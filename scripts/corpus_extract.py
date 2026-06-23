#!/usr/bin/env python3
"""
Corpus extraction pipeline — diacritics-preserving PDF text extractor.

Extracts text from PDFs with full Unicode diacritics preservation.
Handles: ā ē ī ō ū š ṣ ṭ ḫ ʿ ʾ ẓ ḍ ḥ and all standard diacritical marks.

Supports multiple extraction backends: pymupdf, pdfplumber, pdfminer, pikepdf.
Optional table extraction and PDF report generation.

Usage:
    python3 corpus_extract.py <pdf_path> <output_dir> [--slug <slug>] [--bucket <bucket>]
    python3 corpus_extract.py <pdf_path> <output_dir> --method pdfplumber --extract-tables
    python3 corpus_extract.py <pdf_path> <output_dir> --method pdfminer --generate-pdf-report

Output:
    <output_dir>/text/v1-c<N>.md  — one markdown file per chapter/section
    <output_dir>/_extract_meta.json — extraction metadata
    <output_dir>/tables/ — extracted tables (if --extract-tables)
    <output_dir>/extraction_report.pdf — PDF report (if --generate-pdf-report)
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


def extract_with_pymupdf(pdf_path):
    """Extract text using PyMuPDF (fitz)."""
    doc = fitz.open(pdf_path)
    full_text = ""
    total_pages = len(doc)
    pages_with_text = 0
    
    for i, page in enumerate(doc):
        text = page.get_text("text")
        if text.strip():
            pages_with_text += 1
        full_text += text + "\n\n"
    
    doc.close()
    return full_text, total_pages, pages_with_text


def extract_with_pdfplumber(pdf_path):
    """Extract text using pdfplumber."""
    import pdfplumber
    
    full_text = ""
    total_pages = 0
    pages_with_text = 0
    
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages_with_text += 1
            full_text += text + "\n\n"
    
    return full_text, total_pages, pages_with_text


def extract_with_pdfminer(pdf_path):
    """Extract text using pdfminer.six."""
    from pdfminer.high_level import extract_text as pdfminer_extract
    
    full_text = pdfminer_extract(pdf_path)
    
    # pdfminer doesn't give us page count easily, so we use pikepdf for that
    import pikepdf
    with pikepdf.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
    
    # Estimate pages with text based on double newlines
    pages_with_text = full_text.count('\n\n')
    
    return full_text, total_pages, pages_with_text


def extract_with_pikepdf(pdf_path):
    """Extract text using pikepdf (basic text extraction)."""
    import pikepdf
    
    full_text = ""
    pages_with_text = 0
    
    with pikepdf.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        # pikepdf doesn't have built-in text extraction, so we use it for metadata
        # and fall back to pymupdf for actual text
        doc = fitz.open(pdf_path)
        for i, page in enumerate(doc):
            text = page.get_text("text")
            if text.strip():
                pages_with_text += 1
            full_text += text + "\n\n"
        doc.close()
    
    return full_text, total_pages, pages_with_text


def extract_tables(pdf_path, output_dir, method='pdfplumber'):
    """Extract tables from PDF and save as CSV files."""
    tables_dir = os.path.join(output_dir, 'tables')
    os.makedirs(tables_dir, exist_ok=True)
    
    table_count = 0
    
    if method == 'pdfplumber':
        import pdfplumber
        
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                tables = page.extract_tables()
                for table_num, table in enumerate(tables, 1):
                    if table:
                        csv_path = os.path.join(tables_dir, f"page{page_num}_table{table_num}.csv")
                        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
                            import csv
                            writer = csv.writer(f)
                            for row in table:
                                writer.writerow(row)
                        table_count += 1
                        print(f"  Table saved: {csv_path}")
    
    elif method == 'camelot':
        try:
            import camelot
            
            tables = camelot.read_pdf(pdf_path, pages='all', flavor='lattice')
            if len(tables) == 0:
                tables = camelot.read_pdf(pdf_path, pages='all', flavor='stream')
            
            for i, table in enumerate(tables):
                csv_path = os.path.join(tables_dir, f"table_{i+1}.csv")
                table.to_csv(csv_path)
                table_count += 1
                print(f"  Table saved: {csv_path}")
        except Exception as e:
            print(f"  Warning: Camelot extraction failed: {e}")
    
    return table_count


def generate_pdf_report(pdf_path, output_dir, meta, method, table_count=0):
    """Generate a PDF report of the extraction using reportlab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    
    report_path = os.path.join(output_dir, 'extraction_report.pdf')
    
    doc = SimpleDocTemplate(report_path, pagesize=letter)
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=24,
        spaceAfter=30
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=12
    )
    
    elements = []
    
    # Title
    elements.append(Paragraph("PDF Extraction Report", title_style))
    elements.append(Spacer(1, 0.2*inch))
    
    # PDF Information
    elements.append(Paragraph("Document Information", heading_style))
    
    pdf_name = os.path.basename(pdf_path)
    word_count = meta.get('word_count', 0)
    
    info_data = [
        ["Property", "Value"],
        ["PDF File", pdf_name],
        ["Total Pages", str(meta.get('total_pages', 0))],
        ["Pages with Text", str(meta.get('pages_with_text', 0))],
        ["Chapters Detected", str(meta.get('chapters', 0))],
        ["Word Count", str(word_count)],
        ["Diacritics Found", str(meta.get('diacritics', 0))],
        ["Tables Extracted", str(table_count)],
        ["Extraction Method", method],
        ["Extraction Date", meta.get('extracted_at', 'N/A')],
    ]
    
    info_table = Table(info_data, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    
    elements.append(info_table)
    elements.append(Spacer(1, 0.3*inch))
    
    # Chapter Summary
    if meta.get('chapters', 0) > 0:
        elements.append(Paragraph("Chapter Summary", heading_style))
        
        chapter_data = [["Chapter", "Characters"]]
        for ch in meta.get('chapter_details', []):
            chapter_data.append([f"Chapter {ch['chapter']}", str(len(ch['text']))])
        
        if len(chapter_data) > 1:
            ch_table = Table(chapter_data, colWidths=[2*inch, 4*inch])
            ch_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ]))
            elements.append(ch_table)
    
    # Build PDF
    doc.build(elements)
    print(f"\n  PDF report generated: {report_path}")
    
    return report_path


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


