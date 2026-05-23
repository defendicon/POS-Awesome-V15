# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals

import frappe
from frappe.utils import cstr, add_to_date, get_datetime
from typing import List, Dict, Any
import time
import os
import re
import json
import subprocess

from posawesome import __version__ as POS_AWESOME_APP_VERSION

try:
    import psutil
except ImportError:  # pragma: no cover - optional dependency
    psutil = None

_PSUTIL_MISSING_LOGGED = False
import functools

from .utils import get_item_groups, fetch_sales_person_names
from posawesome.utils import get_build_version

POS_AWESOME_REPO_URL = "https://github.com/defendicon/POS-Awesome-V15"


def _normalize_release_tag(version):
    tag = cstr(version).strip()
    if tag.startswith("v") and len(tag) > 1 and tag[1].isdigit():
        tag = tag[1:]
    return tag or None


def _build_release_url(version):
    tag = _normalize_release_tag(version)
    return f"{POS_AWESOME_REPO_URL}/releases/tag/{tag}" if tag else None


def _get_update_metadata() -> Dict[str, Any]:
    return {
        "app_version": POS_AWESOME_APP_VERSION,
        "repo_url": POS_AWESOME_REPO_URL,
        "release_url": _build_release_url(POS_AWESOME_APP_VERSION),
    }


def get_version():
    branch_name = get_app_branch("erpnext")
    if "12" in branch_name:
        return 12
    elif "13" in branch_name:
        return 13
    else:
        return 13


def get_app_branch(app):
    """Returns branch of an app"""
    import subprocess

    try:
        branch = subprocess.check_output(
            "cd ../apps/{0} && git rev-parse --abbrev-ref HEAD".format(app), shell=True
        )
        branch = branch.decode("utf-8")
        branch = branch.strip()
        return branch
    except Exception:
        return ""


def get_root_of(doctype):
    """Get root element of a DocType with a tree structure"""
    # Security: Validate doctype to prevent SQL injection since it's used in FROM clause
    if not re.match(r"^[a-zA-Z0-9 _-]+$", doctype):
        return None

    result = frappe.db.sql(
        """select t1.name from `tab{0}` t1 where
		(select count(*) from `tab{1}` t2 where
			t2.lft < t1.lft and t2.rgt > t1.rgt) = 0
		and t1.rgt > t1.lft""".format(
            doctype, doctype
        )
    )
    return result[0][0] if result else None


def get_child_nodes(group_type, root):
    lft, rgt = frappe.db.get_value(group_type, root, ["lft", "rgt"])
    return frappe.get_all(
        group_type,
        filters={"lft": [">=", lft], "rgt": ["<=", rgt]},
        fields=["name", "lft", "rgt"],
        order_by="lft",
    )


def get_item_group_condition(pos_profile, item_groups=None):
    cond = " and 1=1"
    item_groups = item_groups or get_item_groups(pos_profile)
    if item_groups:
        # Security: Escape values to prevent SQL injection
        escaped_groups = [frappe.db.escape(g) for g in item_groups]
        cond = " and item_group in ({0})".format(", ".join(escaped_groups))

    return cond


def add_taxes_from_tax_template(item, parent_doc):
    accounts_settings = frappe.get_cached_doc("Accounts Settings")
    add_taxes_from_item_tax_template = accounts_settings.add_taxes_from_item_tax_template
    if item.get("item_tax_template") and add_taxes_from_item_tax_template:
        item_tax_template = item.get("item_tax_template")
        taxes_template_details = frappe.get_all(
            "Item Tax Template Detail",
            filters={"parent": item_tax_template},
            fields=["tax_type"],
        )

        for tax_detail in taxes_template_details:
            tax_type = tax_detail.get("tax_type")

            found = any(tax.account_head == tax_type for tax in parent_doc.taxes)
            if not found:
                tax_row = parent_doc.append("taxes", {})
                tax_row.update(
                    {
                        "description": str(tax_type).split(" - ")[0],
                        "charge_type": "On Net Total",
                        "account_head": tax_type,
                    }
                )

                if parent_doc.doctype == "Purchase Order":
                    tax_row.update({"category": "Total", "add_deduct_tax": "Add"})
                tax_row.db_insert()


