#!/usr/bin/env python3
"""corpus_pdf_lite.py — the corpus PDF capability as a UTIL TOOL, in every repo.

WHY THIS FILE EXISTS
====================
The PDF half of the corpus lived in three shapes, none of them a util:

    runtime/mcp-server/tools/pdf_toolkit.py    460 lines — reachable ONLY through an MCP
                                               server. A capability you can only get at by
                                               starting a server is not a util tool: no lane
                                               can call it from a shell, and no gate can.
    scripts/export_publications_to_pdf.sh      238 lines — the GENERATION half, bash, with
                                               a hard-coded vault path and `set -euo
                                               pipefail`, so a missing backend is a CRASH,
                                               never an UNMEASURED.
    scripts/measure/charter_report_build.py    a third PDF path, private to one report.

This is the litified UNION of the first two: every extraction/OCR/inspection backend that
pdf_toolkit reached, plus the markdown→PDF generation pipeline the export script ran, behind
one verb-dispatched CLI + `api()`, stdlib-at-import, in all three repos.

THE IMPORT RULE THAT MAKES A THREE-REPO PDF UTIL POSSIBLE
========================================================
**Every PDF library import in this file is FUNCTION-LOCAL. There are zero at module scope.**

That is not style. A util that dies on import in one of three repos is WORSE than one that
is absent, because it takes its caller down with it — an `import corpus_pdf_lite` at the top
of a gate turns "this repo has no pymupdf" into "this gate cannot run at all", and the gate
reports nothing rather than reporting a missing package. Absent and fine are different facts,
and so are unavailable and broken. Here, a repo with no PDF stack imports this module
perfectly, runs `deps`, and is told exactly which package to install.

BLIND-INSTRUMENT RULE — three verdicts, and silence is never clean
==================================================================
Every verb returns PASS (0) / FAIL (1) / UNMEASURED-with-the-obstacle-named (2).

  · A missing backend is UNMEASURED **naming the pip package**, never a silent no-op and
    never a traceback. `set -euo pipefail` in the bash it replaces made every missing
    dependency indistinguishable from a corrupt PDF.
  · A PDF that exists but yields NO text is UNMEASURED, not PASS with an empty string. A
    scanned page and a blank page produce the same empty string from a text extractor and
    they are opposite facts — the first needs `ocr`, the second is genuinely empty.
  · A backend that raises is a FAIL for that backend and the chain moves on; the verb is
    only UNMEASURED once EVERY backend has been named and none could look.

Verbs:
  deps                                 which backends are actually importable, per capability
  info    <pdf>                        page count / metadata / whether it carries a text layer
  extract <pdf> [--pages A-B] [--out]  text layer (pymupdf -> pdfplumber -> pdfminer)
  tables  <pdf> [--pages A-B]          table extraction (pdfplumber -> camelot)
  ocr     <pdf> [--out] [--lang]       rasterize + OCR (ocrmypdf -> pytesseract+pdf2image)
  gen     <md> <out.pdf> [--title] [--author] [--engine]
                                       markdown -> PDF (pandoc/xelatex -> weasyprint)
  check                                self-check; also available as `--check` on any verb

stdlib-only at import, dual-runtime, verb-dispatched `api()` (CLI + MCP). Does NOT commit.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(os.environ.get("RECKON_HOME") or os.environ.get("REVENANT_HOME")
            or os.environ.get("CLAUDE_PROJECT_DIR") or Path(__file__).resolve().parents[1])

# Exit codes. Identical to corpus_ingest_lite.py's, deliberately: a caller that grades one
# corpus tool by return code must not need a per-tool table.
OK, RED, UNMEASURED = 0, 1, 2

# capability -> ordered backends, each (module-or-binary, pip-name, kind). Ordered by
# FIDELITY, not by speed: the first backend that can actually look wins. Listed as DATA so
# `deps` and every verb read the SAME table — a hand-rolled second list at a call site is how
# a tool reports a backend available that it never tries.
BACKENDS = {
    # `pdftotext` is LAST by fidelity and FIRST by availability: measured 2026-08-01 it is the
    # ONLY extractor present in reckon and revenant-dev (poppler-utils ships in the container;
    # nothing in reckon's declared `corpus` extra is actually installed). Without it this tool
    # would be UNMEASURED in two of three repos on day one — a util that works nowhere is a
    # declaration, not a capability.
    "extract": [("fitz", "pymupdf", "module"),
                ("pdfplumber", "pdfplumber", "module"),
                ("pdfminer.high_level", "pdfminer.six", "module"),
                ("pdftotext", "poppler-utils (system)", "binary")],
    "tables":  [("pdfplumber", "pdfplumber", "module"),
                ("camelot", "camelot-py", "module")],
    "ocr":     [("ocrmypdf", "ocrmypdf", "module"),
                ("pytesseract", "pytesseract", "module")],
    "info":    [("fitz", "pymupdf", "module"),
                ("pikepdf", "pikepdf", "module"),
                ("pdfinfo", "poppler-utils (system)", "binary")],
    "gen":     [("pandoc", "pandoc (system) + texlive-xetex", "binary"),
                ("weasyprint", "weasyprint", "module")],
}


def _have(name: str, kind: str) -> bool:
    """Is ONE backend actually reachable. Import errors are caught WIDE on purpose: a
    half-installed native wheel raises OSError/ImportError/AttributeError depending on which
    shared object is missing, and every one of those means the same thing here — cannot look.
    This is exactly the `_cffi_backend` class of crash, which is a BROKEN install, not an
    absent package, and must still resolve to 'unavailable' rather than a traceback."""
    if kind == "binary":
        return shutil.which(name) is not None
    try:
        __import__(name)
        return True
    except BaseException:
        return False


def backend_status() -> dict:
    """{capability: {"available": [names], "missing": [(name, pip)], "chosen": name|None}}.

    The single source of truth every verb and `deps` reads. Never a count: a capability with
    two backends available and its FIRST one broken is a different fact from both present.
    """
    out = {}
    for cap, chain in BACKENDS.items():
        avail, missing = [], []
        for name, pip, kind in chain:
            (avail if _have(name, kind) else missing).append(
                name if _have(name, kind) else (name, pip))
        out[cap] = {"available": avail,
                    "missing": [m for m in missing if isinstance(m, tuple)],
                    "chosen": avail[0] if avail else None}
    return out


def _obstacle(cap: str) -> str:
    """The refusal text for a capability with NO backend — names every package by its pip
    name. A refusal that says 'unavailable' without naming what to install is a dead end
    dressed as a diagnosis."""
    chain = BACKENDS[cap]
    pkgs = ", ".join(f"{n} (install: {p})" for n, p, _ in chain)
    return (f"UNMEASURED: no backend for '{cap}' is importable in this repo. Tried, in order: "
            f"{pkgs}. Install one INTO THE VENV — `uv run python` / `.venv/bin/python`, never "
            f"bare `python3`, which is the system interpreter outside the venv and the real "
            f"cause of the recurring import crashes.")


def _pdf_path(spec: str) -> tuple[Path | None, str]:
    """(path, obstacle). A path that does not exist is an obstacle NAMED, not an exception."""
    p = Path(spec)
    if not p.is_absolute():
        cand = REPO / spec
        p = cand if cand.exists() else p
    if not p.exists():
        return None, f"UNMEASURED: no such file: {p}"
    if not p.is_file():
        return None, f"UNMEASURED: not a regular file: {p}"
    return p, ""


def _page_range(spec: str | None, npages: int) -> list[int]:
    """0-based page indices from a 1-based 'A-B' / 'A' / None spec. None = every page."""
    if not spec:
        return list(range(npages))
    lo, _, hi = spec.partition("-")
    a = max(1, int(lo)) - 1
    b = min(npages, int(hi) if hi else int(lo))
    return list(range(a, b))


# ── extraction ────────────────────────────────────────────────────────────────────────────
def extract_text(path: Path, pages: str | None = None) -> dict:
    """Text layer, best backend first. Returns {"ok", "backend", "text", "pages", "tried"}.

    `tried` carries every backend that was attempted AND WHY IT DID NOT WIN — a chain that
    silently falls through to the worst backend looks identical to one where the best backend
    was never installed, and those need different fixes.
    """
    tried = []
    for name, pip, kind in BACKENDS["extract"]:
        if not _have(name, kind):
            tried.append({"backend": name, "outcome": "unavailable", "install": pip})
            continue
        try:
            if name == "fitz":
                import fitz  # noqa: PLC0415
                doc = fitz.open(str(path))
                idx = _page_range(pages, doc.page_count)
                text = "\n\n".join(doc.load_page(i).get_text() for i in idx)
                n = doc.page_count
                doc.close()
            elif name == "pdfplumber":
                import pdfplumber  # noqa: PLC0415
                with pdfplumber.open(str(path)) as doc:
                    n = len(doc.pages)
                    idx = _page_range(pages, n)
                    text = "\n\n".join(doc.pages[i].extract_text() or "" for i in idx)
            elif name == "pdfminer.high_level":
                from pdfminer.high_level import extract_text as _mine  # noqa: PLC0415
                text = _mine(str(path))
                n = text.count("\f") + 1
            else:
                cmd = ["pdftotext", "-layout"]
                if pages:
                    lo, _, hi = pages.partition("-")
                    cmd += ["-f", lo, "-l", hi or lo]
                r = subprocess.run(cmd + [str(path), "-"], capture_output=True,
                                   text=True, timeout=300)
                if r.returncode != 0:
                    raise RuntimeError(f"pdftotext exit {r.returncode}: {r.stderr.strip()[:200]}")
                text = r.stdout
                n = text.count("\f") + 1
            tried.append({"backend": name, "outcome": "ran"})
            return {"ok": True, "backend": name, "text": text, "pages": n, "tried": tried}
        except Exception as exc:
            tried.append({"backend": name, "outcome": f"raised: {exc}"})
    return {"ok": False, "backend": None, "text": "", "pages": 0, "tried": tried}


def extract_tables(path: Path, pages: str | None = None) -> dict:
    tried = []
    for name, pip, kind in BACKENDS["tables"]:
        if not _have(name, kind):
            tried.append({"backend": name, "outcome": "unavailable", "install": pip})
            continue
        try:
            if name == "pdfplumber":
                import pdfplumber  # noqa: PLC0415
                tables = []
                with pdfplumber.open(str(path)) as doc:
                    for i in _page_range(pages, len(doc.pages)):
                        for t in doc.pages[i].extract_tables() or []:
                            tables.append({"page": i + 1, "rows": t})
            else:
                import camelot  # noqa: PLC0415
                got = camelot.read_pdf(str(path), pages=pages or "all")
                tables = [{"page": t.page, "rows": t.df.values.tolist()} for t in got]
            tried.append({"backend": name, "outcome": "ran"})
            return {"ok": True, "backend": name, "tables": tables, "tried": tried}
        except Exception as exc:
            tried.append({"backend": name, "outcome": f"raised: {exc}"})
    return {"ok": False, "backend": None, "tables": [], "tried": tried}


def ocr_pdf(path: Path, out: Path | None = None, lang: str = "eng") -> dict:
    """OCR. ocrmypdf produces a SEARCHABLE PDF (text layer added, original pixels kept);
    pytesseract produces TEXT ONLY. Reported distinctly — a caller that asked for a
    searchable PDF and silently got a .txt has been given a different artifact under the
    same verb."""
    tried = []
    for name, pip, kind in BACKENDS["ocr"]:
        if not _have(name, kind):
            tried.append({"backend": name, "outcome": "unavailable", "install": pip})
            continue
        try:
            if name == "ocrmypdf":
                import ocrmypdf  # noqa: PLC0415
                dest = out or path.with_suffix(".ocr.pdf")
                ocrmypdf.ocr(str(path), str(dest), language=lang,
                             skip_text=True, progress_bar=False)
                tried.append({"backend": name, "outcome": "ran"})
                return {"ok": True, "backend": name, "kind": "searchable-pdf",
                        "out": str(dest), "tried": tried}
            import pytesseract  # noqa: PLC0415
            from pdf2image import convert_from_path  # noqa: PLC0415
            text = "\n\n".join(pytesseract.image_to_string(img, lang=lang)
                               for img in convert_from_path(str(path)))
            if out:
                Path(out).write_text(text, encoding="utf-8")
            tried.append({"backend": name, "outcome": "ran"})
            return {"ok": True, "backend": name, "kind": "text-only",
                    "text": text, "out": str(out) if out else None, "tried": tried}
        except Exception as exc:
            tried.append({"backend": name, "outcome": f"raised: {exc}"})
    return {"ok": False, "backend": None, "tried": tried}


def pdf_info(path: Path) -> dict:
    """Pages + metadata + WHETHER A TEXT LAYER EXISTS.

    `has_text_layer` is the load-bearing field: it is what separates a born-digital PDF
    (`extract` works) from a scan (`extract` returns empty and `ocr` is required). Without it
    a caller cannot tell an empty extraction from a failed one, which is the single most
    common way a PDF ingest reports success having read nothing.
    """
    tried = []
    for name, pip, kind in BACKENDS["info"]:
        if not _have(name, kind):
            tried.append({"backend": name, "outcome": "unavailable", "install": pip})
            continue
        try:
            if name == "fitz":
                import fitz  # noqa: PLC0415
                doc = fitz.open(str(path))
                probe = "".join(doc.load_page(i).get_text()
                                for i in range(min(3, doc.page_count))).strip()
                info = {"pages": doc.page_count, "metadata": dict(doc.metadata or {}),
                        "encrypted": bool(doc.is_encrypted),
                        "has_text_layer": bool(probe)}
                doc.close()
            elif name == "pikepdf":
                import pikepdf  # noqa: PLC0415
                with pikepdf.open(str(path)) as doc:
                    info = {"pages": len(doc.pages),
                            "metadata": {k: str(v) for k, v in dict(doc.docinfo).items()},
                            "encrypted": bool(doc.is_encrypted),
                            "has_text_layer": None}   # pikepdf does not extract text
            else:
                raw = subprocess.run(["pdfinfo", str(path)], capture_output=True,
                                     text=True, timeout=60).stdout
                meta = dict(l.split(":", 1) for l in raw.splitlines() if ":" in l)
                info = {"pages": int(meta.get("Pages", "0").strip() or 0),
                        "metadata": {k: v.strip() for k, v in meta.items()},
                        "encrypted": meta.get("Encrypted", "").strip().startswith("yes"),
                        "has_text_layer": None}
            info.update({"ok": True, "backend": name, "path": str(path), "tried": tried})
            return info
        except Exception as exc:
            tried.append({"backend": name, "outcome": f"raised: {exc}"})
    return {"ok": False, "backend": None, "tried": tried}


# ── generation ────────────────────────────────────────────────────────────────────────────
def gen_pdf(md: Path, out: Path, title: str = "", author: str = "",
            engine: str | None = None) -> dict:
    """markdown -> PDF. pandoc/xelatex first (the export script's pipeline: real typography,
    clickable refs, DejaVu fonts), weasyprint second (pdf_toolkit's pipeline: no LaTeX
    needed). Named backends, so a caller always knows WHICH renderer produced the artifact —
    the two do not produce interchangeable output and a report that silently changed
    renderers between runs is a diff nobody can explain.

    The PDF IS VERIFIED AFTER WRITING: a pandoc that exits 0 having written a zero-byte or
    non-PDF file is a real outcome, and returning ok on exit code alone is how a build
    pipeline ships an empty publication.
    """
    chain = [engine] if engine else [n for n, _, _ in BACKENDS["gen"]]
    tried = []
    for name in chain:
        kind = next((k for n, _, k in BACKENDS["gen"] if n == name), "module")
        pip = next((p for n, p, _ in BACKENDS["gen"] if n == name), name)
        if not _have(name, kind):
            tried.append({"backend": name, "outcome": "unavailable", "install": pip})
            continue
        try:
            out.parent.mkdir(parents=True, exist_ok=True)
            if name == "pandoc":
                cmd = ["pandoc", str(md), "-o", str(out), "--pdf-engine=xelatex",
                       "--toc", "--standalone",
                       "-V", "mainfont=DejaVu Serif", "-V", "monofont=DejaVu Sans Mono",
                       "-V", "geometry:margin=1in"]
                if title:
                    cmd += ["-M", f"title={title}"]
                if author:
                    cmd += ["-M", f"author={author}"]
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
                if r.returncode != 0:
                    tried.append({"backend": name,
                                  "outcome": f"exit {r.returncode}: {r.stderr.strip()[:300]}"})
                    continue
            else:
                import weasyprint  # noqa: PLC0415
                try:
                    import markdown as _md  # noqa: PLC0415
                    body = _md.markdown(md.read_text(encoding="utf-8", errors="replace"),
                                        extensions=["tables", "fenced_code", "toc"])
                except Exception:
                    # No markdown lib: render as preformatted text rather than refusing.
                    # Degraded is a NAMED outcome below, never a silent substitution.
                    import html as _html  # noqa: PLC0415
                    body = "<pre>" + _html.escape(
                        md.read_text(encoding="utf-8", errors="replace")) + "</pre>"
                    tried.append({"backend": "markdown", "outcome": "unavailable — "
                                  "rendered as preformatted text (install: markdown)"})
                head = (f"<h1>{title}</h1>" if title else "") + \
                       (f"<p><em>{author}</em></p>" if author else "")
                html = ("<html><head><meta charset='utf-8'><style>"
                        "body{font-family:'DejaVu Serif',serif;margin:2.5cm;line-height:1.5}"
                        "code,pre{font-family:'DejaVu Sans Mono',monospace}"
                        "table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px}"
                        "</style></head><body>" + head + body + "</body></html>")
                weasyprint.HTML(string=html, base_url=str(md.parent)).write_pdf(str(out))

            ok, why = _verify_pdf(out)
            tried.append({"backend": name, "outcome": "ran" if ok else f"produced: {why}"})
            if ok:
                return {"ok": True, "backend": name, "out": str(out),
                        "bytes": out.stat().st_size, "tried": tried}
        except Exception as exc:
            tried.append({"backend": name, "outcome": f"raised: {exc}"})
    return {"ok": False, "backend": None, "out": str(out), "tried": tried}


def _verify_pdf(out: Path) -> tuple[bool, str]:
    """Did a real PDF actually land. Header + non-trivial size, checked by CONTENT.

    Ported from the export script's `pdfinfo` sanity step, but WITHOUT requiring pdfinfo:
    the check must work in a repo with no poppler, or the verification quietly disappears in
    exactly the repos most likely to have a broken PDF stack — a gate that cannot look must
    say so, and here it can always look.
    """
    if not out.exists():
        return False, "no output file"
    size = out.stat().st_size
    if size < 1024:
        return False, f"{size} bytes — too small to be a rendered document"
    try:
        if out.open("rb").read(5) != b"%PDF-":
            return False, "missing %PDF- header — not a PDF"
    except OSError as exc:
        return False, f"unreadable: {exc}"
    return True, ""


# ── verbs ─────────────────────────────────────────────────────────────────────────────────
def cmd_deps(args) -> int:
    """Which backends exist HERE. PASS only when every capability has one; UNMEASURED (never
    FAIL) when some do not — a missing library is not a defect in this repo's work, it is a
    thing this repo currently cannot see."""
    st = backend_status()
    print(json.dumps({"repo": str(REPO), "python": sys.executable,
                      "capabilities": st}, indent=2))
    blind = [c for c, v in st.items() if not v["chosen"]]
    if blind:
        for c in blind:
            print(_obstacle(c), file=sys.stderr)
        print(f"? UNMEASURED corpus-pdf — {len(blind)}/{len(st)} capabilit(ies) have NO "
              f"backend here: {', '.join(sorted(blind))}. Absent and fine are different "
              f"facts.", file=sys.stderr)
        return UNMEASURED
    shape = ", ".join(f"{c}={v['chosen']}" for c, v in sorted(st.items()))
    print(f"✓ PASS corpus-pdf deps — all {len(st)} capabilities have a backend ({shape}).")
    return OK


def cmd_info(args) -> int:
    p, why = _pdf_path(args.pdf)
    if p is None:
        print(why, file=sys.stderr)
        return UNMEASURED
    res = pdf_info(p)
    print(json.dumps(res, indent=2, default=str))
    if not res["ok"]:
        print(_obstacle("info"), file=sys.stderr)
        return UNMEASURED
    return OK


def cmd_extract(args) -> int:
    p, why = _pdf_path(args.pdf)
    if p is None:
        print(why, file=sys.stderr)
        return UNMEASURED
    res = extract_text(p, args.pages)
    if not res["ok"]:
        print(json.dumps({"tried": res["tried"]}, indent=2), file=sys.stderr)
        print(_obstacle("extract"), file=sys.stderr)
        return UNMEASURED
    if not res["text"].strip():
        # NOT a pass. See the module docstring: a scan and a blank page are opposite facts
        # that both produce "". The caller is told which verb answers the question instead.
        print(f"? UNMEASURED: {p} yielded NO text via {res['backend']} across {res['pages']} "
              f"page(s). This is a SCANNED pdf (no text layer) or an empty one — those are "
              f"opposite facts and this verb cannot tell them apart. Run `info` for "
              f"has_text_layer, then `ocr` if it is false.", file=sys.stderr)
        return UNMEASURED
    if args.out:
        Path(args.out).write_text(res["text"], encoding="utf-8")
        print(json.dumps({"ok": True, "backend": res["backend"], "pages": res["pages"],
                          "chars": len(res["text"]), "out": args.out}))
    else:
        print(res["text"])
    return OK


def cmd_tables(args) -> int:
    p, why = _pdf_path(args.pdf)
    if p is None:
        print(why, file=sys.stderr)
        return UNMEASURED
    res = extract_tables(p, args.pages)
    if not res["ok"]:
        print(json.dumps({"tried": res["tried"]}, indent=2), file=sys.stderr)
        print(_obstacle("tables"), file=sys.stderr)
        return UNMEASURED
    print(json.dumps({"ok": True, "backend": res["backend"],
                      "count": len(res["tables"]), "tables": res["tables"]},
                     indent=2, default=str))
    return OK


def cmd_ocr(args) -> int:
    p, why = _pdf_path(args.pdf)
    if p is None:
        print(why, file=sys.stderr)
        return UNMEASURED
    res = ocr_pdf(p, Path(args.out) if args.out else None, args.lang)
    if not res["ok"]:
        print(json.dumps({"tried": res["tried"]}, indent=2), file=sys.stderr)
        print(_obstacle("ocr"), file=sys.stderr)
        return UNMEASURED
    print(json.dumps({k: v for k, v in res.items() if k != "text"}, indent=2, default=str))
    return OK


def cmd_gen(args) -> int:
    src = Path(args.md)
    if not src.is_absolute() and not src.exists():
        src = REPO / args.md
    if not src.exists():
        print(f"UNMEASURED: no such markdown source: {src}", file=sys.stderr)
        return UNMEASURED
    res = gen_pdf(src, Path(args.out), args.title or "", args.author or "", args.engine)
    print(json.dumps(res, indent=2, default=str))
    if not res["ok"]:
        # If NO backend was even importable this is UNMEASURED; if one ran and produced a
        # bad artifact that is a real FAIL. Collapsing the two would let a broken renderer
        # hide behind "dependency missing" forever.
        if any(t.get("outcome", "").startswith(("ran", "produced", "exit", "raised"))
               for t in res["tried"]):
            print("✗ FAIL corpus-pdf gen — a renderer RAN and did not produce a valid PDF "
                  "(see tried[]).", file=sys.stderr)
            return RED
        print(_obstacle("gen"), file=sys.stderr)
        return UNMEASURED
    return OK


def cmd_check(args) -> int:
    """Self-check. Exercises the whole path END TO END when a generator exists — generates a
    PDF into a temp dir and reads it back — because 'the module imports' is the check that
    passes on a tool whose every verb is broken. When no generator exists it is UNMEASURED
    with the obstacle named, never a PASS for the half it could still run."""
    st = backend_status()
    notes = []
    if st["gen"]["chosen"] is None:
        print(json.dumps({"capabilities": st}, indent=2))
        print(_obstacle("gen"), file=sys.stderr)
        print("? UNMEASURED corpus-pdf check — no generator, so the round trip "
              "(generate -> read back) could not be run. The module imports and every verb "
              "refuses correctly; that is NOT the same as verified.", file=sys.stderr)
        return UNMEASURED
    with tempfile.TemporaryDirectory() as td:
        md = Path(td) / "probe.md"
        md.write_text("# corpus_pdf_lite probe\n\nRound-trip marker: CPLPROBE42\n",
                      encoding="utf-8")
        out = Path(td) / "probe.pdf"
        g = gen_pdf(md, out, title="probe")
        if not g["ok"]:
            print(json.dumps(g, indent=2), file=sys.stderr)
            print("✗ FAIL corpus-pdf check — generator present but produced no valid PDF.",
                  file=sys.stderr)
            return RED
        notes.append(f"generated via {g['backend']} ({g['bytes']} bytes)")
        if st["extract"]["chosen"]:
            e = extract_text(out)
            if not e["ok"] or "CPLPROBE42" not in e["text"].replace("\n", ""):
                print(json.dumps(e, indent=2, default=str), file=sys.stderr)
                print("✗ FAIL corpus-pdf check — generated PDF did not read back with its "
                      "own marker. Generation and extraction disagree.", file=sys.stderr)
                return RED
            notes.append(f"read back via {e['backend']}, marker found")
        else:
            notes.append("read-back SKIPPED — no extract backend (see deps)")
            print(_obstacle("extract"), file=sys.stderr)
            print("? UNMEASURED corpus-pdf check — generated, but could not read back.",
                  file=sys.stderr)
            return UNMEASURED
    print(f"✓ PASS corpus-pdf check — {'; '.join(notes)}.")
    return OK


# ── the four-layer doctor ─────────────────────────────────────────────────────────────────
# A PDF tool that only works where someone happened to install a library is not a util. The
# dependency has to be DECLARED AND SATISFIABLE at every layer it is invoked from, and each
# layer has a DIFFERENT failure mode and a DIFFERENT remediation — which is exactly why one
# aggregate "deps ok?" boolean is useless. A hand hitting a PDF failure needs to be told
# WHICH layer, by name, with the command that fixes THAT layer.
#
#   os       native packages + binaries. WeasyPrint needs cairo/pango/gdk-pixbuf; pandoc and
#            pdftotext are BINARIES, not wheels. `pip install weasyprint` succeeds and then
#            fails at import when libpango is absent — an OS failure wearing a Python mask,
#            which is precisely the `_cffi_backend` class of crash. Fixed with apt, not pip.
#   disk     vendoring. DELIBERATELY NOT USED for PDF — see VENDOR_VERDICT below.
#   runtime  the venv. Declared in pyproject's `corpus` extra; satisfied by `uv sync`.
#            DECLARED IS NOT INSTALLED: reckon has declared pymupdf+weasyprint for weeks and
#            has neither. This layer reports what is IMPORTABLE, never what is listed.
#   rka      the operator door. A capability reachable only by remembering a script path is
#            not reachable. Wired by the rka-owning lane; measured here, never assumed.
LAYERS = ("os", "disk", "runtime", "rka")

# The disk/vendoring decision, recorded so it is a DECISION and not an omission.
VENDOR_VERDICT = (
    "NOT VENDORED, deliberately. The precedent is dilithium-py, vendored in revenant-dev "
    "only, so pq_sign.available() was False in cybertemplate for weeks while docs claimed PQ "
    "was enabled — and the partial CT vendor (35 files vs revenant-dev's 49) now reports "
    "available()==True on an incomplete tree, which is worse. Vendoring works when the code "
    "is PURE PYTHON. Every backend here is either a system BINARY (pandoc, pdftotext, "
    "xelatex, tesseract) or a native-extension wheel (pymupdf, pikepdf, weasyprint->cairo/"
    "pango, camelot->ghostscript). Copying those into the tree cannot make them run; it would "
    "produce a vendor manifest that passes set-containment while nothing works — a lie with a "
    "sha256. The OS layer is the only real answer for this capability, so `disk` reports "
    "N/A-BY-DECISION with this rationale rather than a hollow green.")

# OS-layer requirements: binary -> (apt package, what dies without it)
OS_REQUIREMENTS = {
    "pdftotext": ("poppler-utils", "text extraction in repos with no python PDF wheel — "
                                   "TODAY that is reckon and revenant-dev, i.e. the only "
                                   "extractor they have"),
    "pdfinfo":   ("poppler-utils", "page/metadata inspection fallback"),
    "pandoc":    ("pandoc", "the high-fidelity `gen` backend (with texlive-xetex)"),
    "xelatex":   ("texlive-xetex texlive-fonts-recommended",
                  "pandoc's PDF engine — pandoc without it cannot emit PDF at all"),
    "tesseract": ("tesseract-ocr", "the pytesseract OCR backend (the module alone does nothing)"),
}
# Native shared libraries a pip-installed wheel still needs from the OS.
OS_NATIVE_FOR = {
    "weasyprint": ("libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libgdk-pixbuf-2.0-0",
                   "weasyprint imports only if pango/cairo/gdk-pixbuf are present"),
    "camelot":    ("ghostscript", "camelot's lattice mode shells out to ghostscript"),
}


def layer_os() -> dict:
    """PASS/UNMEASURED per OS requirement. Never FAIL: a package this container was not given
    is not a defect in the work, it is a thing this runtime cannot do."""
    present, missing = {}, {}
    for binary, (pkg, why) in OS_REQUIREMENTS.items():
        (present if shutil.which(binary) else missing)[binary] = {"apt": pkg, "needed_for": why}
    native = {}
    for mod, (pkgs, why) in OS_NATIVE_FOR.items():
        native[mod] = {"module_importable": _have(mod, "module"), "apt": pkgs, "note": why}
    verdict = "PASS" if not missing else "UNMEASURED"
    return {"layer": "os", "verdict": verdict, "present": sorted(present),
            "missing": missing, "native_deps": native,
            "remediation": ("sudo apt-get install -y --no-install-recommends "
                            + " ".join(sorted({v["apt"] for v in missing.values()})))
            if missing else None,
            "provisioned_by": ".openhands/setup.sh (the same door that provisions "
                              "openssh-client for commit signing — extended, not duplicated)"}


def layer_disk() -> dict:
    """N/A BY DECISION, with the rationale carried in the output. A layer that is deliberately
    not used must say so out loud; reporting PASS for a layer you never built is the
    false-green this whole tool exists to avoid."""
    return {"layer": "disk", "verdict": "N/A-BY-DECISION", "vendored": False,
            "rationale": VENDOR_VERDICT}


def layer_runtime() -> dict:
    """What is IMPORTABLE in THIS interpreter — plus whether that interpreter is the venv.

    Bare `python3` is the system interpreter, outside the venv, and that (not a missing
    package) is the real cause of the recurring openpyxl / _cffi_backend crashes. So the
    interpreter itself is part of the finding: the same repo is green under `.venv/bin/python`
    and red under `python3`, and a report that does not say which one it ran under is unusable.
    """
    st = backend_status()
    venv = os.environ.get("VIRTUAL_ENV") or ""
    in_venv = bool(venv) or (REPO / ".venv") == Path(sys.prefix)
    blind = sorted(c for c, v in st.items() if not v["chosen"])
    return {"layer": "runtime", "verdict": "PASS" if not blind else "UNMEASURED",
            "python": sys.executable, "in_venv": in_venv,
            "venv_exists": (REPO / ".venv" / "bin" / "python").exists(),
            "capabilities": {c: v["chosen"] for c, v in sorted(st.items())},
            "blind_capabilities": blind,
            "declared_extra": "pyproject.toml [project.optional-dependencies] corpus "
                              "(revenant-dev: [dependency-groups] corpus — that repo has no "
                              "project extras by design)",
            "remediation": "uv sync --extra corpus   # revenant-dev: uv sync --group corpus"
                           "   — then invoke as `uv run python` / `.venv/bin/python`, NEVER "
                           "bare `python3`" if blind else None}


def layer_rka() -> dict:
    """Is the capability reachable through the door every hand already uses.

    Measured by READING the rka source for the verb, not by assuming the handoff landed.
    `scripts/rka` is owned by another lane (shared machinery, live), so this lane does not
    edit it — it measures it and names the verb to wire. UNMEASURED until it is there is the
    honest state; printing PASS because we asked for it would be a claim, not a measurement.
    """
    # FIX (2026-08-19): scripts/rka is a thin exec-shim (7 lines) that has never carried the
    # dispatch logic since the reckon-lite migration -- checking it for "corpus_pdf_lite"
    # could never pass even after wiring. The real dispatcher is reckon-lite/tools/rka; this
    # file's own REPO (see line 69-70) already resolves to reckon-lite/ (parents[1] of a file
    # at reckon-lite/tools/), so the door is REPO/tools/rka, not REPO/reckon-lite/tools/rka.
    rka = REPO / "tools" / "rka"
    if not rka.exists():
        return {"layer": "rka", "verdict": "UNMEASURED",
                "obstacle": f"no rka door at {rka}", "verb": "pdf"}
    try:
        src = rka.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return {"layer": "rka", "verdict": "UNMEASURED",
                "obstacle": f"rka unreadable: {exc}", "verb": "pdf"}
    # `rka pdf` DELEGATES to `rk pdf` (same pattern as bundle/charter/coc) rather than
    # embedding "corpus_pdf_lite" directly in rka's own source -- so a literal substring
    # check on rka alone would never pass even when correctly wired. Check for the
    # delegation case ("pdf)" in rka) AND that rk actually reaches corpus_pdf_lite.py.
    rk = REPO / "tools" / "rk"
    rk_src = rk.read_text(encoding="utf-8", errors="replace") if rk.exists() else ""
    wired = ("corpus_pdf_lite" in src) or (
        "pdf)" in src and "corpus_pdf_lite" in rk_src)
    return {"layer": "rka", "verdict": "PASS" if wired else "UNMEASURED",
            "door": str(rka), "verb": "pdf", "wired": wired,
            "obstacle": None if wired else
                        "`rka pdf …` is NOT wired — corpus_pdf_lite is not referenced in the "
                        "rka door, so this capability is reachable only by remembering a "
                        "script path. NOT edited by this lane: scripts/rka is live shared "
                        "machinery owned by another lane (edit-in-place there has wedged "
                        "every hand before). Handed off via the board.",
            "remediation": None if wired else
                           "owning lane: add verb `pdf` dispatching to "
                           "tools/corpus_pdf_lite.py, passing argv through and PRESERVING the "
                           "0/1/2 exit code (collapsing 2 to 1 would turn every UNMEASURED "
                           "into a FAIL)"}


def cmd_doctor(args) -> int:
    """All four layers, three-valued each, with the missing thing and the fixing command NAMED.

    Aggregation rule, and it is the load-bearing part: ANY layer FAIL -> FAIL; else any layer
    UNMEASURED -> UNMEASURED; else PASS. A layer that could not look NEVER averages away into
    a green, and `disk` (N/A-BY-DECISION) is excluded from the aggregate rather than counted
    as a pass — counting a layer you deliberately did not build as passing is how a 3/4 green
    becomes a 4/4 green with no work done.
    """
    reports = [layer_os(), layer_disk(), layer_runtime(), layer_rka()]
    graded = [r for r in reports if r["verdict"] != "N/A-BY-DECISION"]
    if any(r["verdict"] == "FAIL" for r in graded):
        overall, code = "FAIL", RED
    elif any(r["verdict"] == "UNMEASURED" for r in graded):
        overall, code = "UNMEASURED", UNMEASURED
    else:
        overall, code = "PASS", OK
    print(json.dumps({"tool": "corpus_pdf_lite", "repo": str(REPO), "overall": overall,
                      "layers": reports}, indent=2, default=str))
    for r in reports:
        if r["verdict"] == "UNMEASURED":
            print(f"? UNMEASURED layer '{r['layer']}' — "
                  f"{r.get('obstacle') or 'missing: ' + ', '.join(sorted(r.get('missing', {}) or r.get('blind_capabilities', [])))}"
                  f"\n    fix: {r.get('remediation')}", file=sys.stderr)
    mark = {"PASS": "✓ PASS", "FAIL": "✗ FAIL", "UNMEASURED": "? UNMEASURED"}[overall]
    line = (f"{mark} corpus-pdf doctor — " +
            "; ".join(f"{r['layer']}={r['verdict']}" for r in reports))
    print(line, file=sys.stderr if overall != "PASS" else sys.stdout)
    return code


VERBS = {"deps": cmd_deps, "info": cmd_info, "extract": cmd_extract, "tables": cmd_tables,
         "ocr": cmd_ocr, "gen": cmd_gen, "check": cmd_check, "doctor": cmd_doctor}


def api(verb: str = "deps", **kw) -> int:
    """MCP/in-process entry. Same dispatch table as the CLI — one table, so an MCP caller and
    a shell caller can never reach different code."""
    ns = argparse.Namespace(pdf=kw.get("pdf"), md=kw.get("md"), out=kw.get("out"),
                            pages=kw.get("pages"), lang=kw.get("lang", "eng"),
                            title=kw.get("title"), author=kw.get("author"),
                            engine=kw.get("engine"), check=kw.get("check", False))
    return VERBS[verb](ns)


def register(mcp):  # pragma: no cover — only when an MCP server imports this
    """Bind as an MCP tool. The MCP surface is now a THIN WRAPPER over the util, not the only
    door to it — which is the whole point of litifying pdf_toolkit.py."""
    @mcp.tool()
    def corpus_pdf(verb: str = "deps", **kw) -> int:
        return api(verb, **kw)
    return corpus_pdf


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in VERBS:
        s = sub.add_parser(name)
        s.add_argument("--check", action="store_true",
                       help="run the self-check instead of this verb")
        if name in ("info", "extract", "tables", "ocr"):
            s.add_argument("pdf")
        if name in ("extract", "tables"):
            s.add_argument("--pages", help="1-based page range, e.g. 3-9")
        if name in ("extract", "ocr"):
            s.add_argument("--out")
        if name == "ocr":
            s.add_argument("--lang", default="eng")
        if name == "gen":
            s.add_argument("md")
            s.add_argument("out")
            s.add_argument("--title")
            s.add_argument("--author")
            s.add_argument("--engine", choices=[n for n, _, _ in BACKENDS["gen"]])
    args = ap.parse_args(argv)
    for f in ("pdf", "md", "out", "pages", "lang", "title", "author", "engine"):
        if not hasattr(args, f):
            setattr(args, f, None if f != "lang" else "eng")
    if getattr(args, "check", False) and args.cmd != "check":
        return cmd_check(args)
    return VERBS[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
