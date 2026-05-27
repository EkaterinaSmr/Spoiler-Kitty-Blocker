#!/usr/bin/env python3
import argparse
import base64
import hashlib
import json
import os
import pathlib
import platform
import shlex
import stat
import subprocess
import sys

HOST_NAME = "spoiler_kitty_blocker_db"
HOST_TITLE = "Spoiler Kitty SQLite database"

BACKEND_DIR = pathlib.Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
HOST_FILE = BACKEND_DIR / "native_host.py"
EXTENSION_MANIFEST = PROJECT_DIR / "manifest.json"

BROWSERS = {
    "chrome": {
        "Linux": pathlib.Path.home()
        / ".config"
        / "google-chrome"
        / "NativeMessagingHosts",
        "Darwin": pathlib.Path.home()
        / "Library"
        / "Application Support"
        / "Google"
        / "Chrome"
        / "NativeMessagingHosts",
        "Windows": pathlib.Path(
            os.environ.get("LOCALAPPDATA", pathlib.Path.home() / "AppData" / "Local")
        )
        / "Google"
        / "Chrome"
        / "User Data"
        / "NativeMessagingHosts",
        "registry": rf"HKCU\Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}",
    },
    "chromium": {
        "Linux": pathlib.Path.home() / ".config" / "chromium" / "NativeMessagingHosts",
        "Darwin": pathlib.Path.home()
        / "Library"
        / "Application Support"
        / "Chromium"
        / "NativeMessagingHosts",
        "Windows": pathlib.Path(
            os.environ.get("LOCALAPPDATA", pathlib.Path.home() / "AppData" / "Local")
        )
        / "Chromium"
        / "User Data"
        / "NativeMessagingHosts",
        "registry": rf"HKCU\Software\Chromium\NativeMessagingHosts\{HOST_NAME}",
    },
    "edge": {
        "Linux": pathlib.Path.home()
        / ".config"
        / "microsoft-edge"
        / "NativeMessagingHosts",
        "Darwin": pathlib.Path.home()
        / "Library"
        / "Application Support"
        / "Microsoft Edge"
        / "NativeMessagingHosts",
        "Windows": pathlib.Path(
            os.environ.get("LOCALAPPDATA", pathlib.Path.home() / "AppData" / "Local")
        )
        / "Microsoft"
        / "Edge"
        / "User Data"
        / "NativeMessagingHosts",
        "registry": rf"HKCU\Software\Microsoft\Edge\NativeMessagingHosts\{HOST_NAME}",
    },
    "brave": {
        "Linux": pathlib.Path.home()
        / ".config"
        / "BraveSoftware"
        / "Brave-Browser"
        / "NativeMessagingHosts",
        "Darwin": pathlib.Path.home()
        / "Library"
        / "Application Support"
        / "BraveSoftware"
        / "Brave-Browser"
        / "NativeMessagingHosts",
        "Windows": pathlib.Path(
            os.environ.get("LOCALAPPDATA", pathlib.Path.home() / "AppData" / "Local")
        )
        / "BraveSoftware"
        / "Brave-Browser"
        / "User Data"
        / "NativeMessagingHosts",
        "registry": rf"HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{HOST_NAME}",
    },
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--browser",
        choices=["chrome", "chromium", "edge", "brave", "all"],
        default="chrome",
    )
    parser.add_argument("--extension-id")
    parser.add_argument("--db")
    args = parser.parse_args()

    extension_id = args.extension_id or get_extension_id()
    launcher = make_launcher(args.db)
    browsers = list(BROWSERS) if args.browser == "all" else [args.browser]

    print("Extension ID:", extension_id)
    print("Allowed origin:", f"chrome-extension://{extension_id}/")

    for browser in browsers:
        manifest_path = get_manifest_path(browser)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(
            make_manifest(launcher, extension_id), encoding="utf-8"
        )
        print("Manifest:", manifest_path)

        if platform.system() == "Windows":
            subprocess.run(
                [
                    "reg",
                    "add",
                    BROWSERS[browser]["registry"],
                    "/ve",
                    "/t",
                    "REG_SZ",
                    "/d",
                    str(manifest_path),
                    "/f",
                ],
                check=True,
            )

    print("Launcher:", launcher)
    print("Done. Reload the extension in chrome://extensions")
    return 0


def get_extension_id():
    data = json.loads(EXTENSION_MANIFEST.read_text(encoding="utf-8"))
    key = data.get("key")
    if not key:
        raise RuntimeError("manifest.json has no key")
    public_key = base64.b64decode(key)
    digest = hashlib.sha256(public_key).digest()[:16]
    return digest.hex().translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop"))


def make_launcher(db_path):
    if platform.system() == "Windows":
        launcher = BACKEND_DIR / "run_native_host.cmd"
        env_line = f'set "SPOILER_KITTY_DB={db_path}"\r\n' if db_path else ""
        launcher.write_text(
            f'@echo off\r\n{env_line}"{sys.executable}" "%~dp0native_host.py"\r\n',
            encoding="ascii",
        )
        return launcher

    launcher = BACKEND_DIR / "run_native_host.sh"
    lines = ["#!/bin/sh"]
    if db_path:
        lines.append(f"export SPOILER_KITTY_DB={shlex.quote(str(db_path))}")
    lines.append(f"exec {shlex.quote(sys.executable)} {shlex.quote(str(HOST_FILE))}")
    launcher.write_text("\n".join(lines) + "\n", encoding="utf-8")
    launcher.chmod(launcher.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return launcher


def make_manifest(launcher, extension_id):
    data = {
        "name": HOST_NAME,
        "description": HOST_TITLE,
        "path": str(launcher),
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{extension_id}/"],
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def get_manifest_path(browser):
    folder = BROWSERS[browser][platform.system()]
    return pathlib.Path(folder) / f"{HOST_NAME}.json"


if __name__ == "__main__":
    raise SystemExit(main())
