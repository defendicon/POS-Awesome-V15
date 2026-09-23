frappe.ui.form.on("POS Item Exchange", {
	refresh(frm) {
		if (frm.is_new() || !frappe.user.has_role("System Manager")) {
			return;
		}

		if (frm.doc.status === "Completed") {
			frm.add_custom_button(
				__("Cancel Exchange"),
				async () => {
					const confirmed = await new Promise((resolve) => {
						frappe.confirm(
							__(
								"This will cancel the reconciliation journal, replacement invoice, and return invoice. The original sale will remain unchanged. Continue?",
							),
							() => resolve(true),
							() => resolve(false),
						);
					});
					if (!confirmed) return;

					await frappe.call({
						method: "posawesome.posawesome.doctype.pos_item_exchange.pos_item_exchange.cancel_item_exchange",
						args: { name: frm.doc.name },
						freeze: true,
						freeze_message: __("Cancelling item exchange..."),
					});

					frappe.show_alert({
						message: __("Item exchange cancelled. You can now delete the exchange record."),
						indicator: "green",
					});
					await frm.reload_doc();
				},
				__("Actions"),
			);
		}

		if (frm.doc.status === "Cancelled") {
			frm.add_custom_button(
				__("Delete Exchange"),
				async () => {
					const confirmed = await new Promise((resolve) => {
						frappe.confirm(
							__(
								"Delete this cancelled exchange record? The cancelled invoices will remain available for audit.",
							),
							() => resolve(true),
							() => resolve(false),
						);
					});
					if (!confirmed) return;

					await frappe.call({
						method: "frappe.client.delete",
						args: {
							doctype: "POS Item Exchange",
							name: frm.doc.name,
						},
						freeze: true,
						freeze_message: __("Deleting item exchange..."),
					});

					frappe.show_alert({
						message: __("Item exchange record deleted."),
						indicator: "green",
					});
					frappe.set_route("List", "POS Item Exchange");
				},
				__("Actions"),
			);
		}
	},
});
