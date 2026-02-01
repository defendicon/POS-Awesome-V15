import api from "./api";

const authService = {
	logout(): Promise<any> {
		return api.call("logout");
	},

	getUser(): string | null {
		if (typeof frappe !== "undefined" && frappe.session) {
			return frappe.session.user;
		}
		return null;
	}
};

export default authService;
