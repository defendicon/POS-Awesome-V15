import frappe


def after_uninstall():
    clear_custom_fields_and_properties()
    remove_delivery_charges_field()


def clear_custom_fields_and_properties():
    fixtures = frappe.get_hooks("fixtures", app_name="posawesome")
    for fixture in fixtures:
        if fixture.get("doctype") == "Custom Field":
            filters = fixture.get("filters")
            if filters:
                for filter_condition in filters:
                    # Extract the list of names from the filter condition
                    if (
                        len(filter_condition) >= 3
                        and filter_condition[0] == "name"
                        and filter_condition[1] == "in"
                    ):
                        names = filter_condition[2]
                        for name in names:
                            try:
                                frappe.db.delete("Custom Field", {"name": name})
                                print("Deleted Custom Field: ", name)
                            except Exception as e:
                                print(f"Error deleting Custom Field {name}: {e}")

        if fixture.get("doctype") == "Property Setter":
            filters = fixture.get("filters")
            if filters:
                for filter_condition in filters:
                    # Extract the list of names from the filter condition
                    if (
                        len(filter_condition) >= 3
                        and filter_condition[0] == "name"
                        and filter_condition[1] == "in"
                    ):
                        names = filter_condition[2]
                        for name in names:
                            try:
                                frappe.db.delete("Property Setter", {"name": name})
                                print("Deleted Property Setter: ", name)
                            except Exception as e:
                                print(f"Error deleting Property Setter {name}: {e}")

    frappe.db.commit()


def remove_delivery_charges_field():
    # Remove posa_delivery_charges field from Sales Invoice
    frappe.db.delete("Custom Field", "Sales Invoice-posa_delivery_charges")
    frappe.db.delete("Custom Field", "Sales Invoice-posa_delivery_charges_rate")
    frappe.db.commit()
    print("Removed delivery charges fields from Sales Invoice")
