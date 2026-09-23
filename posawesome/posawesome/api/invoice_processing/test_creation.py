import importlib.util
import json
import pathlib
import sys
import types
import unittest
from unittest.mock import Mock

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]
_ORIGINAL_MODULES = dict(sys.modules)


def tearDownModule():
    managed_prefixes = (
        "frappe",
        "erpnext.accounts.doctype.sales_invoice.sales_invoice",
        "posawesome",
    )
    for name in list(sys.modules):
        if name.startswith(managed_prefixes) and name not in _ORIGINAL_MODULES:
            sys.modules.pop(name, None)
    for name, module in _ORIGINAL_MODULES.items():
        if name.startswith(managed_prefixes):
            sys.modules[name] = module


class AttrDict(dict):
    __getattr__ = dict.get
    __setattr__ = dict.__setitem__

    def update(self, other=None, **kwargs):
        if other:
            super().update(other)
        if kwargs:
            super().update(kwargs)
        return self

    def as_dict(self):
        return dict(self)

    def precision(self, _fieldname):
        return 2

    def set_missing_values(self, for_validate=False):
        return None

    def calculate_taxes_and_totals(self):
        return None


class FakeDoc:
    def __init__(self, **kwargs):
        object.__setattr__(self, "_data", dict(kwargs))
        object.__setattr__(self, "_set_missing_values_calls", [])
        if "flags" not in self._data:
            self._data["flags"] = types.SimpleNamespace()

    def __getattr__(self, name):
        try:
            return self._data[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

    def __setattr__(self, name, value):
        self._data[name] = value

    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value):
        self._data[key] = value

    def update(self, other=None, **kwargs):
        if other:
            if isinstance(other, dict):
                self._data.update(other)
            else:
                self._data.update(getattr(other, "_data", {}))
        if kwargs:
            self._data.update(kwargs)
        return self

    def precision(self, _fieldname):
        return 2

    def set_missing_values(self, for_validate=False):
        self._set_missing_values_calls.append(for_validate)
        return None

    def calculate_taxes_and_totals(self):
        return None

    def as_dict(self):
        return dict(self._data)


def _install_framework_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_utils = types.ModuleType("frappe.utils")
    frappe_exceptions = types.ModuleType("frappe.exceptions")
    frappe_background_jobs = types.ModuleType("frappe.utils.background_jobs")

    class _FrappeDict(AttrDict):
        pass

    class TimestampMismatchError(Exception):
        pass

    class QueryDeadlockError(Exception):
        pass

    frappe_utils.cint = lambda value: int(value or 0)
    frappe_utils.flt = lambda value, precision=None: round(float(value or 0), precision or 2)
    frappe_utils.getdate = lambda value: value
    frappe_utils.nowdate = lambda: "2026-03-21"
    frappe_utils.money_in_words = lambda value, currency=None: f"{value} {currency or ''}".strip()

    frappe_module._dict = _FrappeDict
    frappe_module._ = lambda text: text
    frappe_module.PermissionError = PermissionError
    frappe_module.throw = lambda message, *args, **kwargs: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.log_error = lambda *args, **kwargs: None
    frappe_module.get_cached_value = lambda *args, **kwargs: None
    frappe_module.get_cached_doc = lambda *args, **kwargs: _FrappeDict()
    frappe_module.flags = types.SimpleNamespace(ignore_account_permission=False)
    publish_realtime_calls = []
    frappe_module.db = types.SimpleNamespace(
        get_value=lambda *args, **kwargs: None,
        exists=lambda *args, **kwargs: False,
        rollback=lambda: None,
        commit=lambda: None,
    )
    frappe_module.get_doc = lambda *args, **kwargs: None
    frappe_module.publish_realtime = lambda *args, **kwargs: publish_realtime_calls.append(
        {"args": args, "kwargs": kwargs}
    )
    frappe_module.session = types.SimpleNamespace(user="test@example.com")

    frappe_exceptions.TimestampMismatchError = TimestampMismatchError
    frappe_exceptions.QueryDeadlockError = QueryDeadlockError
    enqueue_calls = []

    def _enqueue(*args, **kwargs):
        enqueue_calls.append({"args": args, "kwargs": kwargs})
        return None

    frappe_background_jobs.enqueue = _enqueue
    frappe_module._enqueue_calls = enqueue_calls
    frappe_module._publish_realtime_calls = publish_realtime_calls

    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils
    sys.modules["frappe.exceptions"] = frappe_exceptions
    sys.modules["frappe.utils.background_jobs"] = frappe_background_jobs

    return frappe_module, enqueue_calls


def _install_dependency_stubs():
    sales_invoice_module = types.ModuleType("erpnext.accounts.doctype.sales_invoice.sales_invoice")
    sales_invoice_module.get_bank_cash_account = lambda *args, **kwargs: None
    sys.modules["erpnext.accounts.doctype.sales_invoice.sales_invoice"] = sales_invoice_module

    processing_utils = types.ModuleType("posawesome.posawesome.api.invoice_processing.utils")
    processing_utils._get_return_validity_settings = lambda *_args, **_kwargs: (False, 0)
    processing_utils._validate_return_window = lambda *_args, **_kwargs: None
    processing_utils._resolve_effective_price_list = lambda *_args, **_kwargs: None
    processing_utils._build_invoice_remarks = lambda *_args, **_kwargs: ""
    processing_utils._set_return_valid_upto = lambda *_args, **_kwargs: None
    processing_utils.get_latest_rate = lambda *_args, **_kwargs: (1, "2026-03-21")
    processing_utils.resolve_erpnext_currency_rates = lambda *_args, **_kwargs: {
        "conversion_rate": 1.0,
        "plc_conversion_rate": 1.0,
        "exchange_rate_date": None,
    }
    sys.modules["posawesome.posawesome.api.invoice_processing.utils"] = processing_utils

    stock_module = types.ModuleType("posawesome.posawesome.api.invoice_processing.stock")
    stock_module._strip_client_freebies_from_payload = lambda *_args, **_kwargs: None
    stock_module._validate_stock_on_invoice = lambda *_args, **_kwargs: None
    stock_module._apply_item_name_overrides = lambda *_args, **_kwargs: None
    stock_module._deduplicate_free_items = lambda *_args, **_kwargs: None
    stock_module._merge_duplicate_taxes = lambda *_args, **_kwargs: None
    stock_module._auto_set_return_batches = lambda *_args, **_kwargs: None
    stock_module._collect_stock_errors = lambda *_args, **_kwargs: []
    stock_module._should_block = lambda *_args, **_kwargs: False
    sys.modules["posawesome.posawesome.api.invoice_processing.stock"] = stock_module

    payment_utils_module = types.ModuleType("posawesome.posawesome.api.payment_processing.utils")
    payment_utils_module.get_bank_cash_account = lambda *_args, **_kwargs: None
    sys.modules["posawesome.posawesome.api.payment_processing.utils"] = payment_utils_module

    utilities_module = types.ModuleType("posawesome.posawesome.api.utilities")
    utilities_module.ensure_child_doctype = lambda *_args, **_kwargs: None
    utilities_module.set_batch_nos_for_bundels = lambda *_args, **_kwargs: None
    sys.modules["posawesome.posawesome.api.utilities"] = utilities_module

    payments_module = types.ModuleType("posawesome.posawesome.api.payments")
    payments_module.redeeming_customer_credit = lambda *_args, **_kwargs: None
    sys.modules["posawesome.posawesome.api.payments"] = payments_module

    sale_controls_module = types.ModuleType("posawesome.posawesome.api.item_sale_controls")
    sale_controls_module.collect_item_sale_control_errors = lambda *_args, **_kwargs: []
    sale_controls_module.validate_invoice_item_sale_controls = lambda *_args, **_kwargs: None
    sys.modules["posawesome.posawesome.api.item_sale_controls"] = sale_controls_module

    terminal_state_module = types.ModuleType("posawesome.posawesome.api.terminal_state")
    terminal_state_module.get_active_terminal_cashier = (
        lambda *_args, **_kwargs: "cashier@example.com"
    )
    terminal_state_module.validate_assigned_terminal_cashier = (
        lambda _pos_profile=None, cashier=None: cashier or "cashier@example.com"
    )
    sys.modules["posawesome.posawesome.api.terminal_state"] = terminal_state_module

    pos_access_module = types.ModuleType("posawesome.posawesome.api.pos_access")
    pos_access_module.get_authorized_pos_profile = (
        lambda pos_profile=None, company=None: AttrDict(
            name=pos_profile or "Main POS",
            company=company or "Test Company",
            create_pos_invoice_instead_of_sales_invoice=0,
        )
    )
    pos_access_module.require_pos_supervisor_or_manager = lambda: "manager@example.com"
    sys.modules["posawesome.posawesome.api.pos_access"] = pos_access_module


def _install_package_stubs():
    package_paths = {
        "posawesome": REPO_ROOT / "posawesome",
        "posawesome.posawesome": REPO_ROOT / "posawesome" / "posawesome",
        "posawesome.posawesome.api": REPO_ROOT / "posawesome" / "posawesome" / "api",
        "posawesome.posawesome.api.invoice_processing": (
            REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoice_processing"
        ),
    }
    for name, path in package_paths.items():
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module


