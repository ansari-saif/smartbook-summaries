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

load_dotenv(Path(__file__).resolve().parent / ".env")

OPENROUTER_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "z-ai/glm-4.7-flash"


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


def _client() -> OpenAI:
    key = os.getenv("OPENROUTER_KEY")
    if not key:
        logger.error("OPENROUTER_KEY is not set")
        raise RuntimeError("OPENROUTER_KEY is not set")
    return OpenAI(base_url=OPENROUTER_URL, api_key=key)


def create_pdf(book_name, filename, text, max_width=80):
    book_dir = data_dir() / "book_pdfs" / safe_name(book_name)
    book_dir.mkdir(parents=True, exist_ok=True)
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


def _chat(system: str, prompt: str) -> str:
    model = os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL)
    logger.debug("OpenRouter chat model={} prompt_chars={}", model, len(prompt))
    response = _client().chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0,
        max_tokens=2048,
        extra_body={"reasoning": {"enabled": False}},
    )
    content = response.choices[0].message.content
    if not content:
        logger.error("OpenRouter returned empty content (model={})", model)
        raise RuntimeError("model returned an empty response")
    return content.strip().strip("```json").strip("```")


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


def get_ai_response_summery(prompt):
    try:
        summary = _chat(
            "Summarize the following text in simple and easy-to-understand language. "
            "Avoid complex words and keep it brief.",
            prompt,
        )
        return "\n\nSummary : \n" + summary
    except Exception as e:
        logger.exception("Summary failed: {}", e)
        return f"Error fetching response: {e}"


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


def process_init(pdf_content, book_name, strings_to_search, start, end):
    book_name = safe_name(book_name)
    logger.info(
        "Processing book={!r} chapters={} pages={}-{}",
        book_name,
        strings_to_search,
        start,
        end,
    )
    content = extract_text_from_pdf(pdf_content, start, end)
    chapters = extract_chapters(content, strings_to_search)
    if not chapters:
        preview = content[:300].replace("\n", " ")
        logger.warning(
            "No chapter titles matched for book={!r}. Looking for {}. Text preview: {!r}",
            book_name,
            strings_to_search,
            preview,
        )
        raise ValueError("No chapters matched the given names in that page range")
    logger.info("Matched {} chapters for book={!r}: {}", len(chapters), book_name, list(chapters))

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
        create_pdf(book_name, key + ".pdf", updated_content)
        ai_response[key] = updated_content
        logger.success("Chapter={!r} complete", key)
    create_json(ai_path, ai_response)
    logger.success(
        "Finished book={!r} ({} chapters total)",
        book_name,
        len(ai_response),
    )
