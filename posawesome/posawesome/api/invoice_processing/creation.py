import frappe
from frappe import _
from frappe.exceptions import TimestampMismatchError
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
from posawesome.posawesome.api.payment_processing.utils import get_bank_cash_account as get_bank_account
from posawesome.posawesome.api.utilities import ensure_child_doctype, set_batch_nos_for_bundels
from posawesome.posawesome.api.payments import redeeming_customer_credit
from posawesome.posawesome.api.idempotency import (
    extract_invoice_client_request_id,
    find_invoice_by_client_request_id,
    set_invoice_client_request_id,
    strip_invoice_client_request_id,
    doctype_supports_client_request_id,
)
import json
import hashlib
from frappe.utils import money_in_words
from frappe.utils.background_jobs import enqueue


LEDGER_DOCTYPE = "POS Invoice Submission Ledger"
STATE_RECEIVED = "RECEIVED"
STATE_DRAFT_CREATED = "DRAFT_CREATED"
STATE_SUBMITTED = "SUBMITTED"
STATE_POST_SUBMIT_DONE = "POST_SUBMIT_DONE"
STATE_FAILED = "FAILED"
FINAL_LEDGER_STATES = {STATE_SUBMITTED, STATE_POST_SUBMIT_DONE}

RETURN_OUTSTANDING_MESSAGE_MARKERS = (
    "Updating the outstanding to this invoice.",
    "Update Outstanding for Self",
)


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


def _get_or_create_submission_ledger(client_request_id, invoice, data, document_type):
    if not client_request_id:
        return None

    scope = _resolve_ledger_scope(invoice, data, document_type)
    ledger_key = _submission_ledger_key(
        client_request_id,
        scope.get("company"),
        scope.get("pos_profile"),
        scope.get("document_type"),
    )
    existing = _get_submission_ledger_by_key(ledger_key)
    if existing:
        return existing

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
        return _save_submission_ledger(ledger_doc)
    except frappe.DuplicateEntryError:
        # A concurrent request already created this ledger row — fall back to
        # fetching it. Any other error (e.g. validation) must propagate so the
        # invoice is never processed without idempotency protection.
        ledger = _get_submission_ledger_by_key(ledger_key)
        if not ledger:
            frappe.throw(_("A concurrent request is already processing this invoice. Please try again."))
        return ledger


def _ledger_response(ledger_doc, replayed=True):
    if not ledger_doc or not ledger_doc.get("invoice_name"):
        return None
    try:
        invoice_doc = frappe.get_doc(
            ledger_doc.get("document_type") or "Sales Invoice",
            ledger_doc.get("invoice_name"),
        )
    except Exception:
        return None

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


def _mark_ledger_failed(ledger_doc, error):
    return _update_submission_ledger(
        ledger_doc,
        STATE_FAILED,
        error_message=str(error),
    )


def _has_post_submit_payment_work(data):
    return bool(
        flt((data or {}).get("redeemed_customer_credit"))
        or flt((data or {}).get("paid_change"))
        or flt((data or {}).get("credit_change"))
    )


