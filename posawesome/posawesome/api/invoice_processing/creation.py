import frappe
from frappe import _
from frappe.exceptions import QueryDeadlockError, TimestampMismatchError
from frappe.utils import (
    cint,
    flt,
    getdate,
    nowdate,
)
from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account
from posawesome.posawesome.api.invoice_processing.utils import (
    _get_return_validity_settings,
    _validate_return_window,
    _resolve_effective_price_list,
    _build_invoice_remarks,
    _set_return_valid_upto,
    resolve_erpnext_currency_rates,
)
from posawesome.posawesome.api.invoice_processing.stock import (
    _strip_client_freebies_from_payload,
    _validate_stock_on_invoice,
    _apply_item_name_overrides,
    _deduplicate_free_items,
    _merge_duplicate_taxes,
    _auto_set_return_batches,
    _collect_stock_errors,
)
from posawesome.posawesome.api.tax_contracts import apply_pos_tax_inclusion_contract
from posawesome.posawesome.api.payment_processing.utils import get_bank_cash_account as get_bank_account
from posawesome.posawesome.api.utilities import ensure_child_doctype, set_batch_nos_for_bundels
from posawesome.posawesome.api.payments import redeeming_customer_credit
from posawesome.posawesome.api.payment_currency import (
    PAYMENT_CURRENCY_FIELDS,
    normalize_change_returns,
    normalize_invoice_payment_currencies,
)
from posawesome.posawesome.api.idempotency import (
    assert_invoice_request_scope,
    extract_invoice_client_request_id,
    find_invoice_by_client_request_id,
    normalize_invoice_request_identity,
    set_invoice_client_request_id,
    strip_invoice_client_request_id,
    doctype_supports_client_request_id,
)
from posawesome.posawesome.api.item_sale_controls import (
    collect_item_sale_control_errors,
    validate_invoice_item_sale_controls,
)
from posawesome.posawesome.api.terminal_state import (
    get_active_terminal_cashier,
    validate_assigned_terminal_cashier,
)
from posawesome.posawesome.api.pos_access import (
    get_authorized_pos_profile,
    require_pos_supervisor_or_manager,
)
import json
import hashlib
import time
from contextlib import contextmanager
from frappe.utils import money_in_words
from frappe.utils.background_jobs import enqueue


LEDGER_DOCTYPE = "POS Invoice Submission Ledger"
STATE_RECEIVED = "RECEIVED"
STATE_DRAFT_CREATED = "DRAFT_CREATED"
STATE_SUBMITTED = "SUBMITTED"
STATE_POST_SUBMIT_DONE = "POST_SUBMIT_DONE"
STATE_FAILED = "FAILED"
FINAL_LEDGER_STATES = {STATE_SUBMITTED, STATE_POST_SUBMIT_DONE}
AUTHORITATIVE_CASHIER_FIELD = "posa_cashier"
CLIENT_CASHIER_KEYS = {AUTHORITATIVE_CASHIER_FIELD, "_posa_authoritative_cashier"}
TRUSTED_SHIFT_AUDIT_KEY = "_posa_shift_reassignment_audit"
TRUSTED_SHIFT_SOURCES = {"offline_sync", "submitted_amendment"}
DEADLOCK_RETRY_DELAYS = (0.08, 0.2)

RETURN_OUTSTANDING_MESSAGE_MARKERS = (
    "Updating the outstanding to this invoice.",
    "Update Outstanding for Self",
)


def _permission_denied(message):
    frappe.throw(message, getattr(frappe, "PermissionError", PermissionError))


def _request_profile_name(value):
    if isinstance(value, dict):
        return str(value.get("name") or "").strip()
    if value is not None and not isinstance(value, str) and hasattr(value, "get"):
        return str(value.get("name") or "").strip()
    return str(value or "").strip()


def _profile_ignore_pricing_rule(profile_doc):
    """Return the authoritative manual-rate persistence policy for this POS Profile."""

    return cint(profile_doc.get("ignore_pricing_rule") or 0) if profile_doc else 0


def _enforce_return_pricing_invariant(invoice_doc):
    """Keep returns tied to the pricing of the invoice they reverse."""

    if not cint(invoice_doc.get("is_return")):
        return False

    invoice_doc.ignore_pricing_rule = 1
    invoice_doc.flags.ignore_pricing_rule = True
    invoice_doc.set("pricing_rules", [])
    return True


def _apply_pricing_rule_policy(invoice_doc, profile_doc):
    """Apply the POS Profile policy, except that returns must never be repriced."""

    if _enforce_return_pricing_invariant(invoice_doc):
        return 1

    ignore_pricing_rule = _profile_ignore_pricing_rule(profile_doc)
    invoice_doc.ignore_pricing_rule = ignore_pricing_rule
    invoice_doc.flags.ignore_pricing_rule = bool(ignore_pricing_rule)
    return ignore_pricing_rule


def _resolve_authorized_invoice_profile(*payloads):
    """Resolve one canonical profile/company from mutually consistent request payloads."""

    payloads = tuple(payload for payload in payloads if isinstance(payload, dict))
    requested_profiles = {
        _request_profile_name(payload.get("pos_profile"))
        for payload in payloads
        if _request_profile_name(payload.get("pos_profile"))
    }
    requested_companies = {
        str(payload.get("company") or "").strip()
        for payload in payloads
        if str(payload.get("company") or "").strip()
    }
    if len(requested_profiles) > 1 or len(requested_companies) > 1:
        _permission_denied(_("The invoice POS Profile and company do not match."))

    profile_doc = get_authorized_pos_profile(
        next(iter(requested_profiles), None),
        company=next(iter(requested_companies), None),
    )
    profile_name = str(profile_doc.get("name") or "").strip()
    profile_company = str(profile_doc.get("company") or "").strip()
    if not profile_name or not profile_company:
        _permission_denied(_("The authorized POS Profile must have a company."))

    for payload in payloads:
        payload["pos_profile"] = profile_name
        payload["company"] = profile_company
    return profile_doc


def _doc_value(doc, key, default=None):
    if isinstance(doc, dict):
        return doc.get(key, default)
    getter = getattr(doc, "get", None)
    if callable(getter):
        try:
            return getter(key, default)
        except TypeError:
            pass
    return getattr(doc, key, default)


def _validate_invoice_opening_shift(
    profile_doc,
    *payloads,
    allow_closed_replay=False,
    required=False,
):
    """Validate a client-supplied shift independently of the mutable ``is_pos`` flag."""

    payloads = tuple(payload for payload in payloads if isinstance(payload, dict))
    shift_names = {
        str(payload.get("posa_pos_opening_shift") or "").strip()
        for payload in payloads
        if str(payload.get("posa_pos_opening_shift") or "").strip()
    }
    if len(shift_names) > 1:
        _permission_denied(_("The invoice POS Opening Shift values do not match."))
    if not shift_names:
        if required:
            _permission_denied(_("A valid POS Opening Shift is required."))
        return None

    shift_name = next(iter(shift_names))
    profile_name = str(profile_doc.get("name") or "").strip()
    company = str(profile_doc.get("company") or "").strip()
    shift_doc = frappe.get_doc("POS Opening Shift", shift_name)

    if (
        str(_doc_value(shift_doc, "pos_profile") or "").strip() != profile_name
        or str(_doc_value(shift_doc, "company") or "").strip() != company
    ):
        _permission_denied(_("The POS Opening Shift does not belong to this POS Profile."))

    shift_user = str(_doc_value(shift_doc, "user") or "").strip()
    session_user = str(getattr(getattr(frappe, "session", None), "user", "") or "").strip()
    flags = getattr(frappe, "flags", None)
    background_shift = str(getattr(flags, "posa_background_opening_shift", "") or "").strip()
    background_user = str(getattr(flags, "posa_background_opening_user", "") or "").strip()
    background_accepted = bool(
        getattr(flags, "posa_background_opening_accepted", False)
    )
    accepted_background = bool(
        background_accepted
        and background_shift == shift_name
        and background_user
        and background_user == shift_user
    )
    if not shift_user or (not accepted_background and shift_user != session_user):
        _permission_denied(_("The POS Opening Shift does not belong to the current user."))

    if cint(_doc_value(shift_doc, "docstatus")) != 1:
        _permission_denied(_("The POS Opening Shift is not submitted."))
    if not accepted_background and not allow_closed_replay and (
        str(_doc_value(shift_doc, "status") or "").strip() != "Open"
        or _doc_value(shift_doc, "pos_closing_shift")
    ):
        _permission_denied(_("The POS Opening Shift is not open."))

    for payload in payloads:
        if payload.get("posa_pos_opening_shift"):
            payload["posa_pos_opening_shift"] = shift_name
    return shift_doc


def _get_scoped_invoice_doc(doctype, invoice_name, pos_profile, company, permission_type):
    return assert_invoice_request_scope(
        frappe.get_doc(doctype, invoice_name),
        pos_profile=pos_profile,
        company=company,
        permission_type=permission_type,
    )


def _assert_submission_ledger_scope(ledger_doc, pos_profile, company, document_type):
    if not ledger_doc:
        return None
    if (
        str(ledger_doc.get("pos_profile") or "").strip() != str(pos_profile or "").strip()
        or str(ledger_doc.get("company") or "").strip() != str(company or "").strip()
        or str(ledger_doc.get("document_type") or "").strip()
        != str(document_type or "").strip()
    ):
        _permission_denied(_("This invoice request is not available for the selected POS Profile."))
    return ledger_doc


def _strip_client_cashier_identity(*payloads):
    for payload in payloads:
        if not isinstance(payload, dict):
            continue
        for key in CLIENT_CASHIER_KEYS:
            payload.pop(key, None)


def _supports_authoritative_cashier(doctype):
    has_column = getattr(frappe.db, "has_column", None)
    if not callable(has_column):
        return False
    try:
        return bool(has_column(doctype, AUTHORITATIVE_CASHIER_FIELD))
    except Exception:
        return False


def _set_authoritative_cashier(invoice_doc, cashier):
    if not invoice_doc or not cashier:
        return
    if _supports_authoritative_cashier(invoice_doc.doctype):
        invoice_doc.set(AUTHORITATIVE_CASHIER_FIELD, cashier)


def _resolve_authoritative_cashier(pos_profile, ledger_doc=None):
    owned_ledger_name = getattr(
        getattr(frappe, "flags", None),
        "posa_owned_submission_ledger",
        None,
    )
    background_cashier = str(
        getattr(
            getattr(frappe, "flags", None),
            "posa_background_authoritative_cashier",
            "",
        )
        or ""
    ).strip()
    if (
        background_cashier
        and ledger_doc
        and ledger_doc.get("name") == owned_ledger_name
    ):
        return validate_assigned_terminal_cashier(pos_profile, background_cashier)

    return get_active_terminal_cashier(pos_profile)


def _json_dumps(value):
    try:
        return json.dumps(value or {}, default=str)
    except Exception:
        return "{}"


def _json_loads(value):
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except Exception:
        return {}