def _load_module():
    module_name = "posawesome.posawesome.api.invoice_processing.creation"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoice_processing" / "creation.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestCustomerCreditPrintFields(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        cls.creation = _load_module()

    def setUp(self):
        self.frappe.get_meta = lambda _doctype: types.SimpleNamespace(
            has_field=lambda fieldname: fieldname
            in {
                "posa_redeemed_customer_credit",
                "posa_remaining_customer_credit_balance",
            }
        )

    def test_profile_controls_invoice_ignore_pricing_rule_policy(self):
        self.assertEqual(
            self.creation._profile_ignore_pricing_rule(
                AttrDict(ignore_pricing_rule="1")
            ),
            1,
        )
        self.assertEqual(
            self.creation._profile_ignore_pricing_rule(
                AttrDict(ignore_pricing_rule=0)
            ),
            0,
        )

    def test_return_pricing_policy_overrides_profile_and_clears_applied_rules(self):
        invoice_doc = FakeDoc(
            is_return=1,
            ignore_pricing_rule=0,
            pricing_rules=[FakeDoc(pricing_rule="GROUP-DISCOUNT")],
            flags=types.SimpleNamespace(ignore_pricing_rule=False),
        )

        policy = self.creation._apply_pricing_rule_policy(
            invoice_doc,
            AttrDict(ignore_pricing_rule=0),
        )

        self.assertEqual(policy, 1)
        self.assertEqual(invoice_doc.ignore_pricing_rule, 1)
        self.assertTrue(invoice_doc.flags.ignore_pricing_rule)
        self.assertEqual(invoice_doc.pricing_rules, [])

    def test_normal_invoice_pricing_policy_still_comes_from_profile(self):
        invoice_doc = FakeDoc(
            is_return=0,
            ignore_pricing_rule=0,
            pricing_rules=[FakeDoc(pricing_rule="GROUP-DISCOUNT")],
            flags=types.SimpleNamespace(ignore_pricing_rule=False),
        )

        policy = self.creation._apply_pricing_rule_policy(
            invoice_doc,
            AttrDict(ignore_pricing_rule="1"),
        )

        self.assertEqual(policy, 1)
        self.assertEqual(invoice_doc.ignore_pricing_rule, 1)
        self.assertTrue(invoice_doc.flags.ignore_pricing_rule)
        self.assertEqual(len(invoice_doc.pricing_rules), 1)

    def test_draft_save_reasserts_return_pricing_invariant(self):
        states_seen_by_save = []
        invoice_doc = FakeDoc(
            name=None,
            is_return=1,
            ignore_pricing_rule=0,
            pricing_rules=[FakeDoc(pricing_rule="GROUP-DISCOUNT")],
            flags=types.SimpleNamespace(ignore_pricing_rule=False),
        )
        invoice_doc.is_new = lambda: True

        def save():
            states_seen_by_save.append(
                (
                    invoice_doc.ignore_pricing_rule,
                    invoice_doc.flags.ignore_pricing_rule,
                    list(invoice_doc.pricing_rules),
                )
            )

        invoice_doc.save = save

        result = self.creation._save_draft_with_latest_timestamp(invoice_doc)

        self.assertIs(result, invoice_doc)
        self.assertEqual(states_seen_by_save, [(1, True, [])])

    def test_customer_credit_print_fields_store_used_and_remaining_amounts(self):
        invoice_doc = FakeDoc(doctype="Sales Invoice", grand_total=100)
        data = {
            "redeemed_customer_credit": 64.5,
            "customer_credit_dict": [
                {"total_credit": 50, "credit_to_redeem": 50},
                {"total_credit": 50, "credit_to_redeem": 14.5},
            ],
        }

        self.creation._apply_customer_credit_print_fields(invoice_doc, data)

        self.assertEqual(invoice_doc.get("posa_redeemed_customer_credit"), 64.5)
        self.assertEqual(invoice_doc.get("posa_remaining_customer_credit_balance"), 35.5)

    def test_gift_card_rows_use_authoritative_cashier_not_client_identity(self):
        captured_rows = []
        gift_cards_module = types.ModuleType("posawesome.posawesome.api.gift_cards")
        gift_cards_module.apply_invoice_gift_card_redemptions = (
            lambda invoice_doc, rows: captured_rows.extend(rows)
        )
        previous_module = sys.modules.get("posawesome.posawesome.api.gift_cards")
        sys.modules["posawesome.posawesome.api.gift_cards"] = gift_cards_module

        def restore_gift_cards_module():
            if previous_module is None:
                sys.modules.pop("posawesome.posawesome.api.gift_cards", None)
            else:
                sys.modules["posawesome.posawesome.api.gift_cards"] = previous_module

        self.addCleanup(restore_gift_cards_module)

        self.creation._apply_invoice_gift_card_settlement(
            FakeDoc(doctype="Sales Invoice"),
            {
                "_posa_authoritative_cashier": "cashier@example.com",
                "gift_card_redemptions": [
                    {
                        "gift_card_code": "GC-0001",
                        "amount": 100,
                        "cashier": "Administrator",
                    }
                ],
            },
        )

        self.assertEqual(captured_rows[0]["cashier"], "cashier@example.com")


class TestUpdateInvoiceReturnPayments(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        cls._original_modules = dict(sys.modules)
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        sys.modules.pop("posawesome.posawesome.api.idempotency", None)
        cls.creation = _load_module()
        cls.real_validate_invoice_opening_shift = staticmethod(
            cls.creation._validate_invoice_opening_shift
        )

    def setUp(self):
        self.enqueue_calls.clear()
        self.frappe._publish_realtime_calls.clear()
        self.creation._validate_invoice_opening_shift = lambda *args, **kwargs: None

    def test_return_invoice_derives_missing_base_amount_from_amount(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name=None,
            pos_profile="Main POS",
            company="Test Company",
            currency="USD",
            posting_date="2026-03-21",
            is_return=1,
            return_against=None,
            pricing_rules=[FakeDoc(pricing_rule="GROUP-DISCOUNT")],
            items=[],
            payments=[
                FakeDoc(
                    amount=125,
                    base_amount=None,
                )
            ],
            taxes=[],
            flags=types.SimpleNamespace(ignore_pricing_rule=False, ignore_permissions=False),
            total=0,
            net_total=0,
            grand_total=0,
            rounded_total=0,
            discount_amount=0,
            paid_amount=0,
            base_paid_amount=0,
            conversion_rate=1,
            plc_conversion_rate=1,
            price_list_currency="USD",
        )

        self.creation.frappe.get_doc = lambda data: invoice_doc
        self.creation.frappe.get_cached_value = lambda *args, **kwargs: 0
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc

        result = self.creation.update_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "posting_date": "2026-03-21",
                    "is_return": 1,
                    "items": [],
                    "payments": [{"amount": 125, "base_amount": None}],
                }
            )
        )

        self.assertEqual(invoice_doc.payments[0].amount, -125)
        self.assertEqual(invoice_doc.payments[0].base_amount, -125)
        self.assertEqual(result["paid_amount"], -125)
        self.assertEqual(result["base_paid_amount"], -125)
        self.assertEqual(invoice_doc._set_missing_values_calls, [True])
        self.assertEqual(invoice_doc.ignore_pricing_rule, 1)
        self.assertTrue(invoice_doc.flags.ignore_pricing_rule)
        self.assertEqual(invoice_doc.pricing_rules, [])

    def test_return_invoice_derives_missing_amount_from_base_amount(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name=None,
            pos_profile="Main POS",
            company="Test Company",
            currency="USD",
            posting_date="2026-03-21",
            is_return=1,
            return_against=None,
            items=[],
            payments=[
                FakeDoc(
                    amount=None,
                    base_amount=125,
                )
            ],
            taxes=[],
            flags=types.SimpleNamespace(ignore_pricing_rule=False, ignore_permissions=False),
            total=0,
            net_total=0,
            grand_total=0,
            rounded_total=0,
            discount_amount=0,
            paid_amount=0,
            base_paid_amount=0,
            conversion_rate=1,
            plc_conversion_rate=1,
            price_list_currency="USD",
        )

        self.creation.frappe.get_doc = lambda data: invoice_doc
        self.creation.frappe.get_cached_value = lambda *args, **kwargs: 0
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc

        result = self.creation.update_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "posting_date": "2026-03-21",
                    "is_return": 1,
                    "items": [],
                    "payments": [{"amount": None, "base_amount": 125}],
                }
            )
        )

        self.assertEqual(invoice_doc.payments[0].amount, -125)
        self.assertEqual(invoice_doc.payments[0].base_amount, -125)
        self.assertEqual(result["paid_amount"], -125)
        self.assertEqual(result["base_paid_amount"], -125)

    def test_resolve_payment_amounts_recomputes_base_amount_from_server_rate(self):
        payment = FakeDoc(amount=12.34, base_amount=999)

        amount, base_amount = self.creation._resolve_payment_amounts(payment, conversion_rate=2)

        self.assertEqual(amount, 12.34)
        self.assertEqual(base_amount, 24.68)

    def test_return_outstanding_policy_targets_credit_note_when_original_is_fully_paid(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            is_return=1,
            is_pos=0,
            is_paid=0,
            return_against="ACC-SINV-2026-00005",
            rounded_total=-64,
            grand_total=-64,
            update_outstanding_for_self=0,
        )
        original_get_value = self.creation.frappe.db.get_value
        self.creation.frappe.db.get_value = lambda *args, **kwargs: 0
        try:
            self.creation._apply_return_outstanding_policy(invoice_doc)
        finally:
            self.creation.frappe.db.get_value = original_get_value

        self.assertEqual(invoice_doc.update_outstanding_for_self, 1)

    def test_return_outstanding_policy_targets_original_when_it_has_enough_outstanding(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            is_return=1,
            is_pos=0,
            is_paid=0,
            return_against="ACC-SINV-2026-00006",
            rounded_total=-64,
            grand_total=-64,
            update_outstanding_for_self=1,
        )
        original_get_value = self.creation.frappe.db.get_value
        self.creation.frappe.db.get_value = lambda *args, **kwargs: 100
        try:
            self.creation._apply_return_outstanding_policy(invoice_doc)
        finally:
            self.creation.frappe.db.get_value = original_get_value

        self.assertEqual(invoice_doc.update_outstanding_for_self, 0)

    def test_linked_return_filters_only_erpnext_outstanding_info_messages(self):
        invoice_doc = FakeDoc(
            is_return=1,
            return_against="ACC-SINV-2026-00005",
        )
        original_local = getattr(self.creation.frappe, "local", None)
        self.creation.frappe.local = types.SimpleNamespace(
            message_log=[{"message": "Existing message"}]
        )

        def operation():
            self.creation.frappe.local.message_log.extend(
                [
                    {
                        "message": (
                            "The outstanding amount 0.0 is lesser than 64.0. "
                            "Updating the outstanding to this invoice."
                        )
                    },
                    {"message": "A separate warning that must remain"},
                    {
                        "message": (
                            "If you want the original invoice updated, uncheck "
                            "Update Outstanding for Self."
                        )
                    },
                ]
            )
            return "submitted"

        try:
            result = self.creation._run_without_return_outstanding_prompts(
                invoice_doc,
                operation,
            )
            filtered_messages = list(self.creation.frappe.local.message_log)
        finally:
            if original_local is None:
                del self.creation.frappe.local
            else:
                self.creation.frappe.local = original_local

        self.assertEqual(result, "submitted")
        self.assertEqual(
            filtered_messages,
            [
                {"message": "Existing message"},
                {"message": "A separate warning that must remain"},
            ],
        )


class TestStaleNamedInvoiceHandling(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        sys.modules.pop("posawesome.posawesome.api.idempotency", None)
        cls.creation = _load_module()
        cls.real_validate_invoice_opening_shift = staticmethod(
            cls.creation._validate_invoice_opening_shift
        )

    def setUp(self):
        self.enqueue_calls.clear()
        self.frappe._publish_realtime_calls.clear()
        self.creation._validate_invoice_opening_shift = lambda *args, **kwargs: None

    def _build_invoice_doc(self, **overrides):
        base = {
            "doctype": "Sales Invoice",
            "name": None,
            "pos_profile": "Main POS",
            "company": "Test Company",
            "currency": "USD",
            "posting_date": "2026-03-21",
            "is_return": 0,
            "return_against": None,
            "items": [],
            "payments": [],
            "taxes": [],
            "flags": types.SimpleNamespace(ignore_pricing_rule=False, ignore_permissions=False),
            "paid_amount": 0,
            "base_paid_amount": 0,
            "conversion_rate": 1,
            "plc_conversion_rate": 1,
            "price_list_currency": "USD",
            "total": 0,
            "discount_amount": 0,
            "net_total": 0,
            "grand_total": 0,
            "rounded_total": 0,
            "docstatus": 0,
        }
        base.update(overrides)
        return FakeDoc(**base)

    def test_update_invoice_creates_new_draft_when_named_doc_is_submitted(self):
        submitted_doc = self._build_invoice_doc(name="SINV-OLD", docstatus=1)
        fresh_doc = self._build_invoice_doc()
        created_payloads = []

        def fake_get_doc(*args):
            if len(args) == 2:
                return submitted_doc
            payload = dict(args[0])
            created_payloads.append(payload)
            return fresh_doc

        self.creation.frappe.db.exists = lambda doctype, name: name == "SINV-OLD"
        self.creation.frappe.get_doc = fake_get_doc
        self.creation.frappe.get_cached_value = lambda *args, **kwargs: 0
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc

        result = self.creation.update_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "SINV-OLD",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "posting_date": "2026-03-21",
                    "items": [],
                    "payments": [],
                }
            )
        )

        self.assertEqual(len(created_payloads), 1)
        self.assertNotIn("name", created_payloads[0])
        self.assertEqual(result["docstatus"], 0)

    def test_update_invoice_recreated_draft_clears_stale_party_fields_from_submitted_doc(self):
        submitted_doc = self._build_invoice_doc(
            name="SINV-OLD",
            docstatus=1,
            customer="CUST-OLD",
            customer_name="Old Customer",
            customer_address="ADDR-OLD",
            shipping_address_name="SHIP-OLD",
            contact_person="CONT-OLD",
            address_display="Old Address",
            contact_display="Old Contact",
            contact_mobile="0300",
            contact_email="old@example.com",
            territory="Old Territory",
        )
        fresh_doc = self._build_invoice_doc()
        created_payloads = []

        def fake_get_doc(*args):
            if len(args) == 2:
                return submitted_doc
            payload = dict(args[0])
            created_payloads.append(payload)
            fresh_doc.update(payload)
            return fresh_doc

        self.creation.frappe.db.exists = lambda doctype, name: (
            doctype == "Sales Invoice" and name == "SINV-OLD"
        ) or (doctype == "Customer" and name == "CUST-NEW")
        self.creation.frappe.get_doc = fake_get_doc
        self.creation.frappe.get_cached_value = lambda *args, **kwargs: 0
        self.creation.frappe.db.get_value = lambda doctype, name, fieldname=None, **kwargs: (
            "New Customer"
            if doctype == "Customer" and fieldname == "customer_name" and name == "CUST-NEW"
            else None
        )
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc

        result = self.creation.update_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "SINV-OLD",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "posting_date": "2026-03-21",
                    "customer": "CUST-NEW",
                    "customer_name": "Old Customer",
                    "customer_address": "ADDR-OLD",
                    "shipping_address_name": "SHIP-OLD",
                    "contact_person": "CONT-OLD",
                    "address_display": "Old Address",
                    "contact_display": "Old Contact",
                    "contact_mobile": "0300",
                    "contact_email": "old@example.com",
                    "territory": "Old Territory",
                    "items": [],
                    "payments": [],
                }
            )
        )

        self.assertEqual(len(created_payloads), 1)
        self.assertNotIn("name", created_payloads[0])
        self.assertEqual(created_payloads[0].get("customer_address"), None)
        self.assertEqual(created_payloads[0].get("shipping_address_name"), None)
        self.assertEqual(created_payloads[0].get("contact_person"), None)
        self.assertEqual(created_payloads[0].get("address_display"), None)
        self.assertEqual(created_payloads[0].get("contact_display"), None)
        self.assertEqual(created_payloads[0].get("contact_mobile"), None)
        self.assertEqual(created_payloads[0].get("contact_email"), None)
        self.assertEqual(created_payloads[0].get("territory"), None)
        self.assertEqual(result["customer"], "CUST-NEW")
        self.assertEqual(result["customer_name"], "New Customer")

    def test_update_invoice_creates_new_draft_when_named_doc_is_missing(self):
        fresh_doc = self._build_invoice_doc()
        created_payloads = []

        def fake_get_doc(*args):
            payload = dict(args[0])
            created_payloads.append(payload)
            return fresh_doc

        self.creation.frappe.db.exists = lambda doctype, name: False
        self.creation.frappe.get_doc = fake_get_doc
        self.creation.frappe.get_cached_value = lambda *args, **kwargs: 0
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc

        result = self.creation.update_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "SINV-MISSING",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "posting_date": "2026-03-21",
                    "items": [],
                    "payments": [],
                }
            )
        )

        self.assertEqual(len(created_payloads), 1)
        self.assertNotIn("name", created_payloads[0])
        self.assertEqual(result["docstatus"], 0)

    def test_update_invoice_clears_stale_party_fields_when_customer_changes(self):
        existing_doc = self._build_invoice_doc(
            name="SINV-DRAFT",
            docstatus=0,
            customer="CUST-OLD",
            customer_name="Old Customer",
            customer_address="ADDR-OLD",
            shipping_address_name="SHIP-OLD",
            contact_person="CONT-OLD",
            address_display="Old Address",
            contact_display="Old Contact",
            contact_mobile="0300",
            contact_email="old@example.com",
            territory="Old Territory",
        )

        self.creation.frappe.db.exists = lambda doctype, name: True
        self.creation.frappe.get_doc = lambda *args: existing_doc
        self.creation.frappe.get_cached_value = lambda *args, **kwargs: 0
        self.creation.frappe.db.get_value = lambda doctype, name, fieldname=None, **kwargs: (
            "New Customer"
            if doctype == "Customer" and fieldname == "customer_name" and name == "CUST-NEW"
            else None
        )
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc

        result = self.creation.update_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "SINV-DRAFT",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "posting_date": "2026-03-21",
                    "customer": "CUST-NEW",
                    "customer_name": "Old Customer",
                    "customer_address": "ADDR-OLD",
                    "shipping_address_name": "SHIP-OLD",
                    "contact_person": "CONT-OLD",
                    "address_display": "Old Address",
                    "contact_display": "Old Contact",
                    "contact_mobile": "0300",
                    "contact_email": "old@example.com",
                    "territory": "Old Territory",
                    "items": [],
                    "payments": [],
                }
            )
        )

        self.assertEqual(result["customer"], "CUST-NEW")
        self.assertEqual(result["customer_name"], "New Customer")
        self.assertIsNone(result.get("customer_address"))
        self.assertIsNone(result.get("shipping_address_name"))
        self.assertIsNone(result.get("contact_person"))
        self.assertIsNone(result.get("address_display"))
        self.assertIsNone(result.get("contact_display"))
        self.assertIsNone(result.get("contact_mobile"))
        self.assertIsNone(result.get("contact_email"))
        self.assertIsNone(result.get("territory"))

    def test_update_invoice_preserves_explicitly_changed_party_fields_for_new_customer(self):
        existing_doc = self._build_invoice_doc(
            name="SINV-DRAFT",
            docstatus=0,
            customer="CUST-OLD",
            customer_address="ADDR-OLD",
            shipping_address_name="SHIP-OLD",
            contact_person="CONT-OLD",
        )

        self.creation.frappe.db.exists = lambda doctype, name: True
        self.creation.frappe.get_doc = lambda *args: existing_doc
        self.creation.frappe.get_cached_value = lambda *args, **kwargs: 0
        self.creation.frappe.db.get_value = lambda doctype, name, fieldname=None, **kwargs: (
            "New Customer"
            if doctype == "Customer" and fieldname == "customer_name" and name == "CUST-NEW"
            else None
        )
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc

        result = self.creation.update_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "SINV-DRAFT",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "posting_date": "2026-03-21",
                    "customer": "CUST-NEW",
                    "customer_address": "ADDR-NEW",
                    "shipping_address_name": "SHIP-NEW",
                    "contact_person": "CONT-NEW",
                    "items": [],
                    "payments": [],
                }
            )
        )

        self.assertEqual(result.get("customer_address"), "ADDR-NEW")
        self.assertEqual(result.get("shipping_address_name"), "SHIP-NEW")
        self.assertEqual(result.get("contact_person"), "CONT-NEW")
        self.assertEqual(result.get("customer_name"), "New Customer")


