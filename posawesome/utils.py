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
_VERSION_FILE_MTIME: float | None = None
_CACHED_VERSION_FILE_VALUE: str | None = None
_CSS_FILE_MTIME: float | None = None
_CACHED_CSS_VERSION: str | None = None


def _read_version_file() -> str | None:
    global _VERSION_FILE_MTIME, _CACHED_VERSION_FILE_VALUE

    try:
        version_stat = _VERSION_FILE.stat()
    except FileNotFoundError:
        _VERSION_FILE_MTIME = None
        _CACHED_VERSION_FILE_VALUE = None
        return None
    except OSError:
        return None

    if _CACHED_VERSION_FILE_VALUE is not None and _VERSION_FILE_MTIME == version_stat.st_mtime:
        # Avoid re-reading/parsing when the asset version file is unchanged.
        return _CACHED_VERSION_FILE_VALUE

    try:
        data = json.loads(_VERSION_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, ValueError):
        return None
    version = data.get("version") or data.get("buildVersion")
    if not version:
        return None

    normalized = str(version)
    _CACHED_VERSION_FILE_VALUE = normalized
    _VERSION_FILE_MTIME = version_stat.st_mtime
    return normalized


def _css_mtime_version() -> str | None:
    global _CSS_FILE_MTIME, _CACHED_CSS_VERSION

    try:
        css_stat = _CSS_FILE.stat()
    except FileNotFoundError:
        _CSS_FILE_MTIME = None
        _CACHED_CSS_VERSION = None
        return None
    except OSError:
        return None

    if _CACHED_CSS_VERSION is not None and _CSS_FILE_MTIME == css_stat.st_mtime:
        # Avoid repeated stat conversions when the CSS asset is untouched.
        return _CACHED_CSS_VERSION

    try:
        version = str(int(css_stat.st_mtime))
    except OSError:
        return None
    _CACHED_CSS_VERSION = version
    _CSS_FILE_MTIME = css_stat.st_mtime
    return version


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
