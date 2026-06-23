#!/usr/bin/env python3
"""
Unified PDF Toolkit CLI - A comprehensive PDF processing tool.

Provides a unified interface for all PDF operations:
- extract: Text extraction with multiple backend support
- ocr: OCR processing for scanned PDFs
- merge: Combine multiple PDFs
- split: Split PDF into parts
- to-images: Convert PDF pages to images
- md-to-pdf: Convert Markdown to PDF
- info: Get PDF metadata and information

Usage:
    python pdf_toolkit.py extract input.pdf output/ --method pymupdf --tables --report
    python pdf_toolkit.py ocr input.pdf output/ --enhance --output-pdf searchable.pdf
    python pdf_toolkit.py merge input1.pdf input2.pdf output.pdf
    python pdf_toolkit.py split input.pdf output/ --pages 1-10,11-20
    python pdf_toolkit.py to-images input.pdf output/ --dpi 300
    python pdf_toolkit.py md-to-pdf input.md output.pdf --style academic
    python pdf_toolkit.py info input.pdf
"""

import argparse
import os
import sys
from datetime import datetime


def cmd_extract(args):
    """Extract text from PDF with various backend options."""
    import fitz  # pymupdf
    
    pdf_path = args.input
    output_dir = args.output
    method = args.method
    
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found: {pdf_path}")
        return 1
    
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"Extracting text from: {os.path.basename(pdf_path)}")
    print(f"Method: {method}")
    print(f"Output: {output_dir}")
    
    # Extract text based on method
    if method == 'pymupdf':
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
        
    elif method == 'pdfplumber':
        try:
            import pdfplumber
        except ImportError:
            print("Error: pdfplumber not installed. Install with: pip install pdfplumber")
            return 1
            
        full_text = ""
        pages_with_text = 0
        
        with pdfplumber.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            for page in pdf.pages:
                text = page.extract_text() or ""
                if text.strip():
                    pages_with_text += 1
                full_text += text + "\n\n"
                
    elif method == 'pdfminer':
        try:
            from pdfminer.high_level import extract_text as pdfminer_extract
        except ImportError:
            print("Error: pdfminer.six not installed. Install with: pip install pdfminer.six")
            return 1
            
        full_text = pdfminer_extract(pdf_path)
        
        import pikepdf
        with pikepdf.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
        pages_with_text = full_text.count('\n\n')
        
    elif method == 'pikepdf':
        try:
            import pikepdf
        except ImportError:
            print("Error: pikepdf not installed. Install with: pip install pikepdf")
            return 1
            
        doc = fitz.open(pdf_path)
        full_text = ""
        pages_with_text = 0
        
        with pikepdf.open(pdf_path) as pdf:
            total_pages = len(pdf.pages)
            
        for i, page in enumerate(doc):
            text = page.get_text("text")
            if text.strip():
                pages_with_text += 1
            full_text += text + "\n\n"
        doc.close()
    
    # Save text
    text_file = os.path.join(output_dir, f"extracted_text.txt")
    with open(text_file, 'w', encoding='utf-8') as f:
        f.write(full_text)
    print(f"Text saved to: {text_file}")
    
    # Extract tables if requested
    table_count = 0
    if args.tables:
        print("\nExtracting tables...")
        tables_dir = os.path.join(output_dir, 'tables')
        os.makedirs(tables_dir, exist_ok=True)
        
        try:
            import pdfplumber
            
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages, 1):
                    tables = page.extract_tables()
                    for table_num, table in enumerate(tables, 1):
                        if table:
                            import csv
                            csv_path = os.path.join(tables_dir, f"page{page_num}_table{table_num}.csv")
                            with open(csv_path, 'w', encoding='utf-8', newline='') as f:
                                writer = csv.writer(f)
                                for row in table:
                                    writer.writerow(row)
                            table_count += 1
                            print(f"  Table saved: page{page_num}_table{table_num}.csv")
                            
        except ImportError:
            print("  Warning: pdfplumber not available for table extraction")
        except Exception as e:
            print(f"  Warning: Table extraction failed: {e}")
        
        if table_count > 0:
            print(f"Extracted {table_count} tables")
        else:
            print("No tables found")
    
    # Generate report if requested
    if args.report:
        print("\nGenerating PDF report...")
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
            from reportlab.lib import colors
            
            report_path = os.path.join(output_dir, 'extraction_report.pdf')
            doc = SimpleDocTemplate(report_path, pagesize=letter)
            styles = getSampleStyleSheet()
            
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Title'],
                fontSize=24,
                spaceAfter=30
            )
            
            elements = []
            elements.append(Paragraph("PDF Extraction Report", title_style))
            elements.append(Spacer(1, 0.2*inch))
            
            word_count = len(full_text.split())
            
            info_data = [
                ["Property", "Value"],
                ["PDF File", os.path.basename(pdf_path)],
                ["Total Pages", str(total_pages)],
                ["Pages with Text", str(pages_with_text)],
                ["Word Count", str(word_count)],
                ["Tables Extracted", str(table_count)],
                ["Extraction Method", method],
                ["Extraction Date", datetime.now().isoformat()],
            ]
            
            info_table = Table(info_data, colWidths=[2*inch, 4*inch])
            info_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ]))
            
            elements.append(info_table)
            doc.build(elements)
            print(f"Report saved to: {report_path}")
            
        except ImportError:
            print("  Warning: reportlab not available for report generation")
        except Exception as e:
            print(f"  Warning: Report generation failed: {e}")
    
    # Print summary
    word_count = len(full_text.split())
    print(f"\nSummary:")
    print(f"  Total pages: {total_pages}")
    print(f"  Pages with text: {pages_with_text}")
    print(f"  Word count: {word_count}")
    print(f"  Tables extracted: {table_count}")
    
    return 0