def set_batch_nos_for_bundels(doc, warehouse_field, throw=False):
    """Automatically select `batch_no` for outgoing items in item table"""
    for d in doc.packed_items:
        qty = d.get("stock_qty") or d.get("transfer_qty") or d.get("qty") or 0
        has_batch_no = frappe.db.get_value("Item", d.item_code, "has_batch_no")
        warehouse = d.get(warehouse_field, None)
        if has_batch_no and warehouse and qty > 0:
            if not d.batch_no:
                d.batch_no = get_batch_no(d.item_code, warehouse, qty, throw, d.serial_no)
            else:
                batch_qty = get_batch_qty(batch_no=d.batch_no, warehouse=warehouse)
                if flt(batch_qty, d.precision("qty")) < flt(qty, d.precision("qty")):
                    frappe.throw(
                        _(
                            "Row #{0}: The batch {1} has only {2} qty. Please select another batch which has {3} qty available or split the row into multiple rows, to deliver/issue from multiple batches"
                        ).format(d.idx, d.batch_no, batch_qty, qty)
                    )


def get_company_domain(company):
    return frappe.get_cached_value("Company", cstr(company), "domain")


@frappe.whitelist()
def get_selling_price_lists():
    """Return all selling price lists"""
    return frappe.get_all(
        "Price List",
        filters={"selling": 1},
        fields=["name"],
        order_by="name",
    )


@frappe.whitelist()
def get_app_info() -> Dict[str, List[Dict[str, str]]]:
    """
    Return a list of installed apps and their versions.
    """
    # Get installed apps using Frappe's built-in function
    installed_apps = frappe.get_installed_apps()

    # Get app versions
    apps_info = []
    for app_name in installed_apps:
        try:
            # Get app version from hooks or __init__.py
            app_version = frappe.get_attr(f"{app_name}.__version__") or "Unknown"
        except (AttributeError, ImportError):
            app_version = "Unknown"

        apps_info.append({"app_name": app_name, "installed_version": app_version})

    return {"apps": apps_info, "build_version": get_build_version(), **_get_update_metadata()}


def _get_git_commit_info(app_name: str = "posawesome") -> Dict[str, Any]:
    """Best-effort git commit details for the given app."""
    try:
        app_path = frappe.get_app_path(app_name)
    except Exception:
        return {}

    if not app_path or not os.path.exists(app_path):
        return {}

    def _run(cmd: List[str]) -> str:
        return subprocess.check_output(cmd, cwd=app_path, stderr=subprocess.DEVNULL).decode("utf-8").strip()

    try:
        commit_hash = _run(["git", "rev-parse", "HEAD"])
        commit_message = _run(["git", "log", "-1", "--pretty=%B"])
        commit_date = _run(["git", "log", "-1", "--pretty=%cI"])
        return {
            "commit_hash": commit_hash,
            "commit_message": commit_message,
            "commit_date": commit_date,
        }
    except Exception:
        return {}


@frappe.whitelist()
def get_build_info() -> Dict[str, Any]:
    """Return build version + latest git commit info for update prompts."""
    data: Dict[str, Any] = {"build_version": get_build_version(), **_get_update_metadata()}
    data.update(_get_git_commit_info("posawesome"))
    return data


