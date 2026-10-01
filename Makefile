ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PY   := $(ROOT)/backend/.venv/bin/python
API  := http://127.0.0.1:8000
UI   := http://127.0.0.1:5173

.PHONY: setup dev backend frontend test build stop help

help:
	@echo "make setup     Create the Python venv and install frontend deps"
	@echo "make dev       API on :8000 and UI on :5173"
	@echo "make backend   API only"
	@echo "make frontend  UI only"
	@echo "make test      pytest, frontend vitest, and production build"
	@echo "make stop      Free ports 8000 and 5173"

setup: $(PY)
	cd $(ROOT)/frontend && npm install

$(PY): $(ROOT)/backend/requirements.txt
	python3 -m venv $(ROOT)/backend/.venv
	$(PY) -m pip install -r $(ROOT)/backend/requirements.txt

dev: setup
	@$(MAKE) stop
	@BACKEND_PID=""; FRONTEND_PID=""; \
	cleanup() { \
		echo; echo "Stopping…"; \
		if [ -n "$$FRONTEND_PID" ]; then kill $$FRONTEND_PID 2>/dev/null || true; fi; \
		if [ -n "$$BACKEND_PID" ]; then kill $$BACKEND_PID 2>/dev/null || true; fi; \
		wait 2>/dev/null || true; \
		echo "Stopped."; \
	}; \
	trap cleanup EXIT INT TERM; \
	echo "Starting API on $(API) …"; \
	(cd $(ROOT)/backend && $(PY) -m uvicorn main:app --host 127.0.0.1 --port 8000) & BACKEND_PID=$$!; \
	ready=0; \
	for _ in $$(seq 1 40); do \
		if curl -sf $(API)/health >/dev/null 2>&1; then ready=1; break; fi; \
		if ! kill -0 $$BACKEND_PID 2>/dev/null; then echo "API exited early."; exit 1; fi; \
		sleep 0.25; \
	done; \
	if [ "$$ready" -ne 1 ]; then echo "API did not become ready on :8000"; exit 1; fi; \
	echo "Starting UI on $(UI) …"; \
	(cd $(ROOT)/frontend && npm run dev -- --host 127.0.0.1 --port 5173) & FRONTEND_PID=$$!; \
	echo; echo "Smartbook is up"; echo "  UI  → $(UI)"; echo "  API → $(API)/docs"; echo "Press Ctrl+C to stop both."; echo; \
	wait

backend: $(PY)
	cd $(ROOT)/backend && $(PY) -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

frontend: setup
	cd $(ROOT)/frontend && npm run dev -- --host 127.0.0.1 --port 5173

test: $(PY)
	cd $(ROOT)/backend && $(PY) -m pytest -q
	cd $(ROOT)/frontend && npm install && npm test && npm run build

build: test

stop:
	-lsof -tiTCP:8000 -sTCP:LISTEN | xargs kill 2>/dev/null || true
	-lsof -tiTCP:5173 -sTCP:LISTEN | xargs kill 2>/dev/null || true
	@echo "Stopped anything on :8000 and :5173."
