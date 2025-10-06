# -*- coding: utf-8 -*-
# Copyright (c) 2020, Youssef Restom and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json
import frappe
from frappe.utils import cstr, add_to_date, get_datetime
from typing import List, Dict
import time
import os
import psutil
import functools

from .utils import get_item_groups


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
        cond = " and item_group in (%s)" % (", ".join(["%s"] * len(item_groups)))
        return cond % tuple(item_groups)

    return cond


def add_taxes_from_tax_template(item, parent_doc):
    accounts_settings = frappe.get_cached_doc("Accounts Settings")
    add_taxes_from_item_tax_template = (
        accounts_settings.add_taxes_from_item_tax_template
    )
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
                d.batch_no = get_batch_no(
                    d.item_code, warehouse, qty, throw, d.serial_no
                )
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

    return {"apps": apps_info}


def ensure_child_doctype(doc, table_field, child_doctype):
    """Ensure child rows have the correct doctype set."""
    for row in doc.get(table_field, []):
        if not row.get("doctype"):
            row.doctype = child_doctype


@frappe.whitelist()
def get_sales_person_names():
    import json

    print("Fetching sales persons...")
    try:
        sales_persons = frappe.get_list(
            "Sales Person",
            filters={"enabled": 1},
            fields=["name", "sales_person_name"],
            limit_page_length=100000,
        )
        print(f"Found {len(sales_persons)} sales persons: {json.dumps(sales_persons)}")
        return sales_persons
    except Exception as e:
        print(f"Error fetching sales persons: {str(e)}")
        frappe.log_error(
            f"Error fetching sales persons: {str(e)}", "POS Sales Person Error"
        )
        return []


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
        rows = frappe.db.sql(
            "SELECT DISTINCT language FROM `tabTranslation` WHERE language IS NOT NULL"
        )
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
            db_connections = frappe.db.sql("SELECT count(*) FROM pg_stat_activity;")[0][
                0
            ]
            db_slow_queries = frappe.db.sql(
                "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '1 second';"
            )[0][0]
            db_table_count = frappe.db.sql(
                "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
            )[0][0]
            db_total_rows = frappe.db.sql(
                "SELECT sum(reltuples)::bigint FROM pg_class WHERE relkind='r';"
            )[0][0]
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
            db_connections = frappe.db.sql(
                "SHOW STATUS WHERE variable_name = 'Threads_connected';"
            )[0][1]
            db_connections = int(db_connections)
            db_slow_queries = frappe.db.sql(
                "SHOW GLOBAL STATUS WHERE variable_name = 'Slow_queries';"
            )[0][1]
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
    try:

        cpu_percent = psutil.cpu_percent(interval=0.5)
        mem = psutil.virtual_memory()
        memory_percent = mem.percent
        memory_total = mem.total
        memory_used = mem.used
        memory_available = mem.available
        load_avg = os.getloadavg() if hasattr(os, "getloadavg") else (0, 0, 0)
        uptime = time.time() - psutil.boot_time()
    except ImportError:
        cpu_percent = None
        memory_percent = None
        memory_total = None
        memory_used = None
        memory_available = None
        load_avg = (None, None, None)
        uptime = None
    except Exception as e:
        frappe.log_error(f"Server usage error: {e}")
        cpu_percent = None
        memory_percent = None
        memory_total = None
        memory_used = None
        memory_available = None
        load_avg = (None, None, None)
        uptime = None
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
            languages.insert(
                0, {"code": "en", "name": "English", "native_name": "English"}
            )

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
            "language_name": (
                current_lang["name"] if current_lang else user_language.upper()
            ),
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
        language = next(
            (lang for lang in available_languages if lang["code"] == lang_code), None
        )

        # Check translation file
        translations_path = frappe.get_app_path(
            "posawesome", "translations", f"{lang_code}.csv"
        )
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
