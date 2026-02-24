// Copyright (c) 2021, Youssef Restom and contributors
// For license information, please see license.txt

frappe.ui.form.on("Referral Code", {
	setup: function (frm) {
		frm.set_query("party_type", function () {
			return {
				filters: {
					name: ["in", ["Customer"]],
				},
			};
		});
		frm.set_query("customer_offer", function () {
			return {
				filters: {
					company: frm.doc.company,
					coupon_based: 1,
					disable: 0,
				},
			};
		});
		frm.set_query("primary_offer", function () {
			return {
				filters: {
					company: frm.doc.company,
					coupon_based: 1,
					disable: 0,
				},
			};
		});
	},
	referral_name: function (frm) {
		if (frm.doc.__islocal === 1) {
			frm.trigger("make_referral_code");
		}
	},
	make_referral_code: function (frm) {
		let referral_name = (frm.doc.referral_name || "").toString();
		let referral_code;
		if (!referral_name) {
			const party = (frm.doc.party || "").toString().trim();
			frm.doc.referral_name = `${party}${generateRandomCode(3)}`;
			referral_code = generateRandomCode(10);
		} else {
			referral_name = referral_name.replace(/\s/g, "");
			referral_code = referral_name.toUpperCase().slice(0, 8);
		}
		frm.doc.referral_code = referral_code;
		frm.refresh_field("referral_name");
		frm.refresh_field("referral_code");
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
