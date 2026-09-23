import sys
from types import ModuleType
from unittest import TestCase
from unittest.mock import MagicMock, patch

from posawesome.posawesome.overrides.multi_currency_payments import (
    MultiCurrencyPOSPaymentsMixin,
)


class TestMultiCurrencyPOSPaymentsMixin(TestCase):
    def test_precision_helper_falls_back_when_document_precision_is_missing(self):
        class Row:
            def __init__(self, precision):
                self.value = precision

            def precision(self, _fieldname):
                return self.value

        fake_frappe = ModuleType("frappe")
        fake_frappe._ = lambda value: value
        fake_utils = ModuleType("frappe.utils")
        fake_utils.cint = lambda value: int(value or 0)
        fake_utils.flt = lambda value, precision=None: round(
            float(value or 0), precision if precision is not None else 6
        )
        fake_utils.getdate = lambda value=None: value
        fake_utils.nowdate = lambda: "2026-09-23"
        fake_invoice_utils = ModuleType(
            "posawesome.posawesome.api.invoice_processing.utils"
        )
        fake_invoice_utils.get_latest_rate = MagicMock()

        with patch.dict(
            sys.modules,
            {
                "frappe": fake_frappe,
                "frappe.utils": fake_utils,
                "posawesome.posawesome.api.invoice_processing.utils": fake_invoice_utils,
            },
        ):
            sys.modules.pop("posawesome.posawesome.api.payment_currency", None)
            from posawesome.posawesome.api.payment_currency import (
                _precision,
                _tender_amount_precision,
            )

            self.assertEqual(_precision(Row(None), "posa_original_amount"), 2)
            self.assertEqual(_precision(Row(None), "amount", fallback=4), 4)
            self.assertEqual(_precision(Row(0), "amount"), 0)
            self.assertEqual(_tender_amount_precision(Row(None)), 9)

    def test_missing_post_change_setting_uses_legacy_behavior(self):
        invoice = MagicMock()
        invoice.is_pos = 1
        invoice.doctype = "Sales Invoice"
        invoice.payments = []

        accounts_settings_meta = MagicMock()
        accounts_settings_meta.has_field.return_value = None

        fake_frappe = ModuleType("frappe")
        fake_frappe.get_meta = MagicMock(return_value=accounts_settings_meta)
        fake_frappe.db = MagicMock()
        fake_utils = ModuleType("frappe.utils")
        fake_utils.cint = lambda value: int(value or 0)
        fake_utils.flt = lambda value, *args: float(value or 0)
        fake_erpnext = ModuleType("erpnext")
        fake_accounts = ModuleType("erpnext.accounts")
        fake_accounts_utils = ModuleType("erpnext.accounts.utils")
        fake_accounts_utils.get_account_currency = MagicMock()

        with patch.dict(
            sys.modules,
            {
                "frappe": fake_frappe,
                "frappe.utils": fake_utils,
                "erpnext": fake_erpnext,
                "erpnext.accounts": fake_accounts,
                "erpnext.accounts.utils": fake_accounts_utils,
            },
        ):
            MultiCurrencyPOSPaymentsMixin.make_pos_gl_entries(invoice, [])

        fake_frappe.db.get_single_value.assert_not_called()
        invoice.make_gle_for_change_amount.assert_not_called()

    def test_v16_before_save_preserves_tender_base_and_posts_exact_change(self):
        class Row(dict):
            __getattr__ = dict.get
            __setattr__ = dict.__setitem__

        class V16SalesInvoice:
            def before_save(self):
                for payment in self.payments:
                    payment.base_amount = round(
                        payment.amount * self.conversion_rate,
                        2,
                    )
                self.base_paid_amount = sum(
                    payment.base_amount for payment in self.payments
                )

        class Invoice(MultiCurrencyPOSPaymentsMixin, V16SalesInvoice):
            def get(self, fieldname, default=None):
                return getattr(self, fieldname, default)

            def precision(self, _fieldname):
                return 2

            def get_gl_dict(self, values, _currency, item=None):
                return values

            def make_gle_for_change_amount(self, _gl_entries):
                raise AssertionError("separate change GL must stay disabled")

        invoice = Invoice()
        invoice.is_pos = 1
        invoice.doctype = "Sales Invoice"
        invoice.is_return = 0
        invoice.return_against = None
        invoice.update_outstanding_for_self = 0
        invoice.name = "ACC-SINV-TEST-0001"
        invoice.customer = "CUST-0001"
        invoice.debit_to = "Debtors - FC"
        invoice.cost_center = "Main - FC"
        invoice.company_currency = "PKR"
        invoice.party_account_currency = "PKR"
        invoice.conversion_rate = 285
        invoice.rounded_total = 0.42
        invoice.grand_total = 0.42
        invoice.base_rounded_total = 119.7
        invoice.base_grand_total = 119.7
        invoice.account_for_change_amount = "Cash - FC"
        invoice.change_amount = 0.01
        invoice.base_change_amount = 2.85
        invoice.payments = [
            Row(
                mode_of_payment="Cash",
                type="Cash",
                account="Cash - FC",
                amount=0.11,
                base_amount=31.35,
                posa_payment_currency="PKR",
                posa_original_amount=30,
                posa_company_exchange_rate=1,
                posa_account_amount=30,
            ),
            Row(
                mode_of_payment="Online Transfer",
                type="Cash",
                account="Bank - FC",
                amount=0.32,
                base_amount=91.2,
                posa_payment_currency="USD",
                posa_original_amount=0.32,
                posa_company_exchange_rate=285,
                posa_account_amount=91.2,
            ),
        ]

        accounts_settings_meta = MagicMock()
        accounts_settings_meta.has_field.return_value = None
        fake_frappe = ModuleType("frappe")
        fake_frappe._ = lambda value: value
        fake_frappe.get_meta = MagicMock(return_value=accounts_settings_meta)
        fake_frappe.db = MagicMock()
        fake_utils = ModuleType("frappe.utils")
        fake_utils.cint = lambda value: int(value or 0)
        fake_utils.flt = lambda value, precision=None: round(
            float(value or 0),
            precision if precision is not None else 6,
        )
        fake_utils.getdate = lambda value=None: value or "2026-08-20"
        fake_utils.nowdate = lambda: "2026-08-20"
        fake_erpnext = ModuleType("erpnext")
        fake_accounts = ModuleType("erpnext.accounts")
        fake_accounts_utils = ModuleType("erpnext.accounts.utils")
        fake_accounts_utils.get_account_currency = lambda _account: "PKR"
        fake_invoice_utils = ModuleType(
            "posawesome.posawesome.api.invoice_processing.utils"
        )
        fake_invoice_utils.get_latest_rate = MagicMock()

        with patch.dict(
            sys.modules,
            {
                "frappe": fake_frappe,
                "frappe.utils": fake_utils,
                "erpnext": fake_erpnext,
                "erpnext.accounts": fake_accounts,
                "erpnext.accounts.utils": fake_accounts_utils,
                "posawesome.posawesome.api.invoice_processing.utils": fake_invoice_utils,
            },
        ):
            invoice.before_save()
            gl_entries = []
            invoice.make_pos_gl_entries(gl_entries)

        self.assertEqual(invoice.payments[0].base_amount, 30)
        self.assertEqual(invoice.base_paid_amount, 121.2)
        self.assertEqual(invoice.base_change_amount, 1.5)
        self.assertEqual(len(gl_entries), 4)
        self.assertAlmostEqual(sum(row.get("credit", 0) for row in gl_entries), 119.7)
        cash_entry = next(row for row in gl_entries if row.get("account") == "Cash - FC")
        self.assertEqual(cash_entry["debit"], 28.5)
        self.assertEqual(cash_entry["debit_in_account_currency"], 28.5)
        self.assertAlmostEqual(cash_entry["debit_in_transaction_currency"], 0.1)

    def test_before_save_hook_preserves_exact_auto_remainder_at_low_display_precision(self):
        class Row(dict):
            __getattr__ = dict.get
            __setattr__ = dict.__setitem__

            def precision(self, _fieldname):
                return 2

        class Invoice(Row):
            def precision(self, _fieldname):
                return 2

        profile = Row(
            name="POS-PROFILE-TEST",
            posa_enable_multi_currency_payments=1,
            posa_allow_manual_payment_exchange_rate=0,
            posa_allowed_currencies=[
                Row(currency="PKR", allow_for_payments=1),
                Row(currency="USD", allow_for_payments=1),
            ],
        )
        invoice = Invoice(
            is_pos=1,
            is_return=0,
            company="Test Company",
            currency="USD",
            posting_date="2026-08-20",
            pos_profile=profile.name,
            conversion_rate=285,
            rounded_total=0.42,
            grand_total=0.42,
            base_rounded_total=119.70,
            base_grand_total=119.70,
            paid_amount=0.42,
            base_paid_amount=122.55,
            change_amount=0,
            base_change_amount=0,
            posa_change_returns=[],
            payments=[
                Row(
                    type="Cash",
                    account="Cash - TC",
                    amount=0.11,
                    base_amount=31.35,
                    posa_payment_currency="PKR",
                    posa_original_amount=30,
                    posa_exchange_rate=0.003508772,
                    posa_company_exchange_rate=1,
                ),
                Row(
                    type="Bank",
                    account="Bank - TC",
                    amount=0.31,
                    base_amount=88.35,
                    posa_payment_currency="USD",
                    posa_original_amount=0.314736842,
                    posa_exchange_rate=1,
                    posa_company_exchange_rate=285,
                ),
            ],
        )

        fake_frappe = ModuleType("frappe")
        fake_frappe._ = lambda value: value
        fake_frappe.get_cached_doc = MagicMock(return_value=profile)
        fake_frappe.get_cached_value = MagicMock(
            side_effect=lambda doctype, _name, fieldname: (
                "PKR" if doctype in {"Company", "Account"} else None
            )
        )
        fake_utils = ModuleType("frappe.utils")
        fake_utils.cint = lambda value: int(value or 0)
        fake_utils.flt = lambda value, precision=None: round(
            float(value or 0), precision if precision is not None else 6
        )
        fake_utils.getdate = lambda value=None: value or "2026-08-20"
        fake_utils.nowdate = lambda: "2026-08-20"
        fake_invoice_utils = ModuleType(
            "posawesome.posawesome.api.invoice_processing.utils"
        )
        fake_invoice_utils.get_latest_rate = lambda from_currency, to_currency, **_kwargs: (
            (0.003508772, "2026-08-20")
            if (from_currency, to_currency) == ("PKR", "USD")
            else (285, "2026-08-20")
        )

        with patch.dict(
            sys.modules,
            {
                "frappe": fake_frappe,
                "frappe.utils": fake_utils,
                "posawesome.posawesome.api.invoice_processing.utils": fake_invoice_utils,
            },
        ):
            sys.modules.pop("posawesome.posawesome.api.payment_currency", None)
            from posawesome.posawesome.api.payment_currency import (
                preserve_multi_currency_payment_amounts,
            )

            preserve_multi_currency_payment_amounts(invoice)

        self.assertEqual(invoice.payments[0].base_amount, 30)
        self.assertEqual(invoice.payments[1].posa_original_amount, 0.314736842)
        self.assertEqual(invoice.payments[1].base_amount, 89.7)
        self.assertEqual(invoice.base_paid_amount, 119.7)
        self.assertEqual(invoice.base_change_amount, 0)
        self.assertEqual(invoice.paid_amount, 0.42)
        self.assertEqual(invoice.change_amount, 0)
