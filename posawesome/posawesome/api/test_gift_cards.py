import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


class FakeGiftCard:
    def __init__(self, code="GC-0001", balance=0, status="Active"):
        self.doctype = "POS Gift Card"
        self.name = code
        self.gift_card_code = code
        self.company = "Test Company"
        self.currency = "PKR"
        self.current_balance = balance
        self.status = status
        self.transactions = []
        self.flags = types.SimpleNamespace(ignore_permissions=False)
        self.saved = False

    def append(self, fieldname, value):
        target = getattr(self, fieldname)
        row = dict(value)
        target.append(row)
        return row

    def save(self, ignore_permissions=False):
        self.saved = True
        return self


class FakeJournalEntry:
    def __init__(self, payload=None):
        payload = payload or {}
        self.doctype = payload.get("doctype", "Journal Entry")
        self.voucher_type = payload.get("voucher_type", "Journal Entry")
        self.posting_date = payload.get("posting_date")
        self.company = payload.get("company")
        self.user_remark = payload.get("user_remark")
        self.accounts = []
        self.flags = types.SimpleNamespace(ignore_permissions=False)
        self.saved = False
        self.submitted = False

    def append(self, fieldname, value):
        target = getattr(self, fieldname)
        row = dict(value)
        target.append(row)
        return row

    def set_missing_values(self):
        return None

    def save(self, ignore_permissions=False):
        self.saved = True
        return self

    def submit(self):
        self.submitted = True
        return self


def _install_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_utils_module = types.ModuleType("frappe.utils")
    employees_module = types.ModuleType("posawesome.posawesome.api.employees")
    utilities_module = types.ModuleType("posawesome.posawesome.api.utilities")

    state = {
        "cards": {},
        "new_docs": [],
        "journal_entries": [],
        "terminal_users": {"Main POS": ["supervisor@example.com", "cashier@example.com"]},
        "user_docs": {
            "supervisor@example.com": types.SimpleNamespace(
                name="supervisor@example.com",
                full_name="Supervisor",
                enabled=1,
                posa_is_pos_supervisor=1,
            ),
            "cashier@example.com": types.SimpleNamespace(
                name="cashier@example.com",
                full_name="Cashier",
                enabled=1,
                posa_is_pos_supervisor=0,
            ),
        },
        "invoices": {
            "ACC-SINV-0001": types.SimpleNamespace(
                doctype="Sales Invoice",
                name="ACC-SINV-0001",
                company="Test Company",
                posting_date="2026-04-05",
                pos_profile="Main POS",
                debit_to="1310 - Debtors - TC",
                customer="CUST-0001",
            )
        },
        "pos_profiles": {
            "Main POS": types.SimpleNamespace(
                name="Main POS",
                company="Test Company",
                cost_center="Main - TC",
                posa_default_source_account="1110 - Cash - TC",
                posa_gift_card_liability_account="2190 - Gift Card Liability - TC",
            )
        },
        "companies": {
            "Test Company": types.SimpleNamespace(
                name="Test Company",
                default_cash_account="1110 - Cash - TC",
                cost_center="Main - TC",
            )
        },
    }

    frappe_module._ = lambda text: text
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.generate_hash = lambda: "GCODE12345"
    frappe_module.utils = types.SimpleNamespace(now_datetime=lambda: "2026-04-05 12:00:00")
    frappe_utils_module.nowdate = lambda: "2026-04-05"
    frappe_module.session = types.SimpleNamespace(user="administrator@example.com")

    def _new_doc(doctype):
        if doctype != "POS Gift Card":
            raise AssertionError(f"Unexpected doctype: {doctype}")
        doc = FakeGiftCard(code=f"GC-{len(state['new_docs']) + 1:04d}")
        state["new_docs"].append(doc)
        return doc

    def _get_doc(doctype, name=None):
        if isinstance(doctype, dict):
            if doctype.get("doctype") == "Journal Entry":
                entry = FakeJournalEntry(doctype)
                state["journal_entries"].append(entry)
                return entry
            raise AssertionError(f"Unexpected dict get_doc doctype: {doctype.get('doctype')}")
        if doctype == "POS Gift Card":
            if name not in state["cards"]:
                raise AssertionError(f"Unknown gift card: {name}")
            return state["cards"][name]
        if doctype == "User":
            if name not in state["user_docs"]:
                raise AssertionError(f"Unknown user: {name}")
            return state["user_docs"][name]
        if doctype == "Sales Invoice":
            if name not in state["invoices"]:
                raise AssertionError(f"Unknown invoice: {name}")
            return state["invoices"][name]
        raise AssertionError(f"Unexpected get_doc doctype: {doctype}")

    frappe_module.new_doc = _new_doc
    frappe_module.get_doc = _get_doc
    frappe_module.get_cached_doc = (
        lambda doctype, name: state["pos_profiles"][name]
        if doctype == "POS Profile"
        else state["companies"][name]
    )
    frappe_module.get_value = (
        lambda doctype, name, fieldname:
            getattr(state["pos_profiles"][name], fieldname, None)
            if doctype == "POS Profile"
            else getattr(state["companies"][name], fieldname, None)
    )
    frappe_module.flags = types.SimpleNamespace(ignore_account_permission=False)
    frappe_module.db = types.SimpleNamespace(
        exists=lambda doctype, name=None: bool(
            doctype == "POS Gift Card"
            and (
                (isinstance(name, dict) and name.get("gift_card_code") in state["cards"])
                or (isinstance(name, str) and name in state["cards"])
            )
        )
    )

    employees_module._resolve_profile_name = lambda pos_profile=None: str(pos_profile or "").strip()
    employees_module._ensure_terminal_user = lambda profile_name, user: state["terminal_users"].get(profile_name, [])
    employees_module._get_user_doc = lambda user: state["user_docs"][user]
    employees_module._is_pos_supervisor = lambda user_doc: bool(
        getattr(user_doc, "posa_is_pos_supervisor", 0)
    )
    utilities_module.ensure_child_doctype = lambda *args, **kwargs: None

    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils_module
    sys.modules["posawesome.posawesome.api.employees"] = employees_module
    sys.modules["posawesome.posawesome.api.utilities"] = utilities_module
    return state


