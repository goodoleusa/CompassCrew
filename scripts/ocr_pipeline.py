#!/usr/bin/env python3
"""
OCR pipeline for hypnosis corpus PDFs.
Extracts text from image-based PDFs using tesseract + pymupdf.
Preserves chapter structure and diacritics.

Enhanced with ocrmypdf support for creating searchable PDFs.

Usage:
    python ocr_pipeline.py --pdf-dir <dir> --output-base <dir>
    python ocr_pipeline.py --pdf-dir <dir> --output-base <dir> --enhance --output-pdf searchable.pdf
"""
import fitz  # pymupdf
import pytesseract
from PIL import Image
import io, os, sys, json, re

DPI = 300

def ocr_page(page, dpi=DPI):
    """Render a PDF page to image and OCR it."""
    mat = fitz.Matrix(dpi/72, dpi/72)
    pix = page.get_pixmap(matrix=mat)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    text = pytesseract.image_to_string(img, lang='eng')
    return text.strip()


def enhance_pdf_with_ocr(input_pdf, output_pdf, dpi=DPI):
    """Use ocrmypdf to add OCR layer to PDF, creating a searchable PDF.
    
    Args:
        input_pdf: Path to input PDF
        output_pdf: Path to output searchable PDF
        dpi: DPI for OCR rendering
    """
    try:
        import ocrmypdf
        
        print(f"  Enhancing PDF with OCR: {os.path.basename(input_pdf)}")
        print(f"  Output: {output_pdf}")
        
        ocrmypdf.ocr(
            input_pdf,
            output_pdf,
            language='eng',
            dpi=dpi,
            optimize=1,
            progress_bar=True,
            skip_text=True,  # Skip pages that already have text
        )
        
        print(f"  Searchable PDF created: {output_pdf}")
        return True
        
    except ImportError:
        print("  Error: ocrmypdf not installed. Install with: pip install ocrmypdf")
        return False
    except Exception as e:
        print(f"  Error enhancing PDF: {e}")
        return False

