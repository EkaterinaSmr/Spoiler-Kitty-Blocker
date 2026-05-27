#!/usr/bin/env python3
import argparse
import os
import pathlib
import platform
import subprocess

HOST_NAME = "spoiler_kitty_blocker_db"

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
    args = parser.parse_args()

    browsers = list(BROWSERS) if args.browser == "all" else [args.browser]
    for browser in browsers:
        manifest = (
            pathlib.Path(BROWSERS[browser][platform.system()]) / f"{HOST_NAME}.json"
        )
        if manifest.exists():
            manifest.unlink()
            print("Removed:", manifest)
        else:
            print("Not found:", manifest)

        if platform.system() == "Windows":
            subprocess.run(
                ["reg", "delete", BROWSERS[browser]["registry"], "/f"], check=False
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