def cmd_ocr(args):
    """OCR processing for scanned PDFs."""
    import fitz
    import pytesseract
    from PIL import Image
    
    pdf_path = args.input
    output_dir = args.output
    
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found: {pdf_path}")
        return 1
    
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"Processing OCR for: {os.path.basename(pdf_path)}")
    
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    
    all_text = []
    for i, page in enumerate(doc):
        print(f"  Processing page {i+1}/{total_pages}...")
        
        # Check if page has text
        text = page.get_text().strip()
        if len(text) > 50:
            all_text.append(text)
        else:
            # OCR the page
            mat = fitz.Matrix(args.dpi/72, args.dpi/72)
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            text = pytesseract.image_to_string(img, lang='eng')
            all_text.append(text.strip())
    
    doc.close()
    
    # Save extracted text
    text_file = os.path.join(output_dir, "ocr_text.txt")
    with open(text_file, 'w', encoding='utf-8') as f:
        f.write('\n\n'.join(all_text))
    print(f"OCR text saved to: {text_file}")
    
    # Enhance PDF if requested
    if args.enhance:
        print("\nEnhancing PDF with OCR layer...")
        try:
            import ocrmypdf
            
            output_pdf = args.output_pdf
            if not output_pdf:
                base_name = os.path.splitext(os.path.basename(pdf_path))[0]
                output_pdf = os.path.join(output_dir, f"{base_name}_searchable.pdf")
            
            os.makedirs(os.path.dirname(output_pdf) if os.path.dirname(output_pdf) else '.', exist_ok=True)
            
            ocrmypdf.ocr(
                pdf_path,
                output_pdf,
                language='eng',
                dpi=args.dpi,
                optimize=1,
                skip_text=True,
            )
            print(f"Searchable PDF saved to: {output_pdf}")
            
        except ImportError:
            print("  Error: ocrmypdf not installed. Install with: pip install ocrmypdf")
        except Exception as e:
            print(f"  Error enhancing PDF: {e}")
    
    print(f"\nOCR complete. Processed {total_pages} pages.")
    return 0


