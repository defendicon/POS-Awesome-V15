import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[5]


def _load_module():
    frappe_module = types.ModuleType("frappe")
    frappe_utils = types.ModuleType("frappe.utils")
    invoices_module = types.ModuleType(
        "posawesome.posawesome.doctype.pos_closing_shift.closing_processing.invoices"
    )
    calls = []

    def get_all(doctype, **kwargs):
        calls.append((doctype, kwargs))
        if doctype == "Sales Invoice":
            return ["SINV-0001"]
        if doctype == "POS Invoice":
            return ["PINV-0001"]
        return []

    frappe_module.get_all = get_all
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    frappe_utils.cint = lambda value: int(value or 0)
    invoices_module.submit_printed_invoices = lambda *args, **kwargs: None
    sys.modules["frappe"] = frappe_module
    sys.modules["frappe.utils"] = frappe_utils
    sys.modules[
        "posawesome.posawesome.doctype.pos_closing_shift.closing_processing.invoices"
    ] = invoices_module

    module_name = "test_closing_payment_reference_target"
    file_path = (
        REPO_ROOT
        / "posawesome"
        / "posawesome"
        / "doctype"
        / "pos_closing_shift"
        / "closing_processing"
        / "data.py"
    )
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module, calls


class TestClosingPaymentEntryReferences(unittest.TestCase):
    def test_includes_invoice_references_and_legacy_shift_reference(self):
        module, calls = _load_module()

        module.get_payments_entries("POS-OPEN-0001")

        payment_call = calls[-1]
        self.assertEqual(payment_call[0], "Payment Entry")
        self.assertEqual(
            payment_call[1]["filters"]["reference_no"],
            ["in", ["POS-OPEN-0001", "SINV-0001", "PINV-0001"]],
        )


if __name__ == "__main__":
    unittest.main()
