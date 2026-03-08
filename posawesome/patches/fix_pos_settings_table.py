import frappe

def execute():
    """
    Fix missing tabPOS Settings table for ERPNext v17+ compatibility.
    
    In ERPNext v17 development versions, the POS Settings DocType metadata
    exists but the physical database table may be missing due to incomplete
    migrations. This patch creates the table and default record if needed.
    """
    
    # Check if DocType exists (it should, but be safe)
    if not frappe.db.exists("DocType", "POS Settings"):
        print("POS Settings DocType not found, skipping patch")
        return

    # Use Frappe's API to be more robust and maintainable
    # Create table if it doesn't exist
    if not frappe.db.table_exists("POS Settings"):
        print("Creating missing tabPOS Settings table...")
        frappe.db.create_table("POS Settings")
        print("Successfully created tabPOS Settings table.")

    # Create single doc record if it doesn't exist
    if not frappe.db.exists("POS Settings", "POS Settings"):
        print("Creating default record for POS Settings...")
        doc = frappe.new_doc("POS Settings")
        doc.invoice_type = 'Sales Invoice'
        doc.post_change_gl_entries = 0
        doc.insert(ignore_permissions=True)
        print("Successfully created default record for POS Settings.")
    
    frappe.db.commit()
