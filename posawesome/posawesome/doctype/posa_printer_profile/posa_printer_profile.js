// Copyright (c) 2026, Youssef Restom and contributors
// For license information, please see license.txt

frappe.ui.form.on("POSA Printer Profile", {
    refresh: function (frm) {
        frm.add_custom_button(__("Test Connection"), () => {
            frappe.call({
                method: "posawesome.posawesome.api.printer_api.test_connection",
                args: {
                    printer_name: frm.doc.printer_name,
                    printer_type: frm.doc.printer_type,
                    ip_address: frm.doc.ip_address,
                    port: frm.doc.port,
                },
                callback: function (r) {
                    if (r.message && r.message.success) {
                        frappe.msgprint(__("Connection successful"));
                    } else {
                        frappe.msgprint(
                            __("Connection failed: {0}", [
                                r.message ? r.message.error : __("Unknown error"),
                            ])
                        );
                    }
                },
            });
        });
    },
});
