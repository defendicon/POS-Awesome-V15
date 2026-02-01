import { ref, unref, inject } from "vue";
import { formatUtils } from "../format";
import {
	getSalesPersonsStorage,
	setSalesPersonsStorage
} from "../../offline/index.js";

export function useInvoiceDetails(options) {
	const {
		invoiceDoc,
		posProfile,
		invoiceType,
		posSettings, // optional
		stores, // { toastStore }
		eventBus,
	} = options;

	const addresses = ref([]);
	const sales_persons = ref([]);
	
	// Date states
	const new_delivery_date = ref(null);
	const new_po_date = ref(null);
	const new_credit_due_date = ref(null);
	const credit_due_days = ref(null);
	const return_valid_upto_date = ref(null);
	
	// Dialogs
	const custom_days_dialog = ref(false);
	const custom_days_value = ref(null);
	
	const credit_due_presets = [7, 14, 30];

	// Formatting helper (internal or exposed if needed)
	const formatDate = (date) => {
		if (!date) return null;
		// Use frappe.datetime.obj_to_str or similar if available, 
		// or formatUtils.formatDate if strictly purely frontend formatting is needed.
		// Original code: this.formatDate(this.new_delivery_date)
		// which usually wraps frappe.datetime.obj_to_str for backend format YYYY-MM-DD
		if (window.frappe && window.frappe.datetime) {
			return window.frappe.datetime.obj_to_str(date);
		}
		return date; // fallback
	};
	
	const formatDateDisplay = (date) => {
		// Used in applyDuePreset: this.formatDateDisplay(d)
		// Likely returns YYYY-MM-DD for the input[type=date] or similar
		if (window.frappe && window.frappe.datetime) {
			return window.frappe.datetime.obj_to_str(date);
		}
		return date.toISOString().split('T')[0];
	};

	// --- Address Logic ---

	const normalizeAddress = (address) => {
		if (!address) return null;
		const normalized = { ...address };
		const fallback = normalized.address_title || normalized.address_line1 || normalized.name || "";
		normalized.address_title = normalized.address_title || fallback;
		normalized.display_title = fallback;
		return normalized;
	};

	const get_addresses = () => {
		const doc = unref(invoiceDoc);
		if (!doc || !doc.customer) {
			addresses.value = [];
			return;
		}
		frappe.call({
			method: "posawesome.posawesome.api.customers.get_customer_addresses",
			args: { customer: doc.customer },
			async: true,
			callback: function (r) {
				if (!r.exc) {
					const records = Array.isArray(r.message) ? r.message : [];
					const normalized = records.map((row) => normalizeAddress(row)).filter(Boolean);
					addresses.value = normalized;
					
					if (
						doc.shipping_address_name &&
						!normalized.some((row) => row.name === doc.shipping_address_name)
					) {
						doc.shipping_address_name = null;
					}
				} else {
					addresses.value = [];
				}
			},
		});
	};

	const new_address = () => {
		const doc = unref(invoiceDoc);
		if (!doc || !doc.customer) {
			if (stores?.toastStore) {
				stores.toastStore.show({
					title: __("Please select a customer first"),
					color: "error",
				});
			}
			return;
		}
		if (eventBus) {
			eventBus.emit("open_new_address", doc.customer);
		}
	};

	const addressFilter = (item, queryText) => {
		const record = (item && item.raw) || item || {};
		const searchText = (queryText || "").toLowerCase();
		if (!searchText) return true;
		
		const fields = [
			"address_title",
			"address_line1",
			"address_line2",
			"city",
			"state",
			"country",
			"name",
		];
		return fields.some((field) => {
			const value = record[field];
			if (!value) return false;
			return String(value).toLowerCase().includes(searchText);
		});
	};

	// --- Sales Person Logic ---

	const get_sales_person_names = () => {
		const profile = unref(posProfile);
		if (profile?.posa_local_storage && getSalesPersonsStorage().length) {
			try {
				sales_persons.value = getSalesPersonsStorage();
			} catch (e) {
				console.error(e);
			}
		}
		
		frappe.call({
			method: "posawesome.posawesome.api.utilities.get_sales_person_names",
			callback: function (r) {
				if (r.message && r.message.length > 0) {
					sales_persons.value = r.message.map((sp) => ({
						value: sp.name,
						title: sp.sales_person_name,
						sales_person_name: sp.sales_person_name,
						name: sp.name,
					}));
					if (profile?.posa_local_storage) {
						setSalesPersonsStorage(sales_persons.value);
					}
				} else {
					sales_persons.value = [];
				}
			},
		});
	};

	// --- Dates Logic ---

	const update_delivery_date = () => {
		const formatted = formatDate(new_delivery_date.value);
		const doc = unref(invoiceDoc);
		if (doc) {
			doc.posa_delivery_date = formatted;
			if (!formatted) {
				doc.shipping_address_name = null;
			}
		} else if (stores?.invoiceStore) {
			stores.invoiceStore.mergeInvoiceDoc({ posa_delivery_date: formatted });
		}
		
		if (!formatted) {
			addresses.value = [];
		}
	};

	const update_po_date = () => {
		const doc = unref(invoiceDoc);
		if (doc) {
			doc.po_date = formatDate(new_po_date.value);
		}
	};

	const update_credit_due_date = () => {
		const doc = unref(invoiceDoc);
		if (doc) {
			doc.due_date = formatDate(new_credit_due_date.value);
		}
	};

	const applyDuePreset = (days) => {
		if (days === null || days === "") return;
		
		const westernDays = formatUtils.fromArabicNumerals(String(days));
		if (isNaN(westernDays)) return;
		
		const parsed = parseInt(westernDays, 10);
		const d = new Date();
		d.setDate(d.getDate() + parsed);
		
		// In original code: this.formatDateDisplay(d)
		new_credit_due_date.value = formatDateDisplay(d);
		credit_due_days.value = parsed;
		update_credit_due_date();
	};

	const applyCustomDays = () => {
		applyDuePreset(custom_days_value.value);
		custom_days_dialog.value = false;
	};

	// Return Validity
	const calculateReturnValidUntil = (baseDate) => {
		const formattedBase = formatDate(baseDate);
		if (!formattedBase) return null;
		
		const parsed = new Date(formattedBase);
		if (Number.isNaN(parsed.getTime())) return null;
		
		const profile = unref(posProfile);
		const settings = unref(posSettings);
		
		const profileDays = parseInt(profile?.posa_return_validity_days ?? 0, 10);
		const settingsDays = parseInt(settings?.posa_return_validity_days ?? 0, 10);
		const daysSetting = Number.isFinite(profileDays) && profileDays > 0 ? profileDays : settingsDays;
		
		if (Number.isFinite(daysSetting) && daysSetting > 0) {
			parsed.setDate(parsed.getDate() + daysSetting);
		}
		
		const year = parsed.getFullYear();
		const month = `0${parsed.getMonth() + 1}`.slice(-2);
		const day = `0${parsed.getDate()}`.slice(-2);
		return `${year}-${month}-${day}`;
	};

	const initializeReturnValidity = (doc) => {
		// Logic to decide if return validity is enabled
		const profile = unref(posProfile);
		const settings = unref(posSettings);
		const enabled = Boolean(
			profile?.posa_enable_return_validity || settings?.posa_enable_return_validity
		);

		if (!enabled || !doc || doc.is_return) {
			return_valid_upto_date.value = null;
			if (doc) {
				doc.posa_return_valid_upto = null;
			}
			return;
		}

		const existing = doc.posa_return_valid_upto;
		const proposedDate =
			existing ||
			calculateReturnValidUntil(doc.posting_date || frappe.datetime.nowdate());

		return_valid_upto_date.value = proposedDate;
		doc.posa_return_valid_upto = proposedDate;
	};

	return {
		addresses,
		sales_persons,
		new_delivery_date,
		new_po_date,
		new_credit_due_date,
		credit_due_days,
		credit_due_presets,
		custom_days_dialog,
		custom_days_value,
		return_valid_upto_date,
		
		get_addresses,
		new_address,
		addressFilter,
		normalizeAddress,
		get_sales_person_names,
		update_delivery_date,
		update_po_date,
		update_credit_due_date,
		applyDuePreset,
		applyCustomDays,
		initializeReturnValidity,
		calculateReturnValidUntil,
	};
}