class TestPostSubmitPaymentProcessing(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        sys.modules.pop("posawesome.posawesome.api.idempotency", None)
        cls.creation = _load_module()
        cls.real_validate_invoice_opening_shift = staticmethod(
            cls.creation._validate_invoice_opening_shift
        )

    def setUp(self):
        self.enqueue_calls.clear()
        self.frappe._publish_realtime_calls.clear()
        self.creation._validate_invoice_opening_shift = lambda *args, **kwargs: None

    def test_process_post_submit_payments_runs_inline_when_async_disabled(self):
        calls = []
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-0001",
            pos_profile="Main POS",
            company="Test Company",
        )

        original_runner = self.creation._run_post_submit_payments
        self.creation._run_post_submit_payments = lambda *args, **kwargs: calls.append(("run", args))

        try:
            self.creation._process_post_submit_payments(
                invoice_doc,
                {"paid_change": 4},
                is_payment_entry=1,
                total_cash=590,
                cash_account={"account": "Cash"},
                payments=[{"mode_of_payment": "Cash", "amount": 600}],
                run_async=False,
            )
        finally:
            self.creation._run_post_submit_payments = original_runner

        self.assertEqual([call[0] for call in calls], ["run"])
        self.assertEqual(self.enqueue_calls, [])

    def test_process_post_submit_payments_enqueues_when_async_enabled(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-0002",
            pos_profile="Main POS",
            company="Test Company",
        )

        self.creation._process_post_submit_payments(
            invoice_doc,
            {"paid_change": 4},
            is_payment_entry=1,
            total_cash=590,
            cash_account={"account": "Cash"},
            payments=[{"mode_of_payment": "Cash", "amount": 600}],
            run_async=True,
            user="cashier@example.com",
        )

        self.assertEqual(len(self.enqueue_calls), 1)
        queued = self.enqueue_calls[0]["kwargs"]
        self.assertEqual(queued["method"], self.creation.process_post_submit_payments_job)
        self.assertTrue(queued["is_async"])
        self.assertEqual(queued["kwargs"]["invoice"], "SINV-0002")
        self.assertEqual(queued["kwargs"]["doctype"], "Sales Invoice")
        self.assertEqual(queued["kwargs"]["data"], {"paid_change": 4})
        self.assertEqual(queued["kwargs"]["payments"], [{"mode_of_payment": "Cash", "amount": 600}])
        self.assertEqual(queued["kwargs"]["user"], "cashier@example.com")
        self.assertEqual(len(self.frappe._publish_realtime_calls), 1)
        self.assertEqual(
            self.frappe._publish_realtime_calls[0]["args"][0],
            "pos_post_submit_payments_started",
        )
        self.assertEqual(
            self.frappe._publish_realtime_calls[0]["kwargs"]["user"],
            "cashier@example.com",
        )
        self.assertTrue(queued["enqueue_after_commit"])

    def test_run_post_submit_payments_passes_created_receive_entries_to_change_entry_creation(self):
        receive_entries = [{"name": "ACC-PAY-0001", "unallocated_amount": 4}]
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-0005",
            pos_profile="Main POS",
            company="Test Company",
        )

        payment_module_name = "posawesome.posawesome.api.invoice_processing.payment"
        payment_module = types.ModuleType(payment_module_name)
        captured_calls = []
        payment_module._create_change_payment_entries = lambda *args, **kwargs: captured_calls.append(
            (args, kwargs)
        )
        sys.modules[payment_module_name] = payment_module

        original_redeem = self.creation.redeeming_customer_credit
        self.creation.redeeming_customer_credit = lambda *args, **kwargs: receive_entries

        try:
            self.creation._run_post_submit_payments(
                invoice_doc,
                {"paid_change": 4},
                is_payment_entry=1,
                total_cash=100,
                cash_account={"account": "Cash"},
                payments=[{"mode_of_payment": "Cash", "amount": 100}],
            )
        finally:
            self.creation.redeeming_customer_credit = original_redeem

        self.assertEqual(len(captured_calls), 1)
        self.assertEqual(captured_calls[0][0][4], receive_entries)

    def test_has_post_submit_payment_work_ignores_gift_card_redemptions(self):
        self.assertFalse(
            self.creation._has_post_submit_payment_work(
                {"gift_card_redemptions": [{"gift_card_code": "GC-0001", "amount": 150}]}
            )
        )

    def test_apply_invoice_gift_card_settlement_delegates_before_submit(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-0006",
            pos_profile="Main POS",
            company="Test Company",
        )

        payment_module_name = "posawesome.posawesome.api.invoice_processing.payment"
        payment_module = types.ModuleType(payment_module_name)
        payment_module._create_change_payment_entries = lambda *args, **kwargs: None
        sys.modules[payment_module_name] = payment_module

        gift_card_module_name = "posawesome.posawesome.api.gift_cards"
        gift_card_calls = []
        gift_card_module = types.ModuleType(gift_card_module_name)
        gift_card_module.apply_invoice_gift_card_redemptions = (
            lambda invoice_doc, rows: gift_card_calls.append((invoice_doc, rows))
        )
        sys.modules[gift_card_module_name] = gift_card_module

        self.creation._apply_invoice_gift_card_settlement(
            invoice_doc,
            {
                "gift_card_redemptions": [
                    {"gift_card_code": "GC-0001", "amount": 150, "cashier": "cashier@example.com"}
                ]
            },
        )

        self.assertEqual(len(gift_card_calls), 1)
        self.assertIs(gift_card_calls[0][0], invoice_doc)
        self.assertEqual(gift_card_calls[0][1][0]["gift_card_code"], "GC-0001")
        self.assertEqual(gift_card_calls[0][1][0]["amount"], 150)

    def test_run_post_submit_payments_skips_gift_card_redemptions(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-0006",
            pos_profile="Main POS",
            company="Test Company",
        )

        payment_module_name = "posawesome.posawesome.api.invoice_processing.payment"
        payment_module = types.ModuleType(payment_module_name)
        payment_module._create_change_payment_entries = lambda *args, **kwargs: None
        sys.modules[payment_module_name] = payment_module

        gift_card_module_name = "posawesome.posawesome.api.gift_cards"
        gift_card_calls = []
        gift_card_module = types.ModuleType(gift_card_module_name)
        gift_card_module.apply_invoice_gift_card_redemptions = lambda *args, **kwargs: gift_card_calls.append(
            (args, kwargs)
        )
        sys.modules[gift_card_module_name] = gift_card_module

        original_redeem = self.creation.redeeming_customer_credit
        self.creation.redeeming_customer_credit = lambda *args, **kwargs: []

        try:
            self.creation._run_post_submit_payments(
                invoice_doc,
                {
                    "gift_card_redemptions": [
                        {"gift_card_code": "GC-0001", "amount": 150, "cashier": "cashier@example.com"}
                    ]
                },
                is_payment_entry=0,
                total_cash=0,
                cash_account={"account": "Cash"},
                payments=[],
            )
        finally:
            self.creation.redeeming_customer_credit = original_redeem

        self.assertEqual(gift_card_calls, [])

    def test_process_post_submit_payments_job_publishes_completion_event(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-0003",
            docstatus=1,
            pos_profile="Main POS",
            company="Test Company",
            flags=types.SimpleNamespace(ignore_permissions=False),
        )
        self.creation.frappe.get_doc = lambda doctype, name: invoice_doc

        calls = []
        original_runner = self.creation._run_post_submit_payments
        self.creation._run_post_submit_payments = lambda *args, **kwargs: calls.append(("run", args))

        try:
            self.creation.process_post_submit_payments_job(
                {
                    "invoice": "SINV-0003",
                    "doctype": "Sales Invoice",
                    "data": {"paid_change": 4},
                    "user": "test@example.com",
                }
            )
        finally:
            self.creation._run_post_submit_payments = original_runner

        self.assertEqual([call[0] for call in calls], ["run"])
        self.assertEqual(len(self.frappe._publish_realtime_calls), 1)
        self.assertEqual(
            self.frappe._publish_realtime_calls[0]["args"][0],
            "pos_post_submit_payments_completed",
        )

    def test_submit_in_background_job_uses_captured_user_for_submit_errors(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-ERR-0001",
            docstatus=0,
            pos_profile="Main POS",
            company="Test Company",
            customer="CUST-0001",
            is_return=0,
            redeem_loyalty_points=0,
            loyalty_program=None,
            cost_center=None,
            flags=types.SimpleNamespace(ignore_permissions=False),
        )
        invoice_doc.submit = lambda: (_ for _ in ()).throw(Exception("submit failed"))
        self.creation.frappe.get_doc = lambda doctype, name: invoice_doc
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc
        self.creation.frappe.session.user = "session-user@example.com"

        self.creation.submit_in_background_job(
            {
                "invoice": "SINV-ERR-0001",
                "doctype": "Sales Invoice",
                "data": {"paid_change": 4},
                "payments": [],
                "user": "cashier@example.com",
            }
        )

        self.assertGreaterEqual(len(self.frappe._publish_realtime_calls), 1)
        self.assertEqual(
            self.frappe._publish_realtime_calls[0]["args"][0],
            "pos_invoice_submit_error",
        )
        self.assertEqual(
            self.frappe._publish_realtime_calls[0]["kwargs"]["user"],
            "cashier@example.com",
        )

    def test_submit_in_background_job_publishes_invoice_processed_before_queueing_post_submit_work(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-0004",
            docstatus=0,
            pos_profile="Main POS",
            company="Test Company",
            customer="CUST-0001",
            is_return=0,
            redeem_loyalty_points=0,
            loyalty_program=None,
            cost_center=None,
            flags=types.SimpleNamespace(ignore_permissions=False),
        )
        invoice_doc.submit = lambda: setattr(invoice_doc, "docstatus", 1)
        self.creation.frappe.get_doc = lambda doctype, name: invoice_doc
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc

        self.creation.submit_in_background_job(
            {
                "invoice": "SINV-0004",
                "doctype": "Sales Invoice",
                "data": {"paid_change": 4},
                "payments": [],
                "user": "cashier@example.com",
            }
        )

        self.assertGreaterEqual(len(self.frappe._publish_realtime_calls), 1)
        self.assertEqual(
            self.frappe._publish_realtime_calls[0]["args"][0],
            "pos_invoice_processed",
        )
        self.assertEqual(
            self.frappe._publish_realtime_calls[0]["kwargs"]["user"],
            "cashier@example.com",
        )
        self.assertEqual(len(self.enqueue_calls), 1)
        self.assertEqual(
            self.enqueue_calls[0]["kwargs"]["kwargs"]["user"],
            "cashier@example.com",
        )


