# Smartbook Summaries

Upload a PDF, name the chapters, and get a plain-English rewrite plus a short summary for each chapter.

The UI is the React app from [smartbook-summaries](https://github.com/ansari-saif/smartbook-summaries). The API is the FastAPI service that used to live in `ansarisaif-alt/book-backend`.

## Run

```bash
cp backend/.env.example backend/.env   # set OPENAI_KEY before processing a real PDF
make setup
make dev
```

| URL | What |
|-----|------|
| http://127.0.0.1:5173 | Upload books and read summaries |
| http://127.0.0.1:8000/docs | API docs |
| http://127.0.0.1:8000/health | Health check |

`make test` runs the API tests and a production frontend build. Chapter processing calls OpenAI only when you upload a PDF; the tests stub that call.

## API

| Method | Path | What |
|--------|------|------|
| GET | `/books` | Book names and chapter counts |
| POST | `/process-pdf` | `pdf_file`, `search_strings` (JSON chapter names), `start`, `end`, `book_name` |
| GET | `/book-details?book_name=` | AI text for each chapter |
| GET | `/chapter-pdf?book_name=&chapter_name=` | Rewritten chapter PDF |

`start` and `end` are 1-based page numbers, and `end` is included. Generated files stay in `backend/data/` and are not committed.

Point the UI at another API with `VITE_API_URL` (see `frontend/.env.example`).
