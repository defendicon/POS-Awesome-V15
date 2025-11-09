import frappe


def execute():
    if not frappe.db.table_exists("POS Profile"):
        return
    try:
        has_column = frappe.db.has_column("POS Profile", "posa_enable_pricing_rules")
    except Exception:
        return
    if not has_column:
        return

    frappe.db.sql(
        """
        UPDATE `tabPOS Profile`
        SET posa_enable_pricing_rules = 1
        WHERE posa_enable_pricing_rules IS NULL
            OR posa_enable_pricing_rules = ''
        """
    )