def _fetch_remote(app_path: str) -> None:
    try:
        subprocess.check_output(
            ["git", "fetch", "origin", "--prune", "--quiet"],
            cwd=app_path,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return


def _get_remote_heads(app_path: str) -> Dict[str, str]:
    try:
        output = (
            subprocess.check_output(
                ["git", "for-each-ref", "refs/remotes/origin", "--format=%(refname:short) %(objectname)"],
                cwd=app_path,
                stderr=subprocess.DEVNULL,
            )
            .decode("utf-8")
            .strip()
        )
        heads = {}
        for line in output.splitlines():
            parts = line.strip().split(" ")
            if len(parts) != 2:
                continue
            ref, sha = parts
            if ref == "origin/HEAD":
                continue
            branch = ref.replace("origin/", "", 1)
            heads[branch] = sha
        return heads
    except Exception:
        return {}


def _get_commit_details(app_path: str, ref: str) -> Dict[str, str]:
    try:
        commit_message = (
            subprocess.check_output(
                ["git", "log", "-1", "--pretty=%B", ref],
                cwd=app_path,
                stderr=subprocess.DEVNULL,
            )
            .decode("utf-8")
            .strip()
        )
        commit_date = (
            subprocess.check_output(
                ["git", "log", "-1", "--pretty=%cI", ref],
                cwd=app_path,
                stderr=subprocess.DEVNULL,
            )
            .decode("utf-8")
            .strip()
        )
        commit_hash = (
            subprocess.check_output(
                ["git", "rev-parse", ref],
                cwd=app_path,
                stderr=subprocess.DEVNULL,
            )
            .decode("utf-8")
            .strip()
        )
        return {
            "commit_hash": commit_hash,
            "commit_message": commit_message,
            "commit_date": commit_date,
        }
    except Exception:
        return {}


def _get_commit_list(app_path: str, range_ref: str, limit: int = 20) -> List[Dict[str, str]]:
    try:
        output = (
            subprocess.check_output(
                [
                    "git",
                    "log",
                    range_ref,
                    f"--max-count={limit}",
                    "--pretty=%H%x1f%h%x1f%s%x1f%cI",
                ],
                cwd=app_path,
                stderr=subprocess.DEVNULL,
            )
            .decode("utf-8")
            .strip()
        )
        commits: List[Dict[str, str]] = []
        for line in output.splitlines():
            parts = line.split("\x1f")
            if len(parts) != 4:
                continue
            full_hash, short_hash, subject, commit_date = parts
            commits.append(
                {
                    "commit_hash": full_hash,
                    "commit_short": short_hash,
                    "commit_message": subject,
                    "commit_date": commit_date,
                }
            )
        return commits
    except Exception:
        return []


def _get_current_branch(app_path: str) -> str:
    try:
        branch = (
            subprocess.check_output(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=app_path,
                stderr=subprocess.DEVNULL,
            )
            .decode("utf-8")
            .strip()
        )
        return branch
    except Exception:
        return ""


@frappe.whitelist()
def get_remote_update_info() -> Dict[str, Any]:
    data: Dict[str, Any] = {"build_version": get_build_version(), **_get_update_metadata()}
    base = _get_git_commit_info("posawesome")
    if base:
        data.update(base)

    try:
        app_path = frappe.get_app_path("posawesome")
    except Exception:
        return data

    if not app_path or not os.path.exists(app_path):
        return data

    _fetch_remote(app_path)
    heads = _get_remote_heads(app_path)
    data["remote_heads"] = heads
    current_branch = _get_current_branch(app_path)
    if current_branch:
        data["current_branch"] = current_branch

    current_hash = base.get("commit_hash") if base else None
    if heads and current_hash and current_branch:
        remote_head = heads.get(current_branch)
        if remote_head and remote_head != current_hash:
            different = {current_branch: remote_head}
            data["remote_ahead"] = different
            ref = f"origin/{current_branch}"
            details = _get_commit_details(app_path, ref)
            if details:
                data["remote_sample_branch"] = current_branch
                data["remote_sample"] = details
            data["remote_commits"] = _get_commit_list(app_path, f"{current_hash}..{ref}")

    return data


def ensure_child_doctype(doc, table_field, child_doctype):
    """Ensure child rows have the correct doctype set."""
    for row in doc.get(table_field, []):
        if not row.get("doctype"):
            row.doctype = child_doctype


@frappe.whitelist()
def get_sales_person_names(pos_profile=None):
    return fetch_sales_person_names(pos_profile=pos_profile)


@frappe.whitelist()
def get_language_options():
    """Return newline separated language codes from translations directories of all apps.

    Always include English (``en``) in the list so that users can explicitly
    select it in the POS profile.
    """
    import os

    languages = {"en"}

    def normalize(code: str) -> str:
        """Return language code normalized for comparison."""
        return code.strip().lower().replace("_", "-")

    # Collect languages from translation CSV files
    for app in frappe.get_installed_apps():
        translations_path = frappe.get_app_path(app, "translations")
        if os.path.exists(translations_path):
            for filename in os.listdir(translations_path):
                if filename.endswith(".csv"):
                    languages.add(normalize(os.path.splitext(filename)[0]))

    # Also include languages from the Translation doctype, if available
    if frappe.db.table_exists("Translation"):
        rows = frappe.db.sql("SELECT DISTINCT language FROM `tabTranslation` WHERE language IS NOT NULL")
        for (language,) in rows:
            languages.add(normalize(language))

    # Normalize to lowercase and deduplicate, then sort for consistent order
    return "\n".join(sorted(languages))


@frappe.whitelist()
def get_translation_dict(lang: str) -> dict:
    """Return translations for the given language from all installed apps."""
    from frappe.translate import get_translations_from_csv

    if lang == "en":
        # English is the base language and does not have a separate
        # translation file. Return an empty dict to avoid file lookups.
        return {}

    translations = {}

    for app in frappe.get_installed_apps():
        try:
            messages = get_translations_from_csv(lang, app) or {}
            translations.update(messages)
        except Exception:
            pass

    # Include translations stored in the Translation doctype, if present
    if frappe.db.table_exists("Translation"):
        rows = frappe.db.sql(
            """
	        SELECT source_text, translated_text
	        FROM `tabTranslation`
	        WHERE language = %s
	    """,
            (lang,),
        )
        for source, target in rows:
            translations[source] = target

    return translations


@frappe.whitelist()
def get_pos_profile_tax_inclusive(pos_profile: str):
    """Return the 'posa_tax_inclusive' setting for the given POS Profile."""
    if not pos_profile:
        return None
    return frappe.get_cached_value("POS Profile", pos_profile, "posa_tax_inclusive")


@frappe.whitelist()
def get_database_usage():
    db_size = None
    db_connections = None
    db_slow_queries = None
    db_engine = None
    db_version = None
    db_table_count = None
    db_total_rows = None
    db_top_tables = []
    try:
        db_type = frappe.conf.get("db_type") or frappe.db.db_type
        db_engine = db_type
        db_version = frappe.db.sql("SELECT VERSION();")[0][0]
        if db_type == "postgres":
            db_name = frappe.conf.get("db_name") or frappe.db.get_database_name()
            db_size = frappe.db.sql("SELECT pg_database_size(%s)", (db_name,))[0][0]
            db_size = int(db_size)
            db_connections = frappe.db.sql("SELECT count(*) FROM pg_stat_activity;")[0][0]
            db_slow_queries = frappe.db.sql(
                "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '1 second';"
            )[0][0]
            db_table_count = frappe.db.sql(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
            )[0][0]
            db_total_rows = frappe.db.sql("SELECT sum(reltuples)::bigint FROM pg_class WHERE relkind='r';")[
                0
            ][0]
            db_top_tables = frappe.db.sql(
                """
                SELECT relname, pg_total_relation_size(relid) AS size
                FROM pg_catalog.pg_statio_user_tables
                ORDER BY size DESC LIMIT 3
            """
            )
            db_top_tables = [{"name": t[0], "size": int(t[1])} for t in db_top_tables]
        elif db_type == "mariadb" or db_type == "mysql":
            db_name = frappe.conf.get("db_name") or frappe.db.get_database_name()
            db_size = frappe.db.sql(
                "SELECT SUM(data_length + index_length) FROM information_schema.tables WHERE table_schema = %s",
                (db_name,),
            )[0][0]
            db_size = int(db_size)
            db_connections = frappe.db.sql("SHOW STATUS WHERE variable_name = 'Threads_connected';")[0][1]
            db_connections = int(db_connections)
            db_slow_queries = frappe.db.sql("SHOW GLOBAL STATUS WHERE variable_name = 'Slow_queries';")[0][1]
            db_slow_queries = int(db_slow_queries)
            db_table_count = frappe.db.sql(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema = %s",
                (db_name,),
            )[0][0]
            db_total_rows = frappe.db.sql(
                "SELECT SUM(TABLE_ROWS) FROM information_schema.tables WHERE table_schema = %s",
                (db_name,),
            )[0][0]
            db_top_tables = frappe.db.sql(
                """
                SELECT table_name, (data_length + index_length) AS size
                FROM information_schema.tables
                WHERE table_schema = %s
                ORDER BY size DESC LIMIT 3
            """,
                (db_name,),
            )
            db_top_tables = [{"name": t[0], "size": int(t[1])} for t in db_top_tables]
    except Exception as db_exc:
        frappe.log_error(f"DB stats error: {db_exc}")
        db_size = None
        db_connections = None
        db_slow_queries = None
        db_engine = None
        db_version = None
        db_table_count = None
        db_total_rows = None
        db_top_tables = []
    return {
        "db_size": db_size,
        "db_connections": db_connections,
        "db_slow_queries": db_slow_queries,
        "db_engine": db_engine,
        "db_version": db_version,
        "db_table_count": db_table_count,
        "db_total_rows": db_total_rows,
        "db_top_tables": db_top_tables,
    }


@frappe.whitelist()
def get_server_usage():
    global _PSUTIL_MISSING_LOGGED

    cpu_percent = None
    memory_percent = None
    memory_total = None
    memory_used = None
    memory_available = None
    load_avg = (None, None, None)
    uptime = None

    if psutil is None:
        if not _PSUTIL_MISSING_LOGGED:
            frappe.log_error("psutil is not installed; server usage metrics unavailable.")
            _PSUTIL_MISSING_LOGGED = True
    else:
        try:

            cpu_percent = psutil.cpu_percent(interval=0.5)
            mem = psutil.virtual_memory()
            memory_percent = mem.percent
            memory_total = mem.total
            memory_used = mem.used
            memory_available = mem.available
            load_avg = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
            uptime = time.time() - psutil.boot_time()
        except Exception as e:
            frappe.log_error(f"Server usage error: {e}")
    return {
        "cpu_percent": cpu_percent,
        "memory_percent": memory_percent,
        "memory_total": memory_total,
        "memory_used": memory_used,
        "memory_available": memory_available,
        "load_avg": load_avg,
        "uptime": uptime,
    }


# Cache for language data
_LANGUAGE_CACHE = {
    "languages": None,
    "last_updated": None,
    "cache_duration": 300,  # 5 minutes
}


def _set_active_session_language(lang_code: str) -> None:
    """Ensure the current request session reflects the selected language."""

    # Update thread-local language used by Frappe during the request
    try:
        frappe.local.lang = lang_code
    except Exception:
        pass

    # Update session dictionaries so subsequent requests use the new language
    for session_obj in (
        getattr(frappe.local, "session", None),
        getattr(frappe.session, "data", None),
    ):
        if not session_obj:
            continue
        try:
            session_obj["lang"] = lang_code
            session_obj["language"] = lang_code
        except Exception:
            pass

    # Some code paths read frappe.session.lang directly
    try:
        frappe.session.lang = lang_code
    except Exception:
        pass

    # Keep boot info in sync so the UI gets the updated language immediately
    boot = getattr(frappe.local, "boot", None)
    if boot:
        boot.lang = lang_code
        sysdefaults = boot.get("sysdefaults")
        if isinstance(sysdefaults, dict):
            sysdefaults["language"] = lang_code

    # Update preferred language cookie when available
    cookie_manager = getattr(frappe.local, "cookie_manager", None)
    if cookie_manager:
        try:
            cookie_manager.set_cookie("preferred_language", lang_code)
        except Exception:
            pass


# Language display names mapping (moved to module level for reuse)
# Language display names mapping (moved to module level for reuse)
LANGUAGE_NAMES = {
    "en": "English",
    "ar": "العربية",
    "es": "Español",
    "pt": "Português",
    "fr": "Français",
    "de": "Deutsch",
    "it": "Italiano",
    "nl": "Nederlands",
    "pl": "Polski",
    "ru": "Русский",
    "zh": "中文",
    "ja": "日本語",
    "ko": "한국어",
    "hi": "हिन्दी",
    "tr": "Türkçe",
    "sv": "Svenska",
    "da": "Dansk",
    "no": "Norsk",
    "fi": "Suomi",
    "cs": "Čeština",
    "sk": "Slovenčina",
    "hu": "Magyar",
    "ro": "Română",
    "bg": "Български",
    "hr": "Hrvatski",
    "sl": "Slovenščina",
    "et": "Eesti",
    "lv": "Latviešu",
    "lt": "Lietuvių",
    "af": "Afrikaans",
    "am": "አማርኛ",
    "bn": "বাংলা",
    "bo": "བོད་སྐད",
    "bs": "Bosanski",
    "ca": "Català",
    "el": "Ελληνικά",
    "en-GB": "English (UK)",
    "en-US": "English (US)",
    "eo": "Esperanto",
    "es-AR": "Español (Argentina)",
    "es-BO": "Español (Bolivia)",
    "es-CL": "Español (Chile)",
    "es-CO": "Español (Colombia)",
    "es-DO": "Español (República Dominicana)",
    "es-EC": "Español (Ecuador)",
    "es-GT": "Español (Guatemala)",
    "es-MX": "Español (México)",
    "es-NI": "Español (Nicaragua)",
    "es-PE": "Español (Perú)",
    "fa": "فارسی",
    "fil": "Filipino",
    "gu": "ગુજરાતી",
    "he": "עברית",
    "id": "Bahasa Indonesia",
    "is": "Íslenska",
    "km": "ភាសាខ្មែរ",
    "kn": "ಕನ್ನಡ",
    "ku": "Kurdî",
    "lo": "ລາວ",
    "mk": "Македонски",
    "ml": "മലയാളം",
    "mn": "Монгол",
    "mr": "मराठी",
    "ms": "Bahasa Melayu",
    "my": "မြန်မာဘာသာ",
    "nb": "Norsk Bokmål",
    "ps": "پښتو",
    "pt-BR": "Português (Brasil)",
    "rw": "Kinyarwanda",
    "si": "සිංහල",
    "sq": "Shqip",
    "sr": "Српски",
    "sr-CS": "Srpski",
    "sw": "Kiswahili",
    "ta": "தமிழ்",
    "te": "తెలుగు",
    "th": "ไทย",
    "uk": "Українська",
    "ur": "اردو",
    "uz": "Oʻzbek",
    "vi": "Tiếng Việt",
    "zh-TW": "中文 (台灣)",
}


def _clip_text(value: Any, max_length: int = 2000) -> str:
    text = cstr(value or "")
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."


def _sanitize_client_error_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "kind": _clip_text(payload.get("kind") or "unknown", 80),
        "message": _clip_text(payload.get("message") or "Unknown client error", 2000),
        "stack": _clip_text(payload.get("stack") or "", 8000),
        "filename": _clip_text(payload.get("filename") or "", 500),
        "lineno": payload.get("lineno"),
        "colno": payload.get("colno"),
        "info": _clip_text(payload.get("info") or "", 1000),
        "route": _clip_text(payload.get("route") or "", 500),
        "url": _clip_text(payload.get("url") or "", 1000),
        "user_agent": _clip_text(payload.get("userAgent") or "", 500),
        "timestamp": _clip_text(payload.get("timestamp") or "", 80),
    }