def _submission_ledger_key(client_request_id, company, pos_profile, document_type):
    raw = "|".join(
        [
            str(client_request_id or ""),
            str(company or ""),
            str(pos_profile or ""),
            str(document_type or ""),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _resolve_ledger_scope(invoice, data, document_type):
    invoice = invoice or {}
    data = data or {}
    pos_profile = invoice.get("pos_profile") or data.get("pos_profile")
    company = invoice.get("company") or data.get("company")
    if not company and pos_profile:
        try:
            company = frappe.db.get_value("POS Profile", pos_profile, "company")
        except Exception:
            company = None
    return {
        "company": company,
        "pos_profile": pos_profile,
        "document_type": document_type,
    }


def _get_submission_ledger_by_key(ledger_key):
    if not ledger_key:
        return None
    try:
        ledger_name = frappe.db.get_value(
            LEDGER_DOCTYPE,
            {"ledger_key": ledger_key},
            "name",
        )
        if ledger_name:
            return frappe.get_doc(LEDGER_DOCTYPE, ledger_name)
    except Exception:
        return None
    return None


def _get_submission_ledger(client_request_id, company, pos_profile, document_type):
    if not client_request_id:
        return None
    ledger_key = _submission_ledger_key(
        client_request_id,
        company,
        pos_profile,
        document_type,
    )
    return _get_submission_ledger_by_key(ledger_key)


def _save_submission_ledger(ledger_doc):
    if not ledger_doc:
        return None

    ledger_name = getattr(ledger_doc, "name", None)
    ledger_exists = False
    if ledger_name:
        try:
            ledger_exists = bool(frappe.db.exists(LEDGER_DOCTYPE, ledger_name))
        except Exception:
            ledger_exists = False

    if hasattr(ledger_doc, "is_new"):
        if ledger_doc.is_new() and hasattr(ledger_doc, "insert"):
            ledger_doc.insert(ignore_permissions=True)
            return ledger_doc

    if ledger_name and not ledger_exists and hasattr(ledger_doc, "insert"):
        ledger_doc.insert(ignore_permissions=True)
    elif ledger_name and hasattr(ledger_doc, "save"):
        ledger_doc.save(ignore_permissions=True)
    elif hasattr(ledger_doc, "insert"):
        ledger_doc.insert(ignore_permissions=True)
    return ledger_doc


def _get_submission_ledger_by_name(ledger_name):
    if not ledger_name:
        return None
    try:
        return frappe.get_doc(LEDGER_DOCTYPE, ledger_name)
    except Exception:
        return None


def _update_submission_ledger_by_name(ledger_name, state, **fields):
    ledger_doc = _get_submission_ledger_by_name(ledger_name)
    if not ledger_doc:
        return None
    return _update_submission_ledger(ledger_doc, state, **fields)


def _update_submission_ledger(ledger_doc, state, **fields):
    if not ledger_doc:
        return None
    ledger_doc.state = state
    for key, value in fields.items():
        if value is not None:
            setattr(ledger_doc, key, value)
    return _save_submission_ledger(ledger_doc)


def _get_or_create_submission_ledger(client_request_id, invoice, data, document_type, return_created=False):
    if not client_request_id:
        return (None, False) if return_created else None

    scope = _resolve_ledger_scope(invoice, data, document_type)
    ledger_key = _submission_ledger_key(
        client_request_id,
        scope.get("company"),
        scope.get("pos_profile"),
        scope.get("document_type"),
    )
    existing = _get_submission_ledger_by_key(ledger_key)
    if existing:
        return (existing, False) if return_created else existing

    payload = {
        "doctype": LEDGER_DOCTYPE,
        "name": ledger_key,
        "ledger_key": ledger_key,
        "client_request_id": client_request_id,
        "company": scope.get("company"),
        "pos_profile": scope.get("pos_profile"),
        "document_type": scope.get("document_type"),
        "state": STATE_RECEIVED,
        "request_data": _json_dumps(data),
        "invoice_payload": _json_dumps(invoice),
    }
    try:
        ledger_doc = frappe.get_doc(payload)
        saved = _save_submission_ledger(ledger_doc)
        return (saved, True) if return_created else saved
    except frappe.DuplicateEntryError:
        # A concurrent request already created this ledger row — fall back to
        # fetching it. Any other error (e.g. validation) must propagate so the
        # invoice is never processed without idempotency protection.
        ledger = _get_submission_ledger_by_key(ledger_key)
        if not ledger:
            frappe.throw(_("A concurrent request is already processing this invoice. Please try again."))
        return (ledger, False) if return_created else ledger


def _ledger_response(ledger_doc, replayed=True):
    if not ledger_doc or not ledger_doc.get("invoice_name"):
        return None
    invoice_doc = _get_scoped_invoice_doc(
        ledger_doc.get("document_type") or "Sales Invoice",
        ledger_doc.get("invoice_name"),
        ledger_doc.get("pos_profile"),
        ledger_doc.get("company"),
        "read",
    )

    docstatus = cint(invoice_doc.get("docstatus"))
    return {
        "name": invoice_doc.name,
        "status": docstatus,
        "docstatus": docstatus,
        "doctype": invoice_doc.doctype,
        "replayed": bool(replayed),
        "idempotent": bool(replayed),
        "ledger_state": ledger_doc.get("state"),
        "client_request_id": ledger_doc.get("client_request_id"),
    }


def _ledger_final_replay_response(ledger_doc):
    if not ledger_doc:
        return None
    if ledger_doc.get("state") not in FINAL_LEDGER_STATES:
        return None
    return _ledger_response(ledger_doc, replayed=True)


def _wait_for_submission_ledger_result(ledger_doc, timeout_seconds=12, interval_seconds=0.25):
    """Wait for the request currently owning this ledger to publish a replayable result."""

    if not ledger_doc or ledger_doc.get("state") == STATE_FAILED:
        return None

    deadline = time.monotonic() + timeout_seconds
    current = ledger_doc
    while time.monotonic() < deadline:
        replay_response = _ledger_final_replay_response(current)
        if replay_response:
            return replay_response

        if current.get("invoice_name"):
            invoice_response = _ledger_response(current, replayed=True)
            if invoice_response and cint(invoice_response.get("docstatus")) == 1:
                # The invoice can commit before asynchronous payment/change work.
                # Do not infer completion from docstatus alone.
                return invoice_response

        time.sleep(interval_seconds)
        refreshed = _get_submission_ledger_by_name(current.get("name"))
        if not refreshed or refreshed.get("state") == STATE_FAILED:
            return None
        current = refreshed

    return None


def _mark_ledger_failed(ledger_doc, error):
    return _update_submission_ledger(
        ledger_doc,
        STATE_FAILED,
        error_message=str(error),
    )


def _enqueue_payload_background_submission(
    invoice,
    data,
    doctype,
    ledger_doc,
    cashier,
    opening_shift_doc=None,
):
    enqueue(
        method=submit_payload_in_background_job,
        queue="default",
        timeout=3000,
        is_async=True,
        enqueue_after_commit=True,
        kwargs={
            "invoice": invoice,
            "data": data,
            "doctype": doctype,
            "ledger_name": ledger_doc.name if ledger_doc else None,
            "cashier": cashier,
            "user": getattr(getattr(frappe, "session", None), "user", None),
            "opening_shift": _doc_value(opening_shift_doc, "name"),
            "opening_user": _doc_value(opening_shift_doc, "user"),
        },
    )


def _has_post_submit_payment_work(data):
    return bool(
        flt((data or {}).get("redeemed_customer_credit"))
        or flt((data or {}).get("paid_change"))
        or flt((data or {}).get("credit_change"))
    )


def _apply_invoice_gift_card_settlement(invoice_doc, data):
    from posawesome.posawesome.api.gift_cards import apply_invoice_gift_card_redemptions

    data = data or {}
    authoritative_cashier = data.get("_posa_authoritative_cashier")
    redemption_rows = []
    for row in data.get("gift_card_redemptions") or []:
        normalized_row = dict(row or {})
        normalized_row.pop("cashier", None)
        if authoritative_cashier:
            normalized_row["cashier"] = authoritative_cashier
        redemption_rows.append(normalized_row)

    apply_invoice_gift_card_redemptions(
        invoice_doc,
        redemption_rows,
    )


def _get_loyalty_detail_value(details, fieldname):
    if hasattr(details, "get"):
        return details.get(fieldname)
    return getattr(details, fieldname, None)


def _derive_loyalty_points_from_amount(invoice_doc, loyalty_amount):
    from erpnext.accounts.doctype.loyalty_program.loyalty_program import (
        get_loyalty_program_details_with_points,
    )

    details = get_loyalty_program_details_with_points(
        invoice_doc.customer,
        invoice_doc.loyalty_program,
        invoice_doc.get("posting_date"),
        invoice_doc.company,
        silent=True,
        include_expired_entry=False,
    )
    conversion_factor = flt(_get_loyalty_detail_value(details, "conversion_factor"))
    if conversion_factor <= 0:
        return 0
    loyalty_amount_in_company_currency = flt(loyalty_amount) * (flt(invoice_doc.get("conversion_rate")) or 1)
    return cint(loyalty_amount_in_company_currency / conversion_factor)


def _apply_loyalty_redemption_settings(invoice_doc, pos_profile=None):
    loyalty_amount = flt(invoice_doc.get("loyalty_amount"))
    loyalty_points = flt(invoice_doc.get("loyalty_points"))

    if not cint(invoice_doc.get("redeem_loyalty_points")) or (loyalty_amount <= 0 and loyalty_points <= 0):
        invoice_doc.redeem_loyalty_points = 0
        invoice_doc.loyalty_amount = 0
        invoice_doc.loyalty_points = 0
        return

    if not invoice_doc.loyalty_program:
        invoice_doc.loyalty_program = frappe.db.get_value(
            "Customer",
            invoice_doc.customer,
            "loyalty_program",
        )

    if not invoice_doc.loyalty_program:
        frappe.throw(_("Loyalty Program is required to redeem loyalty points."))

    if loyalty_points <= 0 and loyalty_amount > 0:
        invoice_doc.loyalty_points = _derive_loyalty_points_from_amount(
            invoice_doc,
            loyalty_amount,
        )
        loyalty_points = flt(invoice_doc.get("loyalty_points"))

    if loyalty_points <= 0:
        invoice_doc.redeem_loyalty_points = 0
        invoice_doc.loyalty_amount = 0
        invoice_doc.loyalty_points = 0
        return

    if not invoice_doc.loyalty_redemption_account:
        invoice_doc.loyalty_redemption_account = frappe.db.get_value(
            "Loyalty Program",
            invoice_doc.loyalty_program,
            "expense_account",
        )

    if not invoice_doc.loyalty_redemption_account:
        frappe.throw(
            _("Please set Expense Account in Loyalty Program {0} before redeeming loyalty points.").format(
                invoice_doc.loyalty_program
            )
        )

    if not invoice_doc.loyalty_redemption_cost_center:
        invoice_doc.loyalty_redemption_cost_center = (
            invoice_doc.cost_center
            or frappe.db.get_value("POS Profile", pos_profile or invoice_doc.pos_profile, "cost_center")
        )

    if not invoice_doc.loyalty_redemption_cost_center:
        frappe.throw(
            _(
                "Loyalty Redemption Cost Center is required for invoice {0} and POS Profile {1}."
            ).format(
                invoice_doc.get("name") or _("unsaved invoice"),
                pos_profile or invoice_doc.pos_profile or _("unknown"),
            )
        )


def _run_post_submit_payments(invoice_doc, data, is_payment_entry, total_cash, cash_account, payments):
    from posawesome.posawesome.api.invoice_processing.payment import _create_change_payment_entries

    receive_entries = redeeming_customer_credit(
        invoice_doc, data, is_payment_entry, total_cash, cash_account, payments
    )
    _create_change_payment_entries(
        invoice_doc,
        data,
        invoice_doc.pos_profile,
        cash_account,
        receive_entries,
    )


def _process_post_submit_payments(
    invoice_doc,
    data,
    is_payment_entry,
    total_cash,
    cash_account,
    payments,
    run_async=False,
    user=None,
    ledger_name=None,
):
    if not _has_post_submit_payment_work(data):
        if ledger_name:
            _update_submission_ledger_by_name(ledger_name, STATE_POST_SUBMIT_DONE)
        return

    if run_async:
        user = user or getattr(getattr(frappe, "session", None), "user", None)
        if user and hasattr(frappe, "publish_realtime"):
            frappe.publish_realtime(
                "pos_post_submit_payments_started",
                {
                    "invoice": invoice_doc.name,
                    "doctype": invoice_doc.doctype,
                },
                user=user,
            )
        enqueue(
            method=process_post_submit_payments_job,
            queue="default",
            timeout=3000,
            is_async=True,
            enqueue_after_commit=True,
            kwargs={
                "invoice": invoice_doc.name,
                "doctype": invoice_doc.doctype,
                "data": data,
                "is_payment_entry": is_payment_entry,
                "total_cash": total_cash,
                "cash_account": cash_account,
                "payments": payments,
                "user": user,
                "ledger_name": ledger_name,
            },
        )
        return

    _run_post_submit_payments(invoice_doc, data, is_payment_entry, total_cash, cash_account, payments)
    if ledger_name:
        _update_submission_ledger_by_name(ledger_name, STATE_POST_SUBMIT_DONE)


def process_post_submit_payments_job(kwargs):
    invoice = kwargs.get("invoice")
    try:
        doctype = kwargs.get("doctype") or "Sales Invoice"
        data = kwargs.get("data") or {}
        is_payment_entry = kwargs.get("is_payment_entry")
        total_cash = kwargs.get("total_cash")
        cash_account = kwargs.get("cash_account")
        payments = kwargs.get("payments") or []
        ledger_name = kwargs.get("ledger_name")

        invoice_doc = frappe.get_doc(doctype, invoice)
        if invoice_doc.docstatus != 1:
            return

        invoice_doc.flags.ignore_permissions = True
        frappe.flags.ignore_account_permission = True
        _run_post_submit_payments(invoice_doc, data, is_payment_entry, total_cash, cash_account, payments)
        if ledger_name:
            _update_submission_ledger_by_name(ledger_name, STATE_POST_SUBMIT_DONE)
        user = kwargs.get("user")
        if user and hasattr(frappe, "publish_realtime"):
            frappe.publish_realtime(
                "pos_post_submit_payments_completed",
                {
                    "invoice": invoice,
                    "doctype": doctype,
                },
                user=user,
            )
    except Exception as e:
        frappe.db.rollback()
        error_msg = str(e)
        ledger_name = kwargs.get("ledger_name")
        if ledger_name:
            try:
                ledger_doc = _get_submission_ledger_by_name(ledger_name)
                if ledger_doc:
                    _mark_ledger_failed(ledger_doc, error_msg)
            except Exception:
                pass
        frappe.log_error(f"POS Post Submit Payment Processing Failed for {invoice}: {error_msg}")
        user = kwargs.get("user")
        if user and hasattr(frappe, "publish_realtime"):
            frappe.publish_realtime(
                "pos_post_submit_payments_failed",
                {"invoice": invoice, "error": error_msg},
                user=user,
            )


def _repair_submitted_invoice_post_submit(ledger_doc, invoice_doc):
    """Explicitly retry stored post-submit work while preserving FAILED on error."""

    context = _json_loads(ledger_doc.get("payment_context"))
    data = _json_loads(ledger_doc.get("request_data"))
    _update_submission_ledger(
        ledger_doc,
        STATE_SUBMITTED,
        invoice_name=invoice_doc.name,
        error_message="",
    )
    try:
        _process_post_submit_payments(
            invoice_doc,
            data,
            context.get("is_payment_entry"),
            context.get("total_cash"),
            context.get("cash_account"),
            context.get("payments") or [],
            False,
            getattr(getattr(frappe, "session", None), "user", None),
            ledger_doc.name,
        )
        _update_submission_ledger(
            ledger_doc,
            STATE_POST_SUBMIT_DONE,
            invoice_name=invoice_doc.name,
            error_message="",
        )
    except Exception as error:
        # Discard any partial financial repair before durably recording only the
        # ledger failure in a fresh transaction.
        frappe.db.rollback()
        persisted_ledger = _get_submission_ledger_by_name(ledger_doc.name) or ledger_doc
        _mark_ledger_failed(persisted_ledger, error)
        frappe.db.commit()
        ledger_doc.state = STATE_FAILED
        ledger_doc.error_message = str(error)
        raise
    return ledger_doc


def _resolve_current_invoice_opening_shift(profile_doc, opening_shift=None):
    profile_name = str(profile_doc.get("name") or "").strip()
    company = str(profile_doc.get("company") or "").strip()
    session_user = str(getattr(getattr(frappe, "session", None), "user", "") or "").strip()
    opening_shift = str(opening_shift or "").strip()
    if not opening_shift:
        opening_shift = frappe.db.get_value(
            "POS Opening Shift",
            {
                "pos_profile": profile_name,
                "company": company,
                "user": session_user,
                "docstatus": 1,
                "status": "Open",
                "pos_closing_shift": ["is", "not set"],
            },
            "name",
        )
    return _validate_invoice_opening_shift(
        profile_doc,
        {"posa_pos_opening_shift": opening_shift},
        required=True,
    )


@contextmanager
def trusted_invoice_shift_reassignment(invoice, data, source):
    """Rebind delayed server-owned workflows to the session's current open shift."""

    if source not in TRUSTED_SHIFT_SOURCES:
        _permission_denied(_("Unsupported trusted shift reassignment source."))
    invoice = invoice if isinstance(invoice, dict) else {}
    data = data if isinstance(data, dict) else {}
    profile_doc = _resolve_authorized_invoice_profile(invoice, data)
    profile_name = str(profile_doc.get("name") or "").strip()
    company = str(profile_doc.get("company") or "").strip()
    supplied_shifts = {
        str(payload.get("posa_pos_opening_shift") or "").strip()
        for payload in (invoice, data)
        if str(payload.get("posa_pos_opening_shift") or "").strip()
    }
    if len(supplied_shifts) > 1:
        _permission_denied(_("The invoice POS Opening Shift values do not match."))

    original_shift_name = next(iter(supplied_shifts), "")
    original_shift = None
    session_user = str(getattr(getattr(frappe, "session", None), "user", "") or "").strip()
    if original_shift_name:
        original_shift = frappe.get_doc("POS Opening Shift", original_shift_name)
        if (
            str(_doc_value(original_shift, "pos_profile") or "").strip() != profile_name
            or str(_doc_value(original_shift, "company") or "").strip() != company
        ):
            _permission_denied(_("The POS Opening Shift does not belong to this POS Profile."))

    original_is_current = bool(
        original_shift
        and cint(_doc_value(original_shift, "docstatus")) == 1
        and str(_doc_value(original_shift, "status") or "").strip() == "Open"
        and not _doc_value(original_shift, "pos_closing_shift")
        and str(_doc_value(original_shift, "user") or "").strip() == session_user
    )
    selected_shift = (
        original_shift
        if original_is_current
        else _resolve_current_invoice_opening_shift(profile_doc)
    )
    selected_shift_name = str(_doc_value(selected_shift, "name") or "").strip()
    invoice["posa_pos_opening_shift"] = selected_shift_name
    data["posa_pos_opening_shift"] = selected_shift_name

    audit = {
        "source": source,
        "client_request_id": (
            invoice.get("posa_client_request_id")
            or data.get("client_request_id")
            or data.get("idempotency_key")
        ),
        "source_invoice_name": invoice.get("name") or invoice.get("amended_from"),
        "original_opening_shift": original_shift_name or None,
        "original_opening_user": _doc_value(original_shift, "user"),
        "original_opening_status": _doc_value(original_shift, "status"),
        "original_closing_shift": _doc_value(original_shift, "pos_closing_shift"),
        "assigned_opening_shift": selected_shift_name,
        "assigned_opening_user": _doc_value(selected_shift, "user"),
    }
    previous = getattr(frappe.flags, "posa_trusted_shift_audit", None)
    frappe.flags.posa_trusted_shift_audit = audit
    try:
        yield audit
    finally:
        if previous is not None:
            frappe.flags.posa_trusted_shift_audit = previous
        elif hasattr(frappe.flags, "posa_trusted_shift_audit"):
            delattr(frappe.flags, "posa_trusted_shift_audit")


def _resolve_write_off_limit(pos_profile_doc):
    if not pos_profile_doc:
        return None

    candidate_fields = (
        "write_off_limit",
        "posa_max_write_off_amount",
        "max_write_off_amount",
        "write_off_amount",
        "posa_write_off_limit",
    )

    for fieldname in candidate_fields:
        raw_value = pos_profile_doc.get(fieldname)
        if raw_value in (None, ""):
            continue
        limit = flt(raw_value)
        if limit > 0:
            return limit

    return None


def _apply_write_off_settings(invoice_doc, data):
    enable_write_off = cint(data.get("is_write_off_change"))

    if invoice_doc.is_return or not enable_write_off:
        invoice_doc.write_off_amount = 0
        invoice_doc.base_write_off_amount = 0
        return

    requested_write_off = flt(data.get("write_off_amount") or invoice_doc.get("write_off_amount"))
    if requested_write_off <= 0:
        invoice_doc.write_off_amount = 0
        invoice_doc.base_write_off_amount = 0
        return

    invoice_total = abs(flt(invoice_doc.rounded_total or invoice_doc.grand_total))
    effective_write_off = min(requested_write_off, invoice_total)

    profile_doc = None
    if invoice_doc.pos_profile and frappe.db.exists("POS Profile", invoice_doc.pos_profile):
        profile_doc = frappe.get_cached_doc("POS Profile", invoice_doc.pos_profile)

    write_off_limit = _resolve_write_off_limit(profile_doc)
    if write_off_limit is not None:
        effective_write_off = min(effective_write_off, write_off_limit)

    allow_partial_payment = cint(profile_doc.get("posa_allow_partial_payment")) if profile_doc else 0
    is_credit_sale = cint(data.get("is_credit_sale"))

    settled_by_payments = 0
    for payment in invoice_doc.get("payments") or []:
        settled_by_payments += max(flt(payment.get("amount")), 0)

    settled_by_loyalty = max(flt(invoice_doc.get("loyalty_amount")), 0)
    settled_by_customer_credit = max(flt(data.get("redeemed_customer_credit")), 0)
    remaining_after_write_off = invoice_total - (
        settled_by_payments + settled_by_loyalty + settled_by_customer_credit + effective_write_off
    )

    if (
        write_off_limit is not None
        and requested_write_off > write_off_limit
        and remaining_after_write_off > 0.001
        and not allow_partial_payment
        and not is_credit_sale
    ):
        frappe.throw(
            _(
                "Write off amount exceeds the allowed limit ({0}). Please add payment for the remaining amount."
            ).format(write_off_limit)
        )

    precision_write_off = invoice_doc.precision("write_off_amount") or 2
    precision_base_write_off = invoice_doc.precision("base_write_off_amount") or 2
    conversion_rate = flt(invoice_doc.get("conversion_rate") or 1)

    invoice_doc.write_off_amount = flt(effective_write_off, precision_write_off)
    invoice_doc.base_write_off_amount = flt(effective_write_off * conversion_rate, precision_base_write_off)


def _validate_credit_sale_allowed(invoice_doc, data):
    if not cint(data.get("is_credit_sale")) or invoice_doc.get("is_return"):
        return

    if not invoice_doc.pos_profile:
        frappe.throw(_("Credit Sale is not enabled in POS Profile"))

    allow_credit_sale = frappe.db.get_value(
        "POS Profile",
        invoice_doc.pos_profile,
        "posa_allow_credit_sale",
    )
    if not cint(allow_credit_sale):
        frappe.throw(_("Credit Sale is not enabled in POS Profile"))


def _has_docfield(doctype, fieldname):
    try:
        return bool(frappe.get_meta(doctype).has_field(fieldname))
    except Exception:
        return False


def _set_if_field_exists(doc, fieldname, value):
    if _has_docfield(doc.doctype, fieldname):
        doc.set(fieldname, value)


def _apply_customer_credit_print_fields(invoice_doc, data):
    redeemed_credit = flt((data or {}).get("redeemed_customer_credit"))
    credit_rows = (data or {}).get("customer_credit_dict") or []

    available_credit = 0
    if isinstance(credit_rows, list):
        for row in credit_rows:
            if hasattr(row, "get"):
                available_credit += flt(row.get("total_credit"))
            else:
                available_credit += flt(getattr(row, "total_credit", 0))

    remaining_credit = max(flt(available_credit - redeemed_credit), 0)
    precision = invoice_doc.precision("grand_total") or 2

    _set_if_field_exists(
        invoice_doc,
        "posa_redeemed_customer_credit",
        flt(redeemed_credit, precision),
    )
    _set_if_field_exists(
        invoice_doc,
        "posa_remaining_customer_credit_balance",
        flt(remaining_credit, precision),
    )


def _safe_date_string(value):
    if value in (None, ""):
        return None

    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        if normalized.lower() in {"invalid date", "nan", "none", "null", "undefined"}:
            return None
        value = normalized

    try:
        return str(getdate(value))
    except Exception:
        return None


def _sanitize_delivery_dates(payload):
    if not isinstance(payload, dict):
        return

    if "posa_delivery_date" in payload:
        payload["posa_delivery_date"] = _safe_date_string(payload.get("posa_delivery_date"))

    items = payload.get("items")
    if not isinstance(items, list):
        return

    for item in items:
        if isinstance(item, dict) and "posa_delivery_date" in item:
            item["posa_delivery_date"] = _safe_date_string(item.get("posa_delivery_date"))


def _apply_manual_posting_controls(payload):
    if not isinstance(payload, dict):
        return

    posting_date = _safe_date_string(payload.get("posting_date"))
    if posting_date:
        payload["posting_date"] = posting_date

    if cint(payload.get("set_posting_time")):
        payload["set_posting_time"] = 1
        return

    today = _safe_date_string(nowdate())
    if posting_date and today and posting_date != today:
        payload["set_posting_time"] = 1


def _build_fresh_invoice_payload(data, doctype):
    fresh_data = dict(data or {})
    fresh_data["doctype"] = doctype

    for fieldname in (
        "name",
        "docstatus",
        "status",
        "amended_from",
        "amendment_date",
        "submitted_by",
        "creation",
        "owner",
        "modified",
        "modified_by",
        "_liked_by",
        "__last_sync_on",
    ):
        fresh_data.pop(fieldname, None)

    return fresh_data


def _clear_stale_party_fields_in_payload(
    payload,
    previous_customer,
    previous_values=None,
):
    next_customer = (payload or {}).get("customer")
    if not previous_customer or not next_customer or previous_customer == next_customer:
        return payload

    customer_dependent_fields = (
        "customer_name",
        "customer_address",
        "address_display",
        "shipping_address_name",
        "contact_person",
        "contact_display",
        "contact_mobile",
        "contact_email",
        "territory",
    )

    for fieldname in customer_dependent_fields:
        previous_value = (previous_values or {}).get(fieldname)
        next_value = payload.get(fieldname)
        if next_value not in (None, "") and next_value == previous_value:
            payload[fieldname] = None

    return payload


def _clear_stale_party_fields_for_customer_change(
    invoice_doc,
    incoming_data,
    previous_customer,
    previous_values=None,
):
    next_customer = (incoming_data or {}).get("customer")
    if not previous_customer or not next_customer or previous_customer == next_customer:
        return invoice_doc

    # Only clear fields that were carried over unchanged from the previous customer.
    customer_dependent_fields = (
        "customer_name",
        "customer_address",
        "address_display",
        "shipping_address_name",
        "contact_person",
        "contact_display",
        "contact_mobile",
        "contact_email",
        "territory",
    )

    for fieldname in customer_dependent_fields:
        previous_value = (previous_values or {}).get(fieldname)
        next_value = incoming_data.get(fieldname)
        if next_value not in (None, "") and next_value == previous_value:
            setattr(invoice_doc, fieldname, None)

    return invoice_doc


def _get_mutable_invoice_doc(data, doctype, pos_profile, company):
    invoice_name = (data or {}).get("name")
    if not invoice_name:
        return frappe.get_doc(data)

    if not frappe.db.exists(doctype, invoice_name):
        return frappe.get_doc(_build_fresh_invoice_payload(data, doctype))

    invoice_doc = _get_scoped_invoice_doc(
        doctype,
        invoice_name,
        pos_profile,
        company,
        "read",
    )
    previous_customer = invoice_doc.get("customer")
    previous_values = {
        fieldname: invoice_doc.get(fieldname)
        for fieldname in (
            "customer_name",
            "customer_address",
            "address_display",
            "shipping_address_name",
            "contact_person",
            "contact_display",
            "contact_mobile",
            "contact_email",
            "territory",
        )
    }
    if cint(invoice_doc.docstatus) != 0:
        fresh_payload = _build_fresh_invoice_payload(data, doctype)
        fresh_payload = _clear_stale_party_fields_in_payload(
            fresh_payload,
            previous_customer,
            previous_values=previous_values,
        )
        return frappe.get_doc(fresh_payload)

    assert_invoice_request_scope(
        invoice_doc,
        pos_profile=pos_profile,
        company=company,
        permission_type="write",
    )

    invoice_doc.update(data)
    invoice_doc = _clear_stale_party_fields_for_customer_change(
        invoice_doc,
        data,
        previous_customer,
        previous_values=previous_values,
    )
    return invoice_doc


def _save_draft_with_latest_timestamp(invoice_doc, retries=2):
    attempts = 0

    while True:
        _enforce_return_pricing_invariant(invoice_doc)
        if invoice_doc.name and not invoice_doc.is_new():
            latest_modified = frappe.db.get_value(invoice_doc.doctype, invoice_doc.name, "modified")
            if latest_modified:
                invoice_doc.modified = latest_modified

        try:
            invoice_doc.save()
            return invoice_doc
        except TimestampMismatchError:
            if attempts >= retries or not invoice_doc.name:
                raise
            attempts += 1
            latest_doc = frappe.get_doc(invoice_doc.doctype, invoice_doc.name)
            current_state = invoice_doc.as_dict()
            current_state.pop("modified", None)
            current_state.pop("modified_by", None)
            current_state.pop("creation", None)
            current_state.pop("owner", None)
            current_state.pop("_liked_by", None)
            current_state.pop("__last_sync_on", None)
            current_state.pop("doctype", None)
            latest_doc.update(current_state)
            latest_doc.flags.ignore_permissions = getattr(invoice_doc.flags, "ignore_permissions", False)
            invoice_doc = latest_doc


def _apply_tax_contract_before_save(invoice_doc):
    _merge_duplicate_taxes(invoice_doc)
    apply_pos_tax_inclusion_contract(invoice_doc)


def _resolve_payment_amounts(payment, conversion_rate=1):
    rate = flt(conversion_rate) or 1
    amount = payment.get("amount")
    base_amount = payment.get("base_amount")

    if amount in (None, "") and base_amount not in (None, ""):
        amount = flt(flt(base_amount) / rate, payment.precision("amount"))

    if amount in (None, ""):
        amount = 0

    amount = flt(amount, payment.precision("amount"))
    base_amount = flt(flt(amount) * rate, payment.precision("base_amount"))
    return amount, base_amount


def _normalize_return_payment_rows(invoice_doc, conversion_rate=1):
    if not invoice_doc.is_return:
        return

    for payment in invoice_doc.payments or []:
        resolved_amount, resolved_base_amount = _resolve_payment_amounts(
            payment,
            invoice_doc.get("conversion_rate") or conversion_rate,
        )
        payment.amount = -abs(resolved_amount)
        payment.base_amount = -abs(resolved_base_amount)
        if payment.get("posa_payment_currency"):
            payment.posa_original_amount = -abs(flt(payment.get("posa_original_amount")))
            payment.posa_account_amount = -abs(flt(payment.get("posa_account_amount")))

    invoice_doc.paid_amount = flt(sum(p.amount for p in invoice_doc.payments or []))
    invoice_doc.base_paid_amount = flt(sum(p.base_amount for p in invoice_doc.payments or []))

    _guard_return_cash_refund(invoice_doc)


def _payment_row_key(row):
    return (
        str(row.get("mode_of_payment") or "").strip(),
        str(row.get("account") or "").strip(),
    )


def _reapply_incoming_payment_amounts(invoice_doc, incoming_rows):
    if not incoming_rows:
        return

    rows_by_key = {}
    rows_by_mode = {}
    for row in incoming_rows or []:
        mode = str(row.get("mode_of_payment") or "").strip()
        if not mode:
            continue
        rows_by_key[_payment_row_key(row)] = row
        rows_by_mode[mode] = row

    applied_modes = set()
    for payment in invoice_doc.payments or []:
        incoming = rows_by_key.get(_payment_row_key(payment)) or rows_by_mode.get(
            str(payment.get("mode_of_payment") or "").strip()
        )
        if not incoming:
            continue
        applied_modes.add(str(incoming.get("mode_of_payment") or "").strip())
        if incoming.get("amount") is not None:
            payment.amount = flt(incoming.get("amount"), payment.precision("amount"))
        if incoming.get("base_amount") is not None:
            payment.base_amount = flt(incoming.get("base_amount"), payment.precision("base_amount"))
        for fieldname in PAYMENT_CURRENCY_FIELDS:
            if incoming.get(fieldname) is not None:
                payment.set(fieldname, incoming.get(fieldname))

    for row in incoming_rows or []:
        mode = str(row.get("mode_of_payment") or "").strip()
        if not mode or mode in applied_modes:
            continue
        payment = invoice_doc.append("payments", {})
        for fieldname in (
            "mode_of_payment",
            "amount",
            "base_amount",
            "account",
            "type",
            "default",
            "currency",
            "conversion_rate",
            "reference_no",
            "clearance_date",
            *PAYMENT_CURRENCY_FIELDS,
        ):
            if row.get(fieldname) is not None:
                payment.set(fieldname, row.get(fieldname))


def _apply_return_outstanding_policy(invoice_doc):
    """Match ERPNext's credit-note target before validation mutates the draft."""
    if not invoice_doc.get("is_return") or not invoice_doc.get("return_against"):
        return

    if invoice_doc.get("is_pos") or invoice_doc.get("is_paid"):
        return

    against_voucher_outstanding = flt(
        frappe.db.get_value(
            invoice_doc.doctype,
            invoice_doc.return_against,
            "outstanding_amount",
        )
    )
    return_total = abs(flt(invoice_doc.get("rounded_total")) or flt(invoice_doc.get("grand_total")))
    invoice_doc.update_outstanding_for_self = cint(return_total > against_voucher_outstanding)


def _is_return_outstanding_message(message):
    if isinstance(message, dict):
        text = message.get("message") or ""
    else:
        text = getattr(message, "message", "") or ""
    return any(marker in str(text) for marker in RETURN_OUTSTANDING_MESSAGE_MARKERS)


def _run_without_return_outstanding_prompts(invoice_doc, operation):
    """Remove only ERPNext's expected linked-credit-note info dialogs."""
    if not invoice_doc.get("is_return") or not invoice_doc.get("return_against"):
        return operation()

    local = getattr(frappe, "local", None)
    message_log = getattr(local, "message_log", None)
    start = len(message_log) if isinstance(message_log, list) else None

    try:
        return operation()
    finally:
        if start is not None:
            local.message_log = message_log[:start] + [
                message
                for message in message_log[start:]
                if not _is_return_outstanding_message(message)
            ]


def _guard_return_cash_refund(invoice_doc):
    """Block a cash refund larger than what was actually paid on the original.

    A return against an UNPAID (credit / on-account) invoice must not pay out
    cash: the credit should reduce the customer's outstanding instead. Refunding
    cash here both gives money for an unpaid sale and leaves the customer's
    balance untouched, while corrupting the cash drawer. We cap the refund at
    the amount the customer actually paid on the original invoice and reject
    anything beyond it so the error surfaces instead of silently losing money.
    """
    return_against = invoice_doc.get("return_against")
    if not return_against:
        return

    # paid_amount is negative for returns; the cash refunded is its magnitude.
    refund = abs(flt(invoice_doc.paid_amount))
    if refund <= 0:
        return

    # Cap the refund at the cash the customer can still get back on this original,
    # computed by the single shared rule (see compute_original_refundable_cash):
    # grand_total - outstanding_amount - returns already issued. NOT paid_amount,
    # which stays 0 for a credit invoice settled later via a Payment Entry.
    from posawesome.posawesome.api.invoice_processing.returns import (
        compute_original_refundable_cash,
    )

    original_paid = compute_original_refundable_cash(invoice_doc.doctype, return_against)
    tolerance = 1.0 / (10 ** (cint(invoice_doc.precision("paid_amount")) or 2))
    if refund > original_paid + tolerance:
        frappe.throw(
            _(
                "Cannot refund {0} for this return: only {1} was paid on the "
                "original invoice {2}. Set the paid amount to 0 so the return is "
                "recorded as a credit note that reduces the customer's balance."
            ).format(
                frappe.format_value(refund, {"fieldtype": "Currency"}),
                frappe.format_value(original_paid, {"fieldtype": "Currency"}),
                return_against,
            )
        )


@frappe.whitelist()
def update_invoice(data):
    currency_cache = {}
    data = json.loads(data)
    _strip_client_cashier_identity(data)
    client_request_id = extract_invoice_client_request_id(data)
    if not doctype_supports_client_request_id(data.get("doctype") or "Sales Invoice"):
        strip_invoice_client_request_id(data)
    _sanitize_delivery_dates(data)
    _apply_manual_posting_controls(data)
    _strip_client_freebies_from_payload(data)
    # Determine doctype based on POS Profile setting. Submitted-invoice
    # amendments preserve the source doctype even when the active profile has
    # since switched between Sales Invoice and POS Invoice mode.
    profile_doc = _resolve_authorized_invoice_profile(data)
    pos_profile = profile_doc.get("name")
    company = profile_doc.get("company")
    profile_ignore_pricing_rule = _profile_ignore_pricing_rule(profile_doc)
    ignore_pricing_rule = 1 if cint(data.get("is_return")) else profile_ignore_pricing_rule
    # Never trust a stale/client-edited copy of this POS Profile setting.
    data["ignore_pricing_rule"] = ignore_pricing_rule
    _validate_invoice_opening_shift(profile_doc, data, required=True)
    forced_doctype = data.pop("_force_invoice_doctype", None)
    doctype = "Sales Invoice"
    if forced_doctype in {"Sales Invoice", "POS Invoice"}:
        doctype = forced_doctype
    elif profile_doc.get("create_pos_invoice_instead_of_sales_invoice"):
        doctype = "POS Invoice"

    # Ensure the document type is set for new invoices to prevent validation errors
    data["doctype"] = doctype
    authoritative_cashier = get_active_terminal_cashier(pos_profile)

    return_validity_enabled, default_validity_days = _get_return_validity_settings(pos_profile)

    invoice_doc = _get_mutable_invoice_doc(
        data,
        doctype,
        pos_profile,
        company,
    )
    set_invoice_client_request_id(invoice_doc, client_request_id)
    _set_authoritative_cashier(invoice_doc, authoritative_cashier)

    # Set currency from data before set_missing_values
    # Validate return items if this is a return invoice
    if (data.get("is_return") or invoice_doc.is_return) and invoice_doc.get("return_against"):
        # We need to import this here to avoid circular imports if possible, or just import it at top if safe
        from posawesome.posawesome.api.invoice_processing.returns import validate_return_items

        validation = validate_return_items(
            invoice_doc.return_against,
            [d.as_dict() for d in invoice_doc.items],
            doctype=invoice_doc.doctype,
        )
        if not validation.get("valid"):
            frappe.throw(validation.get("message"))

    _validate_return_window(invoice_doc, doctype, return_validity_enabled)

    # Ensure customer exists before setting missing values
    customer_name = invoice_doc.get("customer")
    if customer_name and not frappe.db.exists("Customer", customer_name):
        try:
            cust = frappe.get_doc(
                {
                    "doctype": "Customer",
                    "customer_name": customer_name,
                    "customer_group": "All Customer Groups",
                    "territory": "All Territories",
                    "customer_type": "Individual",
                }
            )
            cust.flags.ignore_permissions = True
            cust.insert()
            invoice_doc.customer = cust.name
            invoice_doc.customer_name = cust.customer_name
        except Exception as e:
            frappe.log_error(f"Failed to create customer {customer_name}: {e}")

    if invoice_doc.get("customer"):
        resolved_customer_name = frappe.db.get_value(
            "Customer",
            invoice_doc.customer,
            "customer_name",
        )
        invoice_doc.customer_name = (
            resolved_customer_name or invoice_doc.get("customer_name") or invoice_doc.customer
        )

    effective_price_list = _resolve_effective_price_list(
        invoice_doc.get("customer"),
        invoice_doc.get("pos_profile") or pos_profile,
        invoice_doc.get("selling_price_list") or data.get("selling_price_list"),
    )
    if effective_price_list:
        invoice_doc.selling_price_list = effective_price_list

    selected_currency = data.get("currency")
    price_list_currency = data.get("price_list_currency")
    if not price_list_currency and invoice_doc.get("selling_price_list"):
        price_list_currency = frappe.db.get_value("Price List", invoice_doc.selling_price_list, "currency")

    # Preserve provided item names for manual overrides
    overrides = {d.idx: {"item_name": d.item_name} for d in invoice_doc.items}
    locked_items = {}
    if invoice_doc.is_return:
        for d in invoice_doc.items:
            if d.get("locked_price"):
                locked_items[d.idx] = {
                    "rate": d.rate,
                    "price_list_rate": d.price_list_rate,
                    "discount_percentage": d.discount_percentage,
                    "discount_amount": d.discount_amount,
                    "is_free_item": d.get("is_free_item"),
                }

    _apply_pricing_rule_policy(invoice_doc, profile_doc)

    _deduplicate_free_items(invoice_doc)

    # Set missing values first
    incoming_payment_rows = data.get("payments") or []
    invoice_doc.set_missing_values(for_validate=bool(invoice_doc.is_return))
    # ERPNext's POS defaults may update pricing policy while filling values.
    # Reassert the return invariant before any calculation or validation runs.
    _apply_pricing_rule_policy(invoice_doc, profile_doc)
    _reapply_incoming_payment_amounts(invoice_doc, incoming_payment_rows)
    if effective_price_list:
        invoice_doc.selling_price_list = effective_price_list

    _set_return_valid_upto(invoice_doc, return_validity_enabled, default_validity_days)

    # Reapply any custom item names after defaults are set
    _apply_item_name_overrides(invoice_doc, overrides)

    _apply_tax_contract_before_save(invoice_doc)

    if locked_items:
        for item in invoice_doc.items:
            locked = locked_items.get(item.idx)
            if locked:
                item.update(locked)
        invoice_doc.calculate_taxes_and_totals()

    company_currency = (
        frappe.get_cached_value("Company", invoice_doc.company, "default_currency") or invoice_doc.currency
    )

    # Ensure selected currency is preserved after set_missing_values
    if selected_currency:
        invoice_doc.currency = selected_currency
    price_list_currency = price_list_currency or company_currency

    rates = resolve_erpnext_currency_rates(
        invoice_doc.currency,
        price_list_currency,
        company_currency,
        invoice_doc.posting_date,
        cache=currency_cache,
    )
    conversion_rate = rates["conversion_rate"]
    plc_conversion_rate = rates["plc_conversion_rate"]
    exchange_rate_date = rates["exchange_rate_date"]

    if invoice_doc.currency != company_currency and not conversion_rate:
        frappe.throw(
            _(
                "Unable to find exchange rate for {0} to {1}. Please create a Currency Exchange record manually"
            ).format(invoice_doc.currency, company_currency)
        )
    if price_list_currency != company_currency and not plc_conversion_rate:
        frappe.throw(
            _(
                "Unable to find exchange rate for {0} to {1}. Please create a Currency Exchange record manually"
            ).format(price_list_currency, company_currency)
        )

    invoice_doc.conversion_rate = conversion_rate
    invoice_doc.plc_conversion_rate = plc_conversion_rate
    invoice_doc.price_list_currency = price_list_currency

    for item in invoice_doc.items:
        if item.price_list_rate:
            item.base_price_list_rate = flt(
                item.price_list_rate * conversion_rate,
                item.precision("base_price_list_rate"),
            )
        if item.rate:
            item.base_rate = flt(item.rate * conversion_rate, item.precision("base_rate"))
        if item.amount:
            item.base_amount = flt(item.amount * conversion_rate, item.precision("base_amount"))
        if item.discount_amount:
            item.base_discount_amount = flt(
                item.discount_amount * conversion_rate,
                item.precision("base_discount_amount"),
            )

    for payment in invoice_doc.payments:
        payment.amount, payment.base_amount = _resolve_payment_amounts(payment, conversion_rate)

    normalize_invoice_payment_currencies(
        invoice_doc,
        profile_doc=profile_doc,
        rate_cache=currency_cache,
    )
    normalize_change_returns(invoice_doc, profile_doc=profile_doc, rate_cache=currency_cache)

    invoice_doc.base_total = flt(flt(invoice_doc.total) * conversion_rate, invoice_doc.precision("base_total"))
    invoice_doc.base_net_total = flt(
        flt(invoice_doc.net_total) * conversion_rate,
        invoice_doc.precision("base_net_total"),
    )
    invoice_doc.base_grand_total = flt(
        flt(invoice_doc.grand_total) * conversion_rate,
        invoice_doc.precision("base_grand_total"),
    )
    invoice_doc.base_rounded_total = flt(
        flt(invoice_doc.rounded_total) * conversion_rate,
        invoice_doc.precision("base_rounded_total"),
    )
    invoice_doc.base_discount_amount = flt(
        flt(invoice_doc.discount_amount) * conversion_rate,
        invoice_doc.precision("base_discount_amount"),
    )
    invoice_doc.base_in_words = money_in_words(invoice_doc.base_rounded_total, company_currency)

    data["conversion_rate"] = conversion_rate
    data["plc_conversion_rate"] = plc_conversion_rate
    data["exchange_rate_date"] = exchange_rate_date

    _normalize_return_payment_rows(invoice_doc, conversion_rate)

    _apply_return_outstanding_policy(invoice_doc)

    invoice_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    invoice_doc.docstatus = 0
    invoice_doc = _run_without_return_outstanding_prompts(
        invoice_doc,
        lambda: _save_draft_with_latest_timestamp(invoice_doc),
    )

    # Return both the invoice doc and the updated data
    response = invoice_doc.as_dict()
    response["conversion_rate"] = invoice_doc.conversion_rate
    response["plc_conversion_rate"] = invoice_doc.plc_conversion_rate
    response["exchange_rate_date"] = exchange_rate_date
    response[AUTHORITATIVE_CASHIER_FIELD] = authoritative_cashier
    return response


def _run_with_deadlock_retry(operation, delays=DEADLOCK_RETRY_DELAYS):
    """Retry a whole transaction after MySQL/Frappe invalidates it.

    Retrying only the failed statement is unsafe: by the time ERPNext updates
    Company monthly sales, stock and GL work has already happened in the same
    transaction.  A rollback plus an idempotent replay is the only safe retry.
    """

    for attempt in range(len(delays) + 1):
        try:
            return operation()
        except QueryDeadlockError:
            frappe.db.rollback()
            if attempt >= len(delays):
                raise
            time.sleep(delays[attempt])


@frappe.whitelist()
def submit_invoice(invoice, data, submit_in_background=False):
    return _run_with_deadlock_retry(
        lambda: _submit_invoice_once(invoice, data, submit_in_background)
    )


def _submit_invoice_once(invoice, data, submit_in_background=False):
    data = json.loads(data)
    invoice = json.loads(invoice)
    invoice.pop(TRUSTED_SHIFT_AUDIT_KEY, None)
    data.pop(TRUSTED_SHIFT_AUDIT_KEY, None)
    trusted_shift_audit = getattr(
        getattr(frappe, "flags", None), "posa_trusted_shift_audit", None
    )
    if isinstance(trusted_shift_audit, dict):
        data[TRUSTED_SHIFT_AUDIT_KEY] = dict(trusted_shift_audit)
    _strip_client_cashier_identity(invoice, data)
    client_request_id = normalize_invoice_request_identity(invoice, data)
    _sanitize_delivery_dates(invoice)
    _apply_manual_posting_controls(invoice)
    submit_in_background = cint(submit_in_background)
    _strip_client_freebies_from_payload(invoice)
    profile_doc = _resolve_authorized_invoice_profile(invoice, data)
    pos_profile = profile_doc.get("name")
    company = profile_doc.get("company")
    forced_doctype = invoice.pop("_force_invoice_doctype", None) or data.pop("_force_invoice_doctype", None)
    doctype = "Sales Invoice"
    if forced_doctype in {"Sales Invoice", "POS Invoice"}:
        doctype = forced_doctype
        invoice["doctype"] = doctype
        invoice["_force_invoice_doctype"] = doctype
    elif profile_doc.get("create_pos_invoice_instead_of_sales_invoice"):
        doctype = "POS Invoice"

    if not doctype_supports_client_request_id(doctype):
        strip_invoice_client_request_id(invoice)

    client_invoice_name = invoice.get("name")
    if client_invoice_name and frappe.db.exists(doctype, client_invoice_name):
        client_invoice_doc = _get_scoped_invoice_doc(
            doctype,
            client_invoice_name,
            pos_profile,
            company,
            "read",
        )
        if cint(client_invoice_doc.get("docstatus")) == 0:
            assert_invoice_request_scope(
                client_invoice_doc,
                pos_profile=pos_profile,
                company=company,
                permission_type="write",
            )

    ledger_scope = _resolve_ledger_scope(invoice, data, doctype)
    ledger_doc = _get_submission_ledger(
        client_request_id,
        ledger_scope.get("company"),
        ledger_scope.get("pos_profile"),
        ledger_scope.get("document_type"),
    )
    _assert_submission_ledger_scope(ledger_doc, pos_profile, company, doctype)
    existing_by_request = find_invoice_by_client_request_id(
        client_request_id,
        preferred_doctype=doctype,
        pos_profile=pos_profile,
        company=company,
        permission_type="read",
    )
    final_replay = bool(
        (ledger_doc and ledger_doc.get("state") in FINAL_LEDGER_STATES)
        or (existing_by_request and cint(existing_by_request.docstatus) == 1)
    )
    opening_shift_doc = _validate_invoice_opening_shift(
        profile_doc,
        invoice,
        data,
        allow_closed_replay=final_replay,
        required=not final_replay,
    )
    replay_response = _ledger_final_replay_response(ledger_doc)
    if replay_response:
        return replay_response
    if existing_by_request:
        if cint(existing_by_request.docstatus) == 1:
            if ledger_doc:
                if ledger_doc.get("state") == STATE_FAILED:
                    frappe.throw(
                        _(
                            "Invoice {0} was submitted, but its post-submit processing failed. "
                            "Repair the failed submission before retrying it."
                        ).format(existing_by_request.name)
                    )
                if _has_post_submit_payment_work(_json_loads(ledger_doc.get("request_data"))):
                    _update_submission_ledger(
                        ledger_doc,
                        ledger_doc.get("state"),
                        invoice_name=existing_by_request.name,
                    )
                else:
                    _update_submission_ledger(
                        ledger_doc,
                        STATE_POST_SUBMIT_DONE,
                        invoice_name=existing_by_request.name,
                    )
            return {
                "name": existing_by_request.name,
                "status": existing_by_request.docstatus,
                "docstatus": existing_by_request.docstatus,
                "doctype": existing_by_request.doctype,
                "replayed": True,
                "idempotent": True,
                "ledger_state": ledger_doc.get("state") if ledger_doc else STATE_POST_SUBMIT_DONE,
                "client_request_id": client_request_id,
            }
        assert_invoice_request_scope(
            existing_by_request,
            pos_profile=pos_profile,
            company=company,
            permission_type="write",
        )
        invoice["name"] = existing_by_request.name
        doctype = existing_by_request.doctype
    elif ledger_doc and ledger_doc.get("invoice_name"):
        ledger_invoice_name = ledger_doc.get("invoice_name")
        if frappe.db.exists(doctype, ledger_invoice_name):
            ledger_invoice = _get_scoped_invoice_doc(
                doctype,
                ledger_invoice_name,
                pos_profile,
                company,
                "read",
            )
            if cint(ledger_invoice.docstatus) == 1:
                if ledger_doc.get("state") == STATE_FAILED:
                    frappe.throw(
                        _(
                            "Invoice {0} was submitted, but its post-submit processing failed. "
                            "Repair the failed submission before retrying it."
                        ).format(ledger_invoice.name)
                    )
                if not _has_post_submit_payment_work(
                    _json_loads(ledger_doc.get("request_data"))
                ):
                    _update_submission_ledger(
                        ledger_doc,
                        STATE_POST_SUBMIT_DONE,
                        invoice_name=ledger_invoice.name,
                    )
                replay_response = _ledger_response(ledger_doc, replayed=True)
                if replay_response:
                    return replay_response
            assert_invoice_request_scope(
                ledger_invoice,
                pos_profile=pos_profile,
                company=company,
                permission_type="write",
            )
            invoice["name"] = ledger_invoice.name

    authoritative_cashier = _resolve_authoritative_cashier(pos_profile, ledger_doc)
    data["_posa_authoritative_cashier"] = authoritative_cashier
    allow_background_submit = frappe.get_value(
        "POS Profile",
        pos_profile,
        "posa_allow_submissions_in_background_job",
    )
    if ledger_doc:
        ledger_created = False
    else:
        ledger_doc, ledger_created = _get_or_create_submission_ledger(
            client_request_id,
            invoice,
            data,
            doctype,
            return_created=True,
        )
    owned_ledger_name = getattr(
        getattr(frappe, "flags", None),
        "posa_owned_submission_ledger",
        None,
    )
    if (
        ledger_doc
        and not ledger_created
        and ledger_doc.get("state") != STATE_FAILED
        and ledger_doc.get("name") != owned_ledger_name
    ):
        concurrent_response = _wait_for_submission_ledger_result(ledger_doc)
        if concurrent_response:
            return concurrent_response
        frappe.throw(_("This invoice request is already being processed. Please try again."))

    invoice_name = invoice.get("name")
    if (
        submit_in_background
        and allow_background_submit
        and ledger_doc
        and invoice_name
        and frappe.db.exists(doctype, invoice_name)
    ):
        if client_request_id:
            invoice["posa_client_request_id"] = client_request_id
        if authoritative_cashier:
            invoice[AUTHORITATIVE_CASHIER_FIELD] = authoritative_cashier
        _update_submission_ledger(
            ledger_doc,
            STATE_DRAFT_CREATED,
            invoice_name=invoice_name,
            request_data=_json_dumps(data),
            invoice_payload=_json_dumps(invoice),
        )
        _enqueue_payload_background_submission(
            invoice,
            data,
            doctype,
            ledger_doc,
            authoritative_cashier,
            opening_shift_doc,
        )
        return {
            "name": invoice_name,
            "status": 0,
            "docstatus": 0,
            "doctype": doctype,
            "ledger_state": ledger_doc.get("state"),
            "client_request_id": client_request_id,
            "idempotent": bool(client_request_id),
            "queued": True,
            AUTHORITATIVE_CASHIER_FIELD: authoritative_cashier,
        }

    if invoice_name and frappe.db.exists(doctype, invoice_name):
        existing_doc = _get_scoped_invoice_doc(
            doctype,
            invoice_name,
            pos_profile,
            company,
            "write",
        )
        if cint(existing_doc.docstatus) != 0:
            invoice = _build_fresh_invoice_payload(invoice, doctype)
            invoice_name = None

    if not invoice_name or not frappe.db.exists(doctype, invoice_name):
        if client_request_id:
            invoice["posa_client_request_id"] = client_request_id
        created = update_invoice(json.dumps(invoice))
        invoice_name = created.get("name")
        invoice_doc = _get_scoped_invoice_doc(
            doctype,
            invoice_name,
            pos_profile,
            company,
            "write",
        )
    else:
        # Prevent TimestampMismatchError by relying on server-side timestamp
        if "modified" in invoice:
            del invoice["modified"]
        invoice.pop("_force_invoice_doctype", None)
        invoice_doc = _get_scoped_invoice_doc(
            doctype,
            invoice_name,
            pos_profile,
            company,
            "write",
        )
        invoice_doc.update(invoice)

    set_invoice_client_request_id(invoice_doc, client_request_id)
    _set_authoritative_cashier(invoice_doc, authoritative_cashier)
    _apply_pricing_rule_policy(invoice_doc, profile_doc)
    if ledger_doc:
        _update_submission_ledger(
            ledger_doc,
            STATE_DRAFT_CREATED,
            invoice_name=invoice_doc.name,
            request_data=_json_dumps(data),
            invoice_payload=_json_dumps(invoice),
        )

    _deduplicate_free_items(invoice_doc)

    _apply_loyalty_redemption_settings(invoice_doc, pos_profile)

    # Ensure item name overrides are respected on submit
    _apply_item_name_overrides(invoice_doc)
    _apply_tax_contract_before_save(invoice_doc)
    # Preserve explicit update_stock from client payload (e.g. Invoice generated
    # from Sales Order). Only auto-disable stock when the flag was not provided.
    if invoice.get("posa_delivery_date") and invoice.get("update_stock") is None:
        invoice_doc.update_stock = 0
    mop_cash_list = [
        i.mode_of_payment
        for i in invoice_doc.payments
        if "cash" in i.mode_of_payment.lower() and i.type == "Cash"
    ]
    if len(mop_cash_list) > 0:
        cash_account = get_bank_cash_account(mop_cash_list[0], invoice_doc.company)
    else:
        cash_account = {"account": frappe.get_value("Company", invoice_doc.company, "default_cash_account")}

    invoice_doc.remarks = _build_invoice_remarks(invoice_doc)

    # calculating cash
    total_cash = 0
    if data.get("redeemed_customer_credit"):
        invoice_total = flt(invoice_doc.rounded_total or invoice_doc.grand_total)
        settled_without_cash = (
            flt(data.get("redeemed_customer_credit"))
            + sum(flt(row.get("amount")) for row in (data.get("gift_card_redemptions") or []))
            + flt(invoice_doc.get("loyalty_amount"))
            + flt(invoice_doc.get("write_off_amount"))
        )
        total_cash = max(invoice_total - settled_without_cash, 0)

    is_payment_entry = 0
    if data.get("redeemed_customer_credit"):
        for row in data.get("customer_credit_dict"):
            if row["type"] == "Advance" and row["credit_to_redeem"]:
                advance = frappe.db.get_value(
                    "Payment Entry",
                    row["credit_origin"],
                    ["name", "remarks", "unallocated_amount"],
                    as_dict=True,
                )

                advance_payment = {
                    "reference_type": "Payment Entry",
                    "reference_name": advance.get("name"),
                    "remarks": advance.get("remarks"),
                    "advance_amount": advance.get("unallocated_amount"),
                    "allocated_amount": row["credit_to_redeem"],
                }

                advance_row = invoice_doc.append("advances", {})
                advance_row.update(advance_payment)
                child_dt = (
                    "POS Invoice Advance" if invoice_doc.doctype == "POS Invoice" else "Sales Invoice Advance"
                )
                ensure_child_doctype(invoice_doc, "advances", child_dt)
                invoice_doc.is_pos = 0
                is_payment_entry = 1

    _apply_invoice_gift_card_settlement(invoice_doc, data)
    _apply_customer_credit_print_fields(invoice_doc, data)
    normalize_invoice_payment_currencies(invoice_doc, profile_doc=profile_doc)
    normalize_change_returns(invoice_doc, profile_doc=profile_doc)
    _normalize_return_payment_rows(invoice_doc, invoice_doc.get("conversion_rate") or 1)
    _apply_return_outstanding_policy(invoice_doc)

    payments = [
        row
        for row in (invoice_doc.payments or [])
        if str(row.get("mode_of_payment") or "").strip() != "Gift Card"
    ]

    _auto_set_return_batches(invoice_doc)

    # if frappe.get_value("POS Profile", invoice_doc.pos_profile, "posa_auto_set_batch"):
    #     set_batch_nos(invoice_doc, "warehouse", throw=True)
    set_batch_nos_for_bundels(invoice_doc, "warehouse", throw=True)

    _validate_stock_on_invoice(invoice_doc)
    validate_invoice_item_sale_controls(invoice_doc)

    _validate_credit_sale_allowed(invoice_doc, data)
    _apply_write_off_settings(invoice_doc, data)

    invoice_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    invoice_doc.posa_is_printed = 1
    invoice_doc = _run_without_return_outstanding_prompts(
        invoice_doc,
        lambda: _save_draft_with_latest_timestamp(invoice_doc),
    )
    normalize_invoice_payment_currencies(invoice_doc, profile_doc=profile_doc)
    normalize_change_returns(invoice_doc, profile_doc=profile_doc)
    _normalize_return_payment_rows(invoice_doc, invoice_doc.get("conversion_rate") or 1)

    if data.get("due_date"):
        frappe.db.set_value(
            invoice_doc.doctype,
            invoice_doc.name,
            "due_date",
            data.get("due_date"),
            update_modified=False,
        )

    if ledger_doc:
        _update_submission_ledger(
            ledger_doc,
            STATE_DRAFT_CREATED,
            invoice_name=invoice_doc.name,
            payment_context=_json_dumps(
                {
                    "is_payment_entry": is_payment_entry,
                    "total_cash": total_cash,
                    "cash_account": cash_account,
                    "payments": payments,
                    "cashier": authoritative_cashier,
                }
            ),
        )

    if submit_in_background and allow_background_submit:
        enqueue(
            method=submit_in_background_job,
            queue="default",
            timeout=3000,
            is_async=True,
            enqueue_after_commit=True,
            kwargs={
                "invoice": invoice_doc.name,
                "doctype": invoice_doc.doctype,
                "data": data,
                "is_payment_entry": is_payment_entry,
                "total_cash": total_cash,
                "cash_account": cash_account,
                "payments": payments,
                "user": getattr(getattr(frappe, "session", None), "user", None),
                "cashier": authoritative_cashier,
                "ledger_name": ledger_doc.name if ledger_doc else None,
                "opening_shift": _doc_value(opening_shift_doc, "name"),
                "opening_user": _doc_value(opening_shift_doc, "user"),
            },
        )
    else:
        _run_without_return_outstanding_prompts(invoice_doc, invoice_doc.submit)
        if ledger_doc:
            _update_submission_ledger(
                ledger_doc,
                STATE_SUBMITTED,
                invoice_name=invoice_doc.name,
                payment_context=_json_dumps(
                    {
                        "is_payment_entry": is_payment_entry,
                        "total_cash": total_cash,
                        "cash_account": cash_account,
                        "payments": payments,
                        "cashier": authoritative_cashier,
                    }
                ),
            )
        _process_post_submit_payments(
            invoice_doc,
            data,
            is_payment_entry,
            total_cash,
            cash_account,
            payments,
            bool(allow_background_submit),
            getattr(getattr(frappe, "session", None), "user", None),
            ledger_doc.name if ledger_doc else None,
        )

    return {
        "name": invoice_doc.name,
        "status": invoice_doc.docstatus,
        "docstatus": invoice_doc.docstatus,
        "doctype": invoice_doc.doctype,
        "ledger_state": ledger_doc.get("state") if ledger_doc else None,
        "client_request_id": client_request_id,
        "idempotent": bool(client_request_id),
        AUTHORITATIVE_CASHIER_FIELD: authoritative_cashier,
    }


def _record_background_submission_failure(invoice, error, kwargs, user):
    error_msg = str(error)
    ledger_name = kwargs.get("ledger_name")
    if ledger_name:
        try:
            ledger_doc = _get_submission_ledger_by_name(ledger_name)
            if ledger_doc:
                _mark_ledger_failed(ledger_doc, error_msg)
        except Exception:
            pass
    frappe.log_error(f"POS Background Submission Failed for {invoice}: {error_msg}")
    if hasattr(frappe, "publish_realtime"):
        frappe.publish_realtime(
            "pos_invoice_submit_error",
            {"invoice": invoice, "error": error_msg},
            user=user,
        )


def submit_in_background_job(kwargs):
    invoice = kwargs.get("invoice")
    previous_owned_ledger = getattr(frappe.flags, "posa_owned_submission_ledger", None)
    previous_background_opening_shift = getattr(
        frappe.flags, "posa_background_opening_shift", None
    )
    previous_background_opening_user = getattr(
        frappe.flags, "posa_background_opening_user", None
    )
    previous_background_opening_accepted = getattr(
        frappe.flags, "posa_background_opening_accepted", None
    )
    try:
        doctype = kwargs.get("doctype") or "Sales Invoice"
        data = kwargs.get("data") or {}
        is_payment_entry = kwargs.get("is_payment_entry")
        total_cash = kwargs.get("total_cash")
        cash_account = kwargs.get("cash_account")
        payments = kwargs.get("payments") or []
        user = kwargs.get("user") or getattr(getattr(frappe, "session", None), "user", None)
        cashier = kwargs.get("cashier")
        ledger_name = kwargs.get("ledger_name")
        opening_shift = kwargs.get("opening_shift")
        opening_user = kwargs.get("opening_user")
        if ledger_name:
            frappe.flags.posa_owned_submission_ledger = ledger_name
        if opening_shift:
            frappe.flags.posa_background_opening_shift = opening_shift
        if opening_user:
            frappe.flags.posa_background_opening_user = opening_user
        if opening_shift and opening_user:
            frappe.flags.posa_background_opening_accepted = True
        ledger_doc = _get_submission_ledger_by_name(ledger_name) if ledger_name else None

        if ledger_doc:
            _assert_submission_ledger_scope(
                ledger_doc,
                ledger_doc.get("pos_profile"),
                ledger_doc.get("company"),
                doctype,
            )
            invoice_doc = _get_scoped_invoice_doc(
                doctype,
                invoice,
                ledger_doc.get("pos_profile"),
                ledger_doc.get("company"),
                "read",
            )
            profile_doc = frappe.get_doc("POS Profile", ledger_doc.get("pos_profile"))
        else:
            invoice_doc = frappe.get_doc(doctype, invoice)
            profile_doc = _resolve_authorized_invoice_profile(
                {
                    "pos_profile": invoice_doc.get("pos_profile"),
                    "company": invoice_doc.get("company"),
                }
            )
            assert_invoice_request_scope(
                invoice_doc,
                pos_profile=profile_doc.get("name"),
                company=profile_doc.get("company"),
                permission_type="read",
            )
        _validate_invoice_opening_shift(
            profile_doc,
            {"posa_pos_opening_shift": opening_shift or invoice_doc.get("posa_pos_opening_shift")},
            required=True,
        )
        if cashier:
            cashier = validate_assigned_terminal_cashier(
                invoice_doc.get("pos_profile"),
                cashier,
            )
            _set_authoritative_cashier(invoice_doc, cashier)

        _apply_pricing_rule_policy(invoice_doc, profile_doc)

        if invoice_doc.docstatus == 1:
            if ledger_doc:
                _update_submission_ledger(
                    ledger_doc,
                    STATE_SUBMITTED,
                    invoice_name=invoice_doc.name,
                )
            return

        invoice_doc.flags.ignore_permissions = True
        frappe.flags.ignore_account_permission = True

        # Re-run validations that may be impacted while queued (stock, credit limits)
        _validate_stock_on_invoice(invoice_doc)
        validate_invoice_item_sale_controls(invoice_doc)
        if hasattr(invoice_doc, "validate_credit_limit"):
            invoice_doc.validate_credit_limit()

        invoice_doc.remarks = _build_invoice_remarks(invoice_doc)

        _apply_tax_contract_before_save(invoice_doc)

        _apply_write_off_settings(invoice_doc, data)

        _apply_loyalty_redemption_settings(invoice_doc, invoice_doc.pos_profile)

        _apply_invoice_gift_card_settlement(invoice_doc, data)
        _normalize_return_payment_rows(invoice_doc, invoice_doc.get("conversion_rate") or 1)

        invoice_doc = _save_draft_with_latest_timestamp(invoice_doc)
        _normalize_return_payment_rows(invoice_doc, invoice_doc.get("conversion_rate") or 1)

        _enforce_return_pricing_invariant(invoice_doc)
        invoice_doc.submit()
        if ledger_doc:
            _update_submission_ledger(
                ledger_doc,
                STATE_SUBMITTED,
                invoice_name=invoice_doc.name,
            )
        if hasattr(frappe, "publish_realtime"):
            frappe.publish_realtime(
                "pos_invoice_processed",
                {
                    "invoice": invoice_doc.name,
                    "doctype": invoice_doc.doctype,
                    "has_post_submit_payment_work": _has_post_submit_payment_work(data),
                },
                user=user,
            )
        _process_post_submit_payments(
            invoice_doc,
            data,
            is_payment_entry,
            total_cash,
            cash_account,
            payments,
            True,
            user,
            ledger_name,
        )

    except QueryDeadlockError as error:
        frappe.db.rollback()
        retry_attempt = cint(kwargs.get("_deadlock_retry_attempt"))
        if retry_attempt < len(DEADLOCK_RETRY_DELAYS):
            retry_kwargs = dict(kwargs)
            retry_kwargs["_deadlock_retry_attempt"] = retry_attempt + 1
            time.sleep(DEADLOCK_RETRY_DELAYS[retry_attempt])
            return submit_in_background_job(retry_kwargs)
        _record_background_submission_failure(invoice, error, kwargs, user)
    except Exception as e:
        frappe.db.rollback()
        _record_background_submission_failure(invoice, e, kwargs, user)
    finally:
        for key, previous in (
            ("posa_owned_submission_ledger", previous_owned_ledger),
            ("posa_background_opening_shift", previous_background_opening_shift),
            ("posa_background_opening_user", previous_background_opening_user),
            ("posa_background_opening_accepted", previous_background_opening_accepted),
        ):
            if previous is not None:
                setattr(frappe.flags, key, previous)
            elif hasattr(frappe.flags, key):
                delattr(frappe.flags, key)


def submit_payload_in_background_job(kwargs):
    invoice = kwargs.get("invoice") or {}
    data = kwargs.get("data") or {}
    ledger_name = kwargs.get("ledger_name")
    cashier = kwargs.get("cashier")
    opening_shift = kwargs.get("opening_shift")
    opening_user = kwargs.get("opening_user")
    user = kwargs.get("user") or getattr(getattr(frappe, "session", None), "user", None)
    previous_owned_ledger = getattr(
        getattr(frappe, "flags", None),
        "posa_owned_submission_ledger",
        None,
    )
    previous_background_opening_accepted = getattr(
        getattr(frappe, "flags", None),
        "posa_background_opening_accepted",
        None,
    )
    previous_background_cashier = getattr(
        getattr(frappe, "flags", None),
        "posa_background_authoritative_cashier",
        None,
    )
    previous_background_opening_shift = getattr(
        getattr(frappe, "flags", None),
        "posa_background_opening_shift",
        None,
    )
    previous_background_opening_user = getattr(
        getattr(frappe, "flags", None),
        "posa_background_opening_user",
        None,
    )
    try:
        if ledger_name:
            frappe.flags.posa_owned_submission_ledger = ledger_name
        if cashier:
            frappe.flags.posa_background_authoritative_cashier = cashier
            data["_posa_authoritative_cashier"] = cashier
        if opening_shift:
            frappe.flags.posa_background_opening_shift = opening_shift
        if opening_user:
            frappe.flags.posa_background_opening_user = opening_user
        if opening_shift and opening_user:
            frappe.flags.posa_background_opening_accepted = True
        submit_invoice(
            json.dumps(invoice, default=str),
            json.dumps(data, default=str),
            submit_in_background=0,
        )
    except Exception as e:
        frappe.db.rollback()
        error_msg = str(e)
        if ledger_name:
            try:
                ledger_doc = _get_submission_ledger_by_name(ledger_name)
                if ledger_doc:
                    _mark_ledger_failed(ledger_doc, error_msg)
            except Exception:
                pass
        frappe.log_error(
            f"POS Background Payload Submission Failed for {invoice.get('name')}: {error_msg}"
        )
        if hasattr(frappe, "publish_realtime"):
            frappe.publish_realtime(
                "pos_invoice_submit_error",
                {"invoice": invoice.get("name"), "error": error_msg},
                user=user,
            )
    finally:
        if previous_owned_ledger:
            frappe.flags.posa_owned_submission_ledger = previous_owned_ledger
        elif hasattr(frappe.flags, "posa_owned_submission_ledger"):
            delattr(frappe.flags, "posa_owned_submission_ledger")
        if previous_background_cashier:
            frappe.flags.posa_background_authoritative_cashier = previous_background_cashier
        elif hasattr(frappe.flags, "posa_background_authoritative_cashier"):
            delattr(frappe.flags, "posa_background_authoritative_cashier")
        if previous_background_opening_shift:
            frappe.flags.posa_background_opening_shift = previous_background_opening_shift
        elif hasattr(frappe.flags, "posa_background_opening_shift"):
            delattr(frappe.flags, "posa_background_opening_shift")
        if previous_background_opening_user:
            frappe.flags.posa_background_opening_user = previous_background_opening_user
        elif hasattr(frappe.flags, "posa_background_opening_user"):
            delattr(frappe.flags, "posa_background_opening_user")
        if previous_background_opening_accepted is not None:
            frappe.flags.posa_background_opening_accepted = previous_background_opening_accepted
        elif hasattr(frappe.flags, "posa_background_opening_accepted"):
            delattr(frappe.flags, "posa_background_opening_accepted")


@frappe.whitelist()
def repair_invoice_submission(
    client_request_id,
    company,
    pos_profile,
    document_type="Sales Invoice",
    pos_opening_shift=None,
):
    """Reconcile an incomplete durable submission ledger row without creating a new invoice."""

    client_request_id = (client_request_id or "").strip()
    if not client_request_id:
        frappe.throw(_("client_request_id is required"))

    if document_type not in {"Sales Invoice", "POS Invoice"}:
        frappe.throw(_("Unsupported invoice document type."))

    require_pos_supervisor_or_manager()
    profile_doc = _resolve_authorized_invoice_profile(
        {"pos_profile": pos_profile, "company": company}
    )
    pos_profile = profile_doc.get("name")
    company = profile_doc.get("company")
    get_active_terminal_cashier(pos_profile)
    _resolve_current_invoice_opening_shift(profile_doc, pos_opening_shift)

    ledger_doc = _get_submission_ledger(
        client_request_id,
        company,
        pos_profile,
        document_type,
    )
    if not ledger_doc:
        frappe.throw(_("No invoice submission ledger found for this request"))
    _assert_submission_ledger_scope(
        ledger_doc,
        pos_profile,
        company,
        document_type,
    )

    invoice_name = ledger_doc.get("invoice_name")
    if not invoice_name:
        existing_invoice = find_invoice_by_client_request_id(
            client_request_id,
            preferred_doctype=document_type,
            pos_profile=pos_profile,
            company=company,
            permission_type="read",
        )
        if existing_invoice:
            invoice_name = existing_invoice.name
            _update_submission_ledger(ledger_doc, STATE_DRAFT_CREATED, invoice_name=invoice_name)

    if not invoice_name or not frappe.db.exists(document_type, invoice_name):
        return {
            "client_request_id": client_request_id,
            "ledger_state": ledger_doc.get("state"),
            "repaired": False,
            "message": _("No linked invoice was found for this ledger row"),
        }

    invoice_doc = _get_scoped_invoice_doc(
        document_type,
        invoice_name,
        pos_profile,
        company,
        "read",
    )
    if cint(invoice_doc.get("docstatus")) == 1:
        _repair_submitted_invoice_post_submit(ledger_doc, invoice_doc)
        return {
            "name": invoice_doc.name,
            "status": invoice_doc.docstatus,
            "docstatus": invoice_doc.docstatus,
            "doctype": invoice_doc.doctype,
            "ledger_state": ledger_doc.get("state"),
            "client_request_id": client_request_id,
            "repaired": True,
            "idempotent": True,
        }

    return {
        "name": invoice_doc.name,
        "status": invoice_doc.docstatus,
        "docstatus": invoice_doc.docstatus,
        "doctype": invoice_doc.doctype,
        "ledger_state": ledger_doc.get("state"),
        "client_request_id": client_request_id,
        "repaired": False,
        "message": _("Linked invoice is still a draft"),
    }


@frappe.whitelist()
def validate_cart_items(items, pos_profile=None):
    """Validate cart items for available stock.

    Returns blocking errors and warning-only shortages for front-end checks.
    """

    if isinstance(items, str):
        items = json.loads(items)

    if pos_profile and not frappe.db.exists("POS Profile", pos_profile):
        pos_profile = None

    errors = _collect_stock_errors(
        items,
        pos_profile=pos_profile,
        include_warnings=True,
    )
    errors.extend(collect_item_sale_control_errors(items))
    blocking_errors = [row for row in errors if row.get("policy") == "block"]
    warnings = [row for row in errors if row.get("policy") != "block"]

    return {
        "mode": "block" if blocking_errors else ("warn" if warnings else "allow"),
        "errors": blocking_errors,
        "warnings": warnings,
        "items": errors,
        "should_block": bool(blocking_errors),
    }
