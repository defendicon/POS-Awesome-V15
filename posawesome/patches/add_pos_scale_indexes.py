import frappe


def execute():
    indexes = [
        (
            "Customer",
            ["disabled", "customer_group", "name"],
            "disabled_customer_group_name",
        ),
        (
            "Customer",
            ["disabled", "modified", "name"],
            "disabled_modified_name",
        ),
        (
            "Pricing Rule",
            ["selling", "disable", "company", "valid_from", "valid_upto"],
            "selling_disable_company_validity",
        ),
    ]

    for doctype, fields, index_name in indexes:
        try:
            frappe.db.add_index(doctype, fields, index_name=index_name)
        except Exception as error:
            frappe.log_error(str(error), f"Add POS scale index: {index_name}")
