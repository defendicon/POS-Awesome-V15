frappe.query_reports["POS Item Exchange Audit"] = {
	filters: [
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			reqd: 1,
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: frappe.datetime.get_today(),
			reqd: 1,
		},
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "pos_profile",
			label: __("POS Profile"),
			fieldtype: "Link",
			options: "POS Profile",
			get_query: () => ({
				filters: {
					company: frappe.query_report.get_filter_value("company") || undefined,
				},
			}),
		},
		{
			fieldname: "pos_opening_shift",
			label: __("POS Opening Shift"),
			fieldtype: "Link",
			options: "POS Opening Shift",
		},
		{
			fieldname: "customer",
			label: __("Customer"),
			fieldtype: "Link",
			options: "Customer",
		},
		{
			fieldname: "cashier",
			label: __("Cashier"),
			fieldtype: "Link",
			options: "User",
		},
		{
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: "\nCompleted\nCancelled",
		},
		{
			fieldname: "settlement_type",
			label: __("Settlement Type"),
			fieldtype: "Select",
			options: "\nCustomer Payment\nCustomer Credit\nEven Exchange",
		},
		{
			fieldname: "currency",
			label: __("Currency"),
			fieldtype: "Link",
			options: "Currency",
		},
		{
			fieldname: "original_invoice",
			label: __("Original Invoice"),
			fieldtype: "Link",
			options: "Sales Invoice",
		},
	],
};