def extract_pdf(pdf_path, output_dir, slug=None, bucket="unknown", method='pymupdf', 
                extract_tables=False, generate_report=False):
    """Extract text from a PDF with diacritics preservation and formatting.
    
    Args:
        pdf_path: Path to PDF file
        output_dir: Output directory
        slug: Text slug (default: PDF filename)
        bucket: Bucket ID
        method: Extraction method ('pymupdf', 'pdfplumber', 'pdfminer', 'pikepdf')
        extract_tables: Whether to extract tables
        generate_report: Whether to generate PDF report
    """
    if not slug:
        slug = os.path.basename(pdf_path).replace('.pdf', '').lower().replace(' ', '-')
    
    print(f"\nExtracting: {os.path.basename(pdf_path)}", flush=True)
    print(f"  Method: {method}", flush=True)
    
    # Select extraction method
    extraction_methods = {
        'pymupdf': extract_with_pymupdf,
        'pdfplumber': extract_with_pdfplumber,
        'pdfminer': extract_with_pdfminer,
        'pikepdf': extract_with_pikepdf,
    }
    
    if method not in extraction_methods:
        print(f"  Warning: Unknown method '{method}', falling back to pymupdf", flush=True)
        method = 'pymupdf'
    
    try:
        full_text, total_pages, pages_with_text = extraction_methods[method](pdf_path)
    except Exception as e:
        print(f"  Error with {method}: {e}", flush=True)
        print("  Falling back to pymupdf...", flush=True)
        full_text, total_pages, pages_with_text = extract_with_pymupdf(pdf_path)
        method = 'pymupdf (fallback)'
    
    # Clean the text
    cleaned_text = clean_text(full_text)
    
    # Detect chapters
    chapters = detect_chapters(cleaned_text)
    
    # Write output
    text_dir = os.path.join(output_dir, 'text')
    os.makedirs(text_dir, exist_ok=True)
    
    diacritic_count = sum(1 for c in cleaned_text if c in DIACRITICS)
    word_count = len(cleaned_text.split())
    
    for ch in chapters:
        md_path = os.path.join(text_dir, f"v1-c{ch['chapter']}.md")
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(f"---\ntitle: \"{ch.get('header', 'Chapter ' + str(ch['chapter']))}\"\n")
            f.write(f"book: \"{os.path.basename(pdf_path)}\"\n")
            f.write(f"bucket: {bucket}\n")
            f.write(f"slug: {slug}\n")
            f.write(f"chapter: {ch['chapter']}\n")
            f.write(f"source: \"{pdf_path}\"\n")
            f.write(f"extraction: {method}\n")
            f.write(f"diacritics: {diacritic_count}\n")
            f.write(f"---\n\n")
            f.write(ch['text'])
        
        print(f"  v1-c{ch['chapter']}.md: {len(ch['text'])}c", flush=True)
    
    # Extract tables if requested
    table_count = 0
    if extract_tables:
        print(f"\n  Extracting tables...", flush=True)
        table_count = extract_tables_from_pdf(pdf_path, output_dir)
    
    # Write metadata
    meta = {
        "slug": slug,
        "bucket": bucket,
        "pdf": os.path.basename(pdf_path),
        "total_pages": total_pages,
        "pages_with_text": pages_with_text,
        "chapters": len(chapters),
        "chapter_details": chapters,
        "diacritics": diacritic_count,
        "word_count": word_count,
        "tables_extracted": table_count,
        "extraction_method": method,
        "extracted_at": datetime.utcnow().isoformat() + "Z"
    }
    
    meta_path = os.path.join(output_dir, '_extract_meta.json')
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    
    # Generate PDF report if requested
    if generate_report:
        print(f"\n  Generating PDF report...", flush=True)
        generate_pdf_report(pdf_path, output_dir, meta, method, table_count)
    
    print(f"\n  {slug}: {len(chapters)} chapters, {diacritic_count} diacritics, "
          f"{word_count} words, {pages_with_text}/{total_pages} pages with text", flush=True)
    return meta


