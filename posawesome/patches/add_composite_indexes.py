import frappe


def execute():
    indexes = [
        (
            "Item",
            [
                "is_sales_item",
                "disabled",
                "is_fixed_asset",
                "has_variants",
                "item_group",
                "item_name",
            ],
            "sales_disabled_fixed_variants_group_name",
        ),
        ("Item Barcode", ["barcode"], "barcode"),
        ("Item Barcode", ["parent"], "parent"),
        (
            "Serial No",
            ["item_code", "warehouse", "status"],
            "item_warehouse_status",
        ),
        ("Bin", ["item_code", "warehouse"], "item_code_warehouse"),
        (
            "Stock Ledger Entry",
            [
                "warehouse",
                "item_code",
                "batch_no",
                "is_cancelled",
                "posting_date",
                "posting_time",
                "creation",
            ],
            "warehouse_item_batch_cancel_posting_creation",
        ),
        ("Batch", ["item", "disabled", "expiry_date"], "item_disabled_expiry"),
        (
            "Item Price",
            [
                "price_list",
                "currency",
                "selling",
                "item_code",
                "uom",
                "valid_from",
                "valid_upto",
            ],
            "pricelist_currency_selling_item_uom_validfrom_upto",
        ),
    ]

    for doctype, fields, index_name in indexes:
        try:
            frappe.db.add_index(doctype, fields, index_name=index_name)
        except Exception as e:
            frappe.log_error(str(e), "Add composite indexes")
