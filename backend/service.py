import json
import os
import re
import time
from io import BytesIO
from pathlib import Path
from textwrap import wrap

import fitz
from dotenv import load_dotenv
from loguru import logger
from openai import OpenAI
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

import jobs

load_dotenv(Path(__file__).resolve().parent / ".env")

OPENROUTER_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "z-ai/glm-4.7-flash"
# Rough English estimate; used to keep prompts under a safe input budget.
CHARS_PER_TOKEN = 4
# Leave headroom under typical context windows for system prompt + completion.
MAX_SUMMARY_INPUT_TOKENS = 6000
MAX_OUTPUT_TOKENS = 2048
SUMMARY_SYSTEM = (
    "Summarize the following text in simple and easy-to-understand language. "
    "Avoid complex words and keep it brief."
)
GROUP_SYSTEM = (
    "Group a book's table of contents into the chapters a reader would bind. "
    "Reply with JSON only, no markdown: "
    '{"chapters":[{"title":"Inside-Out","lines":[2]}]}. '
    "lines are the index numbers from the list you are given. "
    "Drop front matter, part dividers, appendices, and a closing interview. "
    "Keep a standalone body chapter, such as Inside-Out or an overview. "
    "Merge a habit or chapter heading with the Principles section directly under it "
    "into one chapter titled '{heading} - {principles}'. "
    "Keep other body chapters on their own, including a paradigms chapter and a later Inside-Out chapter. "
    "Use each index at most once, and keep the chapters in list order."
)


def data_dir() -> Path:
    path = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent / "data"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def safe_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned or cleaned in {".", ".."} or "/" in cleaned or "\\" in cleaned or ".." in cleaned:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Invalid name")
    return cleaned


def chapter_pdf_filename(chapter_name: str) -> str:
    """One path segment. Slashes in titles like 'THINK WIN/WIN' are not directories."""
    cleaned = chapter_name.replace("\x00", "").strip()
    cleaned = cleaned.replace("/", "\u2215").replace("\\", "\u2215")
    if not cleaned or cleaned in {".", ".."}:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Invalid chapter name")
    return f"{cleaned}.pdf"


def _client() -> OpenAI:
    key = os.getenv("OPENROUTER_KEY")
    if not key:
        logger.error("OPENROUTER_KEY is not set")
        raise RuntimeError("OPENROUTER_KEY is not set")
    return OpenAI(base_url=OPENROUTER_URL, api_key=key)


def create_pdf(book_name, chapter_name, text, max_width=80):
    book_dir = data_dir() / "book_pdfs" / safe_name(book_name)
    book_dir.mkdir(parents=True, exist_ok=True)
    filename = chapter_pdf_filename(chapter_name)
    out = book_dir / filename
    logger.debug("Writing chapter PDF {}", out)

    pdf = canvas.Canvas(str(out), pagesize=letter)
    pdf.setTitle(filename)
    pdf.setFont("Helvetica", 12)

    x, y = 100, 750
    line_height = 15
    paragraph_gap = 6

    for paragraph in text.split("\n"):
        wrapped_lines = wrap(paragraph, width=max_width) or [""]
        for line in wrapped_lines:
            pdf.drawString(x, y, line)
            y -= line_height
            if y < 50:
                pdf.showPage()
                pdf.setFont("Helvetica", 12)
                y = 750
        y -= paragraph_gap

    pdf.save()


def estimate_tokens(text: str) -> int:
    return max(1, (len(text) + CHARS_PER_TOKEN - 1) // CHARS_PER_TOKEN)


def split_for_token_limit(text: str, max_tokens: int = MAX_SUMMARY_INPUT_TOKENS) -> list[str]:
    """Split text into pieces that fit under an approximate token budget."""
    max_chars = max(CHARS_PER_TOKEN, max_tokens * CHARS_PER_TOKEN)
    stripped = text.strip()
    if not stripped:
        return []
    if len(stripped) <= max_chars:
        return [stripped]

    parts: list[str] = []
    paragraphs = [p for p in stripped.split("\n\n") if p.strip()]
    current = ""
    for paragraph in paragraphs or [stripped]:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            parts.append(current)
            current = ""
        if len(paragraph) <= max_chars:
            current = paragraph
            continue
        for start in range(0, len(paragraph), max_chars):
            chunk = paragraph[start : start + max_chars].strip()
            if chunk:
                parts.append(chunk)
    if current:
        parts.append(current)
    return parts


def _chat(system: str, prompt: str, max_tokens: int = MAX_OUTPUT_TOKENS) -> str:
    model = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
    logger.debug(
        "OpenRouter chat model={} prompt_chars={} ~{} tokens max_out={}",
        model,
        len(prompt),
        estimate_tokens(prompt),
        max_tokens,
    )
    started = time.perf_counter()
    try:
        response = _client().chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=max_tokens,
            extra_body={"reasoning": {"enabled": False}},
        )
        content = response.choices[0].message.content
        if not content:
            logger.error("OpenRouter returned empty content (model={})", model)
            raise RuntimeError("model returned an empty response")
        return content.strip().strip("```json").strip("```")
    finally:
        jobs.record_step(time.perf_counter() - started)


