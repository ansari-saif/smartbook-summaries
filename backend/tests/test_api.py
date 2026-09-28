import fitz
from fastapi.testclient import TestClient

import service
from main import app

client = TestClient(app)


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
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "success"

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


def test_rejects_path_traversal(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    response = client.get("/book-details", params={"book_name": "../secret"})
    assert response.status_code == 400
