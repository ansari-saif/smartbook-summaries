import asyncio
import contextlib
import json
import threading
import time

import fitz
import pytest
from fastapi.testclient import TestClient
from loguru import logger

import jobs
import main
import service
from main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def _running_app():
    # One event loop for the module, matching uvicorn. A per-request loop would
    # cancel the background job as soon as POST /process-pdf returned.
    with client:
        yield


@pytest.fixture(autouse=True)
def _reset_jobs(_running_app):
    jobs.reset()
    yield
    jobs.reset()


def _wait_for_job(job_id: str, timeout: float = 5.0) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        response = client.get(f"/jobs/{job_id}")
        assert response.status_code == 200, response.text
        last = response.json()
        if last["status"] in {"succeeded", "failed"}:
            return last
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not finish: {last}")


def _parse_sse(body: str) -> list[dict]:
    events = []
    for block in body.split("\n\n"):
        if not block.strip():
            continue
        event = {"event": "message", "id": None, "data": None}
        data_lines = []
        for line in block.split("\n"):
            if not line or line.startswith(":"):
                continue
            field, _, value = line.partition(":")
            value = value.lstrip(" ")
            if field == "id":
                event["id"] = value
            elif field == "event":
                event["event"] = value
            elif field == "data":
                data_lines.append(value)
        if data_lines:
            event["data"] = json.loads("\n".join(data_lines))
            events.append(event)
    return events


