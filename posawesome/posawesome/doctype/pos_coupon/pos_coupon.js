// Copyright (c) 2021, Youssef Restom and contributors
// For license information, please see license.txt

frappe.ui.form.on("POS Coupon", {
	setup: function (frm) {
		frm.set_query("pos_offer", function () {
			return {
				filters: {
					company: frm.doc.company,
					coupon_based: 1,
					disable: 0,
				},
			};
		});
	},
	coupon_name: function (frm) {
		if (frm.doc.__islocal === 1) {
			frm.trigger("make_coupon_code");
		}
	},
	coupon_type: function (frm) {
		if (frm.doc.__islocal === 1) {
			frm.trigger("make_coupon_code");
		}
	},
	make_coupon_code: function (frm) {
		var coupon_name = (frm.doc.coupon_name || "").toString();
		var coupon_code;
		if (frm.doc.coupon_type == "Gift Card") {
			coupon_code = generateRandomCode(10);
		} else if (frm.doc.coupon_type == "Promotional") {
			coupon_name = coupon_name.replace(/\s/g, "");
			coupon_code = coupon_name.toUpperCase().slice(0, 8);
		}
		frm.doc.coupon_code = coupon_code || "";
		frm.refresh_field("coupon_code");
	},
	refresh: function (frm) {
		if (frm.doc.pricing_rule) {
			frm.add_custom_button(__("Add/Edit Coupon Conditions"), function () {
				frappe.set_route("Form", "POS Offer", frm.doc.pos_offer);
			});
		}
	},
});

function generateRandomCode(length) {
	const charset = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	const codeLength = Math.max(1, Number(length) || 1);

	if (window.crypto && window.crypto.getRandomValues) {
		const randomBytes = new Uint8Array(codeLength);
		window.crypto.getRandomValues(randomBytes);
		return Array.from(randomBytes, (byte) => charset[byte % charset.length]).join("");
	}

	return frappe.utils.get_random(codeLength).toUpperCase();
}
