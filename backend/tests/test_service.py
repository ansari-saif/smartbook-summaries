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


def test_estimate_tokens_roughly_chars_over_four():
    assert service.estimate_tokens("abcd") == 1
    assert service.estimate_tokens("a" * 40) == 10


def test_split_for_token_limit_keeps_short_text():
    text = "short summary input"
    assert service.split_for_token_limit(text, max_tokens=100) == [text]


def test_split_for_token_limit_breaks_long_text():
    # 50 tokens * 4 chars = 200 char budget
    text = ("word " * 80).strip()  # ~400 chars
    parts = service.split_for_token_limit(text, max_tokens=50)
    assert len(parts) >= 2
    assert all(service.estimate_tokens(part) <= 50 for part in parts)
    assert "".join(parts).replace(" ", "") == text.replace(" ", "")


def test_summary_map_reduces_when_input_exceeds_budget(monkeypatch):
    calls = []

    def fake_chat(system, prompt, max_tokens=2048):
        calls.append(prompt)
        return f"sum:{len(prompt)}"

    monkeypatch.setattr(service, "_chat", fake_chat)
    monkeypatch.setattr(service, "MAX_SUMMARY_INPUT_TOKENS", 20)  # ~80 chars

    big = ("Paragraph about habits. " * 20).strip()  # well over 80 chars
    assert service.estimate_tokens(big) > 20
    result = service.get_ai_response_summery(big)

    assert result.startswith("\n\nSummary : \n")
    assert len(calls) >= 2  # map chunks + reduce
    assert any("Combine these section summaries" in prompt for prompt in calls)
