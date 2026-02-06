import frappe
from frappe import _

@frappe.whitelist()
def get_last_invoice_rates(customer, item_codes, company=None):
    """
    Get the last invoice rate for a list of items for a specific customer.
    """
    if not company:
        company = frappe.db.get_default("company")

    if not customer or not item_codes:
        return []

    if isinstance(item_codes, str):
        import json
        item_codes = json.loads(item_codes)

    if not item_codes:
        return []

    placeholders = ", ".join(["%s"] * len(item_codes))
    
    query = f"""
        SELECT
            item.item_code,
            item.rate,
            inv.currency,
            inv.name as invoice,
            item.uom,
            inv.posting_date
        FROM
            `tabSales Invoice` inv
        JOIN
            `tabSales Invoice Item` item ON item.parent = inv.name
        WHERE
            inv.customer = %s
            AND inv.company = %s
            AND inv.docstatus = 1
            AND item.item_code IN ({placeholders})
        ORDER BY
            inv.posting_date DESC, inv.creation DESC
    """
    
    # We need the *latest* rate per item. MySQL doesn't have DISTINCT ON.
    # We can fetch all and filter in python, or use a window function if available (MariaDB 10.2+).
    # Frappe usually supports MariaDB 10.2+.
    # Let's try a simpler approach: fetch rows and dedup in Python to be safe and compatible.
    
    # Executing query
    params = [customer, company] + list(item_codes)
    data = frappe.db.sql(query, tuple(params), as_dict=True)
    
    # Dedup to keep only the first (latest) entry per item_code
    latest_rates = {}
    for row in data:
        if row.item_code not in latest_rates:
            latest_rates[row.item_code] = row
            
    return list(latest_rates.values())
