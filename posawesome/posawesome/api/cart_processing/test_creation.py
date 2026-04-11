import importlib.util
import json
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]


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

    def set_missing_values(self):
        return None

    def calculate_taxes_and_totals(self):
        return None


class FakeDoc:
    def __init__(self, **kwargs):
        object.__setattr__(self, "_data", dict(kwargs))
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

    def set_missing_values(self):
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

    frappe_utils.cint = lambda value: int(value or 0)
    frappe_utils.flt = lambda value, precision=None: round(float(value or 0), precision or 2)
    frappe_utils.getdate = lambda value: value
    frappe_utils.nowdate = lambda: "2026-03-21"
    frappe_utils.money_in_words = lambda value, currency=None: f"{value} {currency or ''}".strip()

    frappe_module._dict = _FrappeDict
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
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
    )
    frappe_module.get_doc = lambda *args, **kwargs: None
    frappe_module.publish_realtime = lambda *args, **kwargs: publish_realtime_calls.append(
        {"args": args, "kwargs": kwargs}
    )
    frappe_module.session = types.SimpleNamespace(user="test@example.com")

    frappe_exceptions.TimestampMismatchError = TimestampMismatchError
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

    processing_utils = types.ModuleType("posawesome.posawesome.api.cart_processing.utils")
    processing_utils._get_return_validity_settings = lambda *_args, **_kwargs: (False, 0)
    processing_utils._validate_return_window = lambda *_args, **_kwargs: None
    processing_utils._resolve_effective_price_list = lambda *_args, **_kwargs: None
    processing_utils._build_invoice_remarks = lambda *_args, **_kwargs: ""
    processing_utils._set_return_valid_upto = lambda *_args, **_kwargs: None
    processing_utils.get_latest_rate = lambda *_args, **_kwargs: (1, "2026-03-21")
    sys.modules["posawesome.posawesome.api.cart_processing.utils"] = processing_utils

    stock_module = types.ModuleType("posawesome.posawesome.api.cart_processing.stock")
    stock_module._strip_client_freebies_from_payload = lambda *_args, **_kwargs: None
    stock_module._validate_stock_on_invoice = lambda *_args, **_kwargs: None
    stock_module._apply_item_name_overrides = lambda *_args, **_kwargs: None
    stock_module._deduplicate_free_items = lambda *_args, **_kwargs: None
    stock_module._merge_duplicate_taxes = lambda *_args, **_kwargs: None
    stock_module._auto_set_return_batches = lambda *_args, **_kwargs: None
    stock_module._collect_stock_errors = lambda *_args, **_kwargs: []
    stock_module._should_block = lambda *_args, **_kwargs: False
    sys.modules["posawesome.posawesome.api.cart_processing.stock"] = stock_module

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


def _install_package_stubs():
    package_paths = {
        "posawesome": REPO_ROOT / "posawesome",
        "posawesome.posawesome": REPO_ROOT / "posawesome" / "posawesome",
        "posawesome.posawesome.api": REPO_ROOT / "posawesome" / "posawesome" / "api",
        "posawesome.posawesome.api.cart_processing": (
            REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoice_processing"
        ),
    }
    for name, path in package_paths.items():
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module


def _load_module():
    module_name = "posawesome.posawesome.api.cart_processing.creation"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "invoice_processing" / "creation.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestUpdateInvoiceReturnPayments(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        cls.creation = _load_module()

    def setUp(self):
        self.enqueue_calls.clear()
        self.frappe._publish_realtime_calls.clear()

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
            items=[],
            payments=[
                FakeDoc(
                    amount=125,
                    base_amount=None,
                )
            ],
            taxes=[],
            flags=types.SimpleNamespace(ignore_pricing_rule=False, ignore_permissions=False),
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


class TestStaleNamedInvoiceHandling(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frappe, cls.enqueue_calls = _install_framework_stubs()
        _install_dependency_stubs()
        _install_package_stubs()
        cls.creation = _load_module()

    def setUp(self):
        self.enqueue_calls.clear()
        self.frappe._publish_realtime_calls.clear()

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

        self.creation.frappe.db.exists = (
            lambda doctype, name:
                (doctype == "Sales Invoice" and name == "SINV-OLD")
                or (doctype == "Customer" and name == "CUST-NEW")
        )
        self.creation.frappe.get_doc = fake_get_doc
        self.creation.frappe.get_cached_value = lambda *args, **kwargs: 0
        self.creation.frappe.db.get_value = (
            lambda doctype, name, fieldname=None, **kwargs:
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
        self.creation.frappe.db.get_value = (
            lambda doctype, name, fieldname=None, **kwargs:
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
        self.creation.frappe.db.get_value = (
            lambda doctype, name, fieldname=None, **kwargs:
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
        cls.creation = _load_module()

    def setUp(self):
        self.enqueue_calls.clear()
        self.frappe._publish_realtime_calls.clear()

    def test_process_post_submit_payments_runs_inline_when_async_disabled(self):
        calls = []
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-0001",
            pos_profile="Main POS",
            company="Test Company",
        )

        original_runner = self.creation._run_post_submit_payments
        self.creation._run_post_submit_payments = (
            lambda *args, **kwargs: calls.append(("run", args))
        )

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

        payment_module_name = "posawesome.posawesome.api.cart_processing.payment"
        payment_module = types.ModuleType(payment_module_name)
        captured_calls = []
        payment_module._create_change_payment_entries = (
            lambda *args, **kwargs: captured_calls.append((args, kwargs))
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
                {
                    "gift_card_redemptions": [
                        {"gift_card_code": "GC-0001", "amount": 150}
                    ]
                }
            )
        )

    def test_apply_invoice_gift_card_settlement_delegates_before_submit(self):
        invoice_doc = FakeDoc(
            doctype="Sales Invoice",
            name="SINV-0006",
            pos_profile="Main POS",
            company="Test Company",
        )

        payment_module_name = "posawesome.posawesome.api.cart_processing.payment"
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

        payment_module_name = "posawesome.posawesome.api.cart_processing.payment"
        payment_module = types.ModuleType(payment_module_name)
        payment_module._create_change_payment_entries = lambda *args, **kwargs: None
        sys.modules[payment_module_name] = payment_module

        gift_card_module_name = "posawesome.posawesome.api.gift_cards"
        gift_card_calls = []
        gift_card_module = types.ModuleType(gift_card_module_name)
        gift_card_module.apply_invoice_gift_card_redemptions = (
            lambda *args, **kwargs: gift_card_calls.append((args, kwargs))
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
        self.creation._run_post_submit_payments = (
            lambda *args, **kwargs: calls.append(("run", args))
        )

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


if __name__ == "__main__":
    unittest.main()