def extract_pdf(pdf_path, output_dir, slug):
    """Extract text from PDF, using OCR for image-only pages."""
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    has_text = 0
    needs_ocr = 0
    
    # First pass: determine which pages need OCR
    page_info = []
    for i, page in enumerate(doc):
        text = page.get_text().strip()
        if len(text) > 50:
            page_info.append({"page": i, "method": "text", "chars": len(text)})
            has_text += 1
        else:
            page_info.append({"page": i, "method": "ocr", "chars": 0})
            needs_ocr += 1
    
    print(f"  {slug}: {total_pages} pages - {has_text} with text, {needs_ocr} need OCR", flush=True)
    
    # Extract text
    chapters = []
    current_chapter = []
    chapter_num = 1
    
    for info in page_info:
        page = doc[info["page"]]
        if info["method"] == "text":
            text = page.get_text().strip()
        else:
            text = ocr_page(page)
        
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if re.match(r'^(chapter|CHAPTER)\s+\d+', line) and current_chapter:
                chapters.append({
                    "chapter": chapter_num,
                    "text": '\n'.join(current_chapter)
                })
                chapter_num += 1
                current_chapter = []
            current_chapter.append(line)
    
    if current_chapter:
        chapters.append({
            "chapter": chapter_num,
            "text": '\n'.join(current_chapter)
        })
    
    if len(chapters) == 0:
        all_text = []
        for info in page_info:
            page = doc[info["page"]]
            if info["method"] == "text":
                text = page.get_text().strip()
            else:
                text = ocr_page(page)
            all_text.append(text)
        chapters = [{"chapter": 1, "text": '\n\n'.join(all_text)}]
    
    os.makedirs(output_dir, exist_ok=True)
    
    for ch in chapters:
        md_path = os.path.join(output_dir, f"v1-c{ch['chapter']}.md")
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(f"---\ntitle: \"Chapter {ch['chapter']}\"\n")
            f.write(f"book: \"{os.path.basename(pdf_path)}\"\n")
            f.write(f"bucket: hypnosis\n")
            f.write(f"slug: {slug}\n")
            f.write(f"chapter: {ch['chapter']}\n")
            f.write(f"source: \"{pdf_path}\"\n")
            f.write(f"extraction: OCR (tesseract {pytesseract.get_tesseract_version()})\n")
            f.write(f"---\n\n")
            f.write(ch['text'])
        
        chars = len(ch['text'])
        print(f"    v1-c{ch['chapter']}.md: {chars}c", flush=True)
    
    doc.close()
    return {"chapters": len(chapters), "pages": total_pages, "ocr_pages": needs_ocr}

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(
        description='OCR pipeline for hypnosis PDFs with optional PDF enhancement',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --pdf-dir ./pdfs --output-base ./output
  %(prog)s --pdf-dir ./pdfs --output-base ./output --enhance
  %(prog)s --pdf-dir ./pdfs --output-base ./output --enhance --output-pdf searchable.pdf
  %(prog)s --pdf-dir ./pdfs --output-base ./output --slug-map slugs.json
        """
    )
    parser.add_argument('--pdf-dir', required=True, help='Directory containing PDFs')
    parser.add_argument('--output-base', required=True, help='Base output directory')
    parser.add_argument('--slug-map', help='JSON mapping PDF filenames to slugs')
    parser.add_argument('--enhance', action='store_true',
                        help='Use ocrmypdf to create searchable PDF with OCR layer')
    parser.add_argument('--output-pdf', help='Path for OCR-enhanced PDF (used with --enhance)')
    parser.add_argument('--dpi', type=int, default=300, help='DPI for OCR rendering (default: 300)')
    args = parser.parse_args()
    
    pdf_dir = args.pdf_dir
    output_base = args.output_base
    
    slug_map = {}
    if args.slug_map:
        with open(args.slug_map) as f:
            slug_map = json.load(f)
    
    results = []
    for pdf_file in sorted(os.listdir(pdf_dir)):
        if not pdf_file.endswith('.pdf'):
            continue
        
        pdf_path = os.path.join(pdf_dir, pdf_file)
        
        if pdf_file in slug_map:
            slug = slug_map[pdf_file]
        else:
            slug = pdf_file.replace('.pdf', '').lower().replace(' ', '-')
        
        output_dir = os.path.join(output_base, slug, 'text')
        
        print(f"\nProcessing: {pdf_file} -> {slug}", flush=True)
        result = extract_pdf(pdf_path, output_dir, slug)
        result['slug'] = slug
        result['pdf'] = pdf_file
        
        # Enhance PDF with OCR if requested
        if args.enhance:
            if args.output_pdf:
                # If output_pdf is a directory, create PDF there with original name
                if os.path.isdir(args.output_pdf) or args.output_pdf.endswith('/'):
                    os.makedirs(args.output_pdf, exist_ok=True)
                    enhanced_pdf_path = os.path.join(args.output_pdf, f"enhanced_{pdf_file}")
                else:
                    enhanced_pdf_path = args.output_pdf
                    # If processing multiple PDFs, append slug to avoid overwriting
                    if len([f for f in os.listdir(pdf_dir) if f.endswith('.pdf')]) > 1:
                        base, ext = os.path.splitext(enhanced_pdf_path)
                        enhanced_pdf_path = f"{base}_{slug}{ext}"
            else:
                enhanced_pdf_path = os.path.join(output_base, slug, f"enhanced_{pdf_file}")
            
            os.makedirs(os.path.dirname(enhanced_pdf_path), exist_ok=True)
            success = enhance_pdf_with_ocr(pdf_path, enhanced_pdf_path, args.dpi)
            result['enhanced_pdf'] = enhanced_pdf_path if success else None
            result['enhance_success'] = success
        
        results.append(result)
    
    print(f"\n=== Summary ===", flush=True)
    for r in results:
        print(f"  {r['slug']}: {r['chapters']} chapters, {r['ocr_pages']}/{r['pages']} OCR pages", flush=True)
        if r.get('enhanced_pdf'):
            print(f"    Enhanced PDF: {r['enhanced_pdf']}", flush=True)
    
    with open(os.path.join(output_base, '_ocr_summary.json'), 'w') as f:
        json.dump(results, f, indent=2)
    
    print("Done.", flush=True)
