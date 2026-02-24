// Copyright (c) 2022, Youssef Restom and contributors
// For license information, please see license.txt

frappe.ui.form.on("Delivery Charges", {
	setup: function (frm) {
		const companyFilter = function (doc) {
			return {
				filters: { company: doc.company },
			};
		};

		frm.set_query("shipping_account", companyFilter);
		frm.set_query("cost_center", companyFilter);
		frm.set_query("pos_profile", "profiles", companyFilter);
	},
});