def _apply_invoice_gift_card_settlement(invoice_doc, data):
    from posawesome.posawesome.api.gift_cards import apply_invoice_gift_card_redemptions

    apply_invoice_gift_card_redemptions(
        invoice_doc,
        (data or {}).get("gift_card_redemptions") or [],
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


def _get_mutable_invoice_doc(data, doctype):
    invoice_name = (data or {}).get("name")
    if not invoice_name:
        return frappe.get_doc(data)

    if not frappe.db.exists(doctype, invoice_name):
        return frappe.get_doc(_build_fresh_invoice_payload(data, doctype))

    invoice_doc = frappe.get_doc(doctype, invoice_name)
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

    invoice_doc.paid_amount = flt(sum(p.amount for p in invoice_doc.payments or []))
    invoice_doc.base_paid_amount = flt(sum(p.base_amount for p in invoice_doc.payments or []))

    _guard_return_cash_refund(invoice_doc)


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

    original_paid = flt(
        frappe.db.get_value(invoice_doc.doctype, return_against, "paid_amount")
    )
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
    client_request_id = extract_invoice_client_request_id(data)
    if not doctype_supports_client_request_id(data.get("doctype") or "Sales Invoice"):
        strip_invoice_client_request_id(data)
    _sanitize_delivery_dates(data)
    _apply_manual_posting_controls(data)
    _strip_client_freebies_from_payload(data)
    # Determine doctype based on POS Profile setting
    pos_profile = data.get("pos_profile")
    doctype = "Sales Invoice"
    if pos_profile and frappe.db.get_value(
        "POS Profile", pos_profile, "create_pos_invoice_instead_of_sales_invoice"
    ):
        doctype = "POS Invoice"

    # Ensure the document type is set for new invoices to prevent validation errors
    data.setdefault("doctype", doctype)

    return_validity_enabled, default_validity_days = _get_return_validity_settings(pos_profile)

    invoice_doc = _get_mutable_invoice_doc(data, doctype)
    set_invoice_client_request_id(invoice_doc, client_request_id)

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

    invoice_doc.ignore_pricing_rule = 1
    invoice_doc.flags.ignore_pricing_rule = True

    _deduplicate_free_items(invoice_doc)

    # Set missing values first
    invoice_doc.set_missing_values()
    if effective_price_list:
        invoice_doc.selling_price_list = effective_price_list

    _set_return_valid_upto(invoice_doc, return_validity_enabled, default_validity_days)

    # Reapply any custom item names after defaults are set
    _apply_item_name_overrides(invoice_doc, overrides)

    # Remove duplicate taxes from item and profile templates
    _merge_duplicate_taxes(invoice_doc)

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

    inclusive = frappe.get_cached_value("POS Profile", invoice_doc.pos_profile, "posa_tax_inclusive")
    if invoice_doc.get("taxes"):
        for tax in invoice_doc.taxes:
            if tax.charge_type == "Actual":
                tax.included_in_print_rate = 0
            else:
                tax.included_in_print_rate = 1 if inclusive else 0

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
    return response


@frappe.whitelist()
def submit_invoice(invoice, data, submit_in_background=False):
    data = json.loads(data)
    invoice = json.loads(invoice)
    client_request_id = extract_invoice_client_request_id(invoice, data)
    _sanitize_delivery_dates(invoice)
    _apply_manual_posting_controls(invoice)
    submit_in_background = cint(submit_in_background)
    _strip_client_freebies_from_payload(invoice)
    pos_profile = invoice.get("pos_profile")
    doctype = "Sales Invoice"
    if pos_profile and frappe.db.get_value(
        "POS Profile", pos_profile, "create_pos_invoice_instead_of_sales_invoice"
    ):
        doctype = "POS Invoice"

    if not doctype_supports_client_request_id(doctype):
        strip_invoice_client_request_id(invoice)

    ledger_doc = _get_or_create_submission_ledger(client_request_id, invoice, data, doctype)
    replay_response = _ledger_final_replay_response(ledger_doc)
    if replay_response:
        return replay_response

    existing_by_request = find_invoice_by_client_request_id(client_request_id, preferred_doctype=doctype)
    if existing_by_request:
        if cint(existing_by_request.docstatus) == 1:
            if ledger_doc:
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
        invoice["name"] = existing_by_request.name
        doctype = existing_by_request.doctype
    elif ledger_doc and ledger_doc.get("invoice_name"):
        ledger_invoice_name = ledger_doc.get("invoice_name")
        if frappe.db.exists(doctype, ledger_invoice_name):
            ledger_invoice = frappe.get_doc(doctype, ledger_invoice_name)
            if cint(ledger_invoice.docstatus) == 1:
                _update_submission_ledger(
                    ledger_doc,
                    STATE_POST_SUBMIT_DONE,
                    invoice_name=ledger_invoice.name,
                )
                replay_response = _ledger_response(ledger_doc, replayed=True)
                if replay_response:
                    return replay_response
            invoice["name"] = ledger_invoice.name

    invoice_name = invoice.get("name")
    if invoice_name and frappe.db.exists(doctype, invoice_name):
        existing_doc = frappe.get_doc(doctype, invoice_name)
        if cint(existing_doc.docstatus) != 0:
            invoice = _build_fresh_invoice_payload(invoice, doctype)
            invoice_name = None

    if not invoice_name or not frappe.db.exists(doctype, invoice_name):
        if client_request_id:
            invoice["posa_client_request_id"] = client_request_id
        created = update_invoice(json.dumps(invoice))
        invoice_name = created.get("name")
        invoice_doc = frappe.get_doc(doctype, invoice_name)
    else:
        # Prevent TimestampMismatchError by relying on server-side timestamp
        if "modified" in invoice:
            del invoice["modified"]
        invoice_doc = frappe.get_doc(doctype, invoice_name)
        invoice_doc.update(invoice)

    set_invoice_client_request_id(invoice_doc, client_request_id)
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

    _apply_write_off_settings(invoice_doc, data)

    invoice_doc.flags.ignore_permissions = True
    frappe.flags.ignore_account_permission = True
    invoice_doc.posa_is_printed = 1
    invoice_doc = _run_without_return_outstanding_prompts(
        invoice_doc,
        lambda: _save_draft_with_latest_timestamp(invoice_doc),
    )
    _normalize_return_payment_rows(invoice_doc, invoice_doc.get("conversion_rate") or 1)

    if data.get("due_date"):
        frappe.db.set_value(
            invoice_doc.doctype,
            invoice_doc.name,
            "due_date",
            data.get("due_date"),
            update_modified=False,
        )

    allow_background_submit = frappe.get_value(
        "POS Profile",
        invoice_doc.pos_profile,
        "posa_allow_submissions_in_background_job",
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
                "ledger_name": ledger_doc.name if ledger_doc else None,
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
    }


def submit_in_background_job(kwargs):
    invoice = kwargs.get("invoice")
    try:
        doctype = kwargs.get("doctype") or "Sales Invoice"
        data = kwargs.get("data") or {}
        is_payment_entry = kwargs.get("is_payment_entry")
        total_cash = kwargs.get("total_cash")
        cash_account = kwargs.get("cash_account")
        payments = kwargs.get("payments") or []
        user = kwargs.get("user") or getattr(getattr(frappe, "session", None), "user", None)
        ledger_name = kwargs.get("ledger_name")
        ledger_doc = _get_submission_ledger_by_name(ledger_name) if ledger_name else None

        invoice_doc = frappe.get_doc(doctype, invoice)

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
        if hasattr(invoice_doc, "validate_credit_limit"):
            invoice_doc.validate_credit_limit()

        invoice_doc.remarks = _build_invoice_remarks(invoice_doc)

        _apply_write_off_settings(invoice_doc, data)

        _apply_loyalty_redemption_settings(invoice_doc, invoice_doc.pos_profile)

        _apply_invoice_gift_card_settlement(invoice_doc, data)
        _normalize_return_payment_rows(invoice_doc, invoice_doc.get("conversion_rate") or 1)

        invoice_doc = _save_draft_with_latest_timestamp(invoice_doc)
        _normalize_return_payment_rows(invoice_doc, invoice_doc.get("conversion_rate") or 1)

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
        frappe.log_error(f"POS Background Submission Failed for {invoice}: {error_msg}")
        frappe.publish_realtime(
            "pos_invoice_submit_error",
            {"invoice": invoice, "error": error_msg},
            user=user,
        )


@frappe.whitelist()
def repair_invoice_submission(client_request_id, company, pos_profile, document_type="Sales Invoice"):
    """Reconcile an incomplete durable submission ledger row without creating a new invoice."""

    client_request_id = (client_request_id or "").strip()
    if not client_request_id:
        frappe.throw(_("client_request_id is required"))

    ledger_doc = _get_submission_ledger(
        client_request_id,
        company,
        pos_profile,
        document_type,
    )
    if not ledger_doc:
        frappe.throw(_("No invoice submission ledger found for this request"))

    invoice_name = ledger_doc.get("invoice_name")
    if not invoice_name:
        existing_invoice = find_invoice_by_client_request_id(
            client_request_id,
            preferred_doctype=document_type,
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

    invoice_doc = frappe.get_doc(document_type, invoice_name)
    if cint(invoice_doc.get("docstatus")) == 1:
        context = _json_loads(ledger_doc.get("payment_context"))
        data = _json_loads(ledger_doc.get("request_data"))
        _update_submission_ledger(ledger_doc, STATE_SUBMITTED, invoice_name=invoice_doc.name)
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
        _update_submission_ledger(ledger_doc, STATE_POST_SUBMIT_DONE, invoice_name=invoice_doc.name)
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
    blocking_errors = [row for row in errors if row.get("policy") == "block"]
    warnings = [row for row in errors if row.get("policy") != "block"]

    return {
        "mode": "block" if blocking_errors else ("warn" if warnings else "allow"),
        "errors": blocking_errors,
        "warnings": warnings,
        "items": errors,
        "should_block": bool(blocking_errors),
    }