def get_ai_response(prompt):
    try:
        return _chat(
            "Please rewrite the following text in simple and clear English. "
            "Use easy words and short sentences so that anyone can understand. "
            "Keep the original meaning the same",
            prompt,
        )
    except Exception as e:
        logger.exception("Rewrite failed: {}", e)
        return f"Error fetching response: {e}"


def _summarize_long_text(text: str) -> str:
    """Summarize text, map-reducing when input would exceed the token budget."""
    parts = split_for_token_limit(text, MAX_SUMMARY_INPUT_TOKENS)
    if not parts:
        return ""
    total_tokens = estimate_tokens(text)
    if len(parts) == 1:
        logger.info("Summary single pass (~{} tokens)", total_tokens)
        jobs.add_steps(1)
        return _chat(SUMMARY_SYSTEM, parts[0], max_tokens=1024)

    logger.info(
        "Summary input ~{} tokens exceeds budget {} — map-reduce over {} chunks",
        total_tokens,
        MAX_SUMMARY_INPUT_TOKENS,
        len(parts),
    )
    jobs.add_steps(len(parts))
    partials = []
    for index, part in enumerate(parts, start=1):
        logger.info(
            "Summary map {}/{} (~{} tokens)",
            index,
            len(parts),
            estimate_tokens(part),
        )
        partials.append(_chat(SUMMARY_SYSTEM, part, max_tokens=1024))

    combined = "\n\n".join(partials)
    if estimate_tokens(combined) > MAX_SUMMARY_INPUT_TOKENS:
        logger.info("Partial summaries still large (~{} tokens) — reducing again", estimate_tokens(combined))
        return _summarize_long_text(combined)

    logger.info("Summary reduce pass (~{} tokens)", estimate_tokens(combined))
    jobs.add_steps(1)
    return _chat(
        SUMMARY_SYSTEM,
        "Combine these section summaries into one short overall summary:\n\n" + combined,
        max_tokens=1024,
    )


def get_ai_response_summery(prompt):
    try:
        summary = _summarize_long_text(prompt)
        return "\n\nSummary : \n" + summary
    except Exception as e:
        logger.exception("Summary failed: {}", e)
        return f"Error fetching response: {e}"


_DASH_CHARS = "\u2010\u2011\u2012\u2013\u2014\u2212\ufe58\ufe63\uff0d"
_CONTENTS_HEADING = "contents"
_MAX_CONTENTS_PAGES = 4
_CONTENTS_LINE_LIMIT = 80
_PRINTED_PAGE = re.compile(r"^(?P<title>.*?)(?:\.{2,}|\s{2,})\s*(?P<page>\d+)\s*$")


def _fold_title(text: str) -> str:
    """Compare titles ignoring case, line breaks, and which dash was used."""
    for dash in _DASH_CHARS:
        text = text.replace(dash, "-")
    text = re.sub(r"\s+", " ", text.replace("\n", " ")).strip().casefold()
    return text


def _open_pdf(pdf_content: bytes):
    try:
        return fitz.open(stream=BytesIO(pdf_content), filetype="pdf")
    except Exception as e:
        raise ValueError("Could not read that PDF") from e


def pdf_page_count(pdf_content: bytes) -> int:
    doc = _open_pdf(pdf_content)
    try:
        return doc.page_count
    finally:
        doc.close()


def _page_lines(page) -> list[str]:
    return [line.strip() for line in page.get_text("text").splitlines() if line.strip()]


