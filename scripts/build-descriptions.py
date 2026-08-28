"""Build the browser-ready MBTI description dataset from the DOCX source files."""

from __future__ import annotations

import json
import re
from pathlib import Path

from docx import Document
from docx.document import Document as DocumentObject
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOC_DIRECTORY = PROJECT_ROOT / "doc"
OUTPUT_FILE = PROJECT_ROOT / "descriptions.js"
TYPE_PATTERN = re.compile(r"^\d+_([A-Z]{4})_")
EXPECTED_TYPES = {
    "ISTJ", "ISFJ", "INFJ", "INTJ",
    "ISTP", "ISFP", "INFP", "INTP",
    "ESTP", "ESFP", "ENFP", "ENTP",
    "ESTJ", "ESFJ", "ENFJ", "ENTJ",
}


def clean_text(value: str) -> str:
    """Normalize Word-only spacing while preserving authored punctuation and line breaks."""
    return "\n".join(line.strip() for line in value.replace("\u00a0", " ").splitlines()).strip()


def iter_document_blocks(document: DocumentObject):
    """Yield paragraphs and tables in their original Word document order."""
    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document._body)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document._body)


def table_payload(table: Table) -> dict[str, object]:
    rows = []
    for row in table.rows:
        rows.append([clean_text(cell.text) for cell in row.cells])
    return {"type": "table", "rows": rows}


def read_description(path: Path) -> dict[str, object]:
    document = Document(path)
    metadata: list[str] = []
    blocks: list[dict[str, object]] = []

    for block in iter_document_blocks(document):
        if isinstance(block, Paragraph):
            text = clean_text(block.text)
            if not text:
                continue
            if len(metadata) < 3:
                metadata.append(text)
                continue

            style_name = block.style.name if block.style is not None else ""
            heading_match = re.match(r"Heading\s+([12])$", style_name, re.IGNORECASE)
            if heading_match:
                blocks.append({
                    "type": "heading",
                    "level": int(heading_match.group(1)),
                    "text": text,
                })
            else:
                blocks.append({"type": "paragraph", "text": text})
        elif isinstance(block, Table):
            blocks.append(table_payload(block))

    if len(metadata) != 3:
        raise ValueError(f"{path.name}: expected three title paragraphs, found {len(metadata)}")
    if not any(block["type"] == "table" for block in blocks):
        raise ValueError(f"{path.name}: no tables were extracted")

    return {
        "title": metadata[1],
        "subtitle": metadata[2],
        "source": path.name,
        "blocks": blocks,
    }


def build_dataset() -> dict[str, dict[str, object]]:
    dataset: dict[str, dict[str, object]] = {}
    for path in sorted(DOC_DIRECTORY.glob("*.docx")):
        match = TYPE_PATTERN.match(path.name)
        if not match:
            raise ValueError(f"Unrecognized document filename: {path.name}")
        mbti_type = match.group(1)
        if mbti_type in dataset:
            raise ValueError(f"Duplicate MBTI type: {mbti_type}")
        description = read_description(path)
        if description["source"] != path.name:
            raise AssertionError("Source filename mismatch")
        dataset[mbti_type] = description

    missing = EXPECTED_TYPES - dataset.keys()
    unexpected = dataset.keys() - EXPECTED_TYPES
    if missing or unexpected:
        raise ValueError(
            f"Description set mismatch; missing={sorted(missing)}, unexpected={sorted(unexpected)}"
        )
    return dataset


def main() -> None:
    dataset = build_dataset()
    javascript = (
        "// Auto-generated from doc/*.docx by scripts/build-descriptions.py.\n"
        "// Edit the DOCX source files and rerun the generator instead of editing this file.\n"
        f"window.MBTI_DESCRIPTIONS = {json.dumps(dataset, ensure_ascii=False, indent=2)};\n"
    )
    with OUTPUT_FILE.open("w", encoding="utf-8", newline="\n") as output:
        output.write(javascript)
    block_count = sum(len(item["blocks"]) for item in dataset.values())
    print(f"Generated {len(dataset)} MBTI descriptions ({block_count} blocks) at {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
