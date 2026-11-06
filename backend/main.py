import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from loguru import logger

import jobs
from logging_config import setup_logging
from service import (
    chapter_pdf_filename,
    data_dir,
    find_contents_page,
    pdf_page_count,
    process_init,
    read_contents,
    safe_name,
)

setup_logging()
jobs.install_job_log_sink()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    jobs.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(
    title="Smartbook Summaries",
    description="Upload a PDF, split it by chapter, and store an AI rewrite plus summary.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "smartbook summaries"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "smartbook-summaries"}


def _parse_chapters(raw: str, page_count: int) -> list[dict]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON format for chapters")
    if not isinstance(parsed, list) or not parsed:
        raise ValueError("chapters must be a list of {title, page, end}")
    chapters = []
    previous = 0
    for item in parsed:
        if not isinstance(item, dict):
            raise ValueError("chapters must be a list of {title, page, end}")
        title = item.get("title")
        page = item.get("page")
        end = item.get("end")
        if not isinstance(title, str) or not title.strip():
            raise ValueError("each chapter needs a title")
        if isinstance(page, bool) or not isinstance(page, int):
            raise ValueError("each chapter needs an integer page")
        if isinstance(end, bool) or not isinstance(end, int):
            raise ValueError("each chapter needs an integer end page")
        if page < 1 or end < page or end > page_count:
            raise ValueError(f"pages {page}-{end} are outside the PDF ({page_count} pages)")
        if page < previous:
            raise ValueError("chapter pages must be in order")
        title = title.strip()
        chapter_pdf_filename(title)
        chapters.append({"title": title, "page": page, "end": end})
        previous = page
    return chapters


@app.post("/contents-page")
async def contents_page(pdf_file: UploadFile = File(...)):
    logger.info("POST /contents-page file={!r}", pdf_file.filename)
    pdf_content = await pdf_file.read()
    if not pdf_content:
        raise HTTPException(status_code=400, detail="PDF file is empty")
    try:
        return await asyncio.to_thread(find_contents_page, pdf_content)
    except ValueError as e:
        logger.warning("contents-page failed: {}", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/contents")
async def contents(
    pdf_file: UploadFile = File(...),
    contents_page: int = Form(...),
):
    logger.info("POST /contents page={} file={!r}", contents_page, pdf_file.filename)
    pdf_content = await pdf_file.read()
    if not pdf_content:
        raise HTTPException(status_code=400, detail="PDF file is empty")
    try:
        return await asyncio.to_thread(read_contents, pdf_content, contents_page)
    except ValueError as e:
        logger.warning("contents failed: {}", e)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/process-pdf", status_code=202)
async def process_pdf(
    pdf_file: UploadFile = File(...),
    chapters: str = Form(...),
    book_name: str = Form(...),
):
    logger.info(
        "POST /process-pdf book={!r} file={!r} chapters_raw={!r}",
        book_name,
        pdf_file.filename,
        chapters[:200],
    )
    try:
        safe_name(book_name)
        pdf_content = await pdf_file.read()
        if not pdf_content:
            logger.warning("Empty PDF upload for book={!r}", book_name)
            raise HTTPException(status_code=400, detail="PDF file is empty")
        page_count = pdf_page_count(pdf_content)
        parsed_chapters = _parse_chapters(chapters, page_count)
        logger.debug("PDF bytes={} pages={} chapters={}", len(pdf_content), page_count, parsed_chapters)
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("process-pdf validation failed for book={!r}: {}", book_name, e)
        raise HTTPException(status_code=400, detail=str(e))

    # Validation finished. The job runs after this response; closing the client
    # (refresh, SSE drop) does not cancel it.
    job = jobs.create_job(book_name)
    task = asyncio.create_task(_run_job(job, pdf_content, book_name, parsed_chapters))
    jobs.track_task(task)
    return {"status": "queued", "job_id": job.id, "book_name": book_name}


async def _run_job(job, pdf_content, book_name, chapters):
    jobs.mark_running(job)
    try:
        with jobs.bind_job(job.id), logger.contextualize(job_id=job.id):
            await asyncio.to_thread(process_init, pdf_content, book_name, chapters)
            logger.success("Processed book={!r} ({} chapters)", book_name, len(chapters))
        jobs.mark_succeeded(job)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        with logger.contextualize(job_id=job.id):
            logger.exception("process-pdf failed for book={!r}: {}", book_name, e)
        jobs.mark_failed(job, str(e))


@app.get("/jobs")
async def get_jobs():
    return {"jobs": jobs.list_jobs()}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    payload = job.to_dict()
    payload["logs"] = job.recent_logs()
    return payload


@app.get("/jobs/{job_id}/events")
async def job_events(job_id: str, request: Request):
    job = jobs.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    last_event_id = jobs.parse_last_event_id(request.headers.get("last-event-id"))
    return StreamingResponse(
        jobs.iter_job_events(job, last_event_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/books")
async def get_books():
    books = []
    root = data_dir()
    root.mkdir(parents=True, exist_ok=True)
    for path in sorted(root.glob("*.json")):
        try:
            data = path.read_text().strip()
            parsed = json.loads(data)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("Skipping invalid book file {}: {}", path.name, e)
            continue
        if isinstance(parsed, dict):
            books.append({"book_name": path.stem, "chapter_count": len(parsed)})
    logger.debug("GET /books -> {} books", len(books))
    return {"status": "success", "books": books}


@app.get("/book-details")
async def get_book_details(book_name: str = Query(...)):
    name = safe_name(book_name)
    file_path = data_dir() / "ai" / f"{name}.json"
    if not file_path.is_file():
        logger.warning("Book details not found: {!r}", name)
        raise HTTPException(status_code=404, detail=f"Book '{name}' not found")
    try:
        book_data = json.loads(file_path.read_text())
    except json.JSONDecodeError:
        logger.error("Corrupt JSON for book={!r} at {}", name, file_path)
        raise HTTPException(status_code=500, detail=f"Invalid JSON format in {name}.json")
    logger.debug("GET /book-details book={!r} chapters={}", name, len(book_data))
    return {"status": "success", "book_name": name, "data": book_data}


@app.get("/chapter-pdf")
async def get_chapter_pdf(
    book_name: str = Query(...),
    chapter_name: str = Query(...),
):
    book = safe_name(book_name)
    filename = chapter_pdf_filename(chapter_name)
    file_path = data_dir() / "book_pdfs" / book / filename
    if not file_path.is_file():
        logger.warning("Chapter PDF missing: {}/{}", book, chapter_name)
        raise HTTPException(status_code=404, detail=f"PDF file not found for {book}/{chapter_name}")
    logger.debug("Serving chapter PDF {}/{}", book, chapter_name)
    return FileResponse(file_path, media_type="application/pdf", filename=filename)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