def _looks_like_contents(text: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 3:
        return False
    return all(len(line) <= _CONTENTS_LINE_LIMIT for line in lines)


def _is_contents_heading(title: str) -> bool:
    folded = _fold_title(title).strip(" .:;-")
    return folded in {"contents", "table of contents"}


def find_contents_page(pdf_content: bytes) -> dict:
    """The PDF page where the table of contents starts. No model call."""
    doc = _open_pdf(pdf_content)
    try:
        for _level, title, page in doc.get_toc():
            if _is_contents_heading(title) and 1 <= page <= doc.page_count:
                return {"contents_page": page, "page_count": doc.page_count}
        for index in range(doc.page_count):
            lines = _page_lines(doc[index])
            if not any(_is_contents_heading(line) for line in lines):
                continue
            if _looks_like_contents(doc[index].get_text("text")):
                return {"contents_page": index + 1, "page_count": doc.page_count}
        raise ValueError("No contents page found in this PDF")
    finally:
        doc.close()


def _split_contents_line(line: str) -> tuple[str, int | None]:
    match = _PRINTED_PAGE.match(line)
    if not match:
        return line.strip(), None
    title = match.group("title").strip(" .\t")
    if not title:
        return line.strip(), None
    return title, int(match.group("page"))


def _outline_pages(doc) -> dict[str, int]:
    pages = {}
    for _level, title, page in doc.get_toc():
        folded = _fold_title(title)
        if folded and folded not in pages and page >= 1:
            pages[folded] = page
    return pages


def _find_title_page(doc, folded_title: str, after_page: int) -> int | None:
    for index in range(after_page, doc.page_count):
        folded = _fold_title(doc[index].get_text("text"))
        if folded_title and folded_title in folded:
            return index + 1
    return None


def _parse_group_reply(raw: str) -> list[dict]:
    """Read the model's chapter groups. Pages are not taken from this reply."""
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("Could not group the contents into chapters") from exc
    if isinstance(parsed, dict):
        parsed = parsed.get("chapters")
    if not isinstance(parsed, list) or not parsed:
        raise ValueError("Could not group the contents into chapters")
    groups = []
    for item in parsed:
        if not isinstance(item, dict):
            raise ValueError("Could not group the contents into chapters")
        title = item.get("title")
        lines = item.get("lines")
        if not isinstance(title, str) or not title.strip() or not isinstance(lines, list) or not lines:
            raise ValueError("Could not group the contents into chapters")
        indexes = []
        for line in lines:
            if isinstance(line, bool) or not isinstance(line, int):
                raise ValueError("Could not group the contents into chapters")
            indexes.append(line)
        groups.append({"title": title.strip(), "lines": indexes})
    return groups


def _ask_chapter_groups(chapters: list[dict]) -> list[dict]:
    """Ask which contents lines belong in each chapter. One short call."""
    listing = [{"index": index, "title": chapter["title"]} for index, chapter in enumerate(chapters)]
    raw = _chat(GROUP_SYSTEM, json.dumps(listing, ensure_ascii=False))
    return _parse_group_reply(raw)


def apply_chapter_groups(chapters: list[dict], groups: list[dict]) -> list[dict]:
    """From is the first selected line's page. To is the last selected line's end."""
    used: set[int] = set()
    previous_index = -1
    grouped: list[dict] = []
    for group in groups:
        title = group.get("title")
        indexes = group.get("lines")
        if not isinstance(title, str) or not title.strip() or not isinstance(indexes, list) or not indexes:
            raise ValueError("Could not group the contents into chapters")
        chosen = []
        for index in indexes:
            if isinstance(index, bool) or not isinstance(index, int):
                raise ValueError("Could not group the contents into chapters")
            if index < 0 or index >= len(chapters) or index in used:
                raise ValueError("Could not group the contents into chapters")
            chosen.append(index)
            used.add(index)
        if min(chosen) < previous_index:
            raise ValueError("Could not group the contents into chapters")
        previous_index = min(chosen)
        selected = [chapters[index] for index in chosen]
        pages = [item["page"] for item in selected if item["page"] is not None]
        ends = [item["end"] for item in selected if item["end"] is not None]
        if not pages:
            grouped.append({"title": title.strip(), "page": None, "end": None})
            continue
        start = min(pages)
        end = max(ends) if ends else start
        if end < start:
            end = start
        if grouped and grouped[-1]["page"] is not None and start < grouped[-1]["page"]:
            raise ValueError("Could not group the contents into chapters")
        grouped.append({"title": title.strip(), "page": start, "end": end})
    if not grouped:
        raise ValueError("Could not group the contents into chapters")
    return grouped


def group_contents(chapters: list[dict]) -> list[dict]:
    """Keep real chapters. A bad reply does not fall back to every contents line."""
    try:
        groups = _ask_chapter_groups(chapters)
    except ValueError:
        raise
    except Exception as exc:
        logger.warning("Chapter grouping failed: {}", exc)
        raise ValueError("Could not group the contents into chapters") from exc
    return apply_chapter_groups(chapters, groups)


def read_contents(pdf_content: bytes, contents_page: int) -> dict:
    """Real chapters from a contents page, each with its From and To PDF page."""
    if contents_page < 1:
        raise ValueError("contents_page must be a 1-based page number")
    doc = _open_pdf(pdf_content)
    try:
        if contents_page > doc.page_count:
            raise ValueError(
                f"contents_page {contents_page} is past the end of the PDF ({doc.page_count} pages)"
            )
        last_index = contents_page - 1
        titles: list[tuple[str, int | None]] = []
        for index in range(contents_page - 1, min(doc.page_count, contents_page - 1 + _MAX_CONTENTS_PAGES)):
            text = doc[index].get_text("text")
            if index != contents_page - 1 and not _looks_like_contents(text):
                break
            last_index = index
            for line in _page_lines(doc[index]):
                title, printed = _split_contents_line(line)
                if not title or _fold_title(title) == _CONTENTS_HEADING:
                    continue
                titles.append((title, printed))
        if not titles:
            raise ValueError("No chapter titles found on that contents page")

        outline = _outline_pages(doc)
        chapters = []
        for title, printed in titles:
            folded = _fold_title(title)
            page = outline.get(folded)
            if page is None:
                page = _find_title_page(doc, folded, last_index + 1)
            if page is None:
                page = printed
            chapters.append({"title": title, "page": page, "end": None})
        _assign_ends(chapters, doc.page_count)
        chapters = group_contents(chapters)
        logger.info(
            "Contents page {} yielded {} chapters (pdf has {} pages)",
            contents_page,
            len(chapters),
            doc.page_count,
        )
        return {"chapters": chapters, "page_count": doc.page_count}
    finally:
        doc.close()


def _assign_ends(chapters: list[dict], page_count: int) -> None:
    """To is the page before the next known start, or the last PDF page."""
    for index, chapter in enumerate(chapters):
        start = chapter["page"]
        if start is None:
            chapter["end"] = None
            continue
        end = page_count
        for later in chapters[index + 1 :]:
            if later["page"] is not None:
                end = later["page"] - 1
                break
        if end < start:
            end = start
        chapter["end"] = end


def slice_chapters(pdf_content: bytes, chapters: list[dict]) -> dict[str, str]:
    """Each chapter runs from its From page through its To page."""
    doc = _open_pdf(pdf_content)
    try:
        page_count = doc.page_count
        sliced: dict[str, str] = {}
        for chapter in chapters:
            start = chapter["page"]
            end = chapter["end"]
            if start < 1 or end < start or end > page_count:
                raise ValueError(
                    f"Chapter {chapter['title']!r} pages {start}-{end} are outside the PDF ({page_count} pages)"
                )
            text = ""
            for page in doc[start - 1 : end]:
                text += page.get_text("text")
            sliced[chapter["title"]] = text
        return sliced
    finally:
        doc.close()


def extract_chapters(text, strings_to_search):
    pattern = "|".join(re.escape(ch) for ch in strings_to_search)
    matches = re.split(f"({pattern})", text)

    chapters = {}
    current_title = None
    for segment in matches:
        segment = segment.strip()
        if not segment:
            continue
        if segment in strings_to_search:
            current_title = segment
            chapters[current_title] = ""
        elif current_title:
            chapters[current_title] += segment + "\n"
    return chapters


def extract_paragraphs(text):
    paragraphs = []
    current_paragraph = []
    for line in text.split("\n"):
        if len(line.strip()) < 70 and current_paragraph:
            current_paragraph.append(line.strip())
            paragraphs.append(" ".join(current_paragraph))
            current_paragraph = []
            continue
        if line.strip():
            current_paragraph.append(line.strip())
    if current_paragraph:
        paragraphs.append(" ".join(current_paragraph))
    return paragraphs


def merge_paragraphs(paragraphs):
    new_paragraph = ""
    new_paragraphs = []
    for paragraph in paragraphs:
        new_paragraph += paragraph
        if len(new_paragraph) > 2000:
            new_paragraphs.append(new_paragraph)
            new_paragraph = ""
    if new_paragraph:
        new_paragraphs.append(new_paragraph)
    return new_paragraphs


def extract_text_from_pdf(pdf_content, start, end):
    text = ""
    pdf_reader = fitz.open(stream=BytesIO(pdf_content), filetype="pdf")
    try:
        page_count = pdf_reader.page_count
        start_i = max(start - 1, 0)
        logger.debug(
            "Extracting PDF text pages {}-{} (pdf has {} pages, {} bytes)",
            start,
            end,
            page_count,
            len(pdf_content),
        )
        for page in pdf_reader[start_i:end]:
            text += page.get_text("text")
    finally:
        pdf_reader.close()
    logger.debug("Extracted {} characters of text", len(text))
    return text


def create_json(filename, payload):
    path = Path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=4))
    logger.debug("Wrote JSON {}", path)


