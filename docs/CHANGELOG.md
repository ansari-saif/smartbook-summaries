# Changelog

All notable changes to this project are documented here.

## Unreleased

### Fixed

- PDF upload drop zone now accepts drag-and-drop (previously only click-to-upload worked).
- PDF detection also accepts `.pdf` files with an empty MIME type (common on some OS drop events).

### Added

- `docs/PROJECT_CONTEXT.md` — architecture and local run context.
- Frontend Vitest coverage for PDF file detection.
- Extra backend unit tests for chapter extraction, safe names, and OpenRouter client config.
- Reader fullscreen mode and markdown-style chapter formatting on the summary page.

### Changed

- Backend AI calls use OpenRouter (`OPENROUTER_KEY`) with model `z-ai/glm-4.7-flash` by default (`OPENROUTER_MODEL` override).
- `load_dotenv` loads `backend/.env` from the service file path so keys resolve regardless of cwd.
