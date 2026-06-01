from __future__ import annotations

import functools
import logging
import time
from contextlib import contextmanager
from typing import Any, Callable

import frappe

logger = logging.getLogger(__name__)


def is_pos_perf_enabled() -> bool:
    return bool(frappe.conf.get("posa_perf_log_enabled"))


def count_bucket(count: Any) -> str:
    try:
        value = int(count)
    except Exception:
        return "unknown"
    if value < 0:
        return "unknown"
    if value == 0:
        return "0"
    if value <= 5:
        return "1-5"
    if value <= 20:
        return "6-20"
    if value <= 100:
        return "21-100"
    if value <= 1000:
        return "101-1000"
    return "1000+"


def result_count(value: Any) -> int | None:
    if value is None:
        return 0
    if isinstance(value, (list, tuple, set)):
        return len(value)
    if isinstance(value, dict):
        for key in ("data", "items", "customers", "changes", "updates", "invoices", "payments"):
            nested = value.get(key)
            if isinstance(nested, (list, tuple, set)):
                return len(nested)
    return None


def sanitize_context(context: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for key, value in (context or {}).items():
        if value is None:
            continue
        if isinstance(value, bool):
            safe[key] = value
        elif isinstance(value, (int, float)):
            safe[key] = round(float(value), 3)
        else:
            text = str(value)
            safe[key] = text[:80]
    return safe


def emit_pos_perf(metric: str, duration_ms: float, status: str = "success", **context):
    if not is_pos_perf_enabled():
        return
    safe_context = sanitize_context(context)
    parts = " ".join(f"{key}={safe_context[key]}" for key in sorted(safe_context))
    logger.info(
        "[POS_PERF] metric=%s duration_ms=%.2f status=%s %s",
        metric,
        duration_ms,
        status,
        parts,
    )


def pos_perf_endpoint(metric: str, count_getter: Callable[[Any], Any] | None = None, **static_context):
    def decorate(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            started_at = time.perf_counter()
            try:
                result = fn(*args, **kwargs)
            except Exception as exc:
                emit_pos_perf(
                    metric,
                    (time.perf_counter() - started_at) * 1000,
                    "failure",
                    error_code=exc.__class__.__name__,
                    **static_context,
                )
                raise

            if count_getter:
                count = count_getter(result)
            else:
                count = result_count(result)
            emit_pos_perf(
                metric,
                (time.perf_counter() - started_at) * 1000,
                "success",
                result_count_bucket=count_bucket(count) if count is not None else "unknown",
                **static_context,
            )
            return result

        return wrapper

    return decorate


@contextmanager
def pos_perf_query(metric: str, **context):
    started_at = time.perf_counter()
    try:
        yield
    except Exception as exc:
        emit_pos_perf(
            metric,
            (time.perf_counter() - started_at) * 1000,
            "failure",
            error_code=exc.__class__.__name__,
            **context,
        )
        raise
    else:
        emit_pos_perf(metric, (time.perf_counter() - started_at) * 1000, "success", **context)
