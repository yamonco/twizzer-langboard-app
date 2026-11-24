#!/usr/bin/env python3
"""Build a deterministic Langboard package archive."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
import hashlib

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist" / "twizzer-0.1.0.zip"
FILES = ["manifest.json", "panel/index.html", "panel/panel.js", "panel/assets/twizzer-cursor.svg"]
OUT.parent.mkdir(exist_ok=True)
with ZipFile(OUT, "w", ZIP_DEFLATED) as archive:
    for name in FILES:
        info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, (ROOT / name).read_bytes())
print(f"{OUT} sha256={hashlib.sha256(OUT.read_bytes()).hexdigest()}")