def _pdf_bytes() -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Chapter 1\nHello from the first chapter.\nChapter 2\nHello from the second chapter.")
    data = doc.tobytes()
    doc.close()
    return data


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_books_empty(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    response = client.get("/books")
    assert response.status_code == 200
    assert response.json() == {"status": "success", "books": []}


def test_missing_book_is_404(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    response = client.get("/book-details", params={"book_name": "missing"})
    assert response.status_code == 404


def test_process_pdf_writes_summary_and_chapter_pdf(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(service, "get_ai_response", lambda prompt: f"rewrite:{prompt[:24]}")
    monkeypatch.setattr(service, "get_ai_response_summery", lambda prompt: "\n\nSummary : \nshort")

    response = client.post(
        "/process-pdf",
        data={
            "search_strings": '["Chapter 1", "Chapter 2"]',
            "start": "1",
            "end": "1",
            "book_name": "Demo Book",
        },
        files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
    )
    assert response.status_code == 202, response.text
    body = response.json()
    assert body["status"] == "queued"
    assert body["job_id"]
    job = _wait_for_job(body["job_id"])
    assert job["status"] == "succeeded", job

    books = client.get("/books").json()["books"]
    assert books == [{"book_name": "Demo Book", "chapter_count": 2}]

    details = client.get("/book-details", params={"book_name": "Demo Book"})
    assert details.status_code == 200
    body = details.json()["data"]
    assert set(body) == {"Chapter 1", "Chapter 2"}
    assert "Summary" in body["Chapter 1"]

    pdf = client.get(
        "/chapter-pdf",
        params={"book_name": "Demo Book", "chapter_name": "Chapter 1"},
    )
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")


def test_process_pdf_chapter_title_with_slash(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(service, "get_ai_response", lambda prompt: f"rewrite:{prompt[:24]}")
    monkeypatch.setattr(service, "get_ai_response_summery", lambda prompt: "\n\nSummary : \nshort")

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "THINK WIN/WIN\nSeek mutual benefit.")
    pdf_bytes = doc.tobytes()
    doc.close()

    response = client.post(
        "/process-pdf",
        data={
            "search_strings": '["THINK WIN/WIN"]',
            "start": "1",
            "end": "1",
            "book_name": "The 7 Habits of Highly Effective People",
        },
        files={"pdf_file": ("habits.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 202, response.text
    job = _wait_for_job(response.json()["job_id"])
    assert job["status"] == "succeeded", job

    stored = list((tmp_path / "book_pdfs" / "The 7 Habits of Highly Effective People").iterdir())
    assert len(stored) == 1
    assert stored[0].is_file()
    assert "/" not in stored[0].name

    pdf = client.get(
        "/chapter-pdf",
        params={
            "book_name": "The 7 Habits of Highly Effective People",
            "chapter_name": "THINK WIN/WIN",
        },
    )
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")


def test_rejects_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    response = client.get("/book-details", params={"book_name": "../secret"})
    assert response.status_code == 400


def test_process_pdf_merges_chapters_for_same_book(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(service, "get_ai_response", lambda prompt: f"rewrite:{prompt[:24]}")
    monkeypatch.setattr(service, "get_ai_response_summery", lambda prompt: "\n\nSummary : \nshort")

    first = client.post(
        "/process-pdf",
        data={
            "search_strings": '["Chapter 1"]',
            "start": "1",
            "end": "1",
            "book_name": "Demo Book",
        },
        files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
    )
    assert first.status_code == 202, first.text
    assert _wait_for_job(first.json()["job_id"])["status"] == "succeeded"

    second = client.post(
        "/process-pdf",
        data={
            "search_strings": '["Chapter 2"]',
            "start": "1",
            "end": "1",
            "book_name": "Demo Book",
        },
        files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
    )
    assert second.status_code == 202, second.text
    assert _wait_for_job(second.json()["job_id"])["status"] == "succeeded"

    books = client.get("/books").json()["books"]
    assert books == [{"book_name": "Demo Book", "chapter_count": 2}]

    details = client.get("/book-details", params={"book_name": "Demo Book"}).json()["data"]
    assert set(details) == {"Chapter 1", "Chapter 2"}


def test_unknown_job_is_404():
    assert client.get("/jobs/missing").status_code == 404
    events = client.get("/jobs/missing/events")
    assert events.status_code == 404


def test_invalid_upload_does_not_create_a_job():
    response = client.post(
        "/process-pdf",
        data={
            "search_strings": "not-json",
            "start": "1",
            "end": "1",
            "book_name": "Demo Book",
        },
        files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
    )
    assert response.status_code == 400
    assert client.get("/jobs").json()["jobs"] == []


def test_jobs_list_includes_created_job(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(service, "get_ai_response", lambda prompt: "rewrite")
    monkeypatch.setattr(service, "get_ai_response_summery", lambda prompt: "\n\nSummary : \nshort")

    response = client.post(
        "/process-pdf",
        data={
            "search_strings": '["Chapter 1"]',
            "start": "1",
            "end": "1",
            "book_name": "Demo Book",
        },
        files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
    )
    job_id = response.json()["job_id"]
    job = _wait_for_job(job_id)
    assert job["status"] == "succeeded"

    listed = client.get("/jobs").json()["jobs"]
    assert [item["job_id"] for item in listed] == [job_id]
    assert listed[0]["book_name"] == "Demo Book"
    assert listed[0]["status"] == "succeeded"


def test_process_pdf_job_fails_when_no_chapter_matches(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(service, "get_ai_response", lambda prompt: "rewrite")
    monkeypatch.setattr(service, "get_ai_response_summery", lambda prompt: "\n\nSummary : \nshort")

    response = client.post(
        "/process-pdf",
        data={
            "search_strings": '["Missing Chapter"]',
            "start": "1",
            "end": "1",
            "book_name": "Demo Book",
        },
        files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
    )
    assert response.status_code == 202, response.text
    job = _wait_for_job(response.json()["job_id"])
    assert job["status"] == "failed"
    assert "No chapters matched" in job["error"]


def test_sse_replays_logs_and_terminal_status(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(service, "get_ai_response", lambda prompt: "rewrite")
    monkeypatch.setattr(service, "get_ai_response_summery", lambda prompt: "\n\nSummary : \nshort")

    response = client.post(
        "/process-pdf",
        data={
            "search_strings": '["Chapter 1"]',
            "start": "1",
            "end": "1",
            "book_name": "Demo Book",
        },
        files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
    )
    job_id = response.json()["job_id"]
    assert _wait_for_job(job_id)["status"] == "succeeded"

    stream = client.get(f"/jobs/{job_id}/events")
    assert stream.status_code == 200
    assert stream.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(stream.text)
    logs = [event for event in events if event["event"] == "log"]
    assert logs
    assert logs[0]["id"] == str(logs[0]["data"]["seq"])
    assert any("Demo Book" in event["data"]["message"] for event in logs)
    assert events[-1]["event"] == "status"
    assert events[-1]["data"]["status"] == "succeeded"


def test_sse_last_event_id_skips_already_seen_logs(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setattr(service, "get_ai_response", lambda prompt: "rewrite")
    monkeypatch.setattr(service, "get_ai_response_summery", lambda prompt: "\n\nSummary : \nshort")

    response = client.post(
        "/process-pdf",
        data={
            "search_strings": '["Chapter 1"]',
            "start": "1",
            "end": "1",
            "book_name": "Demo Book",
        },
        files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
    )
    job_id = response.json()["job_id"]
    assert _wait_for_job(job_id)["status"] == "succeeded"

    full = _parse_sse(client.get(f"/jobs/{job_id}/events").text)
    log_ids = [int(event["id"]) for event in full if event["event"] == "log"]
    assert len(log_ids) >= 2
    cursor = log_ids[0]

    resumed = _parse_sse(
        client.get(f"/jobs/{job_id}/events", headers={"Last-Event-ID": str(cursor)}).text
    )
    resumed_ids = [int(event["id"]) for event in resumed if event["event"] == "log"]
    assert cursor not in resumed_ids
    assert resumed_ids == [seq for seq in log_ids if seq > cursor]
    assert resumed[-1]["event"] == "status"
    assert resumed[-1]["data"]["status"] == "succeeded"


def test_sse_disconnect_does_not_cancel_job(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    started = threading.Event()
    release = threading.Event()

    def slow(*_args, **_kwargs):
        started.set()
        assert release.wait(timeout=3)

    monkeypatch.setattr(main, "process_init", slow)
    try:
        response = client.post(
            "/process-pdf",
            data={
                "search_strings": '["Chapter 1"]',
                "start": "1",
                "end": "1",
                "book_name": "Demo Book",
            },
            files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
        )
        assert response.status_code == 202, response.text
        job_id = response.json()["job_id"]
        assert started.wait(timeout=2)

        async def close_stream() -> None:
            job = jobs.get_job(job_id)
            assert job is not None
            agen = jobs.iter_job_events(job, 0)
            nxt = asyncio.create_task(agen.__anext__())
            done, _pending = await asyncio.wait({nxt}, timeout=0.2)
            if not done:
                nxt.cancel()
            with contextlib.suppress(asyncio.CancelledError, StopAsyncIteration):
                await nxt
            with contextlib.suppress(RuntimeError):
                await agen.aclose()
            assert job.subscribers == []

        client.portal.call(close_stream)
        assert client.get(f"/jobs/{job_id}").json()["status"] == "running"
        release.set()

        job = _wait_for_job(job_id)
        assert job["status"] == "succeeded", job
        replay = _parse_sse(client.get(f"/jobs/{job_id}/events").text)
        assert replay[-1]["event"] == "status"
        assert replay[-1]["data"]["status"] == "succeeded"
    finally:
        release.set()


def test_concurrent_jobs_keep_their_own_logs(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    release = threading.Event()
    entered: list[str] = []

    def fake(_pdf, book_name, *_rest):
        logger.info("JOBLOG {}", book_name)
        entered.append(book_name)
        assert release.wait(timeout=3)

    monkeypatch.setattr(main, "process_init", fake)

    def start(book_name: str) -> str:
        response = client.post(
            "/process-pdf",
            data={
                "search_strings": '["Chapter 1"]',
                "start": "1",
                "end": "1",
                "book_name": book_name,
            },
            files={"pdf_file": ("demo.pdf", _pdf_bytes(), "application/pdf")},
        )
        assert response.status_code == 202, response.text
        return response.json()["job_id"]

    try:
        first = start("Alpha Book")
        second = start("Beta Book")
        deadline = time.time() + 3
        while time.time() < deadline and len(entered) < 2:
            time.sleep(0.02)
        release.set()
        assert sorted(entered) == ["Alpha Book", "Beta Book"]
        assert _wait_for_job(first)["status"] == "succeeded"
        assert _wait_for_job(second)["status"] == "succeeded"
    finally:
        release.set()

    def messages(job_id: str) -> str:
        events = _parse_sse(client.get(f"/jobs/{job_id}/events").text)
        return "\n".join(event["data"]["message"] for event in events if event["event"] == "log")

    alpha = messages(first)
    beta = messages(second)
    assert "JOBLOG Alpha Book" in alpha
    assert "Beta Book" not in alpha
    assert "JOBLOG Beta Book" in beta
    assert "Alpha Book" not in beta