def _is_cache_valid():
    """Check if language cache is still valid."""
    if not _LANGUAGE_CACHE["last_updated"]:
        return False

    cache_time = _LANGUAGE_CACHE["last_updated"]
    expiry_time = add_to_date(cache_time, seconds=_LANGUAGE_CACHE["cache_duration"])
    return get_datetime() < expiry_time


def _update_language_cache(languages):
    """Update the language cache."""
    _LANGUAGE_CACHE["languages"] = languages
    _LANGUAGE_CACHE["last_updated"] = get_datetime()


@frappe.whitelist()
def get_available_languages():
    """Get list of available languages with caching."""
    # Return cached data if valid
    if _is_cache_valid() and _LANGUAGE_CACHE["languages"]:
        return _LANGUAGE_CACHE["languages"]

    languages = []

    try:
        translations_path = frappe.get_app_path("posawesome", "translations")
        if os.path.exists(translations_path):
            # Use os.scandir for better performance
            with os.scandir(translations_path) as entries:
                for entry in entries:
                    if entry.is_file() and entry.name.endswith(".csv"):
                        lang_code = os.path.splitext(entry.name)[0]
                        display_name = LANGUAGE_NAMES.get(lang_code, lang_code.upper())
                        languages.append(
                            {
                                "code": lang_code,
                                "name": display_name,
                                "native_name": display_name,
                            }
                        )

        # Always include English as fallback
        if not any(lang["code"] == "en" for lang in languages):
            languages.insert(0, {"code": "en", "name": "English", "native_name": "English"})

        # Sort and cache
        languages = sorted(languages, key=lambda x: x["code"])
        _update_language_cache(languages)

        return languages

    except Exception as e:
        frappe.log_error(f"Error getting available languages: {str(e)}")
        # Return minimal fallback
        fallback = [{"code": "en", "name": "English", "native_name": "English"}]
        _update_language_cache(fallback)
        return fallback


