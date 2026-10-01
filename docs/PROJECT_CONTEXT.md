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
2. `POST /process-pdf` extracts text for that range, splits on chapter titles, rewrites via OpenRouter, and stores results under `backend/data/`.
3. The summary page loads `GET /book-details` and can download a chapter PDF via `GET /chapter-pdf`.

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
- Backend uses Loguru: stderr for live output, rotating files under `backend/logs/`.
- `POST /process-pdf` runs `process_init` via `asyncio.to_thread` so other endpoints stay responsive during long AI work.
