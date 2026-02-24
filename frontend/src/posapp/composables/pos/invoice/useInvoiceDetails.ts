import { ref, unref, type Ref } from "vue";
import { formatUtils, normalizeDateForBackend } from "../../../format";
import {
	getSalesPersonsStorage,
	setSalesPersonsStorage,
} from "../../../../offline/index";

declare const frappe: any;
declare const __: (_str: string, _args?: any[]) => string;

export interface InvoiceDetailsOptions {
	invoiceDoc: Ref<any>;
	posProfile: Ref<any>;
	invoiceType: Ref<string>;
	posSettings?: Ref<any>;
	stores?: {
		toastStore?: any;
		invoiceStore?: any;
	};
	eventBus?: any;
}

export interface Address {
	name: string;
	address_title?: string;
	address_line1?: string;
	address_line2?: string;
	city?: string;
	state?: string;
	country?: string;
	display_title?: string;
}

export interface SalesPerson {
	name: string;
	sales_person_name: string;
	value: string;
	title: string;
}

export function useInvoiceDetails(options: InvoiceDetailsOptions) {
	const {
		invoiceDoc,
		posProfile,
		// invoiceType,
		posSettings,
		stores,
		eventBus,
	} = options;

	const addresses = ref<Address[]>([]);
	const sales_persons = ref<SalesPerson[]>([]);

	// Date states
	const new_delivery_date = ref<string | null>(null);
	const new_po_date = ref<string | null>(null);
	const new_credit_due_date = ref<string | null>(null);
	const credit_due_days = ref<number | null>(null);
	const return_valid_upto_date = ref<string | null>(null);

	// Dialogs
	const custom_days_dialog = ref(false);
	const custom_days_value = ref<number | null>(null);

	const credit_due_presets = [7, 14, 30];

	// Formatting helper
	const formatDate = (date: any) => {
		if (!date) return null;
		if (typeof frappe !== "undefined" && frappe.datetime) {
			const formatted = frappe.datetime.obj_to_str(date);
			const normalized = normalizeDateForBackend(formatted);
			if (normalized) {
				return normalized;
			}
		}
		return normalizeDateForBackend(date);
	};

	const formatDateDisplay = (date: any) => {
		if (!date) return "";
		if (typeof frappe !== "undefined" && frappe.datetime) {
			const formatted = frappe.datetime.obj_to_str(date);
			const normalized = normalizeDateForBackend(formatted);
			if (normalized) {
				return normalized;
			}
		}
		if (date instanceof Date) {
			return date.toISOString().split("T")[0];
		}
		return normalizeDateForBackend(date) || "";
	};

	// --- Address Logic ---

	const normalizeAddress = (address: any): Address | null => {
		if (!address) return null;
		const normalized = { ...address };
		const fallback =
			normalized.address_title ||
			normalized.address_line1 ||
			normalized.name ||
			"";
		normalized.address_title = normalized.address_title || fallback;
		normalized.display_title = fallback;
		return normalized as Address;
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
			callback: function (r: any) {
				if (!r.exc) {
					const records = Array.isArray(r.message) ? r.message : [];
					const normalized = records
						.map((row) => normalizeAddress(row))
						.filter((row): row is Address => row !== null);
					addresses.value = normalized;

					if (
						doc.shipping_address_name &&
						!normalized.some(
							(row) => row.name === doc.shipping_address_name,
						)
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

	const addressFilter = (item: any, queryText: string) => {
		const record = (item && item.raw) || item || {};
		const searchText = (queryText || "").toLowerCase();
		if (!searchText) return true;

		const fields: (keyof Address)[] = [
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
			callback: function (r: any) {
				if (r.message && r.message.length > 0) {
					sales_persons.value = r.message.map((sp: any) => ({
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
			stores.invoiceStore.mergeInvoiceDoc({
				posa_delivery_date: formatted,
			});
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

	const applyDuePreset = (days: number | string | null) => {
		if (days === null || days === "") return;

		const westernDays = formatUtils.fromArabicNumerals(String(days));
		const parsed = parseInt(westernDays, 10);
		if (isNaN(parsed)) return;

		const d = new Date();
		d.setDate(d.getDate() + parsed);

		new_credit_due_date.value = formatDateDisplay(d) || null;
		credit_due_days.value = parsed;
		update_credit_due_date();
	};

	const applyCustomDays = () => {
		if (custom_days_value.value !== null) {
			applyDuePreset(custom_days_value.value);
		}
		custom_days_dialog.value = false;
	};

	// Return Validity
	const calculateReturnValidUntil = (baseDate: any) => {
		const formattedBase = formatDate(baseDate);
		if (!formattedBase) return null;

		const parsed = new Date(formattedBase);
		if (Number.isNaN(parsed.getTime())) return null;

		const profile = unref(posProfile);
		const settings = unref(posSettings);

		const profileDays = parseInt(
			profile?.posa_return_validity_days ?? 0,
			10,
		);
		const settingsDays = parseInt(
			settings?.posa_return_validity_days ?? 0,
			10,
		);
		const daysSetting =
			Number.isFinite(profileDays) && profileDays > 0
				? profileDays
				: settingsDays;

		if (Number.isFinite(daysSetting) && daysSetting > 0) {
			parsed.setDate(parsed.getDate() + daysSetting);
		}

		const year = parsed.getFullYear();
		const month = `0${parsed.getMonth() + 1}`.slice(-2);
		const day = `0${parsed.getDate()}`.slice(-2);
		return `${year}-${month}-${day}`;
	};

	const initializeReturnValidity = (doc: any) => {
		const profile = unref(posProfile);
		const settings = unref(posSettings);
		const enabled = Boolean(
			profile?.posa_enable_return_validity ||
			settings?.posa_enable_return_validity,
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
			calculateReturnValidUntil(
				doc.posting_date ||
					(typeof frappe !== "undefined"
						? frappe.datetime.nowdate()
						: new Date().toISOString().split("T")[0]),
			);

		return_valid_upto_date.value = proposedDate;
		doc.posa_return_valid_upto = proposedDate;
	};

	const updateReturnValidUpto = (value: any) => {
		const profile = unref(posProfile);
		const settings = unref(posSettings);
		const enabled = Boolean(
			profile?.posa_enable_return_validity ||
			settings?.posa_enable_return_validity,
		);

		if (!enabled) return;

		const formatted = formatDate(value); // YYYY-MM-DD
		return_valid_upto_date.value = formatDateDisplay(formatted) || null;

		const doc = unref(invoiceDoc);
		if (doc) {
			doc.posa_return_valid_upto = formatted;
		} else if (stores?.invoiceStore) {
			stores.invoiceStore.mergeInvoiceDoc({
				posa_return_valid_upto: formatted,
			});
		}
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
		updateReturnValidUpto,
		formatDateDisplay,
		formatDate,
	};
}
