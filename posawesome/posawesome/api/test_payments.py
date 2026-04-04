import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]


class FakeChildRow(dict):
    def update(self, other=None, **kwargs):
        if other:
            super().update(other)
        if kwargs:
            super().update(kwargs)
        return self

    def __getattr__(self, item):
        try:
            return self[item]
        except KeyError as exc:
            raise AttributeError(item) from exc


class FakePaymentEntry:
    def __init__(self):
        self.references = []
        self.flags = types.SimpleNamespace(ignore_permissions=False, submitted=True)
        self.name = "ACC-PAY-TEST-0001"
        self.docstatus = 1

    def update(self, other=None, **kwargs):
        if other:
            for key, value in other.items():
                setattr(self, key, value)
        for key, value in kwargs.items():
            setattr(self, key, value)
        return self

    def append(self, fieldname, value):
        row = FakeChildRow()
        if isinstance(value, dict):
            row.update(value)
        getattr(self, fieldname).append(row)
        return row

    def setup_party_account_field(self):
        return None

    def set_missing_values(self):
        return None

    def set_amounts(self):
        return None

    def save(self):
        return None

    def submit(self):
        self.docstatus = 1
        self.flags.submitted = True
        return None


def _install_stubs():
    frappe_module = types.ModuleType("frappe")
    frappe_utils = types.ModuleType("frappe.utils")
    accounts_party = types.ModuleType("erpnext.accounts.party")
    accounts_utils = types.ModuleType("erpnext.accounts.utils")
    payment_request_module = types.ModuleType(
        "erpnext.accounts.doctype.payment_request.payment_request"
    )
    utilities_module = types.ModuleType("posawesome.posawesome.api.utilities")

    created_docs = []
    get_all_responses = {}
    sql_responses = []
    get_doc_responses = {}
    reconcile_calls = []

    frappe_utils.nowdate = lambda: "2026-03-26"
    frappe_utils.flt = lambda value, precision=None: round(
        float(value or 0), precision or 2
    )

    frappe_module._ = lambda text: text
    frappe_module._dict = lambda payload=None, **kwargs: FakeChildRow(
        dict(payload or {}, **kwargs)
    )
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_module.flags = types.SimpleNamespace(ignore_account_permission=False)
    frappe_module.get_value = lambda *args, **kwargs: "Main - CC"
    frappe_module.db = types.SimpleNamespace(
        get_value=lambda *args, **kwargs: None,
        sql=lambda *args, **kwargs: list(sql_responses),
    )

    def _matches_filters(row, filters):
        if not filters:
            return True

        for key, expected in filters.items():
            actual = getattr(row, key, None)
            if isinstance(expected, (list, tuple)) and len(expected) == 2:
                operator, value = expected
                if operator == ">" and not actual > value:
                    return False
                if operator == "<" and not actual < value:
                    return False
            elif actual != expected:
                return False
        return True

    def _get_all(doctype, filters=None, fields=None, **kwargs):
        rows = list(get_all_responses.get(doctype, []))
        return [row for row in rows if _matches_filters(row, filters or {})]

    frappe_module.get_all = _get_all

    def _make_payment_entry():
        doc = FakePaymentEntry()
        created_docs.append(doc)
        return doc

    frappe_module.new_doc = lambda doctype: _make_payment_entry()

    def _get_doc(*args):
        if len(args) == 2:
            return get_doc_responses[(args[0], args[1])]

        payload = args[0]
        doc = _make_payment_entry()
        if isinstance(payload, dict):
            doc.update(payload)
        return doc

    frappe_module.get_doc = _get_doc
    def _reconcile_against_document(args, *extra, **kwargs):
        for row in args:
            # Mirror ERPNext's attribute-style access contract.
            _ = row.voucher_type
            _ = row.voucher_no
        reconcile_calls.append(
            {
                "args": args,
                "extra": extra,
                "kwargs": kwargs,
            }
        )

    accounts_utils.reconcile_against_document = _reconcile_against_document

    accounts_party.get_party_bank_account = lambda *args, **kwargs: None
    payment_request_module.get_dummy_message = lambda *_args, **_kwargs: ""
    payment_request_module.get_existing_payment_request_amount = (
        lambda *_args, **_kwargs: 0
    )
    utilities_module.ensure_child_doctype = lambda *_args, **_kwargs: None

    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils
    sys.modules["erpnext.accounts.party"] = accounts_party
    sys.modules["erpnext.accounts.utils"] = accounts_utils
    sys.modules[
        "erpnext.accounts.doctype.payment_request.payment_request"
    ] = payment_request_module
    sys.modules["posawesome.posawesome.api.utilities"] = utilities_module

    return created_docs, get_all_responses, sql_responses, get_doc_responses, reconcile_calls


