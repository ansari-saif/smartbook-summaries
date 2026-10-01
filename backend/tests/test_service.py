import service


def test_extract_chapters_splits_on_titles():
    text = "Intro\nChapter 1\nHello one.\nChapter 2\nHello two."
    chapters = service.extract_chapters(text, ["Chapter 1", "Chapter 2"])
    assert list(chapters) == ["Chapter 1", "Chapter 2"]
    assert "Hello one." in chapters["Chapter 1"]
    assert "Hello two." in chapters["Chapter 2"]


def test_extract_chapters_returns_empty_when_no_match():
    assert service.extract_chapters("plain text", ["Chapter 1"]) == {}


def test_safe_name_rejects_path_parts():
    from fastapi import HTTPException

    try:
        service.safe_name("../secret")
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400


def test_client_requires_openrouter_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_KEY", raising=False)
    try:
        service._client()
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "OPENROUTER_KEY" in str(exc)


def test_default_model_constant():
    assert service.DEFAULT_MODEL == "z-ai/glm-4.7-flash"
    assert "openrouter.ai" in service.OPENROUTER_URL
