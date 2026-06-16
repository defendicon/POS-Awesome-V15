import frappe


SYNC_DELTA_INDEXES = [
    (
        "Item Price",
        ["price_list", "modified", "name"],
        "price_list_modified_name",
    ),
    (
        "Deleted Document",
        ["deleted_doctype", "creation", "deleted_name"],
        "doctype_creation_deleted_name",
    ),
    (
        "Bin",
        ["warehouse", "modified", "item_code"],
        "warehouse_modified_item_code",
    ),
    (
        "Bin",
        ["warehouse", "item_code", "modified"],
        "warehouse_item_code_modified",
    ),
    (
        "Item",
        [
            "modified",
            "item_group",
            "disabled",
            "is_sales_item",
            "is_fixed_asset",
            "item_code",
        ],
        "modified_group_disabled_sales_fixed_item",
    ),
    (
        "Item",
        [
            "disabled",
            "is_sales_item",
            "is_fixed_asset",
            "item_group",
            "modified",
            "item_code",
        ],
        "disabled_sales_fixed_group_modified_item",
    ),
    (
        "Customer",
        ["modified", "disabled", "customer_group", "name"],
        "modified_disabled_group_name",
    ),
    (
        "Customer",
        ["disabled", "customer_group", "modified", "name"],
        "disabled_group_modified_name",
    ),
    (
        "Price List",
        ["selling", "modified", "name"],
        "selling_modified_name",
    ),
]


def execute():
    for doctype, fields, index_name in SYNC_DELTA_INDEXES:
        try:
            frappe.db.add_index(doctype, fields, index_name=index_name)
        except Exception as error:
            frappe.log_error(
                str(error),
                f"Add offline sync delta index: {index_name}",
            )
