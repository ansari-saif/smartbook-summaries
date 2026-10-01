import json
import os
import re
from io import BytesIO
from pathlib import Path
from textwrap import wrap

import fitz
from dotenv import load_dotenv
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
        raise RuntimeError("OPENROUTER_KEY is not set")
    return OpenAI(base_url=OPENROUTER_URL, api_key=key)


def create_pdf(book_name, filename, text, max_width=80):
    book_dir = data_dir() / "book_pdfs" / safe_name(book_name)
    book_dir.mkdir(parents=True, exist_ok=True)
    out = book_dir / filename

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
    response = _client().chat.completions.create(
        model=os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL),
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
        start_i = max(start - 1, 0)
        for page in pdf_reader[start_i:end]:
            text += page.get_text("text")
    finally:
        pdf_reader.close()
    return text


def create_json(filename, payload):
    path = Path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=4))


def process_init(pdf_content, book_name, strings_to_search, start, end):
    book_name = safe_name(book_name)
    content = extract_text_from_pdf(pdf_content, start, end)
    chapters = extract_chapters(content, strings_to_search)
    if not chapters:
        raise ValueError("No chapters matched the given names in that page range")
    create_json(data_dir() / f"{book_name}.json", chapters)
    ai_response = {}
    for key, value in chapters.items():
        paragraphs = extract_paragraphs(value)
        chunks = merge_paragraphs(paragraphs)
        results = [get_ai_response(para) for para in chunks]
        updated_content = key + "\n\n" + "\n\n".join(results)
        updated_content += get_ai_response_summery(updated_content)
        create_pdf(book_name, key + ".pdf", updated_content)
        ai_response[key] = updated_content
    create_json(data_dir() / "ai" / f"{book_name}.json", ai_response)
