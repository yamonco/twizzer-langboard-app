#!/usr/bin/env python3
"""Validate the public, portable Langboard package without network access."""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
decl = manifest["declaration"]
required = {"cards.create", "cards.read", "resources.read", "panels.render"}
assert manifest["package_version"] == 1
assert decl["key"] == "twizzer"
assert required.issubset(set(decl["capabilities"]))
assert decl["resource_types"] == ["site"]
for field in ("panel_entry", "store"):
    assert field in manifest
for path in (manifest["panel_entry"], manifest["store"]["icon"]):
    target = ROOT / path
    assert target.is_file(), f"missing package file: {path}"
assert (ROOT / "panel/assets/twizzer-cursor.svg").read_text(encoding="utf-8").startswith("<svg")

# Keep credentials and private deployment data out of this public package.
secret_patterns = [
    re.compile(r"(?i)(client_secret|access_token|refresh_token|private_key|password)\s*[:=]"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._-]{16,}"),
    re.compile(r"https?://(?:10\\.|192\\.168\\.|172\\.(?:1[6-9]|2[0-9]|3[01])\\.)"),
]
for path in ROOT.rglob("*"):
    if not path.is_file() or ".git" in path.parts or path.suffix in {".pyc", ".zip"}:
        continue
    text = path.read_text(encoding="utf-8", errors="ignore")
    for pattern in secret_patterns:
        assert not pattern.search(text), f"private material pattern in {path}: {pattern.pattern}"
print("twizzer package valid: declaration, files, icon, and public-data scan")
