import importlib.util
import json
import pathlib
import sys
import types
import unittest
from contextlib import contextmanager

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_ORIGINAL_MODULES = dict(sys.modules)
sys.path.insert(
    0,
    str(REPO_ROOT / "posawesome" / "posawesome" / "api" / "test_support"),
)

from offline_sync_harness import install_offline_sync_package_stubs


def tearDownModule():
    for name in list(sys.modules):
        if name.startswith(("frappe", "posawesome")) and name not in _ORIGINAL_MODULES:
            sys.modules.pop(name, None)
    for name, module in _ORIGINAL_MODULES.items():
        if name.startswith(("frappe", "posawesome")):
            sys.modules[name] = module


def _install_stubs():
    install_offline_sync_package_stubs()

    frappe_module = types.ModuleType("frappe")
    frappe_module._ = lambda text: text
    frappe_module.throw = lambda message: (_ for _ in ()).throw(Exception(message))
    frappe_module.whitelist = lambda *args, **kwargs: (lambda fn: fn)
    sys.modules["frappe"] = frappe_module

    # The offline-sync harness installs namespace stubs with empty package paths,
    # so load the real shared identity helper explicitly.
    idempotency_name = "posawesome.posawesome.api.idempotency"
    idempotency_path = (
        REPO_ROOT / "posawesome" / "posawesome" / "api" / "idempotency.py"
    )
    idempotency_spec = importlib.util.spec_from_file_location(
        idempotency_name, idempotency_path
    )
    idempotency_module = importlib.util.module_from_spec(idempotency_spec)
    sys.modules[idempotency_name] = idempotency_module
    idempotency_spec.loader.exec_module(idempotency_module)

    creation_module = types.ModuleType("posawesome.posawesome.api.invoice_processing.creation")
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

    @contextmanager
    def trusted_shift(invoice, data, source):
        original = invoice.get("posa_pos_opening_shift")
        invoice["posa_pos_opening_shift"] = "POS-OPEN-CURRENT"
        data["posa_pos_opening_shift"] = "POS-OPEN-CURRENT"
        data["_posa_shift_reassignment_audit"] = {
            "source": source,
            "original_opening_shift": original,
            "assigned_opening_shift": "POS-OPEN-CURRENT",
        }
        yield data["_posa_shift_reassignment_audit"]

    creation_module.trusted_invoice_shift_reassignment = trusted_shift
    sys.modules["posawesome.posawesome.api.invoice_processing.creation"] = creation_module


def _load_module():
    module_name = "test_offline_sync_invoices_target"
    file_path = REPO_ROOT / "posawesome" / "posawesome" / "api" / "offline_sync" / "invoices.py"
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

    def test_server_draft_is_not_acknowledged_as_a_completed_sale(self):
        original = self.module.submit_invoice
        self.module.submit_invoice = lambda *args, **kwargs: {"name": "DRAFT-1", "docstatus": 0}
        try:
            response = self.module.submit_invoice_outbox_entry(
                client_request_id="draft-request", invoice={"pos_profile": "Main POS", "company": "Test Company"}, data={}
            )
            self.assertFalse(response["acknowledged"])
            self.assertEqual(response["invoice"]["docstatus"], 0)
        finally:
            self.module.submit_invoice = original

    def test_orders_cannot_be_replayed_as_sales_invoices(self):
        with self.assertRaisesRegex(Exception, "Only Sales Invoice and POS Invoice"):
            self.module.submit_invoice_outbox_entry(client_request_id="order", invoice={"doctype": "Sales Order"}, data={})

    def test_submit_invoice_outbox_entry_normalizes_conflicting_identity_aliases(self):
        captured = {}
        original_submit_invoice = self.module.submit_invoice

        def capture_submit(invoice, data, submit_in_background=0):
            captured["invoice"] = json.loads(invoice)
            captured["data"] = json.loads(data)
            return {
                "name": "ACC-SINV-OUTBOX-0002",
                "doctype": "Sales Invoice",
                "docstatus": 1,
                "status": 1,
            }

        self.module.submit_invoice = capture_submit
        try:
            self.module.submit_invoice_outbox_entry(
                client_request_id="outbox-authoritative-002",
                invoice={"posa_client_request_id": "stale-invoice-id"},
                data={
                    "idempotency_key": "stale-idempotency-key",
                    "client_request_id": "stale-client-id",
                },
            )
        finally:
            self.module.submit_invoice = original_submit_invoice

        self.assertEqual(
            captured["invoice"]["posa_client_request_id"],
            "outbox-authoritative-002",
        )
        self.assertEqual(
            captured["data"]["idempotency_key"],
            "outbox-authoritative-002",
        )
        self.assertEqual(captured["data"]["client_request_id"], "outbox-authoritative-002")

    def test_late_offline_sync_uses_server_controlled_current_shift(self):
        captured = {}
        original_submit_invoice = self.module.submit_invoice

        def capture_submit(invoice, data, submit_in_background=0):
            captured["invoice"] = json.loads(invoice)
            captured["data"] = json.loads(data)
            return {
                "name": "ACC-SINV-OFFLINE-LATE-0001",
                "doctype": "Sales Invoice",
                "docstatus": 1,
                "status": 1,
            }

        self.module.submit_invoice = capture_submit
        try:
            self.module.submit_invoice_outbox_entry(
                client_request_id="offline-late-001",
                invoice={
                    "company": "Test Company",
                    "pos_profile": "Main POS",
                    "posa_pos_opening_shift": "POS-OPEN-CLOSED",
                },
                data={},
            )
        finally:
            self.module.submit_invoice = original_submit_invoice

        self.assertEqual(
            captured["invoice"]["posa_pos_opening_shift"],
            "POS-OPEN-CURRENT",
        )
        self.assertEqual(captured["data"]["posa_pos_opening_shift"], "POS-OPEN-CURRENT")
        self.assertEqual(
            captured["data"]["_posa_shift_reassignment_audit"],
            {
                "source": "offline_sync",
                "original_opening_shift": "POS-OPEN-CLOSED",
                "assigned_opening_shift": "POS-OPEN-CURRENT",
            },
        )

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
