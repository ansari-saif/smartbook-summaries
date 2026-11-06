# Changelog

All notable changes to this project are documented here.

## Unreleased

### Fixed

- PDF upload drop zone now accepts drag-and-drop (previously only click-to-upload worked).
- PDF detection also accepts `.pdf` files with an empty MIME type (common on some OS drop events).
- `POST /process-pdf` returns `202` as soon as the upload is valid. Chapter processing continues in a background job, so a refresh or a dropped log stream does not stop it.

### Added

- `GET /jobs`, `GET /jobs/{job_id}`, and `GET /jobs/{job_id}/events`. The event stream replays missed lines when the browser reconnects with `Last-Event-ID`.
- The bind form shows that job's log live, restores it from the tab after a refresh, and lists recent jobs so one can be reopened.

- `docs/PROJECT_CONTEXT.md` — architecture and local run context.
- Frontend Vitest coverage for PDF file detection.
- Extra backend unit tests for chapter extraction, safe names, and OpenRouter client config.
- Reader fullscreen mode and markdown-style chapter formatting on the summary page.

### Changed

- Backend AI calls use OpenRouter (`OPENROUTER_KEY`) with model `z-ai/glm-4.7-flash` by default (`OPENROUTER_MODEL` override).
- `load_dotenv` loads `backend/.env` from the service file path so keys resolve regardless of cwd.
