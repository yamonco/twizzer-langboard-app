"""Package the built MV3 extension with a root manifest and a reproducible file order."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "dist" / "extension"
manifest = json.loads((SOURCE / "manifest.json").read_bytes())
files = {
    "manifest.json", "composer.js", "content.js", "style.css",
    manifest["background"]["service_worker"], manifest["side_panel"]["default_path"],
    *manifest["icons"].values(),
}
archive_path = SOURCE.parent / f"twizzer-chrome-{manifest['version']}.zip"
contents = [(name, (SOURCE / name).read_bytes()) for name in sorted(files)]
with ZipFile(archive_path, "w") as archive:
    for name, data in contents:
        entry = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        entry.external_attr = 0o100644 << 16
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, data)
print(f"{hashlib.sha256(archive_path.read_bytes()).hexdigest()}  {archive_path}")
