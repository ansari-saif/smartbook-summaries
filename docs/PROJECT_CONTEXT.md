# Project Context

Smartbook Summaries turns a PDF into chapter-level plain-English rewrites and short summaries.

## Layout

| Path | Role |
|------|------|
| `frontend/` | React + Vite UI (upload, book list, chapter reader) |
| `backend/` | FastAPI API (PDF split, OpenRouter rewrite/summary, stored JSON/PDFs) |
| `backend/data/` | Generated book JSON and chapter PDFs (local only, not committed) |
| `docs/` | Project context and changelog |

## Flow

1. User uploads a PDF, names chapters, and sets a page range on the home page.
2. `POST /process-pdf` validates the upload and returns `202` with a `job_id`. A background task extracts text for that range, splits on chapter titles, rewrites via OpenRouter, and stores results under `backend/data/`. Closing the request does not stop that task.
3. The home page follows `GET /jobs/{job_id}/events` for live logs. After a refresh it resumes with `Last-Event-ID`, and `GET /jobs` lists jobs it can reopen.
4. The summary page loads `GET /book-details` and can download a chapter PDF via `GET /chapter-pdf`.

## Config

- Backend: `backend/.env` from `.env.example` — `OPENROUTER_KEY`, optional `OPENROUTER_MODEL`.
- Frontend: optional `VITE_API_URL` (defaults to `http://127.0.0.1:8000`).

## Commands

```bash
make setup   # venv + npm install
make dev     # API :8000 + UI :5173
make test    # pytest + frontend vitest + production build
```

## Notes

- Chapter matching is exact string match against the extracted PDF text.
- AI calls happen only during PDF processing; tests stub those helpers.
- The upload zone supports click and drag-and-drop for PDF files.
- Backend uses Loguru: stderr for live output, rotating files under `backend/logs/`, and a per-job sink for the event stream.
- PDF work still runs in a thread (`asyncio.to_thread`) so the event loop stays responsive. The thread belongs to a background job, not to the upload request. Job state is in memory for this process and is lost on restart.
