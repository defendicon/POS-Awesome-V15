from __future__ import unicode_literals  # noqa: UP010

from frappe import _


def get_data():
    return [
        {
            "label": _("POS Awesome"),
            "items": [
                {
                    "description": "POS Awesome",
                    "name": "posapp",
                    "label": "POSAPP",
                    "type": "page",
                },
                {
                    "type": "doctype",
                    "description": "POS Profile",
                    "name": "POS Profile",
                },
                {
                    "type": "doctype",
                    "description": "Printer profiles and routing settings",
                    "name": "POSA Printer Profile",
                },
                {
                    "type": "doctype",
                    "description": "POS Opening Shift",
                    "name": "POS Opening Shift",
                },
                {
                    "type": "doctype",
                    "description": "POS Closing Shift",
                    "name": "POS Closing Shift",
                },
                {
                    "type": "doctype",
                    "description": "Completed and cancelled POS item exchanges",
                    "name": "POS Item Exchange",
                },
                {
                    "type": "report",
                    "description": "Audit item exchange documents and settlement totals",
                    "name": "POS Item Exchange Audit",
                    "doctype": "POS Item Exchange",
                    "is_query_report": True,
                },
                {
                    "type": "doctype",
                    "description": "POS Offers",
                    "name": "POS Offer",
                },
            ],
        }
    ]
