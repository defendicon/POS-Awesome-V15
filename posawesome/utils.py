"""Utility helpers shared across the POS Awesome backend."""

from __future__ import annotations

import json
import time
from pathlib import Path

from posawesome import __version__ as app_version

_BASE_DIR = Path(__file__).resolve().parent
_VERSION_FILE = _BASE_DIR / "public" / "dist" / "js" / "version.json"
_CSS_FILE = _BASE_DIR / "public" / "dist" / "js" / "posawesome.css"
_FALLBACK_VERSION: str | None = None


def _read_version_file() -> str | None:
    if not _VERSION_FILE.exists():
        return None
    try:
        data = json.loads(_VERSION_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, ValueError):
        return None
    version = data.get("version") or data.get("buildVersion")
    return str(version) if version else None


def _css_mtime_version() -> str | None:
    if not _CSS_FILE.exists():
        return None
    try:
        return str(int(_CSS_FILE.stat().st_mtime))
    except OSError:
        return None


def get_build_version() -> str:
    """Return a string that uniquely identifies the current asset build."""

    version = _read_version_file()
    if version:
        return version

    mtime_version = _css_mtime_version()
    if mtime_version:
        return mtime_version

    global _FALLBACK_VERSION
    if _FALLBACK_VERSION is None:
        _FALLBACK_VERSION = f"{app_version}-{int(time.time())}"
    return _FALLBACK_VERSION
