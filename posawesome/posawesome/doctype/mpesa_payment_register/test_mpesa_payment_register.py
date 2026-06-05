import importlib.util
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[4]


def _load_module(captured):
    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    sys.modules["frappe"] = frappe_module

    document_module = types.ModuleType("frappe.model.document")
    document_module.Document = object
    sys.modules["frappe.model"] = types.ModuleType("frappe.model")
    sys.modules["frappe.model.document"] = document_module

    payment_entry_module = types.ModuleType("posawesome.posawesome.api.payment_entry")

    def fake_create_payment_entry(*args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return types.SimpleNamespace(name="ACC-PAY-0001")

    payment_entry_module.create_payment_entry = fake_create_payment_entry
    sys.modules["posawesome.posawesome.api.payment_entry"] = payment_entry_module

    module_name = "test_mpesa_payment_register_target"
    file_path = (
        REPO_ROOT
        / "posawesome"
        / "posawesome"
        / "doctype"
        / "mpesa_payment_register"
        / "mpesa_payment_register.py"
    )
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestMpesaPaymentRegister(unittest.TestCase):
    def test_create_payment_entry_uses_explicit_payment_mapping(self):
        captured = {}
        module = _load_module(captured)
        register = types.SimpleNamespace(
            company="Test Company",
            transamount=2500,
            currency="KES",
            mode_of_payment="M-Pesa",
            customer="CUST-0001",
            posting_date="2026-06-05",
            transid="MPESA-TRANS-001",
            submit_payment=1,
        )

        payment_entry_name = module.MpesaPaymentRegister.create_payment_entry(register)

        self.assertEqual(payment_entry_name, "ACC-PAY-0001")
        self.assertEqual(captured["args"], ())
        self.assertEqual(
            captured["kwargs"],
            {
                "company": "Test Company",
                "amount": 2500,
                "currency": "KES",
                "mode_of_payment": "M-Pesa",
                "customer": "CUST-0001",
                "party": "CUST-0001",
                "party_type": "Customer",
                "payment_type": "Receive",
                "reference_date": "2026-06-05",
                "reference_no": "MPESA-TRANS-001",
                "posting_date": "2026-06-05",
                "submit": 1,
            },
        )


if __name__ == "__main__":
    unittest.main()
