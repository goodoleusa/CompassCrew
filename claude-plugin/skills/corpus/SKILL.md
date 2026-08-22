---
description: "Corpus and PDF tooling — search, read, and manage ingested document buckets, and (pro tier) run raw PDF extract/OCR/merge/split, all over MCP. Use when the user references a PDF, a corpus bucket, a source document, wants a bibliography, or wants to search/read ingested text."
---

# corpus — document corpus and PDF tooling

Two tools, two tiers, both server-side. No PDF parsing, OCR, chunking, or bibliography synthesis
happens in this plugin — that pipeline is real IP and stays on the VPS (`corpus.py`,
`pdf_toolkit.py`).

## `reckon_corpus` — free tier, ingested-text operations

```
reckon_corpus  verb=buckets                              # list corpus buckets
reckon_corpus  verb=buckets  action=create|delete|rename  bucket=...
reckon_corpus  verb=ingest   bucket=... source=...        # or sources=[...] for batch
reckon_corpus  verb=texts    bucket=...                   # list ingested texts in a bucket
reckon_corpus  verb=manifest bucket=... slug=...
reckon_corpus  verb=toc      bucket=... slug=...
reckon_corpus  verb=read     bucket=... slug=...
reckon_corpus  verb=search   bucket=... query=...
reckon_corpus  verb=bibliography  bucket=...
reckon_corpus  verb=thread   bucket=... slug=...          # cross-doc thread linking
reckon_corpus  verb=annotate | verb=annotations  bucket=... slug=...
```

This covers the common case — a PDF or other source has already been ingested into a bucket, and
the user wants to search, read, cite, or annotate it. All free tier.

## `reckon_pdf` — pro tier, raw PDF operations

```
reckon_pdf  verb=info       path=...                      # metadata, page count
reckon_pdf  verb=extract    path=...
reckon_pdf  verb=ocr        path=...
reckon_pdf  verb=merge      paths=[...]
reckon_pdf  verb=split      path=...
reckon_pdf  verb=to_images  path=...
reckon_pdf  verb=md_to_pdf  markdown=...
```

These are gated `pro` in the live tool registry — a free-tier caller will get back
`{error_type: "tier_gate"}`. When that happens, say so plainly and point at
`https://mcp.reckon.systems/signup` (or wherever the server's `upgrade_url` in the response
points — use that if present, it's more current than anything hardcoded here). Do **not** try to
work around the gate by extracting PDF text some other way (e.g. shelling out to a local `pdftotext`)
— that silently reimplements the gated capability outside the tier boundary the operator set up,
which defeats the point of gating it server-side. If the user needs raw PDF ops and is on free
tier, the correct answer is "ingest it into a corpus bucket instead" (free) or "this needs a paid
tier" — not a local workaround.

## Choosing between them

- User has a source they want searchable/citable long-term → `reckon_corpus verb=ingest`, then
  `search`/`read`/`bibliography`. Free.
- User wants to know what's in a bucket already → `reckon_corpus verb=texts` / `verb=toc`. Free.
- User wants raw extraction/OCR/merge/split of a PDF file as a one-off, not corpus-tracked →
  `reckon_pdf`. Pro tier, gated server-side.
