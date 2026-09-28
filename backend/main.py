from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from service import data_dir, process_init, safe_name

app = FastAPI(
    title="Smartbook Summaries",
    description="Upload a PDF, split it by chapter, and store an AI rewrite plus summary.",
    version="1.0.0",
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


@app.post("/process-pdf")
async def process_pdf(
    pdf_file: UploadFile = File(...),
    search_strings: str = Form(...),
    start: int = Form(...),
    end: int = Form(...),
    book_name: str = Form(...),
):
    import json

    try:
        strings_to_search = json.loads(search_strings)
        if not isinstance(strings_to_search, list) or not all(
            isinstance(item, str) and item.strip() for item in strings_to_search
        ):
            raise HTTPException(status_code=400, detail="search_strings must be a list of chapter names")
        if start < 1 or end < start:
            raise HTTPException(status_code=400, detail="start and end must be 1-based page numbers, with end >= start")
        safe_name(book_name)
        pdf_content = await pdf_file.read()
        if not pdf_content:
            raise HTTPException(status_code=400, detail="PDF file is empty")
        process_init(pdf_content, book_name, strings_to_search, start, end)
        return {"status": "success"}
    except HTTPException:
        raise
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format for search_strings")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {e}")


@app.get("/books")
async def get_books():
    books = []
    root = data_dir()
    root.mkdir(parents=True, exist_ok=True)
    for path in sorted(root.glob("*.json")):
        try:
            data = path.read_text().strip()
            import json

            parsed = json.loads(data)
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(parsed, dict):
            books.append({"book_name": path.stem, "chapter_count": len(parsed)})
    return {"status": "success", "books": books}


@app.get("/book-details")
async def get_book_details(book_name: str = Query(...)):
    import json

    name = safe_name(book_name)
    file_path = data_dir() / "ai" / f"{name}.json"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Book '{name}' not found")
    try:
        book_data = json.loads(file_path.read_text())
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Invalid JSON format in {name}.json")
    return {"status": "success", "book_name": name, "data": book_data}


@app.get("/chapter-pdf")
async def get_chapter_pdf(
    book_name: str = Query(...),
    chapter_name: str = Query(...),
):
    book = safe_name(book_name)
    chapter = safe_name(chapter_name)
    file_path = data_dir() / "book_pdfs" / book / f"{chapter}.pdf"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"PDF file not found for {book}/{chapter}")
    return FileResponse(file_path, media_type="application/pdf", filename=f"{chapter}.pdf")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
