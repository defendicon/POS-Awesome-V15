import frappe

def execute():
    """
    Fix missing tabPOS Settings table for ERPNext v17+ compatibility.
    
    In ERPNext v17 development versions, the POS Settings DocType metadata
    exists but the physical database table may be missing due to incomplete
    migrations. This patch creates the table if it doesn't exist.
    """
    
    # Check if DocType exists (it should, but be safe)
    if not frappe.db.exists("DocType", "POS Settings"):
        print("POS Settings DocType not found, skipping patch")
        return
    
    # Check if table already exists
    table_exists = frappe.db.sql("SHOW TABLES LIKE 'tabPOS Settings'")
    if table_exists:
        print("tabPOS Settings table already exists, skipping patch")
        return
    
    print("Creating missing tabPOS Settings table...")
    
    # Create the table
    frappe.db.sql("""
        CREATE TABLE IF NOT EXISTS `tabPOS Settings` (
          `name` varchar(255) NOT NULL,
          `creation` datetime(6) DEFAULT NULL,
          `modified` datetime(6) DEFAULT NULL,
          `modified_by` varchar(255) DEFAULT NULL,
          `owner` varchar(255) DEFAULT NULL,
          `docstatus` int(1) NOT NULL DEFAULT 0,
          `parent` varchar(255) DEFAULT NULL,
          `parentfield` varchar(255) DEFAULT NULL,
          `parenttype` varchar(255) DEFAULT NULL,
          `idx` int(8) NOT NULL DEFAULT 0,
          `_user_tags` text,
          `_comments` text,
          `_assign` text,
          `_liked_by` text,
          `invoice_type` varchar(255) DEFAULT 'Sales Invoice',
          `post_change_gl_entries` int(1) NOT NULL DEFAULT 0,
          PRIMARY KEY (`name`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    
    # Insert default record for Single DocType
    frappe.db.sql("""
        INSERT INTO `tabPOS Settings` 
        (`name`, `creation`, `modified`, `modified_by`, `owner`, `invoice_type`, `post_change_gl_entries`)
        VALUES 
        ('POS Settings', NOW(), NOW(), 'Administrator', 'Administrator', 'Sales Invoice', 0)
        ON DUPLICATE KEY UPDATE `modified` = NOW()
    """)
    
    frappe.db.commit()
    print("Successfully created tabPOS Settings table and default record")
