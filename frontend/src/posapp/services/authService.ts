import api from "./api";
import type { ApiEnvelope } from "./api";

const authService = {
	logoutEnvelope(): Promise<ApiEnvelope<any>> {
		return api.callEnvelope("logout");
	},

	logout(): Promise<ApiEnvelope<any>> {
		return api.callEnvelope("logout");
	},

	getUser(): string | null {
		if (typeof frappe !== "undefined" && frappe.session) {
			return frappe.session.user;
		}
		return null;
	},
};

export default authService;
