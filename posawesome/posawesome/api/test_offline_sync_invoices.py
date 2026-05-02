import importlib.util
import json
import pathlib
import sys
import types
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(
    0,
    str(REPO_ROOT / "posawesome" / "posawesome" / "api" / "test_support"),
)

from offline_sync_harness import install_offline_sync_package_stubs


def _install_stubs():
    install_offline_sync_package_stubs()

    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    sys.modules["frappe"] = frappe_module

    creation_module = types.ModuleType(
        "posawesome.posawesome.api.invoice_processing.creation"
    )
    creation_module.submit_invoice = lambda invoice, data, submit_in_background=0: {
        "name": "ACC-SINV-OUTBOX-0001",
        "doctype": "Sales Invoice",
        "docstatus": 1,
        "status": 1,
        "client_request_id": json.loads(invoice).get("posa_client_request_id"),
    }
    creation_module.repair_invoice_submission = lambda **kwargs: {
        "name": "ACC-SINV-OUTBOX-0001",
        "doctype": kwargs.get("document_type"),
        "docstatus": 1,
        "ledger_state": "POST_SUBMIT_DONE",
        "repaired": True,
    }
    sys.modules[
        "posawesome.posawesome.api.invoice_processing.creation"
    ] = creation_module


def _load_module():
    module_name = "test_offline_sync_invoices_target"
    file_path = (
        REPO_ROOT
        / "posawesome"
        / "posawesome"
        / "api"
        / "offline_sync"
        / "invoices.py"
    )
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


class TestOfflineSyncInvoices(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _install_stubs()
        cls.module = _load_module()

    def test_submit_invoice_outbox_entry_returns_acknowledgement(self):
        response = self.module.submit_invoice_outbox_entry(
            client_request_id="outbox-fixed-001",
            invoice={
                "name": "OFFLINE-SINV-0001",
                "company": "Test Company",
                "pos_profile": "Main POS",
            },
            data={},
        )

        self.assertTrue(response["acknowledged"])
        self.assertEqual(response["client_request_id"], "outbox-fixed-001")
        self.assertEqual(response["invoice"]["name"], "ACC-SINV-OUTBOX-0001")

    def test_repair_invoice_outbox_entry_delegates_to_submission_repair(self):
        response = self.module.repair_invoice_outbox_entry(
            client_request_id="outbox-fixed-001",
            company="Test Company",
            pos_profile="Main POS",
            document_type="Sales Invoice",
        )

        self.assertTrue(response["repaired"])
        self.assertEqual(response["ledger_state"], "POST_SUBMIT_DONE")


if __name__ == "__main__":
    unittest.main()
