import api from "./api";

export default {
	logout() {
		return api.call("logout");
	},

	getUser() {
		if (typeof frappe !== "undefined" && frappe.session) {
			return frappe.session.user;
		}
		return null;
	}
};
