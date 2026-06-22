// Copyright (c) 2025, Youssef Restom and contributors
// For license information, please see license.txt

frappe.ui.form.on("Barcode Print Log", {
    refresh: function (frm) {
        if (frm.doc.verification_status === "Unverified") {
            frm.add_custom_button(__("Mark Verified"), () => {
                frm.set_value("verification_status", "Verified");
                frm.set_value("verified_at", frappe.datetime.now_datetime());
                frm.set_value("verified_by", frappe.session.user);
                frm.save();
            });
        }
    }
});
