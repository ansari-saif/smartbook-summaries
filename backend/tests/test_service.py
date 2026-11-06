import fitz

import service


def _pdf_with_pages(pages: list[str], outline: list | None = None) -> bytes:
    doc = fitz.open()
    for text in pages:
        page = doc.new_page()
        html = "<br>".join(text.split("\n"))
        page.insert_htmlbox(fitz.Rect(72, 36, 540, 760), html)
    if outline:
        doc.set_toc(outline)
    data = doc.tobytes()
    doc.close()
    return data


def test_extract_chapters_splits_on_titles():
    text = "Intro\nChapter 1\nHello one.\nChapter 2\nHello two."
    chapters = service.extract_chapters(text, ["Chapter 1", "Chapter 2"])
    assert list(chapters) == ["Chapter 1", "Chapter 2"]
    assert "Hello one." in chapters["Chapter 1"]
    assert "Hello two." in chapters["Chapter 2"]


def test_extract_chapters_returns_empty_when_no_match():
    assert service.extract_chapters("plain text", ["Chapter 1"]) == {}


def test_read_contents_keeps_a_following_contents_page_and_stops_at_prose():
    pdf = _pdf_with_pages(
        [
            "CONTENTS\nForeword\nInside-Out\nOverview",
            "Appendix A\nAppendix B\nInterview",
            "This opening paragraph is definitely longer than eighty characters and should stop the contents scan.",
        ]
    )
    result = service.read_contents(pdf, 1)
    assert [item["title"] for item in result["chapters"]] == [
        "Foreword",
        "Inside-Out",
        "Overview",
        "Appendix A",
        "Appendix B",
        "Interview",
    ]


def test_read_contents_finds_a_heading_split_across_lines():
    pdf = _pdf_with_pages(
        [
            "Habit 1: Be Proactive",
            "Something else entirely on this page.",
            "HABIT 1:\nBE PROACTIVE\nTake responsibility.",
        ]
    )
    result = service.read_contents(pdf, 1)
    assert result["chapters"] == [{"title": "Habit 1: Be Proactive", "page": 3, "end": 3}]


def test_read_contents_uses_a_printed_page_when_the_title_is_not_in_the_body():
    pdf = _pdf_with_pages(
        [
            "Appendix .......... 4",
            "Unrelated body text with no matching heading.",
        ]
    )
    result = service.read_contents(pdf, 1)
    assert result["chapters"] == [{"title": "Appendix", "page": 4, "end": 4}]


def test_read_contents_matches_outline_across_dash_characters():
    pdf = _pdf_with_pages(
        ["The 7 Habits\u2014An Overview", "The chapter body."],
        outline=[[1, "The 7 Habits-An Overview", 2]],
    )
    result = service.read_contents(pdf, 1)
    assert result["chapters"] == [{"title": "The 7 Habits\u2014An Overview", "page": 2, "end": 2}]
    assert result["page_count"] == 2


def test_read_contents_rejects_a_page_past_the_end():
    pdf = _pdf_with_pages(["CONTENTS\nOne\nTwo\nThree"])
    try:
        service.read_contents(pdf, 3)
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "past the end" in str(exc)


def test_read_contents_sets_a_shared_page_as_from_and_to():
    pdf = _pdf_with_pages(
        ["CONTENTS\nHabit 7\nPrinciples", "Earlier page.", "HABIT 7:\nSHARPEN\nPrinciples of renewal."],
        outline=[[1, "Habit 7", 3], [1, "Principles", 3]],
    )
    result = service.read_contents(pdf, 1)
    assert result["chapters"] == [
        {"title": "Habit 7", "page": 3, "end": 3},
        {"title": "Principles", "page": 3, "end": 3},
    ]


def test_slice_chapters_stops_at_the_given_end_page():
    pdf = _pdf_with_pages(
        [
            "one",
            "HABIT 1:\nBE PROACTIVE",
            "still habit",
            "skipped page",
            "HABIT 2:\nBEGIN",
        ]
    )
    sliced = service.slice_chapters(
        pdf,
        [
            {"title": "Habit 1", "page": 2, "end": 3},
            {"title": "Habit 2", "page": 5, "end": 5},
        ],
    )
    assert "BE PROACTIVE" in sliced["Habit 1"]
    assert "still habit" in sliced["Habit 1"]
    assert "skipped page" not in sliced["Habit 1"]
    assert "BEGIN" not in sliced["Habit 1"]
    assert "BEGIN" in sliced["Habit 2"]
    assert "skipped page" not in sliced["Habit 2"]


def test_slice_chapters_keeps_a_shared_page():
    pdf = _pdf_with_pages(["shared page text"])
    sliced = service.slice_chapters(
        pdf,
        [{"title": "A", "page": 1, "end": 1}, {"title": "B", "page": 1, "end": 1}],
    )
    assert "shared page text" in sliced["A"]
    assert "shared page text" in sliced["B"]


def test_chapter_pdf_filename_keeps_slash_titles_in_one_segment():
    filename = service.chapter_pdf_filename("THINK WIN/WIN")
    assert "/" not in filename
    assert "\\" not in filename
    assert filename == "THINK WIN\u2215WIN.pdf"


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