class TestManualPostingDatePreservation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        sys.modules.pop("posawesome.posawesome.api.idempotency", None)
        cls.creation = _load_module()
        cls.real_validate_invoice_opening_shift = staticmethod(
            cls.creation._validate_invoice_opening_shift
        )

    def setUp(self):
        self.enqueue_calls.clear()
        self.frappe._publish_realtime_calls.clear()
        self.creation._validate_invoice_opening_shift = lambda *args, **kwargs: None
        self.creation.get_active_terminal_cashier = (
            lambda *_args, **_kwargs: "cashier@example.com"
        )

    def test_update_invoice_requires_unlocked_server_terminal_before_draft_creation(self):
        self.creation.get_active_terminal_cashier = Mock(
            side_effect=PermissionError("terminal is locked")
        )
        self.creation.frappe.get_doc = Mock(
            side_effect=AssertionError("locked terminal must not create a draft")
        )

        with self.assertRaisesRegex(PermissionError, "terminal is locked"):
            self.creation.update_invoice(
                json.dumps(
                    {
                        "doctype": "Sales Invoice",
                        "pos_profile": "Main POS",
                        "company": "Test Company",
                        "posa_cashier": "Administrator",
                    }
                )
            )

        self.creation.get_active_terminal_cashier.assert_called_once_with("Main POS")
        self.creation.frappe.get_doc.assert_not_called()

    def test_authoritative_cashier_replaces_forged_client_identity(self):
        payload = {
            "posa_cashier": "Administrator",
            "_posa_authoritative_cashier": "attacker@example.com",
        }
        invoice_doc = FakeDoc(doctype="Sales Invoice")
        self.creation.frappe.db.has_column = lambda doctype, fieldname: True

        self.creation._strip_client_cashier_identity(payload)
        self.creation._set_authoritative_cashier(
            invoice_doc,
            "cashier@example.com",
        )

        self.assertNotIn("posa_cashier", payload)
        self.assertNotIn("_posa_authoritative_cashier", payload)
        self.assertEqual(invoice_doc.posa_cashier, "cashier@example.com")

    def test_background_worker_uses_owned_ledger_cashier_after_terminal_relocks(self):
        self.creation.get_active_terminal_cashier = Mock(
            side_effect=PermissionError("terminal is locked")
        )
        self.creation.validate_assigned_terminal_cashier = Mock(
            return_value="cashier@example.com"
        )
        ledger_doc = FakeDoc(name="ledger-001")
        self.creation.frappe.flags.posa_owned_submission_ledger = "ledger-001"
        self.creation.frappe.flags.posa_background_authoritative_cashier = (
            "cashier@example.com"
        )

        try:
            cashier = self.creation._resolve_authoritative_cashier(
                "Main POS",
                ledger_doc,
            )
        finally:
            delattr(self.creation.frappe.flags, "posa_owned_submission_ledger")
            delattr(
                self.creation.frappe.flags,
                "posa_background_authoritative_cashier",
            )

        self.assertEqual(cashier, "cashier@example.com")
        self.creation.validate_assigned_terminal_cashier.assert_called_once_with(
            "Main POS",
            "cashier@example.com",
        )
        self.creation.get_active_terminal_cashier.assert_not_called()

    def _install_loyalty_program_module(self, conversion_factor):
        module_name = "erpnext.accounts.doctype.loyalty_program.loyalty_program"
        previous_module = sys.modules.get(module_name)

        def restore_module():
            if previous_module is None:
                sys.modules.pop(module_name, None)
            else:
                sys.modules[module_name] = previous_module

        self.addCleanup(restore_module)

        loyalty_module = types.ModuleType(module_name)
        loyalty_module.get_loyalty_program_details_with_points = lambda *args, **kwargs: AttrDict(
            conversion_factor=conversion_factor
        )
        sys.modules[module_name] = loyalty_module

    def _build_invoice_doc(self, **overrides):
        base = {
            "doctype": "Sales Invoice",
            "name": None,
            "pos_profile": "Main POS",
            "company": "Test Company",
            "currency": "USD",
            "posting_date": "2026-03-21",
            "set_posting_time": 0,
            "customer": "CUST-0001",
            "customer_name": "Customer 1",
            "cost_center": None,
            "is_return": 0,
            "return_against": None,
            "items": [],
            "payments": [],
            "taxes": [],
            "flags": types.SimpleNamespace(ignore_pricing_rule=False, ignore_permissions=False),
            "paid_amount": 0,
            "base_paid_amount": 0,
            "conversion_rate": 1,
            "plc_conversion_rate": 1,
            "price_list_currency": "USD",
            "total": 0,
            "discount_amount": 0,
            "net_total": 0,
            "grand_total": 0,
            "rounded_total": 0,
            "docstatus": 0,
            "redeem_loyalty_points": 0,
            "loyalty_program": None,
            "loyalty_redemption_account": None,
            "loyalty_redemption_cost_center": None,
            "remarks": "",
            "update_stock": 1,
        }
        base.update(overrides)
        return FakeDoc(**base)

    def test_loyalty_redemption_settings_clear_zero_amount_redemption_flag(self):
        invoice_doc = self._build_invoice_doc(
            redeem_loyalty_points=1,
            loyalty_amount=0,
            loyalty_points=0,
        )

        self.creation._apply_loyalty_redemption_settings(invoice_doc, "Main POS")

        self.assertEqual(invoice_doc.redeem_loyalty_points, 0)
        self.assertEqual(invoice_doc.loyalty_amount, 0)
        self.assertEqual(invoice_doc.loyalty_points, 0)

    def test_loyalty_redemption_settings_derives_missing_points_from_amount(self):
        invoice_doc = self._build_invoice_doc(
            redeem_loyalty_points=1,
            loyalty_program="Retail Loyalty",
            loyalty_amount=25,
            loyalty_points=0,
            posting_date="2026-03-21",
        )

        self._install_loyalty_program_module(conversion_factor=5)

        def fake_get_value(doctype, name, fieldname):
            if (doctype, name, fieldname) == ("Loyalty Program", "Retail Loyalty", "expense_account"):
                return "Loyalty Expense - TC"
            if (doctype, name, fieldname) == ("POS Profile", "Main POS", "cost_center"):
                return "Main Cost Center - TC"
            return None

        self.creation.frappe.db.get_value = fake_get_value

        self.creation._apply_loyalty_redemption_settings(invoice_doc, "Main POS")

        self.assertEqual(invoice_doc.loyalty_points, 5)
        self.assertEqual(invoice_doc.redeem_loyalty_points, 1)

    def test_loyalty_redemption_settings_derives_missing_points_from_company_currency_amount(self):
        invoice_doc = self._build_invoice_doc(
            redeem_loyalty_points=1,
            loyalty_program="Retail Loyalty",
            loyalty_amount=10,
            loyalty_points=0,
            conversion_rate=280,
            posting_date="2026-03-21",
        )

        self._install_loyalty_program_module(conversion_factor=70)

        def fake_get_value(doctype, name, fieldname):
            if (doctype, name, fieldname) == ("Loyalty Program", "Retail Loyalty", "expense_account"):
                return "Loyalty Expense - TC"
            if (doctype, name, fieldname) == ("POS Profile", "Main POS", "cost_center"):
                return "Main Cost Center - TC"
            return None

        self.creation.frappe.db.get_value = fake_get_value

        self.creation._apply_loyalty_redemption_settings(invoice_doc, "Main POS")

        self.assertEqual(invoice_doc.loyalty_points, 40)
        self.assertEqual(invoice_doc.redeem_loyalty_points, 1)
        self.assertEqual(invoice_doc.loyalty_amount, 10)

    def test_loyalty_redemption_settings_clears_too_small_derived_redemption(self):
        invoice_doc = self._build_invoice_doc(
            redeem_loyalty_points=1,
            loyalty_program="Retail Loyalty",
            loyalty_amount=0.5,
            loyalty_points=0,
            conversion_rate=1,
            posting_date="2026-03-21",
        )

        self._install_loyalty_program_module(conversion_factor=10)

        self.creation._apply_loyalty_redemption_settings(invoice_doc, "Main POS")

        self.assertEqual(invoice_doc.loyalty_points, 0)
        self.assertEqual(invoice_doc.redeem_loyalty_points, 0)
        self.assertEqual(invoice_doc.loyalty_amount, 0)

    def test_loyalty_redemption_settings_requires_configured_expense_account_for_positive_redemption(self):
        invoice_doc = self._build_invoice_doc(
            redeem_loyalty_points=1,
            loyalty_program="Retail Loyalty",
            loyalty_amount=10,
            loyalty_points=2,
        )
        self.creation.frappe.db.get_value = lambda doctype, name, fieldname: None

        with self.assertRaises(Exception) as ctx:
            self.creation._apply_loyalty_redemption_settings(invoice_doc, "Main POS")

        self.assertIn("Expense Account in Loyalty Program Retail Loyalty", str(ctx.exception))

    def test_loyalty_redemption_settings_requires_configured_cost_center_for_positive_redemption(self):
        invoice_doc = self._build_invoice_doc(
            name="SINV-0001",
            redeem_loyalty_points=1,
            loyalty_program="Retail Loyalty",
            loyalty_amount=10,
            loyalty_points=2,
        )

        def fake_get_value(doctype, name, fieldname):
            if (doctype, name, fieldname) == ("Loyalty Program", "Retail Loyalty", "expense_account"):
                return "Loyalty Expense - TC"
            if (doctype, name, fieldname) == ("POS Profile", "Main POS", "cost_center"):
                return None
            return None

        self.creation.frappe.db.get_value = fake_get_value

        with self.assertRaises(Exception) as ctx:
            self.creation._apply_loyalty_redemption_settings(invoice_doc, "Main POS")

        self.assertIn("Loyalty Redemption Cost Center is required", str(ctx.exception))
        self.assertIn("SINV-0001", str(ctx.exception))
        self.assertIn("Main POS", str(ctx.exception))

    def test_update_invoice_marks_backdated_payload_for_manual_posting(self):
        captured_payloads = []
        invoice_doc = self._build_invoice_doc()

        def fake_get_doc(*args):
            if len(args) == 1:
                payload = dict(args[0])
                captured_payloads.append(payload)
                invoice_doc.update(payload)
                return invoice_doc
            return invoice_doc

        self.creation.frappe.get_doc = fake_get_doc
        self.creation.frappe.get_cached_value = lambda *args, **kwargs: 0
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc

        self.creation.update_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "customer": "CUST-0001",
                    "posting_date": "2026-03-19",
                    "items": [],
                    "payments": [],
                }
            )
        )

        self.assertEqual(captured_payloads[0]["posting_date"], "2026-03-19")
        self.assertEqual(captured_payloads[0]["set_posting_time"], 1)

    def test_submit_invoice_keeps_manual_posting_for_existing_backdated_draft(self):
        invoice_doc = self._build_invoice_doc(
            name="ACC-SINV-0001",
            posting_date="2026-03-19",
        )
        invoice_doc.submit = lambda: setattr(invoice_doc, "docstatus", 1)

        self.creation.frappe.db.exists = lambda doctype, name: name == "ACC-SINV-0001"
        self.creation.frappe.db.get_value = lambda *args, **kwargs: 0
        self.creation.frappe.get_value = lambda *args, **kwargs: 0
        self.creation.frappe.get_doc = lambda *args: invoice_doc
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc
        self.creation._apply_invoice_gift_card_settlement = lambda *args, **kwargs: None
        self.creation._process_post_submit_payments = lambda *args, **kwargs: None

        result = self.creation.submit_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "ACC-SINV-0001",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "customer": "CUST-0001",
                    "posting_date": "2026-03-19",
                    "items": [],
                    "payments": [],
                }
            ),
            json.dumps({}),
            submit_in_background=0,
        )

        self.assertEqual(invoice_doc.posting_date, "2026-03-19")
        self.assertEqual(invoice_doc.set_posting_time, 1)
        self.assertEqual(result["status"], 1)

    def test_submit_invoice_recalculates_existing_draft_with_non_inclusive_pos_tax(self):
        tax_row = {
            "charge_type": "On Net Total",
            "account_head": "VAT - TC",
            "description": "VAT 5%",
            "rate": 5,
            "included_in_print_rate": 1,
            "tax_amount": 2.59,
            "total": 54.41,
        }
        invoice_doc = self._build_invoice_doc(
            name="ACC-SINV-VAT-0001",
            total=54.41,
            net_total=51.82,
            grand_total=54.41,
            rounded_total=54.41,
            total_taxes_and_charges=2.59,
            items=[
                FakeDoc(
                    item_code="VAT-ITEM",
                    qty=1,
                    rate=54.41,
                    amount=54.41,
                    price_list_rate=68.01,
                    discount_percentage=20,
                    discount_amount=13.60,
                )
            ],
            taxes=[tax_row],
        )
        calculate_calls = []
        original_calculate_taxes_and_totals = FakeDoc.calculate_taxes_and_totals

        def calculate_taxes_and_totals(_doc):
            current_tax = invoice_doc.taxes[0]
            calculate_calls.append(current_tax["included_in_print_rate"])
            invoice_doc.net_total = 54.41
            current_tax["tax_amount"] = 2.72
            current_tax["total"] = 57.13
            invoice_doc.total_taxes_and_charges = 2.72
            invoice_doc.grand_total = 57.13
            invoice_doc.rounded_total = 57.13

        def submit():
            self.assertEqual(invoice_doc.taxes[0]["included_in_print_rate"], 0)
            self.assertEqual(invoice_doc.net_total, 54.41)
            self.assertEqual(invoice_doc.total_taxes_and_charges, 2.72)
            self.assertEqual(invoice_doc.grand_total, 57.13)
            invoice_doc.docstatus = 1

        FakeDoc.calculate_taxes_and_totals = calculate_taxes_and_totals
        invoice_doc.submit = submit

        self.creation.frappe.db.exists = lambda doctype, name: name == "ACC-SINV-VAT-0001"
        self.creation.frappe.db.get_value = lambda *args, **kwargs: 0
        self.creation.frappe.get_value = lambda *args, **kwargs: 0
        self.creation.frappe.get_cached_value = (
            lambda doctype, name, fieldname: 0
            if (doctype, name, fieldname) == ("POS Profile", "Main POS", "posa_tax_inclusive")
            else None
        )
        self.creation.frappe.get_doc = lambda *args: invoice_doc
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc
        self.creation._apply_invoice_gift_card_settlement = lambda *args, **kwargs: None
        self.creation._process_post_submit_payments = lambda *args, **kwargs: None

        try:
            result = self.creation.submit_invoice(
                json.dumps(
                    {
                        "doctype": "Sales Invoice",
                        "name": "ACC-SINV-VAT-0001",
                        "pos_profile": "Main POS",
                        "company": "Test Company",
                        "currency": "USD",
                        "customer": "CUST-0001",
                        "total": 54.41,
                        "net_total": 51.82,
                        "grand_total": 54.41,
                        "rounded_total": 54.41,
                        "total_taxes_and_charges": 2.59,
                        "items": [
                            {
                                "item_code": "VAT-ITEM",
                                "qty": 1,
                                "rate": 54.41,
                                "amount": 54.41,
                                "price_list_rate": 68.01,
                                "discount_percentage": 20,
                                "discount_amount": 13.60,
                            }
                        ],
                        "taxes": [tax_row],
                        "payments": [],
                    }
                ),
                json.dumps({}),
                submit_in_background=0,
            )
        finally:
            FakeDoc.calculate_taxes_and_totals = original_calculate_taxes_and_totals

        self.assertEqual(calculate_calls, [0])
        self.assertEqual(result["status"], 1)

    def test_submit_invoice_normalizes_existing_return_draft_payments_before_save(self):
        invoice_doc = self._build_invoice_doc(
            name="ACC-SINV-RETURN-0001",
            is_return=1,
            return_against="ACC-SINV-BASE-0001",
            additional_discount_percentage=10,
            discount_amount=-10,
            total=-100,
            net_total=-100,
            grand_total=-90,
            rounded_total=-90,
            payments=[
                FakeDoc(
                    mode_of_payment="Cash",
                    type="Cash",
                    amount=90,
                    base_amount=90,
                )
            ],
        )

        def assert_submit_sees_negative_payments():
            self.assertEqual(invoice_doc.payments[0].amount, -90)
            self.assertEqual(invoice_doc.payments[0].base_amount, -90)
            invoice_doc.docstatus = 1

        invoice_doc.submit = assert_submit_sees_negative_payments

        self.creation.frappe.db.exists = lambda doctype, name: name == "ACC-SINV-RETURN-0001"
        self.creation.frappe.db.get_value = (
            lambda doctype, name, fieldname, *args, **kwargs: 90
            if fieldname == "paid_amount"
            else 0
        )
        self.creation.frappe.get_value = lambda *args, **kwargs: 0
        self.creation.frappe.get_doc = lambda *args: invoice_doc
        self.creation._apply_invoice_gift_card_settlement = lambda *args, **kwargs: None
        self.creation._process_post_submit_payments = lambda *args, **kwargs: None
        # This test isolates sign normalization; refundable-balance validation
        # has dedicated coverage in the return-processing tests.
        self.creation._guard_return_cash_refund = lambda *args, **kwargs: None

        def assert_return_payments_are_negative_before_save(doc):
            self.assertEqual(doc.payments[0].amount, -90)
            self.assertEqual(doc.payments[0].base_amount, -90)
            # Simulate framework-side save logic mutating child rows before submit.
            doc.payments[0].amount = 90
            doc.payments[0].base_amount = 90
            return doc

        self.creation._save_draft_with_latest_timestamp = assert_return_payments_are_negative_before_save

        result = self.creation.submit_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "ACC-SINV-RETURN-0001",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "customer": "CUST-0001",
                    "is_return": 1,
                    "return_against": "ACC-SINV-BASE-0001",
                    "additional_discount_percentage": 10,
                    "discount_amount": -10,
                    "items": [],
                }
            ),
            json.dumps({}),
            submit_in_background=0,
        )

        self.assertEqual(result["status"], 1)


