// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

// render
frappe.listview_settings["POS Opening Shift"] = {
	get_indicator: function (doc) {
		const statusColor = {
			Draft: "grey",
			Open: "orange",
			Closed: "green",
			Cancelled: "red",
		};
		const status = doc.status || "Draft";
		return [__(status), statusColor[status] || "blue", "status,=," + status];
	},
};