def extract_tables_from_pdf(pdf_path, output_dir):
    """Extract tables from PDF using available methods."""
    tables_dir = os.path.join(output_dir, 'tables')
    os.makedirs(tables_dir, exist_ok=True)
    
    table_count = 0
    
    # Try pdfplumber first
    try:
        import pdfplumber
        
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages, 1):
                tables = page.extract_tables()
                for table_num, table in enumerate(tables, 1):
                    if table:
                        csv_path = os.path.join(tables_dir, f"page{page_num}_table{table_num}.csv")
                        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
                            import csv
                            writer = csv.writer(f)
                            for row in table:
                                writer.writerow(row)
                        table_count += 1
                        print(f"  Table saved: page{page_num}_table{table_num}.csv")
        
        if table_count > 0:
            print(f"  Extracted {table_count} tables using pdfplumber")
            return table_count
            
    except ImportError:
        print("  pdfplumber not available, trying camelot...")
    except Exception as e:
        print(f"  pdfplumber extraction failed: {e}")
    
    # Try camelot as fallback
    try:
        import camelot
        
        tables = camelot.read_pdf(pdf_path, pages='all', flavor='lattice')
        if len(tables) == 0:
            tables = camelot.read_pdf(pdf_path, pages='all', flavor='stream')
        
        for i, table in enumerate(tables):
            csv_path = os.path.join(tables_dir, f"table_{i+1}.csv")
            table.to_csv(csv_path)
            table_count += 1
            print(f"  Table saved: table_{i+1}.csv")
        
        if table_count > 0:
            print(f"  Extracted {table_count} tables using camelot")
            
    except ImportError:
        print("  camelot not available for table extraction")
    except Exception as e:
        print(f"  camelot extraction failed: {e}")
    
    if table_count == 0:
        print("  No tables found in PDF")
    
    return table_count


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Extract text from PDF with diacritics preservation',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s document.pdf output/
  %(prog)s document.pdf output/ --method pdfplumber
  %(prog)s document.pdf output/ --extract-tables
  %(prog)s document.pdf output/ --method pdfminer --generate-pdf-report
  %(prog)s document.pdf output/ --method pymupdf --extract-tables --generate-pdf-report
        """
    )
    parser.add_argument('pdf_path', help='Path to PDF file')
    parser.add_argument('output_dir', help='Output directory')
    parser.add_argument('--slug', help='Text slug (default: PDF filename)')
    parser.add_argument('--bucket', default='unknown', help='Bucket ID')
    parser.add_argument('--method', default='pymupdf', 
                        choices=['pymupdf', 'pdfplumber', 'pdfminer', 'pikepdf'],
                        help='Extraction backend (default: pymupdf)')
    parser.add_argument('--extract-tables', action='store_true',
                        help='Extract tables and save as CSV files')
    parser.add_argument('--generate-pdf-report', action='store_true',
                        help='Generate a PDF report of the extraction')
    args = parser.parse_args()
    
    extract_pdf(args.pdf_path, args.output_dir, args.slug, args.bucket,
                args.method, args.extract_tables, args.generate_pdf_report)