class TestInvoiceIdempotency(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        sys.modules.pop("posawesome.posawesome.api.idempotency", None)
        cls.creation = _load_module()
        cls.original_process_post_submit_payments = cls.creation._process_post_submit_payments
        cls.real_validate_invoice_opening_shift = staticmethod(
            cls.creation._validate_invoice_opening_shift
        )

    def setUp(self):
        self.enqueue_calls.clear()
        self.frappe._publish_realtime_calls.clear()
        self.creation.frappe.db.has_column = lambda doctype, fieldname: True
        self.creation._process_post_submit_payments = type(self).original_process_post_submit_payments
        self.creation.get_active_terminal_cashier = (
            lambda *_args, **_kwargs: "cashier@example.com"
        )
        self.creation._validate_invoice_opening_shift = lambda *args, **kwargs: None

    def test_forged_profile_or_company_values_are_rejected_before_authorization(self):
        authorize = Mock(
            return_value=AttrDict(name="Main POS", company="Test Company")
        )
        original_authorize = self.creation.get_authorized_pos_profile
        self.creation.get_authorized_pos_profile = authorize
        self.addCleanup(
            setattr,
            self.creation,
            "get_authorized_pos_profile",
            original_authorize,
        )

        with self.assertRaisesRegex(Exception, "POS Profile and company do not match"):
            self.creation._resolve_authorized_invoice_profile(
                {"pos_profile": "Main POS", "company": "Test Company"},
                {"pos_profile": "Other POS", "company": "Other Company"},
            )

        authorize.assert_not_called()

    def test_invoice_opening_shift_is_validated_even_when_client_disables_is_pos(self):
        opening_doc = FakeDoc(
            name="POS-OPEN-0001",
            pos_profile="Main POS",
            company="Test Company",
            user="test@example.com",
            docstatus=1,
            status="Open",
            pos_closing_shift=None,
        )
        original_get_doc = self.creation.frappe.get_doc
        self.creation.frappe.get_doc = lambda doctype, name: opening_doc
        self.addCleanup(setattr, self.creation.frappe, "get_doc", original_get_doc)

        result = self.real_validate_invoice_opening_shift(
            AttrDict(name="Main POS", company="Test Company"),
            {"posa_pos_opening_shift": "POS-OPEN-0001", "is_pos": 0},
        )

        self.assertIs(result, opening_doc)

    def test_invoice_opening_shift_is_required_for_new_pos_operations(self):
        with self.assertRaisesRegex(Exception, "POS Opening Shift is required"):
            self.real_validate_invoice_opening_shift(
                AttrDict(name="Main POS", company="Test Company"),
                {},
                required=True,
            )

    def test_mutable_named_draft_requires_write_after_scoped_read(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-READ-ONLY-0001",
            docstatus=0,
            pos_profile="Main POS",
            company="Test Company",
            customer="CUST-0001",
        )
        permission_checks = []

        def assert_scope(doc, **kwargs):
            permission_checks.append(kwargs["permission_type"])
            if kwargs["permission_type"] == "write":
                raise PermissionError("write permission required")
            return doc

        original_scope = self.creation.assert_invoice_request_scope
        original_get_doc = self.creation.frappe.get_doc
        original_exists = self.creation.frappe.db.exists
        self.creation.assert_invoice_request_scope = assert_scope
        self.creation.frappe.get_doc = lambda *_args: invoice_doc
        self.creation.frappe.db.exists = lambda *_args: True
        self.addCleanup(setattr, self.creation, "assert_invoice_request_scope", original_scope)
        self.addCleanup(setattr, self.creation.frappe, "get_doc", original_get_doc)
        self.addCleanup(setattr, self.creation.frappe.db, "exists", original_exists)

        with self.assertRaisesRegex(PermissionError, "write permission required"):
            self.creation._get_mutable_invoice_doc(
                {
                    "doctype": "Sales Invoice",
                    "name": invoice_doc.name,
                    "customer": "CUST-0002",
                },
                "Sales Invoice",
                "Main POS",
                "Test Company",
            )

        self.assertEqual(permission_checks, ["read", "write"])
        self.assertEqual(invoice_doc.customer, "CUST-0001")

    def test_idempotency_recovered_draft_requires_write_before_background_queue(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-RECOVERED-0001",
            docstatus=0,
            pos_profile="Main POS",
            company="Test Company",
        )
        original_get_ledger = self.creation._get_submission_ledger
        original_find_invoice = self.creation.find_invoice_by_client_request_id
        original_scope = self.creation.assert_invoice_request_scope
        original_cashier = self.creation.get_active_terminal_cashier
        self.creation._get_submission_ledger = lambda *_args, **_kwargs: None
        self.creation.find_invoice_by_client_request_id = (
            lambda *_args, **_kwargs: invoice_doc
        )
        self.creation.assert_invoice_request_scope = Mock(
            side_effect=PermissionError("write permission required")
        )
        self.creation.get_active_terminal_cashier = Mock(
            side_effect=AssertionError("draft must be rejected before terminal or queue work")
        )
        self.addCleanup(
            setattr, self.creation, "_get_submission_ledger", original_get_ledger
        )
        self.addCleanup(
            setattr,
            self.creation,
            "find_invoice_by_client_request_id",
            original_find_invoice,
        )
        self.addCleanup(
            setattr, self.creation, "assert_invoice_request_scope", original_scope
        )
        self.addCleanup(
            setattr, self.creation, "get_active_terminal_cashier", original_cashier
        )

        with self.assertRaisesRegex(PermissionError, "write permission required"):
            self.creation.submit_invoice(
                json.dumps(
                    {
                        "doctype": "Sales Invoice",
                        "pos_profile": "Main POS",
                        "company": "Test Company",
                        "customer": "CUST-0001",
                        "posa_client_request_id": "recovered-read-only-001",
                    }
                ),
                json.dumps({"idempotency_key": "recovered-read-only-001"}),
                submit_in_background=1,
            )

        self.creation.assert_invoice_request_scope.assert_called_once_with(
            invoice_doc,
            pos_profile="Main POS",
            company="Test Company",
            permission_type="write",
        )

    def test_invoice_opening_shift_rejects_wrong_scope_owner_and_state(self):
        base = {
            "name": "POS-OPEN-0001",
            "pos_profile": "Main POS",
            "company": "Test Company",
            "user": "test@example.com",
            "docstatus": 1,
            "status": "Open",
            "pos_closing_shift": None,
        }
        cases = (
            ({"pos_profile": "Other POS"}, "does not belong to this POS Profile"),
            ({"company": "Other Company"}, "does not belong to this POS Profile"),
            ({"user": "other@example.com"}, "does not belong to the current user"),
            ({"docstatus": 2}, "is not submitted"),
            ({"status": "Closed"}, "is not open"),
            ({"pos_closing_shift": "POS-CLOSE-0001"}, "is not open"),
        )
        original_get_doc = self.creation.frappe.get_doc
        self.addCleanup(setattr, self.creation.frappe, "get_doc", original_get_doc)
        for overrides, expected_error in cases:
            with self.subTest(expected_error=expected_error):
                opening_doc = FakeDoc(**{**base, **overrides})
                self.creation.frappe.get_doc = lambda doctype, name, doc=opening_doc: doc
                with self.assertRaisesRegex(Exception, expected_error):
                    self.real_validate_invoice_opening_shift(
                        AttrDict(name="Main POS", company="Test Company"),
                        {"posa_pos_opening_shift": "POS-OPEN-0001", "is_pos": 0},
                    )

    def test_trusted_delayed_work_reassigns_closed_shift_and_records_audit(self):
        closed_shift = FakeDoc(
            name="POS-OPEN-CLOSED",
            pos_profile="Main POS",
            company="Test Company",
            user="former@example.com",
            docstatus=1,
            status="Closed",
            pos_closing_shift="POS-CLOSE-0001",
        )
        current_shift = FakeDoc(
            name="POS-OPEN-CURRENT",
            pos_profile="Main POS",
            company="Test Company",
            user="test@example.com",
            docstatus=1,
            status="Open",
            pos_closing_shift=None,
        )
        original_get_doc = self.creation.frappe.get_doc
        original_get_value = self.creation.frappe.db.get_value
        original_validator = self.creation._validate_invoice_opening_shift

        def get_doc(doctype, name):
            if doctype == "POS Opening Shift":
                return closed_shift if name == closed_shift.name else current_shift
            raise AssertionError((doctype, name))

        self.creation.frappe.get_doc = get_doc
        self.creation.frappe.db.get_value = lambda *_args, **_kwargs: current_shift.name
        self.creation._validate_invoice_opening_shift = self.real_validate_invoice_opening_shift
        self.addCleanup(setattr, self.creation.frappe, "get_doc", original_get_doc)
        self.addCleanup(setattr, self.creation.frappe.db, "get_value", original_get_value)
        self.addCleanup(
            setattr,
            self.creation,
            "_validate_invoice_opening_shift",
            original_validator,
        )

        for source in ("offline_sync", "submitted_amendment"):
            with self.subTest(source=source):
                invoice = {
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "posa_pos_opening_shift": closed_shift.name,
                }
                data = {}
                with self.creation.trusted_invoice_shift_reassignment(
                    invoice,
                    data,
                    source,
                ) as audit:
                    self.assertEqual(invoice["posa_pos_opening_shift"], current_shift.name)
                    self.assertEqual(data["posa_pos_opening_shift"], current_shift.name)
                    self.assertEqual(audit["source"], source)
                    self.assertEqual(audit["original_opening_shift"], closed_shift.name)
                    self.assertEqual(audit["assigned_opening_shift"], current_shift.name)
                    self.assertEqual(
                        self.creation.frappe.flags.posa_trusted_shift_audit,
                        audit,
                    )

    def test_trusted_delayed_work_rejects_cross_profile_original_shift(self):
        foreign_shift = FakeDoc(
            name="POS-OPEN-FOREIGN",
            pos_profile="Other POS",
            company="Other Company",
            user="test@example.com",
            docstatus=1,
            status="Closed",
            pos_closing_shift="POS-CLOSE-FOREIGN",
        )
        original_get_doc = self.creation.frappe.get_doc
        self.creation.frappe.get_doc = lambda *_args: foreign_shift
        self.addCleanup(setattr, self.creation.frappe, "get_doc", original_get_doc)

        with self.assertRaisesRegex(Exception, "does not belong to this POS Profile"):
            with self.creation.trusted_invoice_shift_reassignment(
                {
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "posa_pos_opening_shift": foreign_shift.name,
                },
                {},
                "offline_sync",
            ):
                pass

    def test_accepted_background_shift_ownership_survives_later_shift_close(self):
        opening_doc = FakeDoc(
            name="POS-OPEN-0001",
            pos_profile="Main POS",
            company="Test Company",
            user="test@example.com",
            docstatus=1,
            status="Closed",
            pos_closing_shift="POS-CLOSE-0001",
        )
        original_get_doc = self.creation.frappe.get_doc
        self.creation.frappe.get_doc = lambda doctype, name: opening_doc
        self.addCleanup(setattr, self.creation.frappe, "get_doc", original_get_doc)
        self.creation.frappe.flags.posa_owned_submission_ledger = "ledger-accepted-001"
        self.creation.frappe.flags.posa_background_opening_shift = "POS-OPEN-0001"
        self.creation.frappe.flags.posa_background_opening_user = "test@example.com"
        self.creation.frappe.flags.posa_background_opening_accepted = True
        self.addCleanup(
            lambda: [
                delattr(self.creation.frappe.flags, key)
                for key in (
                    "posa_owned_submission_ledger",
                    "posa_background_opening_shift",
                    "posa_background_opening_user",
                    "posa_background_opening_accepted",
                )
                if hasattr(self.creation.frappe.flags, key)
            ]
        )

        result = self.real_validate_invoice_opening_shift(
            AttrDict(name="Main POS", company="Test Company"),
            {"posa_pos_opening_shift": "POS-OPEN-0001"},
        )

        self.assertIs(result, opening_doc)

    def test_client_named_draft_cannot_cross_pos_profile_scope(self):
        cross_profile_draft = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-OTHER-0001",
            docstatus=0,
            pos_profile="Other POS",
            company="Other Company",
        )
        original_exists = self.creation.frappe.db.exists
        original_get_doc = self.creation.frappe.get_doc
        self.creation.frappe.db.exists = lambda *_args, **_kwargs: True
        self.creation.frappe.get_doc = lambda *_args, **_kwargs: cross_profile_draft
        self.addCleanup(setattr, self.creation.frappe.db, "exists", original_exists)
        self.addCleanup(setattr, self.creation.frappe, "get_doc", original_get_doc)

        with self.assertRaisesRegex(Exception, "not available for the selected POS Profile"):
            self.creation._get_mutable_invoice_doc(
                {
                    "doctype": "Sales Invoice",
                    "name": cross_profile_draft.name,
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                },
                "Sales Invoice",
                "Main POS",
                "Test Company",
            )

    def test_request_id_replay_rejects_cross_profile_invoice_without_disclosure(self):
        cross_profile_invoice = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-SECRET-0001",
            docstatus=1,
            pos_profile="Other POS",
            company="Other Company",
        )
        original_get_value = self.creation.frappe.db.get_value
        original_get_doc = self.creation.frappe.get_doc
        self.creation.frappe.db.get_value = lambda *_args, **_kwargs: cross_profile_invoice.name
        self.creation.frappe.get_doc = lambda *_args, **_kwargs: cross_profile_invoice
        self.addCleanup(setattr, self.creation.frappe.db, "get_value", original_get_value)
        self.addCleanup(setattr, self.creation.frappe, "get_doc", original_get_doc)

        with self.assertRaisesRegex(Exception, "not available for the selected POS Profile") as error:
            self.creation.find_invoice_by_client_request_id(
                "guessed-request-id",
                preferred_doctype="Sales Invoice",
                pos_profile="Main POS",
                company="Test Company",
            )

        self.assertNotIn(cross_profile_invoice.name, str(error.exception))

    def test_request_id_replay_requires_document_read_permission(self):
        protected_invoice = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-PROTECTED-0001",
            docstatus=1,
            pos_profile="Main POS",
            company="Test Company",
        )
        protected_invoice.check_permission = Mock(side_effect=PermissionError("denied"))
        original_get_value = self.creation.frappe.db.get_value
        original_get_doc = self.creation.frappe.get_doc
        self.creation.frappe.db.get_value = lambda *_args, **_kwargs: protected_invoice.name
        self.creation.frappe.get_doc = lambda *_args, **_kwargs: protected_invoice
        self.addCleanup(setattr, self.creation.frappe.db, "get_value", original_get_value)
        self.addCleanup(setattr, self.creation.frappe, "get_doc", original_get_doc)

        with self.assertRaises(PermissionError):
            self.creation.find_invoice_by_client_request_id(
                "protected-request-id",
                preferred_doctype="Sales Invoice",
                pos_profile="Main POS",
                company="Test Company",
            )

        protected_invoice.check_permission.assert_called_once_with("read")

    def test_submit_invoice_returns_existing_submitted_doc_for_same_client_request_id(self):
        existing_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-IDEMP-0001",
            docstatus=1,
            pos_profile="Main POS",
            company="Test Company",
        )

        def fake_get_value(doctype, filters=None, fieldname=None, **kwargs):
            if (
                doctype == "Sales Invoice"
                and isinstance(filters, dict)
                and filters.get("posa_client_request_id") == "inv-fixed-001"
            ):
                return "ACC-SINV-IDEMP-0001"
            return 0

        self.creation.frappe.db.get_value = fake_get_value
        self.creation.frappe.db.exists = lambda *args, **kwargs: False
        self.creation.frappe.get_doc = lambda *args: existing_doc
        self.creation.update_invoice = lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("duplicate replay should not build a new invoice")
        )
        self.creation.get_active_terminal_cashier = Mock(
            side_effect=AssertionError(
                "final idempotent replay must not require an unlocked terminal"
            )
        )
        self.creation._validate_invoice_opening_shift = (
            self.real_validate_invoice_opening_shift
        )

        result = self.creation.submit_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "items": [],
                    "payments": [],
                    "posa_client_request_id": "inv-fixed-001",
                }
            ),
            json.dumps({"idempotency_key": "inv-fixed-001"}),
            submit_in_background=0,
        )

        self.assertEqual(result["name"], "ACC-SINV-IDEMP-0001")
        self.assertEqual(result["status"], 1)
        self.assertTrue(result["replayed"])
        self.creation.get_active_terminal_cashier.assert_not_called()

    def test_submit_retry_does_not_turn_failed_post_submit_ledger_into_success(self):
        ledger_doc = FakeDoc(
            doctype="POS Invoice Submission Ledger",
            name="ledger-failed-retry-001",
            ledger_key="ledger-failed-retry-001",
            client_request_id="failed-retry-001",
            company="Test Company",
            pos_profile="Main POS",
            document_type="Sales Invoice",
            invoice_name="ACC-SINV-FAILED-0001",
            state="FAILED",
            request_data=json.dumps({"redeemed_customer_credit": 100}),
            payment_context=json.dumps({"is_payment_entry": 1}),
            error_message="post submit failed",
        )
        ledger_doc.save = lambda ignore_permissions=False: ledger_doc
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-FAILED-0001",
            docstatus=1,
            pos_profile="Main POS",
            company="Test Company",
        )

        def fake_get_value(doctype, filters=None, fieldname=None, **kwargs):
            if doctype == "POS Invoice Submission Ledger":
                return ledger_doc.name
            if doctype == "Sales Invoice" and isinstance(filters, dict):
                return invoice_doc.name
            return 0

        def fake_get_doc(doctype, name):
            if doctype == "POS Invoice Submission Ledger":
                return ledger_doc
            if doctype == "POS Profile":
                return AttrDict(name="Main POS", company="Test Company")
            if doctype == "Sales Invoice":
                return invoice_doc
            raise AssertionError(f"unexpected get_doc call: {(doctype, name)}")

        self.creation.frappe.db.get_value = fake_get_value
        self.creation.frappe.db.exists = lambda *args, **kwargs: False
        self.creation.frappe.get_doc = fake_get_doc
        post_submit = Mock(side_effect=AssertionError("automatic retry must not rerun ledger work"))
        self.creation._process_post_submit_payments = post_submit

        with self.assertRaisesRegex(Exception, "post-submit processing failed"):
            self.creation.submit_invoice(
                json.dumps(
                    {
                        "doctype": "Sales Invoice",
                        "pos_profile": "Main POS",
                        "company": "Test Company",
                        "customer": "CUST-0001",
                        "posa_client_request_id": "failed-retry-001",
                    }
                ),
                json.dumps({}),
                submit_in_background=0,
            )

        self.assertEqual(ledger_doc.state, "FAILED")
        self.assertEqual(ledger_doc.error_message, "post submit failed")
        post_submit.assert_not_called()

    def test_repair_requires_supervisor_before_loading_profile_or_ledger(self):
        original_supervisor = self.creation.require_pos_supervisor_or_manager
        original_profile = self.creation.get_authorized_pos_profile
        profile_lookup = Mock(
            side_effect=AssertionError("profile must not load before supervisor authorization")
        )
        self.creation.require_pos_supervisor_or_manager = Mock(
            side_effect=PermissionError("supervisor required")
        )
        self.creation.get_authorized_pos_profile = profile_lookup
        self.addCleanup(
            setattr,
            self.creation,
            "require_pos_supervisor_or_manager",
            original_supervisor,
        )
        self.addCleanup(
            setattr,
            self.creation,
            "get_authorized_pos_profile",
            original_profile,
        )

        with self.assertRaisesRegex(PermissionError, "supervisor required"):
            self.creation.repair_invoice_submission(
                "repair-forbidden-001",
                "Test Company",
                "Main POS",
            )

        profile_lookup.assert_not_called()

    def test_repair_requires_unlocked_terminal_and_current_opening_shift(self):
        original_cashier = self.creation.get_active_terminal_cashier
        original_resolve_shift = self.creation._resolve_current_invoice_opening_shift
        cashier = Mock(return_value="cashier@example.com")
        shift = Mock(side_effect=PermissionError("open shift required"))
        self.creation.get_active_terminal_cashier = cashier
        self.creation._resolve_current_invoice_opening_shift = shift
        self.addCleanup(
            setattr,
            self.creation,
            "get_active_terminal_cashier",
            original_cashier,
        )
        self.addCleanup(
            setattr,
            self.creation,
            "_resolve_current_invoice_opening_shift",
            original_resolve_shift,
        )

        with self.assertRaisesRegex(PermissionError, "open shift required"):
            self.creation.repair_invoice_submission(
                "repair-no-shift-001",
                "Test Company",
                "Main POS",
            )

        cashier.assert_called_once_with("Main POS")
        shift.assert_called_once()

    def test_repair_api_rethrows_durable_post_submit_failure(self):
        ledger_doc = FakeDoc(
            name="ledger-api-repair-failed-001",
            client_request_id="ledger-api-repair-failed-001",
            state="FAILED",
            company="Test Company",
            pos_profile="Main POS",
            document_type="Sales Invoice",
            invoice_name="ACC-SINV-FAILED-API-0001",
        )
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-FAILED-API-0001",
            docstatus=1,
            company="Test Company",
            pos_profile="Main POS",
        )

        def get_value(doctype, *_args, **_kwargs):
            if doctype == "POS Invoice Submission Ledger":
                return ledger_doc.name
            return None

        def get_doc(doctype, _name):
            if doctype == "POS Invoice Submission Ledger":
                return ledger_doc
            if doctype == "Sales Invoice":
                return invoice_doc
            raise AssertionError(f"unexpected doctype: {doctype}")

        original_repair = self.creation._repair_submitted_invoice_post_submit
        self.creation.frappe.db.get_value = get_value
        self.creation.frappe.db.exists = lambda doctype, name: (
            doctype == "Sales Invoice" and name == invoice_doc.name
        )
        self.creation.frappe.get_doc = get_doc
        self.creation._repair_submitted_invoice_post_submit = Mock(
            side_effect=RuntimeError("durably failed repair")
        )
        self.addCleanup(
            setattr,
            self.creation,
            "_repair_submitted_invoice_post_submit",
            original_repair,
        )

        with self.assertRaisesRegex(RuntimeError, "durably failed repair"):
            self.creation.repair_invoice_submission(
                ledger_doc.client_request_id,
                "Test Company",
                "Main POS",
            )

        self.creation._repair_submitted_invoice_post_submit.assert_called_once_with(
            ledger_doc,
            invoice_doc,
        )

    def test_explicit_post_submit_repair_restores_failed_state_when_retry_crashes(self):
        ledger_doc = FakeDoc(
            name="ledger-repair-failed-001",
            state="FAILED",
            request_data=json.dumps({"redeemed_customer_credit": 100}),
            payment_context=json.dumps({"is_payment_entry": 1}),
            error_message="original failure",
        )
        ledger_doc.save = lambda ignore_permissions=False: ledger_doc
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-FAILED-0002",
            docstatus=1,
        )
        original_processor = self.creation._process_post_submit_payments
        self.creation._process_post_submit_payments = Mock(side_effect=Exception("retry failed"))
        self.addCleanup(
            setattr,
            self.creation,
            "_process_post_submit_payments",
            original_processor,
        )

        with self.assertRaisesRegex(Exception, "retry failed"):
            self.creation._repair_submitted_invoice_post_submit(ledger_doc, invoice_doc)

        self.assertEqual(ledger_doc.state, "FAILED")
        self.assertIn("retry failed", ledger_doc.error_message)

    def test_submit_invoice_skips_idempotency_lookup_when_custom_field_is_missing(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-NEW-0001",
            docstatus=0,
            pos_profile="Main POS",
            company="Test Company",
            currency="USD",
            customer="CUST-0001",
            is_return=0,
            items=[],
            payments=[],
            taxes=[],
            flags=types.SimpleNamespace(ignore_permissions=False),
            redeem_loyalty_points=0,
            loyalty_program=None,
            cost_center=None,
            write_off_amount=0,
            rounded_total=0,
            grand_total=0,
            remarks="",
        )
        invoice_doc.submit = lambda: setattr(invoice_doc, "docstatus", 1)

        self.creation.frappe.db.has_column = lambda doctype, fieldname: False
        self.creation.frappe.db.get_value = lambda *args, **kwargs: 0
        self.creation.frappe.db.exists = lambda doctype, name: name == "ACC-SINV-NEW-0001"
        self.creation.frappe.get_value = lambda *args, **kwargs: 0
        self.creation.frappe.get_doc = lambda *args: invoice_doc
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc
        self.creation._apply_invoice_gift_card_settlement = lambda *args, **kwargs: None
        self.creation._process_post_submit_payments = lambda *args, **kwargs: None

        result = self.creation.submit_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "ACC-SINV-NEW-0001",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "customer": "CUST-0001",
                    "items": [],
                    "payments": [],
                    "posa_client_request_id": "inv-fixed-002",
                }
            ),
            json.dumps({"idempotency_key": "inv-fixed-002"}),
            submit_in_background=0,
        )

        self.assertEqual(result["status"], 1)
        self.assertEqual(getattr(invoice_doc, "posa_client_request_id", None), None)

    def test_submit_invoice_does_not_query_missing_client_request_column(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-NEW-0002",
            docstatus=0,
            pos_profile="Main POS",
            company="Test Company",
            currency="USD",
            customer="CUST-0001",
            is_return=0,
            items=[],
            payments=[],
            taxes=[],
            flags=types.SimpleNamespace(ignore_permissions=False),
            redeem_loyalty_points=0,
            loyalty_program=None,
            cost_center=None,
            write_off_amount=0,
            rounded_total=0,
            grand_total=0,
            remarks="",
        )
        invoice_doc.submit = lambda: setattr(invoice_doc, "docstatus", 1)

        def explode_if_lookup_runs(*args, **kwargs):
            filters = args[1] if len(args) > 1 else kwargs.get("filters")
            if isinstance(filters, dict) and "posa_client_request_id" in filters:
                raise AssertionError("idempotency lookup should be skipped when the field is missing")
            return 0

        self.creation.frappe.db.has_column = lambda doctype, fieldname: False
        self.creation.frappe.db.get_value = explode_if_lookup_runs
        self.creation.frappe.db.exists = lambda doctype, name: name == "ACC-SINV-NEW-0002"
        self.creation.frappe.get_value = lambda *args, **kwargs: 0
        self.creation.frappe.get_doc = lambda *args: invoice_doc
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc
        self.creation._apply_invoice_gift_card_settlement = lambda *args, **kwargs: None
        self.creation._process_post_submit_payments = lambda *args, **kwargs: None

        result = self.creation.submit_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "ACC-SINV-NEW-0002",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "customer": "CUST-0001",
                    "items": [],
                    "payments": [],
                    "posa_client_request_id": "inv-fixed-003",
                }
            ),
            json.dumps({"idempotency_key": "inv-fixed-003"}),
            submit_in_background=0,
        )

        self.assertEqual(result["status"], 1)
        self.assertEqual(getattr(invoice_doc, "posa_client_request_id", None), None)

    def test_submit_invoice_replays_from_durable_ledger_without_invoice_custom_field(self):
        ledger_rows = {}
        submitted_docs = {}
        submit_count = {"value": 0}

        def make_invoice_doc(name):
            invoice_doc = FakeDoc(
                doctype="Sales Invoice",
                name=name,
                docstatus=0,
                pos_profile="Main POS",
                company="Test Company",
                currency="USD",
                customer="CUST-0001",
                is_return=0,
                items=[],
                payments=[],
                taxes=[],
                flags=types.SimpleNamespace(ignore_permissions=False),
                redeem_loyalty_points=0,
                loyalty_program=None,
                cost_center=None,
                write_off_amount=0,
                rounded_total=0,
                grand_total=0,
                remarks="",
            )

            def submit():
                submit_count["value"] += 1
                invoice_doc.docstatus = 1

            invoice_doc.submit = submit
            submitted_docs[name] = invoice_doc
            return invoice_doc

        def fake_update_invoice(payload):
            name = f"ACC-SINV-LEDGER-{len(submitted_docs) + 1:04d}"
            make_invoice_doc(name)
            return {"name": name}

        def attach_ledger_methods(ledger_doc):
            def insert(ignore_permissions=False):
                ledger_doc.name = ledger_doc.get("name") or ledger_doc.ledger_key
                ledger_rows[ledger_doc.name] = ledger_doc
                return ledger_doc

            def save(ignore_permissions=False):
                ledger_rows[ledger_doc.name] = ledger_doc
                return ledger_doc

            ledger_doc.insert = insert
            ledger_doc.save = save
            return ledger_doc

        def fake_get_doc(*args):
            if len(args) == 1 and isinstance(args[0], dict):
                payload = dict(args[0])
                if payload.get("doctype") == "POS Invoice Submission Ledger":
                    return attach_ledger_methods(FakeDoc(**payload))
            if len(args) == 2 and args[0] == "Sales Invoice":
                return submitted_docs[args[1]]
            if len(args) == 2 and args[0] == "POS Invoice Submission Ledger":
                return ledger_rows[args[1]]
            raise AssertionError(f"unexpected get_doc call: {args}")

        def fake_get_value(doctype, filters=None, fieldname=None, **kwargs):
            if doctype == "POS Invoice Submission Ledger" and isinstance(filters, dict):
                for row in ledger_rows.values():
                    if all(row.get(key) == value for key, value in filters.items()):
                        return row.name
                return None
            return 0

        self.creation.frappe.db.has_column = lambda doctype, fieldname: not (
            doctype in {"Sales Invoice", "POS Invoice"} and fieldname == "posa_client_request_id"
        )
        self.creation.frappe.db.get_value = fake_get_value
        self.creation.frappe.db.exists = (
            lambda doctype, name: doctype == "Sales Invoice" and name in submitted_docs
        )
        self.creation.frappe.get_value = lambda *args, **kwargs: 0
        self.creation.frappe.get_doc = fake_get_doc
        self.creation.update_invoice = fake_update_invoice
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc
        self.creation._apply_invoice_gift_card_settlement = lambda *args, **kwargs: None

        payload = {
            "doctype": "Sales Invoice",
            "pos_profile": "Main POS",
            "company": "Test Company",
            "currency": "USD",
            "customer": "CUST-0001",
            "items": [],
            "payments": [],
            "posa_client_request_id": "ledger-fixed-001",
        }
        data = {"idempotency_key": "ledger-fixed-001"}

        first = self.creation.submit_invoice(
            json.dumps(payload),
            json.dumps(data),
            submit_in_background=0,
        )
        second = self.creation.submit_invoice(
            json.dumps(payload),
            json.dumps(data),
            submit_in_background=0,
        )

        self.assertEqual(first["name"], "ACC-SINV-LEDGER-0001")
        self.assertEqual(second["name"], "ACC-SINV-LEDGER-0001")
        self.assertEqual(len(ledger_rows), 1)
        self.assertEqual(next(iter(ledger_rows.values())).state, "POST_SUBMIT_DONE")
        self.assertTrue(second["replayed"])
        self.assertTrue(second["idempotent"])
        self.assertEqual(submit_count["value"], 1)
        self.assertEqual(len(submitted_docs), 1)

    def test_submit_invoice_waits_for_active_duplicate_submission_ledger(self):
        ledger_doc = FakeDoc(
            doctype="POS Invoice Submission Ledger",
            name="ledger-active-001",
            ledger_key="ledger-active-001",
            client_request_id="ledger-active-001",
            company="Test Company",
            pos_profile="Main POS",
            document_type="Sales Invoice",
            state="RECEIVED",
        )

        def fake_get_value(doctype, filters=None, fieldname=None, **kwargs):
            if doctype == "POS Invoice Submission Ledger":
                return ledger_doc.name
            return 0

        def wait_for_result(active_ledger):
            self.assertIs(active_ledger, ledger_doc)
            return {
                "name": "ACC-SINV-ACTIVE-0001",
                "status": 1,
                "docstatus": 1,
                "doctype": "Sales Invoice",
                "replayed": True,
                "idempotent": True,
                "ledger_state": "POST_SUBMIT_DONE",
                "client_request_id": "ledger-active-001",
            }

        self.creation.frappe.db.has_column = lambda doctype, fieldname: True
        self.creation.frappe.db.get_value = fake_get_value
        self.creation.frappe.get_doc = lambda doctype, name: ledger_doc
        self.creation.frappe.get_value = lambda *args, **kwargs: 0
        self.creation.update_invoice = Mock(side_effect=AssertionError("duplicate request must not create a draft"))
        self.creation._wait_for_submission_ledger_result = wait_for_result

        result = self.creation.submit_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "customer": "CUST-0001",
                    "items": [],
                    "payments": [],
                    "posa_client_request_id": "ledger-active-001",
                }
            ),
            json.dumps({"idempotency_key": "ledger-active-001"}),
            submit_in_background=0,
        )

        self.assertEqual(result["name"], "ACC-SINV-ACTIVE-0001")
        self.assertTrue(result["replayed"])
        self.creation.update_invoice.assert_not_called()

    def test_submit_invoice_fast_queues_existing_draft_for_background_submission(self):
        ledger_rows = {}
        enqueued = {}
        draft_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-DRAFT-0001",
            docstatus=0,
            pos_profile="Main POS",
            company="Test Company",
        )
        opening_doc = FakeDoc(
            name="POS-OPEN-0001",
            pos_profile="Main POS",
            company="Test Company",
            user="test@example.com",
            docstatus=1,
            status="Open",
            pos_closing_shift=None,
        )

        def attach_ledger_methods(ledger_doc):
            def insert(ignore_permissions=False):
                ledger_doc.name = ledger_doc.get("name") or ledger_doc.ledger_key
                ledger_rows[ledger_doc.name] = ledger_doc
                return ledger_doc

            def save(ignore_permissions=False):
                ledger_rows[ledger_doc.name] = ledger_doc
                return ledger_doc

            ledger_doc.insert = insert
            ledger_doc.save = save
            return ledger_doc

        def fake_get_doc(*args):
            if len(args) == 1 and isinstance(args[0], dict):
                payload = dict(args[0])
                if payload.get("doctype") == "POS Invoice Submission Ledger":
                    return attach_ledger_methods(FakeDoc(**payload))
            if args == ("Sales Invoice", "ACC-SINV-DRAFT-0001"):
                return draft_doc
            if args == ("POS Opening Shift", "POS-OPEN-0001"):
                return opening_doc
            raise AssertionError(f"unexpected get_doc call: {args}")

        def fake_get_value(doctype, filters=None, fieldname=None, **kwargs):
            if doctype == "POS Invoice Submission Ledger" and isinstance(filters, dict):
                for row in ledger_rows.values():
                    if all(row.get(key) == value for key, value in filters.items()):
                        return row.name
                return None
            return 1 if doctype == "POS Profile" and fieldname == "posa_allow_submissions_in_background_job" else 0

        def fake_enqueue(**kwargs):
            enqueued.update(kwargs)

        self.creation.frappe.db.has_column = lambda doctype, fieldname: True
        self.creation.frappe.db.get_value = fake_get_value
        self.creation.frappe.db.exists = (
            lambda doctype, name: doctype == "Sales Invoice" and name == "ACC-SINV-DRAFT-0001"
        )
        self.creation.frappe.get_doc = fake_get_doc
        self.creation.frappe.get_value = fake_get_value
        self.creation.enqueue = fake_enqueue
        self.creation._validate_invoice_opening_shift = self.real_validate_invoice_opening_shift
        self.creation.update_invoice = Mock(side_effect=AssertionError("fast background path must not update draft synchronously"))

        result = self.creation.submit_invoice(
            json.dumps(
                {
                    "doctype": "Sales Invoice",
                    "name": "ACC-SINV-DRAFT-0001",
                    "pos_profile": "Main POS",
                    "company": "Test Company",
                    "currency": "USD",
                    "customer": "CUST-0001",
                    "items": [],
                    "payments": [],
                    "posa_client_request_id": "ledger-fast-001",
                    "posa_pos_opening_shift": "POS-OPEN-0001",
                }
            ),
            json.dumps({"idempotency_key": "ledger-fast-001"}),
            submit_in_background=1,
        )

        self.assertEqual(result["name"], "ACC-SINV-DRAFT-0001")
        self.assertEqual(result["docstatus"], 0)
        self.assertTrue(result["queued"])
        self.assertEqual(len(ledger_rows), 1)
        ledger_doc = next(iter(ledger_rows.values()))
        self.assertEqual(ledger_doc.state, "DRAFT_CREATED")
        self.assertEqual(ledger_doc.invoice_name, "ACC-SINV-DRAFT-0001")
        self.assertEqual(enqueued["method"], self.creation.submit_payload_in_background_job)
        self.assertEqual(enqueued["kwargs"]["ledger_name"], ledger_doc.name)
        self.assertEqual(enqueued["kwargs"]["opening_shift"], "POS-OPEN-0001")
        self.assertEqual(enqueued["kwargs"]["opening_user"], "test@example.com")
        self.creation.update_invoice.assert_not_called()

    def test_save_submission_ledger_inserts_named_new_doc(self):
        calls = {"insert": 0, "save": 0}
        ledger_doc = FakeDoc(
            doctype="POS Invoice Submission Ledger",
            name="ledger-key-001",
            ledger_key="ledger-key-001",
            client_request_id="request-001",
        )
        ledger_doc.is_new = lambda: True

        def insert(ignore_permissions=False):
            calls["insert"] += 1
            return ledger_doc

        def save(ignore_permissions=False):
            calls["save"] += 1
            raise AssertionError("new named ledger docs must be inserted, not saved")

        ledger_doc.insert = insert
        ledger_doc.save = save

        result = self.creation._save_submission_ledger(ledger_doc)

        self.assertIs(result, ledger_doc)
        self.assertEqual(calls["insert"], 1)
        self.assertEqual(calls["save"], 0)

    def test_post_submit_without_payment_work_ignores_missing_ledger(self):
        self.creation.frappe.db.exists = lambda doctype, name: False
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-0001",
            docstatus=1,
        )

        self.creation._process_post_submit_payments(
            invoice_doc,
            {},
            0,
            0,
            None,
            [],
            False,
            None,
            "missing-ledger-name",
        )

    def test_repair_incomplete_submission_ledger_reconciles_submitted_invoice(self):
        ledger_doc = FakeDoc(
            doctype="POS Invoice Submission Ledger",
            name="ledger-repair-001",
            ledger_key="ledger-repair-001",
            client_request_id="ledger-repair-001",
            company="Test Company",
            pos_profile="Main POS",
            document_type="Sales Invoice",
            invoice_name="ACC-SINV-REPAIR-0001",
            state="SUBMITTED",
            request_data=json.dumps({}),
            payment_context=json.dumps({}),
        )
        ledger_doc.save = lambda ignore_permissions=False: ledger_doc
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-REPAIR-0001",
            docstatus=1,
            pos_profile="Main POS",
            company="Test Company",
        )

        def fake_get_value(doctype, filters=None, fieldname=None, **kwargs):
            if doctype == "POS Invoice Submission Ledger":
                return ledger_doc.name
            return None

        def fake_get_doc(doctype, name):
            if doctype == "POS Invoice Submission Ledger":
                return ledger_doc
            if doctype == "POS Profile":
                return AttrDict(name="Main POS", company="Test Company")
            if doctype == "Sales Invoice":
                return invoice_doc
            raise AssertionError(f"unexpected get_doc call: {(doctype, name)}")

        self.creation.frappe.db.get_value = fake_get_value
        self.creation.frappe.db.exists = (
            lambda doctype, name: doctype == "Sales Invoice" and name == "ACC-SINV-REPAIR-0001"
        )
        self.creation.frappe.get_doc = fake_get_doc
        self.creation._process_post_submit_payments = lambda *args, **kwargs: None

        result = self.creation.repair_invoice_submission(
            client_request_id="ledger-repair-001",
            company="Test Company",
            pos_profile="Main POS",
            document_type="Sales Invoice",
        )

        self.assertEqual(result["name"], "ACC-SINV-REPAIR-0001")
        self.assertEqual(result["ledger_state"], "POST_SUBMIT_DONE")
        self.assertTrue(result["repaired"])

    def test_background_submit_updates_existing_submission_ledger(self):
        ledger_doc = FakeDoc(
            doctype="POS Invoice Submission Ledger",
            name="ledger-background-001",
            ledger_key="ledger-background-001",
            client_request_id="ledger-background-001",
            company="Test Company",
            pos_profile="Main POS",
            document_type="Sales Invoice",
            invoice_name="ACC-SINV-BG-0001",
            state="DRAFT_CREATED",
            request_data=json.dumps({}),
            payment_context=json.dumps({}),
        )
        ledger_doc.save = lambda ignore_permissions=False: ledger_doc
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-BG-0001",
            docstatus=0,
            pos_profile="Main POS",
            company="Test Company",
            currency="USD",
            customer="CUST-0001",
            is_return=0,
            items=[],
            payments=[],
            taxes=[],
            flags=types.SimpleNamespace(ignore_permissions=False),
            redeem_loyalty_points=0,
            loyalty_program=None,
            cost_center=None,
            write_off_amount=0,
            rounded_total=0,
            grand_total=0,
            remarks="",
        )
        invoice_doc.submit = lambda: setattr(invoice_doc, "docstatus", 1)

        def fake_get_doc(doctype, name):
            if doctype == "POS Invoice Submission Ledger":
                return ledger_doc
            if doctype == "POS Profile":
                return AttrDict(name="Main POS", company="Test Company")
            if doctype == "Sales Invoice":
                return invoice_doc
            raise AssertionError(f"unexpected get_doc call: {(doctype, name)}")

        self.creation.frappe.get_doc = fake_get_doc
        self.creation.frappe.db.get_value = lambda *args, **kwargs: 0
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc
        self.creation._apply_invoice_gift_card_settlement = lambda *args, **kwargs: None

        self.creation.submit_in_background_job(
            {
                "invoice": "ACC-SINV-BG-0001",
                "doctype": "Sales Invoice",
                "data": {},
                "is_payment_entry": 0,
                "total_cash": 0,
                "cash_account": None,
                "payments": [],
                "ledger_name": "ledger-background-001",
                "opening_shift": "POS-OPEN-0001",
                "opening_user": "test@example.com",
            }
        )

        self.assertEqual(invoice_doc.docstatus, 1)
        self.assertEqual(ledger_doc.state, "POST_SUBMIT_DONE")

    def test_background_submit_marks_ledger_failed_when_post_submit_work_crashes(self):
        ledger_doc = FakeDoc(
            doctype="POS Invoice Submission Ledger",
            name="ledger-background-failed-001",
            ledger_key="ledger-background-failed-001",
            client_request_id="ledger-background-failed-001",
            company="Test Company",
            pos_profile="Main POS",
            document_type="Sales Invoice",
            invoice_name="ACC-SINV-BG-FAIL-0001",
            state="DRAFT_CREATED",
            request_data=json.dumps({}),
            payment_context=json.dumps({}),
            error_message=None,
        )
        ledger_doc.save = lambda ignore_permissions=False: ledger_doc
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="ACC-SINV-BG-FAIL-0001",
            docstatus=0,
            pos_profile="Main POS",
            company="Test Company",
            currency="USD",
            customer="CUST-0001",
            is_return=0,
            items=[],
            payments=[],
            taxes=[],
            flags=types.SimpleNamespace(ignore_permissions=False),
            redeem_loyalty_points=0,
            loyalty_program=None,
            cost_center=None,
            write_off_amount=0,
            rounded_total=0,
            grand_total=0,
            remarks="",
        )
        invoice_doc.submit = lambda: setattr(invoice_doc, "docstatus", 1)

        def fake_get_doc(doctype, name):
            if doctype == "POS Invoice Submission Ledger":
                return ledger_doc
            if doctype == "POS Profile":
                return AttrDict(name="Main POS", company="Test Company")
            if doctype == "Sales Invoice":
                return invoice_doc
            raise AssertionError(f"unexpected get_doc call: {(doctype, name)}")

        self.creation.frappe.get_doc = fake_get_doc
        self.creation.frappe.db.get_value = lambda *args, **kwargs: 0
        self.creation._save_draft_with_latest_timestamp = lambda doc: doc
        self.creation._apply_invoice_gift_card_settlement = lambda *args, **kwargs: None
        self.creation._process_post_submit_payments = lambda *args, **kwargs: (_ for _ in ()).throw(
            Exception("post submit failed")
        )

        self.creation.submit_in_background_job(
            {
                "invoice": "ACC-SINV-BG-FAIL-0001",
                "doctype": "Sales Invoice",
                "data": {},
                "is_payment_entry": 0,
                "total_cash": 0,
                "cash_account": None,
                "payments": [],
                "ledger_name": "ledger-background-failed-001",
                "user": "cashier@example.com",
                "opening_shift": "POS-OPEN-0001",
                "opening_user": "test@example.com",
            }
        )

        self.assertEqual(invoice_doc.docstatus, 1)
        self.assertEqual(ledger_doc.state, "FAILED")
        self.assertIn("post submit failed", ledger_doc.error_message)


class TestInvoiceDeadlockRetry(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        cls.creation = _load_module()

    def test_retries_whole_transaction_after_query_deadlock(self):
        attempts = []
        rollback = Mock()
        sleep = Mock()
        self.creation.frappe.db.rollback = rollback
        self.creation.time.sleep = sleep

        def operation():
            attempts.append(len(attempts) + 1)
            if len(attempts) < 3:
                raise self.creation.QueryDeadlockError("tabCompany conflict")
            return {"docstatus": 1}

        result = self.creation._run_with_deadlock_retry(
            operation,
            delays=(0.01, 0.02),
        )

        self.assertEqual(result, {"docstatus": 1})
        self.assertEqual(attempts, [1, 2, 3])
        self.assertEqual(rollback.call_count, 2)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [0.01, 0.02])


if __name__ == "__main__":
    unittest.main()
