#!/usr/bin/env python3
"""
Corpus extraction pipeline — diacritics-preserving PDF text extractor.

Extracts text from PDFs with full Unicode diacritics preservation.
Handles: ā ē ī ō ū š ṣ ṭ ḫ ʿ ʾ ẓ ḍ ḥ and all standard diacritical marks.

Usage:
    python3 corpus_extract.py <pdf_path> <output_dir> [--slug <slug>] [--bucket <bucket>]

Output:
    <output_dir>/text/v1-c<N>.md  — one markdown file per chapter/section
    <output_dir>/_extract_meta.json — extraction metadata
"""

import fitz  # pymupdf
import os
import sys
import json
import re
import argparse
from datetime import datetime


# Unicode diacritics that must be preserved
DIACRITICS = set(
    "āēīōūšṣṭḫʿʾẓḍḥ"
    "ĀĒĪŌŪŠṢṬḪ"
    "áéíóúàèìòúâêîôûäëïöüãõñç"
    "ÁÉÍÓÚÀÈÌÒÚÂÊÎÔÛÄËÏÖÜÃÕÑÇ"
    "čďěňřšťůž"
    "ČĎĚŇŘŠŤŮŽ"
    "ḡḣḷṁṅṇṛṝṣṭ"
    "ḠḢḶṀṄṆṚṜṢṬ"
)

# Patterns that indicate page number artifacts to clean
PAGE_ARTIFACT_RE = re.compile(r'\{p\d+\}|\{p\[\^?\d+\]\}|\{page\s*\d+\}', re.IGNORECASE)

# Patterns for chapter/section detection
CHAPTER_RE = re.compile(
    r'^(chapter|CHAPTER|section|SECTION|part|PART|book|BOOK|volume|VOLUME)\s+[\dIVXLCDM]+',
    re.MULTILINE
)

# Hyphenation at line break
HYPHEN_LINE_END_RE = re.compile(r'(\w)-\s*\n\s*(\w)')


def clean_text(text):
    """Clean extracted text while preserving diacritics."""
    # Remove page number artifacts like {p1}, {p[^1]}
    text = PAGE_ARTIFACT_RE.sub('', text)
    
    # Fix hyphenated word breaks: "Mesopota-\n mian" -> "Mesopotamian"
    text = HYPHEN_LINE_END_RE.sub(r'\1\2', text)
    
    # Normalize multiple spaces (but not newlines)
    text = re.sub(r' {3,}', '  ', text)
    
    # Remove lines that are just whitespace
    lines = text.split('\n')
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if stripped:
            cleaned.append(stripped)
        else:
            cleaned.append('')  # preserve paragraph breaks
    
    # Merge single-word lines into paragraphs
    merged = []
    buffer = []
    for line in cleaned:
        if not line:
            if buffer:
                merged.append(' '.join(buffer))
                buffer = []
            merged.append('')
        elif len(line.split()) <= 3 and not line.endswith(('.', '!', '?', ':', ';')):
            # Short line — might be part of a paragraph
            buffer.append(line)
        else:
            if buffer:
                merged.append(' '.join(buffer))
                buffer = []
            merged.append(line)
    
    if buffer:
        merged.append(' '.join(buffer))
    
    return '\n'.join(merged)


def detect_chapters(text):
    """Split text into chapters based on chapter/section headers."""
    chapters = []
    
    # Find all chapter header positions
    matches = list(CHAPTER_RE.finditer(text))
    
    if not matches:
        # No chapters detected — treat entire text as one chapter
        return [{"chapter": 1, "text": text}]
    
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chapter_text = text[start:end].strip()
        if chapter_text:
            # Extract chapter number from header
            header = match.group(0)
            chapters.append({
                "chapter": i + 1,
                "header": header,
                "text": chapter_text
            })
    
    return chapters


def extract_pdf(pdf_path, output_dir, slug=None, bucket="unknown"):
    """Extract text from a PDF with diacritics preservation and formatting."""
    doc = fitz.open(pdf_path)
    
    if not slug:
        slug = os.path.basename(pdf_path).replace('.pdf', '').lower().replace(' ', '-')
    
    # Extract all text
    full_text = ""
    pages_with_text = 0
    total_pages = len(doc)
    
    for i, page in enumerate(doc):
        text = page.get_text("text")  # plain text extraction, preserves Unicode
        if text.strip():
            pages_with_text += 1
        full_text += text + "\n\n"
    
    doc.close()
    
    # Clean the text
    cleaned_text = clean_text(full_text)
    
    # Detect chapters
    chapters = detect_chapters(cleaned_text)
    
    # Write output
    text_dir = os.path.join(output_dir, 'text')
    os.makedirs(text_dir, exist_ok=True)
    
    diacritic_count = sum(1 for c in cleaned_text if c in DIACRITICS)
    
    for ch in chapters:
        md_path = os.path.join(text_dir, f"v1-c{ch['chapter']}.md")
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(f"---\ntitle: \"{ch.get('header', 'Chapter ' + str(ch['chapter']))}\"\n")
            f.write(f"book: \"{os.path.basename(pdf_path)}\"\n")
            f.write(f"bucket: {bucket}\n")
            f.write(f"slug: {slug}\n")
            f.write(f"chapter: {ch['chapter']}\n")
            f.write(f"source: \"{pdf_path}\"\n")
            f.write(f"extraction: pymupdf-text\n")
            f.write(f"diacritics: {diacritic_count}\n")
            f.write(f"---\n\n")
            f.write(ch['text'])
        
        print(f"  v1-c{ch['chapter']}.md: {len(ch['text'])}c", flush=True)
    
    # Write metadata
    meta = {
        "slug": slug,
        "bucket": bucket,
        "pdf": os.path.basename(pdf_path),
        "total_pages": total_pages,
        "pages_with_text": pages_with_text,
        "chapters": len(chapters),
        "diacritics": diacritic_count,
        "extracted_at": datetime.utcnow().isoformat() + "Z"
    }
    
    meta_path = os.path.join(output_dir, '_extract_meta.json')
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    
    print(f"\n  {slug}: {len(chapters)} chapters, {diacritic_count} diacritics, {pages_with_text}/{total_pages} pages with text")
    return meta


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Extract text from PDF with diacritics preservation')
    parser.add_argument('pdf_path', help='Path to PDF file')
    parser.add_argument('output_dir', help='Output directory')
    parser.add_argument('--slug', help='Text slug (default: PDF filename)')
    parser.add_argument('--bucket', default='unknown', help='Bucket ID')
    args = parser.parse_args()
    
    extract_pdf(args.pdf_path, args.output_dir, args.slug, args.bucket)
