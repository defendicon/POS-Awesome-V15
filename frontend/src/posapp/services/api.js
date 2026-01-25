
export default {
	call(method, args = {}, options = {}) {
		return new Promise((resolve, reject) => {
			frappe.call({
				method,
				args,
				freeze: options.freeze || false,
				freeze_message: options.freeze_message,
				async: options.async !== false, // default true
				...options,
				callback: (r) => {
					if (r.exc || (r.message && r.message.error)) {
						reject(r);
					} else {
						resolve(r.message);
					}
				},
				error: (r) => {
					reject(r);
				}
			});
		});
	},

	getDoc(doctype, name) {
		return this.call("frappe.client.get", { doctype, name });
	},

	setValue(doctype, name, fieldname, value) {
		return this.call("frappe.client.set_value", { doctype, name, fieldname, value });
	}
};
