"""In-memory background jobs for PDF processing.

Single-process only: the registry lives in this process and is lost on restart.
Jobs are not tied to an HTTP connection. Closing an SSE client unsubscribes
that viewer and leaves the job running.
"""

from __future__ import annotations

import asyncio
import json
import time
import traceback
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from loguru import logger

TERMINAL = {"succeeded", "failed"}
FINISHED_TTL_SECONDS = 3600
MAX_FINISHED_JOBS = 50
MAX_HISTORY = 1000
HEARTBEAT_SECONDS = 15

_jobs: dict[str, "Job"] = {}
_tasks: set[asyncio.Task] = set()
_loop: asyncio.AbstractEventLoop | None = None
_sink_id: int | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Job:
    id: str
    book_name: str
    status: str = "queued"
    error: str | None = None
    created_at: str = field(default_factory=_now)
    finished_at: str | None = None
    created_monotonic: float = field(default_factory=time.monotonic)
    finished_monotonic: float | None = None
    next_seq: int = 1
    history: list[dict] = field(default_factory=list)
    subscribers: list[asyncio.Queue] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "job_id": self.id,
            "book_name": self.book_name,
            "status": self.status,
            "error": self.error,
            "created_at": self.created_at,
            "finished_at": self.finished_at,
        }


def bind_loop(loop: asyncio.AbstractEventLoop | None = None) -> None:
    """Remember the loop that owns job queues. Worker-thread logs hop onto it."""
    global _loop
    _loop = loop or asyncio.get_running_loop()


def ensure_loop() -> None:
    if _loop is not None:
        return
    try:
        bind_loop(asyncio.get_running_loop())
    except RuntimeError:
        return


def install_job_log_sink() -> None:
    """Route loguru records that carry extra['job_id'] into that job's history.

    The sink itself does not enqueue. From a worker thread it only schedules
    onto the event loop; records without a job id are ignored. Debug lines stay
    on the server logs and are not streamed.
    """
    global _sink_id
    if _sink_id is not None:
        return
    _sink_id = logger.add(_route_record, level="INFO", enqueue=False)


def create_job(book_name: str) -> Job:
    ensure_loop()
    job = Job(id=str(uuid.uuid4()), book_name=book_name)
    _jobs[job.id] = job
    _prune()
    return job


def get_job(job_id: str) -> Job | None:
    return _jobs.get(job_id)


def list_jobs() -> list[dict]:
    jobs = sorted(_jobs.values(), key=lambda job: job.created_monotonic, reverse=True)
    return [job.to_dict() for job in jobs]


def track_task(task: asyncio.Task) -> None:
    """Keep a strong reference so the task is not garbage-collected mid-run."""
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def mark_running(job: Job) -> None:
    job.status = "running"


def mark_succeeded(job: Job) -> None:
    job.status = "succeeded"
    job.finished_at = _now()
    job.finished_monotonic = time.monotonic()
    _prune()
    _fanout_status(job)


def mark_failed(job: Job, error: str) -> None:
    job.status = "failed"
    job.error = error
    job.finished_at = _now()
    job.finished_monotonic = time.monotonic()
    _prune()
    _fanout_status(job)


def parse_last_event_id(header: str | None) -> int:
    if not header:
        return 0
    try:
        return int(header)
    except ValueError:
        return 0


async def iter_job_events(job: Job, last_event_id: int):
    """Replay retained logs after Last-Event-ID, then live events.

    A terminal job replays what remains and sends one status event.
    Leaving this generator (client disconnect) only drops the subscriber.
    """
    ensure_loop()
    queue: asyncio.Queue = asyncio.Queue()
    job.subscribers.append(queue)
    try:
        seen: set[int] = set()

        def emit_log(event: dict) -> str | None:
            seq = event["seq"]
            if seq <= last_event_id or seq in seen:
                return None
            seen.add(seq)
            return _sse(
                "log",
                {
                    "seq": seq,
                    "time": event["time"],
                    "level": event["level"],
                    "message": event["message"],
                },
                seq,
            )

        for event in list(job.history):
            chunk = emit_log(event)
            if chunk:
                yield chunk

        while True:
            try:
                item = queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            if item["type"] == "log":
                chunk = emit_log(item)
                if chunk:
                    yield chunk

        if job.status in TERMINAL:
            yield _sse_status(job)
            return

        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                yield ": ping\n\n"
                if job.status in TERMINAL:
                    yield _sse_status(job)
                    return
                continue
            if item["type"] == "log":
                chunk = emit_log(item)
                if chunk:
                    yield chunk
            elif item["type"] == "status":
                yield _sse_status(job)
                return
    finally:
        if queue in job.subscribers:
            job.subscribers.remove(queue)


def reset() -> None:
    """Drop jobs and cancel tracked tasks. Tests use this between cases."""
    for task in list(_tasks):
        task.cancel()
    _tasks.clear()
    _jobs.clear()


def _prune() -> None:
    now = time.monotonic()
    for job in list(_jobs.values()):
        if job.status not in TERMINAL or job.finished_monotonic is None:
            continue
        if now - job.finished_monotonic > FINISHED_TTL_SECONDS:
            _jobs.pop(job.id, None)
    finished = [job for job in _jobs.values() if job.status in TERMINAL]
    finished.sort(key=lambda job: job.finished_monotonic or 0)
    overflow = len(finished) - MAX_FINISHED_JOBS
    for job in finished[: max(0, overflow)]:
        _jobs.pop(job.id, None)


def _fanout_status(job: Job) -> None:
    item = {"type": "status", "status": job.status, "error": job.error}
    for subscriber in list(job.subscribers):
        subscriber.put_nowait(item)


def _append_log(job_id: str, partial: dict) -> None:
    job = _jobs.get(job_id)
    if job is None:
        return
    event = {
        "seq": job.next_seq,
        "time": partial["time"],
        "level": partial["level"],
        "message": partial["message"],
    }
    job.next_seq += 1
    job.history.append(event)
    overflow = len(job.history) - MAX_HISTORY
    if overflow > 0:
        del job.history[:overflow]
    item = {"type": "log", **event}
    for subscriber in list(job.subscribers):
        subscriber.put_nowait(item)


def _route_record(message) -> None:
    record = message.record
    job_id = record["extra"].get("job_id")
    if not job_id or _loop is None:
        return
    text = str(record["message"])
    exc = record["exception"]
    if exc is not None:
        text = f"{text}\n{''.join(traceback.format_exception(exc.type, exc.value, exc.traceback))}".rstrip()
    partial = {
        "time": record["time"].strftime("%Y-%m-%d %H:%M:%S"),
        "level": record["level"].name,
        "message": text,
    }
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is _loop:
        _append_log(job_id, partial)
        return
    try:
        _loop.call_soon_threadsafe(_append_log, job_id, partial)
    except RuntimeError:
        return


def _sse(event: str, data: dict, event_id: int | None = None) -> str:
    lines = []
    if event_id is not None:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    lines.append(f"data: {json.dumps(data, ensure_ascii=False)}")
    return "\n".join(lines) + "\n\n"


def _sse_status(job: Job) -> str:
    data: dict = {"status": job.status}
    if job.status == "failed":
        data["error"] = job.error or "Processing failed"
    return _sse("status", data)