def _load_json_dict(path: Path) -> dict:
    if not path.is_file():
        return {}
    try:
        parsed = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("Could not read existing {}: {}", path, e)
        return {}
    return parsed if isinstance(parsed, dict) else {}


def process_init(pdf_content, book_name, chapters):
    book_name = safe_name(book_name)
    logger.info(
        "Processing book={!r} chapters={}",
        book_name,
        [chapter["title"] for chapter in chapters],
    )
    chapters = slice_chapters(pdf_content, chapters)
    if not chapters:
        raise ValueError("No chapters to process")
    logger.info("Sliced {} chapters for book={!r}: {}", len(chapters), book_name, list(chapters))

    raw_path = data_dir() / f"{book_name}.json"
    ai_path = data_dir() / "ai" / f"{book_name}.json"
    existing_raw = _load_json_dict(raw_path)
    existing_ai = _load_json_dict(ai_path)
    if existing_raw or existing_ai:
        logger.info(
            "Merging into existing book={!r} (kept chapters: raw={}, ai={})",
            book_name,
            list(existing_raw),
            list(existing_ai),
        )

    merged_raw = {**existing_raw, **chapters}
    create_json(raw_path, merged_raw)

    ai_response = dict(existing_ai)
    for key, value in chapters.items():
        logger.info("Rewriting chapter={!r} ({} chars)", key, len(value))
        paragraphs = extract_paragraphs(value)
        chunks = merge_paragraphs(paragraphs)
        total_chunks = len(chunks)
        logger.info("Chapter={!r} split into {} chunks", key, total_chunks)
        jobs.add_steps(total_chunks)
        results = []
        for index, para in enumerate(chunks, start=1):
            logger.info(
                "Chapter={!r} chunk {}/{} ({} chars) — rewrite starting",
                key,
                index,
                total_chunks,
                len(para),
            )
            started = time.perf_counter()
            rewritten = get_ai_response(para)
            elapsed = time.perf_counter() - started
            ok = not rewritten.startswith("Error fetching response:")
            logger.info(
                "Chapter={!r} chunk {}/{} done in {:.1f}s (out={} chars, ok={})",
                key,
                index,
                total_chunks,
                elapsed,
                len(rewritten),
                ok,
            )
            results.append(rewritten)
        updated_content = key + "\n\n" + "\n\n".join(results)
        logger.info("Chapter={!r} summary starting", key)
        summary_started = time.perf_counter()
        updated_content += get_ai_response_summery(updated_content)
        logger.info(
            "Chapter={!r} summary done in {:.1f}s",
            key,
            time.perf_counter() - summary_started,
        )
        create_pdf(book_name, key, updated_content)
        ai_response[key] = updated_content
        logger.success("Chapter={!r} complete", key)
    create_json(ai_path, ai_response)
    logger.success(
        "Finished book={!r} ({} chapters total)",
        book_name,
        len(ai_response),
    )
