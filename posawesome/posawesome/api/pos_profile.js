// Copyright (c) 20201 Youssef Restom and contributors
// For license information, please see license.txt

const set_pos_profile_queries = (frm) => {
	const set_field_query = (fieldname, query_factory) => {
		if (frm.fields_dict[fieldname]) {
			frm.set_query(fieldname, query_factory);
		}
	};

	const set_child_query = (fieldname, table_fieldname, query_factory) => {
		const table = frm.fields_dict[table_fieldname];
		if (table && table.grid) {
			frm.set_query(fieldname, table_fieldname, query_factory);
		}
	};

	set_child_query("price_list", "posa_allowed_selling_price_lists", (doc) => ({
		filters: {
			enabled: 1,
			selling: 1,
			...(!Number(doc.posa_allow_multi_currency) && doc.currency ? { currency: doc.currency } : {}),
		},
	}));

	set_field_query("posa_cash_mode_of_payment", function () {
		return {
			filters: { type: "Cash" },
		};
	});

	set_field_query("posa_default_expense_account", function (doc) {
		return {
			filters: {
				company: doc.company,
				is_group: 0,
				root_type: "Expense",
			},
		};
	});

	set_field_query("posa_back_office_cash_account", function (doc) {
		return {
			filters: {
				company: doc.company,
				is_group: 0,
				account_type: "Cash",
			},
		};
	});

	set_field_query("posa_default_source_account", function (doc) {
		return {
			filters: {
				company: doc.company,
				is_group: 0,
				account_type: "Cash",
			},
		};
	});

	set_field_query("posa_gift_card_liability_account", function (doc) {
		return {
			filters: {
				company: doc.company,
				is_group: 0,
				root_type: "Liability",
			},
		};
	});

	set_child_query("account", "posa_allowed_expense_accounts", function (doc) {
		return {
			filters: {
				company: doc.company,
				is_group: 0,
				root_type: "Expense",
			},
		};
	});

	set_child_query("account", "posa_allowed_source_accounts", function (doc) {
		return {
			filters: {
				company: doc.company,
				is_group: 0,
				account_type: "Cash",
			},
		};
	});
};

frappe.ui.form.on("POS Profile", {
	setup: function (frm) {
		set_pos_profile_queries(frm);
		frappe.call({
			method: "posawesome.posawesome.api.utilities.get_language_options",
			callback: function (r) {
				if (!r.exc && frm.fields_dict["posa_language"]) {
					frm.fields_dict["posa_language"].df.options = r.message;
					frm.refresh_field("posa_language");
				}
			},
		});
	},
	refresh: function (frm) {
		set_pos_profile_queries(frm);
	},
});