def cmd_merge(args):
    """Merge multiple PDFs into one."""
    try:
        from pypdf import PdfWriter, PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfWriter, PdfReader
        except ImportError:
            print("Error: pypdf not installed. Install with: pip install pypdf")
            return 1
    
    output_path = args.output
    input_files = args.inputs
    
    print(f"Merging {len(input_files)} PDFs...")
    
    writer = PdfWriter()
    
    for pdf_file in input_files:
        if not os.path.exists(pdf_file):
            print(f"Error: PDF file not found: {pdf_file}")
            return 1
        
        print(f"  Adding: {os.path.basename(pdf_file)}")
        reader = PdfReader(pdf_file)
        for page in reader.pages:
            writer.add_page(page)
    
    # Create output directory if needed
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    
    with open(output_path, 'wb') as f:
        writer.write(f)
    
    print(f"Merged PDF saved to: {output_path}")
    return 0


def cmd_split(args):
    """Split PDF into parts."""
    try:
        from pypdf import PdfWriter, PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfWriter, PdfReader
        except ImportError:
            print("Error: pypdf not installed. Install with: pip install pypdf")
            return 1
    
    pdf_path = args.input
    output_dir = args.output
    
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found: {pdf_path}")
        return 1
    
    os.makedirs(output_dir, exist_ok=True)
    
    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)
    
    print(f"Splitting: {os.path.basename(pdf_path)} ({total_pages} pages)")
    
    # Parse page ranges
    page_ranges = []
    for range_str in args.pages.split(','):
        if '-' in range_str:
            start, end = range_str.split('-')
            start = int(start) - 1  # Convert to 0-indexed
            end = int(end)
            page_ranges.append((start, end))
        else:
            page = int(range_str) - 1
            page_ranges.append((page, page + 1))
    
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    
    for i, (start, end) in enumerate(page_ranges):
        if start >= total_pages:
            print(f"  Warning: Range {start+1}-{end} exceeds document length, skipping")
            continue
        
        end = min(end, total_pages)
        
        writer = PdfWriter()
        for page_num in range(start, end):
            writer.add_page(reader.pages[page_num])
        
        output_path = os.path.join(output_dir, f"{base_name}_part{i+1}_pages{start+1}-{end}.pdf")
        with open(output_path, 'wb') as f:
            writer.write(f)
        
        print(f"  Part {i+1} (pages {start+1}-{end}): {output_path}")
    
    print(f"\nSplit complete. Created {len(page_ranges)} parts.")
    return 0


def cmd_to_images(args):
    """Convert PDF pages to images."""
    try:
        from pdf2image import convert_from_path
    except ImportError:
        print("Error: pdf2image not installed. Install with: pip install pdf2image")
        return 1
    
    pdf_path = args.input
    output_dir = args.output
    dpi = args.dpi
    fmt = args.format
    
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found: {pdf_path}")
        return 1
    
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"Converting PDF to images: {os.path.basename(pdf_path)}")
    print(f"DPI: {dpi}, Format: {fmt}")
    
    try:
        images = convert_from_path(pdf_path, dpi=dpi)
        
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        
        for i, image in enumerate(images):
            image_path = os.path.join(output_dir, f"{base_name}_page{i+1}.{fmt}")
            image.save(image_path, fmt.upper())
            print(f"  Page {i+1}: {image_path}")
        
        print(f"\nConversion complete. Created {len(images)} images.")
        
    except Exception as e:
        print(f"Error converting PDF: {e}")
        return 1
    
    return 0


