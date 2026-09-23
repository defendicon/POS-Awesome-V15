import frappe

CUSTOM_FIELD = "POS Profile-posa_default_printer_profile"
PRINTER_DOCTYPES = ("POSA Printer Profile", "POSA Printer Routing Rule")


def execute():
    if frappe.db.exists("Custom Field", CUSTOM_FIELD):
        frappe.delete_doc(
            "Custom Field",
            CUSTOM_FIELD,
            force=True,
            ignore_permissions=True,
            delete_permanently=True,
        )

    for doctype in PRINTER_DOCTYPES:
        if frappe.db.exists("DocType", doctype):
            frappe.delete_doc(
                "DocType",
                doctype,
                force=True,
                ignore_permissions=True,
                ignore_on_trash=True,
                delete_permanently=True,
            )

        table_name = f"tab{doctype.replace('`', '')}"
        frappe.db.sql_ddl(f"DROP TABLE IF EXISTS `{table_name}`")

    frappe.clear_cache(doctype="POS Profile")
