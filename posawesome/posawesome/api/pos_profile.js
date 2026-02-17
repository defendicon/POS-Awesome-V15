// Copyright (c) 20201 Youssef Restom and contributors
// For license information, please see license.txt

frappe.ui.form.on("POS Profile", {
	setup: function (frm) {
		frm.set_query("posa_cash_mode_of_payment", function (doc) {
			return {
				filters: { type: "Cash" },
			};
		});

		frm.set_query("posa_default_expense_account", function (doc) {
			return {
				filters: {
					company: doc.company,
					is_group: 0,
					root_type: "Expense",
				},
			};
		});

		frm.set_query("posa_back_office_cash_account", function (doc) {
			return {
				filters: {
					company: doc.company,
					is_group: 0,
					account_type: "Cash",
				},
			};
		});

		frm.set_query("posa_default_source_account", function (doc) {
			return {
				filters: {
					company: doc.company,
					is_group: 0,
					account_type: "Cash",
				},
			};
		});

		frm.set_query("account", "posa_allowed_expense_accounts", function (doc) {
			return {
				filters: {
					company: doc.company,
					is_group: 0,
					root_type: "Expense",
				},
			};
		});

		frm.set_query("account", "posa_allowed_source_accounts", function (doc) {
			return {
				filters: {
					company: doc.company,
					is_group: 0,
					account_type: "Cash",
				},
			};
		});

		frappe.call({
			method: "posawesome.posawesome.api.utilities.get_language_options",
			callback: function (r) {
				if (!r.exc) {
					frm.fields_dict["posa_language"].df.options = r.message;
					frm.refresh_field("posa_language");
				}
			},
		});
	},
});