def _install_package_stubs():
    package_paths = {
        "posawesome": REPO_ROOT / "posawesome",
        "posawesome.posawesome": REPO_ROOT / "posawesome" / "posawesome",
        "posawesome.posawesome.api": REPO_ROOT / "posawesome" / "posawesome" / "api",
    }
    for name, path in package_paths.items():
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module


def _load_module():
    module_name = "posawesome.posawesome.api.gift_cards"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "gift_cards.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestGiftCardApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.state = _install_stubs()
        _install_package_stubs()
        cls.module = _load_module()

    def setUp(self):
        self.state["cards"].clear()
        self.state["new_docs"].clear()
        self.state["journal_entries"].clear()

    def test_issue_gift_card_requires_supervisor(self):
        with self.assertRaises(Exception) as ctx:
            self.module.issue_gift_card(
                pos_profile="Main POS",
                cashier="cashier@example.com",
                company="Test Company",
                initial_amount=500,
                gift_card_code="GC-NEW-01",
            )

        self.assertIn("POS supervisor", str(ctx.exception))

    def test_top_up_updates_balance_and_transaction_history(self):
        existing = FakeGiftCard(code="GC-0001", balance=500, status="Active")
        self.state["cards"][existing.gift_card_code] = existing

        result = self.module.top_up_gift_card(
            pos_profile="Main POS",
            cashier="supervisor@example.com",
            gift_card_code="GC-0001",
            amount=250,
        )

        self.assertEqual(result["gift_card_code"], "GC-0001")
        self.assertEqual(result["current_balance"], 750)
        self.assertEqual(len(existing.transactions), 1)
        self.assertEqual(existing.transactions[0]["transaction_type"], "Top Up")
        self.assertEqual(existing.transactions[0]["amount"], 250)
        self.assertEqual(existing.transactions[0]["balance_after"], 750)
        self.assertEqual(len(self.state["journal_entries"]), 1)
        self.assertTrue(self.state["journal_entries"][0].submitted)
        self.assertEqual(
            self.state["journal_entries"][0].accounts[0]["account"],
            "1110 - Cash - TC",
        )
        self.assertEqual(
            self.state["journal_entries"][0].accounts[1]["account"],
            "2190 - Gift Card Liability - TC",
        )

    def test_redeem_gift_card_records_invoice_reference(self):
        existing = FakeGiftCard(code="GC-0002", balance=800, status="Active")
        self.state["cards"][existing.gift_card_code] = existing

        result = self.module.redeem_gift_card(
            gift_card_code="GC-0002",
            amount=300,
            invoice_doctype="Sales Invoice",
            invoice_name="ACC-SINV-0001",
            cashier="cashier@example.com",
            company="Test Company",
        )

        self.assertEqual(result["current_balance"], 500)
        self.assertEqual(len(existing.transactions), 1)
        self.assertEqual(existing.transactions[0]["transaction_type"], "Redeem")
        self.assertEqual(existing.transactions[0]["reference_doctype"], "Sales Invoice")
        self.assertEqual(existing.transactions[0]["reference_name"], "ACC-SINV-0001")
        self.assertEqual(len(self.state["journal_entries"]), 1)
        self.assertEqual(
            self.state["journal_entries"][0].accounts[0]["account"],
            "2190 - Gift Card Liability - TC",
        )
        self.assertEqual(
            self.state["journal_entries"][0].accounts[1]["reference_name"],
            "ACC-SINV-0001",
        )

    def test_redeem_gift_card_blocks_inactive_card(self):
        existing = FakeGiftCard(code="GC-0003", balance=800, status="Inactive")
        self.state["cards"][existing.gift_card_code] = existing

        with self.assertRaises(Exception) as ctx:
            self.module.redeem_gift_card(
                gift_card_code="GC-0003",
                amount=100,
                invoice_doctype="Sales Invoice",
                invoice_name="ACC-SINV-0002",
                cashier="cashier@example.com",
                company="Test Company",
            )

        self.assertIn("active gift cards", str(ctx.exception))

    def test_issue_gift_card_with_initial_amount_creates_liability_entry(self):
        result = self.module.issue_gift_card(
            pos_profile="Main POS",
            cashier="supervisor@example.com",
            company="Test Company",
            initial_amount=500,
            gift_card_code="GC-ISSUE-01",
        )

        self.assertEqual(result["current_balance"], 500)
        self.assertEqual(len(self.state["journal_entries"]), 1)
        self.assertEqual(
            self.state["journal_entries"][0].accounts[0]["account"],
            "1110 - Cash - TC",
        )
        self.assertEqual(
            self.state["journal_entries"][0].accounts[1]["account"],
            "2190 - Gift Card Liability - TC",
        )


if __name__ == "__main__":
    unittest.main()