@functools.lru_cache(maxsize=128)
def _get_user_language_cached(user):
    """Get user language with LRU cache."""
    if user == "Guest":
        return "en"
    return frappe.get_cached_value("User", user, "language") or "en"


@frappe.whitelist()
def get_current_user_language():
    """Get current user's language with optimized caching."""
    try:
        user = frappe.session.user
        if user == "Guest":
            return {
                "success": False,
                "message": "Guest users cannot have language preferences",
            }

        user_language = _get_user_language_cached(user)
        _set_active_session_language(user_language)
        available_languages = get_available_languages()

        # Find current language details
        current_lang = next(
            (lang for lang in available_languages if lang["code"] == user_language),
            None,
        )

        return {
            "success": True,
            "user": user,
            "language_code": user_language,
            "language_name": (current_lang["name"] if current_lang else user_language.upper()),
            "available_languages": available_languages,
        }

    except Exception as e:
        frappe.log_error(f"Error getting current user language: {str(e)}")
        return {"success": False, "message": "Failed to get language"}


@frappe.whitelist()
def set_current_user_language(lang_code):
    """Set language with optimized database operations."""
    try:
        user = frappe.session.user
        if user == "Guest":
            return {
                "success": False,
                "message": "Guest users cannot set language preferences",
            }

        # Validate language code
        available_languages = get_available_languages()
        valid_codes = [lang["code"] for lang in available_languages]

        if lang_code not in valid_codes:
            return {
                "success": False,
                "message": f"Language '{lang_code}' is not supported",
            }

        # Batch database operations
        frappe.db.set_value("User", user, "language", lang_code, update_modified=False)
        frappe.db.commit()

        # Clear specific caches
        frappe.clear_cache(user=user)
        _get_user_language_cached.cache_clear()
        _set_active_session_language(lang_code)

        return {
            "success": True,
            "message": f"Language set to {lang_code}",
            "language": lang_code,
        }

    except Exception as e:
        frappe.log_error(f"Error setting language: {str(e)}")
        return {"success": False, "message": "Failed to set language"}


