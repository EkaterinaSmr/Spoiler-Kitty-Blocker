#!/usr/bin/env python3
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

SKIP_DIRS = {"dist", "__pycache__", ".git"}
SKIP_SUFFIXES = {".pyc", ".sqlite3"}


def main():
    version = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))[
        "version"
    ]
    DIST.mkdir(exist_ok=True)
    out = DIST / f"spoiler-kitty-blocker-chrome-clean-{version}.zip"

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(ROOT.rglob("*")):
            rel = path.relative_to(ROOT)
            if path.is_dir():
                continue
            if any(part in SKIP_DIRS for part in rel.parts):
                continue
            if path.suffix in SKIP_SUFFIXES:
                continue
            zf.write(path, rel.as_posix())

    print(out)


if __name__ == "__main__":
    main()