def _load_payments_module():
    module_name = "posawesome.posawesome.api.payments"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "payments.py"
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestRedeemingCustomerCredit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (
            cls.created_docs,
            cls.get_all_responses,
            cls.sql_responses,
            cls.get_doc_responses,
            cls.reconcile_calls,
        ) = _install_stubs()
        cls.payments_module = _load_payments_module()

    def setUp(self):
        self.created_docs.clear()
        self.get_all_responses.clear()
        self.sql_responses.clear()
        self.get_doc_responses.clear()
        self.reconcile_calls.clear()

    def test_advance_credit_overpayment_keeps_full_received_amount_and_allocates_only_due(self):
        invoice_doc = types.SimpleNamespace(
            customer="CUST-0001",
            debit_to="Debtors - TC",
            company="Test Company",
            pos_profile="Main POS",
            posa_pos_opening_shift="POS-OPEN-0001",
            name="SINV-0001",
        )
        data = {
            "redeemed_customer_credit": 50,
            "customer_credit_dict": [
                {
                    "type": "Advance",
                    "credit_origin": "ACC-PAY-0001",
                    "credit_to_redeem": 50,
                }
            ],
            "due_date": "2026-03-26",
        }
        payments = [
            types.SimpleNamespace(
                amount=10,
                account="Cash - TC",
                mode_of_payment="Cash",
            )
        ]

        created_entries = self.payments_module.redeeming_customer_credit(
            invoice_doc=invoice_doc,
            data=data,
            is_payment_entry=1,
            total_cash=6,
            cash_account={"account": "Cash - TC"},
            payments=payments,
        )

        self.assertEqual(len(self.created_docs), 1)
        payment_entry = self.created_docs[0]
        self.assertEqual(payment_entry.paid_amount, 10)
        self.assertEqual(payment_entry.received_amount, 10)
        self.assertEqual(payment_entry.docstatus, 1)
        self.assertTrue(payment_entry.flags.submitted)
        self.assertEqual(len(payment_entry.references), 1)
        self.assertEqual(payment_entry.references[0]["allocated_amount"], 6)
        self.assertEqual(
            created_entries,
            [
                {
                    "name": payment_entry.name,
                    "mode_of_payment": "Cash",
                    "account": "Cash - TC",
                    "paid_amount": 10,
                    "allocated_amount": 6,
                    "unallocated_amount": 4,
                }
            ],
        )

    def test_get_available_credit_excludes_pay_type_payment_entries(self):
        self.get_all_responses["Sales Invoice"] = []
        self.get_all_responses["Payment Entry"] = [
            types.SimpleNamespace(
                name="ACC-PAY-RECEIVE-0001",
                unallocated_amount=25,
                payment_type="Receive",
                party_type="Customer",
                party="CUST-0001",
                company="Test Company",
                docstatus=1,
            ),
            types.SimpleNamespace(
                name="ACC-PAY-PAY-0001",
                unallocated_amount=10,
                payment_type="Pay",
                party_type="Customer",
                party="CUST-0001",
                company="Test Company",
                docstatus=1,
            ),
        ]

        credits = self.payments_module.get_available_credit(
            customer="CUST-0001",
            company="Test Company",
        )

        self.assertEqual(
            credits,
            [
                {
                    "type": "Advance",
                    "credit_origin": "ACC-PAY-RECEIVE-0001",
                    "total_credit": 15.0,
                    "credit_to_redeem": 0,
                    "source_type": "Payment Entry",
                }
            ],
        )

    def test_get_available_credit_offsets_receive_advances_with_unallocated_pay_entries(self):
        self.get_all_responses["Sales Invoice"] = []
        self.get_all_responses["Payment Entry"] = [
            types.SimpleNamespace(
                name="ACC-PAY-RECEIVE-0001",
                unallocated_amount=410,
                payment_type="Receive",
                party_type="Customer",
                party="CUST-0001",
                company="Test Company",
                docstatus=1,
            ),
            types.SimpleNamespace(
                name="ACC-PAY-PAY-0001",
                unallocated_amount=410,
                payment_type="Pay",
                party_type="Customer",
                party="CUST-0001",
                company="Test Company",
                docstatus=1,
            ),
        ]

        credits = self.payments_module.get_available_credit(
            customer="CUST-0001",
            company="Test Company",
        )

        self.assertEqual(credits, [])

    def test_repair_overpayment_change_allocations_previews_exact_match(self):
        self.get_all_responses["Sales Invoice"] = [
            types.SimpleNamespace(
                name="ACC-SINV-2026-08532",
                customer="zzz",
                company="Farooq Chemicals",
                posting_date="2026-04-04",
                outstanding_amount=-2160,
                change_amount=2160,
                base_change_amount=2160,
                posa_pos_opening_shift="POSA-OS-26-0000007",
                account_for_change_amount="1110 - Cash - FC",
                is_pos=1,
                is_return=0,
                docstatus=1,
            )
        ]
        self.get_all_responses["Payment Entry"] = [
            types.SimpleNamespace(
                name="ACC-PAY-2026-00780",
                paid_amount=2160,
                unallocated_amount=2160,
                paid_from="1110 - Cash - FC",
                reference_no="POSA-OS-26-0000007",
                posting_date="2026-04-04",
                payment_type="Pay",
                party_type="Customer",
                party="zzz",
                company="Farooq Chemicals",
                docstatus=1,
            )
        ]

        payment_doc = FakePaymentEntry()
        payment_doc.name = "ACC-PAY-2026-00780"
        payment_doc.paid_from = "1110 - Cash - FC"
        payment_doc.cost_center = "Main - FC"
        self.get_doc_responses[("Payment Entry", "ACC-PAY-2026-00780")] = payment_doc

        result = self.payments_module.repair_overpayment_change_allocations(
            invoice_names=["ACC-SINV-2026-08532"],
            dry_run=1,
        )

        self.assertEqual(result["candidate_count"], 1)
        self.assertEqual(
            result["matched"],
            [
                {
                    "invoice": "ACC-SINV-2026-08532",
                    "payment_entry": "ACC-PAY-2026-00780",
                    "allocated_amount": 2160.0,
                }
            ],
        )
        self.assertEqual(result["repaired"], [])
        self.assertEqual(result["skipped"], [])
        self.assertEqual(self.reconcile_calls, [])

    def test_repair_overpayment_change_allocations_reconciles_exact_match(self):
        self.get_all_responses["Sales Invoice"] = [
            types.SimpleNamespace(
                name="ACC-SINV-2026-08532",
                customer="zzz",
                company="Farooq Chemicals",
                posting_date="2026-04-04",
                outstanding_amount=-2160,
                change_amount=2160,
                base_change_amount=2160,
                posa_pos_opening_shift="POSA-OS-26-0000007",
                account_for_change_amount="1110 - Cash - FC",
                is_pos=1,
                is_return=0,
                docstatus=1,
            )
        ]
        self.get_all_responses["Payment Entry"] = [
            types.SimpleNamespace(
                name="ACC-PAY-2026-00780",
                paid_amount=2160,
                unallocated_amount=2160,
                paid_from="1110 - Cash - FC",
                reference_no="POSA-OS-26-0000007",
                posting_date="2026-04-04",
                payment_type="Pay",
                party_type="Customer",
                party="zzz",
                company="Farooq Chemicals",
                docstatus=1,
            )
        ]

        payment_doc = FakePaymentEntry()
        payment_doc.name = "ACC-PAY-2026-00780"
        payment_doc.paid_from = "1110 - Cash - FC"
        payment_doc.cost_center = "Main - FC"
        self.get_doc_responses[("Payment Entry", "ACC-PAY-2026-00780")] = payment_doc

        result = self.payments_module.repair_overpayment_change_allocations(
            invoice_names=["ACC-SINV-2026-08532"],
            dry_run=0,
        )

        self.assertEqual(
            result["repaired"],
            [
                {
                    "invoice": "ACC-SINV-2026-08532",
                    "payment_entry": "ACC-PAY-2026-00780",
                    "allocated_amount": 2160.0,
                }
            ],
        )
        self.assertEqual(len(self.reconcile_calls), 1)
        reconcile_row = self.reconcile_calls[0]["args"][0]
        self.assertEqual(reconcile_row["voucher_type"], "Payment Entry")
        self.assertEqual(reconcile_row["voucher_no"], "ACC-PAY-2026-00780")
        self.assertEqual(reconcile_row["against_voucher_type"], "Sales Invoice")
        self.assertEqual(reconcile_row["against_voucher"], "ACC-SINV-2026-08532")
        self.assertEqual(reconcile_row["allocated_amount"], 2160.0)
        self.assertEqual(reconcile_row["account"], "1110 - Cash - FC")
        self.assertEqual(reconcile_row["party_type"], "Customer")
        self.assertEqual(reconcile_row["party"], "zzz")
        self.assertEqual(reconcile_row["dr_or_cr"], "credit_in_account_currency")


if __name__ == "__main__":
    unittest.main()