@frappe.whitelist()
def get_language_info(lang_code):
    """Get detailed information about a specific language."""
    try:
        is_valid, error_msg = _validate_language_code(lang_code)
        if not is_valid:
            return {"success": False, "message": error_msg}

        available_languages = get_available_languages()
        language = next((lang for lang in available_languages if lang["code"] == lang_code), None)

        # Check translation file
        translations_path = frappe.get_app_path("posawesome", "translations", f"{lang_code}.csv")
        has_translations = os.path.exists(translations_path)

        translation_count = 0
        if has_translations:
            try:
                with open(translations_path, "r", encoding="utf-8") as f:
                    translation_count = sum(1 for _ in f) - 1  # Exclude header
            except Exception:
                pass

        return {
            "success": True,
            "language": language,
            "has_translations": has_translations,
            "translation_count": translation_count,
        }

    except Exception as e:
        frappe.log_error(f"Error getting language info for {lang_code}: {str(e)}")
        return {"success": False, "message": "Failed to get language info"}


@frappe.whitelist()
def log_client_error(payload=None):
    """Capture frontend runtime errors in server logs for debugging."""
    try:
        if isinstance(payload, str):
            parsed_payload = json.loads(payload)
        elif isinstance(payload, dict):
            parsed_payload = payload
        else:
            parsed_payload = {"message": _clip_text(payload)}

        sanitized_payload = _sanitize_client_error_payload(parsed_payload)
        title = f"POS Client Error [{sanitized_payload.get('kind', 'unknown')}]"
        message = {
            "user": frappe.session.user,
            "site": frappe.local.site,
            "payload": sanitized_payload,
        }

        frappe.log_error(message=json.dumps(message, ensure_ascii=True, default=str), title=title)
        return {"ok": True}
    except Exception as exc:
        frappe.log_error(
            message=f"Failed to log POS client error: {cstr(exc)}\n{frappe.get_traceback()}",
            title="POS Client Error Logging Failure",
        )
        return {"ok": False}