def cmd_md_to_pdf(args):
    """Convert Markdown to PDF."""
    try:
        import markdown
        from weasyprint import HTML
    except ImportError as e:
        print(f"Error: Required package not installed: {e}")
        print("Install with: pip install markdown weasyprint")
        return 1
    
    md_path = args.input
    output_path = args.output
    style = args.style
    
    if not os.path.exists(md_path):
        print(f"Error: Markdown file not found: {md_path}")
        return 1
    
    print(f"Converting Markdown to PDF: {os.path.basename(md_path)}")
    print(f"Style: {style}")
    
    # Read markdown
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
    
    # Convert to HTML
    html_content = markdown.markdown(md_content, extensions=['extra', 'codehilite', 'toc'])
    
    # Apply style
    styles = {
        'academic': '''
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; max-width: 8.5in; margin: 1in auto; }
            h1 { font-size: 18pt; text-align: center; }
            h2 { font-size: 14pt; }
            code { font-family: 'Courier New', monospace; font-size: 10pt; }
            pre { background: #f5f5f5; padding: 10px; border-radius: 5px; }
        ''',
        'modern': '''
            body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.6; max-width: 8.5in; margin: 1in auto; color: #333; }
            h1 { color: #2c3e50; border-bottom: 2px solid #3498db; }
            h2 { color: #34495e; }
            code { font-family: 'Consolas', monospace; background: #f8f8f8; padding: 2px 4px; }
            pre { background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 5px; }
        ''',
        'minimal': '''
            body { font-family: 'Georgia', serif; font-size: 11pt; line-height: 1.6; max-width: 7in; margin: 1in auto; }
            h1, h2, h3 { font-weight: normal; }
            code { font-family: monospace; }
        ''',
    }
    
    css = styles.get(style, styles['modern'])
    
    full_html = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>{css}</style>
    </head>
    <body>{html_content}</body>
    </html>
    '''
    
    # Create output directory if needed
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    
    # Convert to PDF
    try:
        HTML(string=full_html).write_pdf(output_path)
        print(f"PDF saved to: {output_path}")
    except Exception as e:
        print(f"Error generating PDF: {e}")
        return 1
    
    return 0


def cmd_info(args):
    """Get PDF metadata and information."""
    try:
        import pikepdf
    except ImportError:
        print("Error: pikepdf not installed. Install with: pip install pikepdf")
        return 1
    
    pdf_path = args.input
    
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found: {pdf_path}")
        return 1
    
    print(f"PDF Information: {os.path.basename(pdf_path)}")
    print("=" * 50)
    
    try:
        with pikepdf.open(pdf_path) as pdf:
            # Basic info
            print(f"Pages: {len(pdf.pages)}")
            print(f"PDF Version: {pdf.pdf_version}")
            
            # File size
            file_size = os.path.getsize(pdf_path)
            if file_size < 1024:
                size_str = f"{file_size} bytes"
            elif file_size < 1024 * 1024:
                size_str = f"{file_size / 1024:.1f} KB"
            else:
                size_str = f"{file_size / (1024 * 1024):.1f} MB"
            print(f"File Size: {size_str}")
            
            # Metadata
            if pdf.docinfo:
                print("\nMetadata:")
                for key, value in pdf.docinfo.items():
                    if str(value):
                        print(f"  {key}: {value}")
            
            # Page size (first page)
            if pdf.pages:
                page = pdf.pages[0]
                if '/MediaBox' in page:
                    mediabox = page['/MediaBox']
                    width = float(mediabox[2]) - float(mediabox[0])
                    height = float(mediabox[3]) - float(mediabox[1])
                    print(f"\nPage Size (first page): {width:.1f} x {height:.1f} points")
                    print(f"  ({width/72:.2f} x {height/72:.2f} inches)")
            
            # Encryption
            print(f"\nEncrypted: {pdf.is_encrypted}")
            
            # Check for text content
            import fitz
            doc = fitz.open(pdf_path)
            pages_with_text = 0
            for page in doc:
                if page.get_text().strip():
                    pages_with_text += 1
            doc.close()
            
            print(f"Pages with text: {pages_with_text}/{len(pdf.pages)}")
            
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return 1
    
    return 0


def main():
    parser = argparse.ArgumentParser(
        description='Unified PDF Toolkit - Comprehensive PDF processing',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s extract input.pdf output/ --method pymupdf --tables --report
  %(prog)s ocr input.pdf output/ --enhance --output-pdf searchable.pdf
  %(prog)s merge input1.pdf input2.pdf output.pdf
  %(prog)s split input.pdf output/ --pages 1-10,11-20
  %(prog)s to-images input.pdf output/ --dpi 300
  %(prog)s md-to-pdf input.md output.pdf --style academic
  %(prog)s info input.pdf
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    
    # Extract command
    extract_parser = subparsers.add_parser('extract', help='Extract text from PDF')
    extract_parser.add_argument('input', help='Input PDF file')
    extract_parser.add_argument('output', help='Output directory')
    extract_parser.add_argument('--method', default='pymupdf',
                               choices=['pymupdf', 'pdfplumber', 'pdfminer', 'pikepdf'],
                               help='Extraction backend (default: pymupdf)')
    extract_parser.add_argument('--tables', action='store_true',
                               help='Extract tables as CSV files')
    extract_parser.add_argument('--report', action='store_true',
                               help='Generate PDF extraction report')
    
    # OCR command
    ocr_parser = subparsers.add_parser('ocr', help='OCR processing for scanned PDFs')
    ocr_parser.add_argument('input', help='Input PDF file')
    ocr_parser.add_argument('output', help='Output directory')
    ocr_parser.add_argument('--dpi', type=int, default=300,
                           help='DPI for OCR rendering (default: 300)')
    ocr_parser.add_argument('--enhance', action='store_true',
                           help='Create searchable PDF with OCR layer')
    ocr_parser.add_argument('--output-pdf', help='Path for enhanced PDF')
    
    # Merge command
    merge_parser = subparsers.add_parser('merge', help='Merge multiple PDFs')
    merge_parser.add_argument('inputs', nargs='+', help='Input PDF files')
    merge_parser.add_argument('output', help='Output PDF file')
    
    # Split command
    split_parser = subparsers.add_parser('split', help='Split PDF into parts')
    split_parser.add_argument('input', help='Input PDF file')
    split_parser.add_argument('output', help='Output directory')
    split_parser.add_argument('--pages', required=True,
                             help='Page ranges (e.g., 1-10,11-20)')
    
    # To-images command
    to_images_parser = subparsers.add_parser('to-images', help='Convert PDF to images')
    to_images_parser.add_argument('input', help='Input PDF file')
    to_images_parser.add_argument('output', help='Output directory')
    to_images_parser.add_argument('--dpi', type=int, default=300,
                                 help='DPI for rendering (default: 300)')
    to_images_parser.add_argument('--format', default='png',
                                 choices=['png', 'jpg', 'jpeg', 'tiff', 'bmp'],
                                 help='Image format (default: png)')
    
    # MD-to-PDF command
    md_to_pdf_parser = subparsers.add_parser('md-to-pdf', help='Convert Markdown to PDF')
    md_to_pdf_parser.add_argument('input', help='Input Markdown file')
    md_to_pdf_parser.add_argument('output', help='Output PDF file')
    md_to_pdf_parser.add_argument('--style', default='modern',
                                 choices=['academic', 'modern', 'minimal'],
                                 help='PDF style (default: modern)')
    
    # Info command
    info_parser = subparsers.add_parser('info', help='Get PDF information')
    info_parser.add_argument('input', help='Input PDF file')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    # Execute command
    commands = {
        'extract': cmd_extract,
        'ocr': cmd_ocr,
        'merge': cmd_merge,
        'split': cmd_split,
        'to-images': cmd_to_images,
        'md-to-pdf': cmd_md_to_pdf,
        'info': cmd_info,
    }
    
    return commands[args.command](args)


if __name__ == '__main__':
    sys.exit(main())
