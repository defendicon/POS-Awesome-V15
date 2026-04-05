import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field


FIELDS = [
	{
		"fieldname": "posa_use_gift_cards",
		"label": "Use Gift Cards",
		"fieldtype": "Check",
		"default": "1",
		"insert_after": "use_customer_credit",
	},
	{
		"fieldname": "posa_allow_supervisor_manage_gift_cards",
		"label": "Allow Supervisor Gift Card Management",
		"fieldtype": "Check",
		"default": "1",
		"insert_after": "posa_use_gift_cards",
	},
	{
		"fieldname": "posa_gift_card_liability_account",
		"label": "Gift Card Liability Account",
		"fieldtype": "Link",
		"options": "Account",
		"insert_after": "posa_allow_supervisor_manage_gift_cards",
	},
]


def execute():
	for field in FIELDS:
		cf_name = f"POS Profile-{field['fieldname']}"
		if not frappe.db.exists("Custom Field", cf_name):
			create_custom_field("POS Profile", field)
		else:
			frappe.db.set_value(
				"Custom Field",
				cf_name,
				{
					"label": field["label"],
					"fieldtype": field["fieldtype"],
					"default": field.get("default"),
					"options": field.get("options"),
					"insert_after": field["insert_after"],
				},
				update_modified=False,
			)
	frappe.clear_cache(doctype="POS Profile")
