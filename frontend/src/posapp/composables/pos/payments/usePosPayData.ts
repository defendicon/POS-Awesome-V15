import { ref, type Ref } from "vue";
import { isOffline, getStoredCustomer } from "../../../../offline/index";
import { useCustomersStore } from "../../../stores/customersStore.js";

declare const frappe: any;
declare const __: (_text: string, _args?: any[]) => string;

type PosPayDataArgs = {
	posProfile: Ref<any>;
	company: Ref<any>;
	customerName: Ref<string>;
	eventBus: { emit: (_event: string, _payload?: unknown) => void };
	currencySymbol: (_currency: string) => string;
	formatCurrency: (_value: number) => string;
};

export function usePosPayData({
	posProfile,
	company,
	customerName,
	eventBus,
	currencySymbol,
	formatCurrency,
}: PosPayDataArgs) {
	const OUTSTANDING_INVOICES_PAGE_LENGTH = 300;
	const outstanding_invoices = ref<any[]>([]);
	const unallocated_payments = ref<any[]>([]);
	const mpesa_payments = ref<any[]>([]);
	const invoices_loading = ref(false);
	const unallocated_payments_loading = ref(false);
	const mpesa_payments_loading = ref(false);
	const auto_reconcile_loading = ref(false);
	const auto_reconcile_summary = ref("");
	const customer_info = ref<any>("");
	const outstandingReqToken = ref(0);
	const unallocatedReqToken = ref(0);
	const mpesaReqToken = ref(0);

	const pos_profiles_list = ref<any[]>([]);
	const mpesa_search_name = ref("");
	const mpesa_search_mobile = ref("");

	async function get_outstanding_invoices(
		posProfileSearch?: string | null,
	) {
		invoices_loading.value = true;
		const requestToken = ++outstandingReqToken.value;
		const requestCustomer = customerName.value;
		const requestCompany = company.value;

		if (!customerName.value || !company.value) {
			outstanding_invoices.value = [];
			invoices_loading.value = false;
			return;
		}

		if (isOffline()) {
			outstanding_invoices.value = [];
			invoices_loading.value = false;
			return;
		}

		try {
			const resolvedPosProfile =
				typeof posProfileSearch === "undefined"
					? posProfile.value?.name || null
					: posProfileSearch || null;

			const r = await frappe.call(
				"posawesome.posawesome.api.payment_entry.get_outstanding_invoices",
				{
					customer: customerName.value,
					company: company.value,
					currency: posProfile.value.currency,
					pos_profile: resolvedPosProfile,
					include_all_currencies: true,
					page_start: 0,
					page_length: OUTSTANDING_INVOICES_PAGE_LENGTH,
				},
			);

			if (
				requestToken !== outstandingReqToken.value ||
				requestCustomer !== customerName.value ||
				requestCompany !== company.value
			) {
				return;
			}

			outstanding_invoices.value = Array.isArray(r.message)
				? r.message
				: [];
		} catch {
			if (requestToken === outstandingReqToken.value) {
				outstanding_invoices.value = [];
			}
		} finally {
			if (requestToken === outstandingReqToken.value) {
				invoices_loading.value = false;
			}
		}
	}

	async function get_unallocated_payments() {
		if (!posProfile.value.posa_allow_reconcile_payments) return;
		unallocated_payments_loading.value = true;
		const requestToken = ++unallocatedReqToken.value;
		const requestCustomer = customerName.value;
		const requestCompany = company.value;

		if (!customerName.value || !company.value || isOffline()) {
			unallocated_payments.value = [];
			unallocated_payments_loading.value = false;
			return;
		}

		try {
			const r = await frappe.call(
				"posawesome.posawesome.api.payment_entry.get_unallocated_payments",
				{
					customer: customerName.value,
					company: company.value,
					currency: posProfile.value?.currency || null,
					include_all_currencies: true,
				},
			);

			if (
				requestToken !== unallocatedReqToken.value ||
				requestCustomer !== customerName.value ||
				requestCompany !== company.value
			) {
				return;
			}

			const payments = Array.isArray(r.message) ? r.message : [];
			unallocated_payments.value = payments.map((payment: any) => ({
				...payment,
				is_credit_note: Boolean(payment?.is_credit_note),
				mode_of_payment: payment?.is_credit_note
					? __("Credit Note")
					: payment?.mode_of_payment,
			}));
		} catch {
			if (requestToken === unallocatedReqToken.value) {
				unallocated_payments.value = [];
			}
		} finally {
			if (requestToken === unallocatedReqToken.value) {
				unallocated_payments_loading.value = false;
			}
		}
	}

	async function get_draft_mpesa_payments_register(
		paymentMethodsList: unknown[] = [],
	) {
		if (!posProfile.value.posa_allow_mpesa_reconcile_payments) return;
		mpesa_payments_loading.value = true;
		const requestToken = ++mpesaReqToken.value;
		const requestCompany = company.value;

		if (!company.value) {
			mpesa_payments.value = [];
			mpesa_payments_loading.value = false;
			return;
		}

		if (isOffline()) {
			mpesa_payments.value = [];
			mpesa_payments_loading.value = false;
			return;
		}

		try {
			const r = await frappe.call(
				"posawesome.posawesome.api.m_pesa.get_mpesa_draft_payments",
				{
					company: company.value,
					mode_of_payment: null,
					full_name: mpesa_search_name.value || null,
					mobile_no: mpesa_search_mobile.value || null,
					payment_methods_list: paymentMethodsList,
				},
			);
			if (
				requestToken !== mpesaReqToken.value ||
				requestCompany !== company.value
			) {
				return;
			}
			mpesa_payments.value = r.message || [];
		} catch {
			if (requestToken === mpesaReqToken.value) {
				mpesa_payments.value = [];
			}
		} finally {
			if (requestToken === mpesaReqToken.value) {
				mpesa_payments_loading.value = false;
			}
		}
	}

	async function autoReconcile(posProfileSearch: string | null = null) {
		if (!posProfile.value.posa_allow_reconcile_payments) return;
		if (!customerName.value) {
			frappe.msgprint(__("Please select a customer before reconciling."));
			return;
		}
		if (!company.value) {
			frappe.msgprint(__("Please select company before reconciling."));
			return;
		}
		if (!outstanding_invoices.value.length || isOffline()) return;

		auto_reconcile_loading.value = true;
		auto_reconcile_summary.value = "";

		try {
			const response = await frappe.call({
				method: "posawesome.posawesome.api.payment_entry.auto_reconcile_customer_invoices",
				args: {
					customer: customerName.value,
					company: company.value,
					currency: posProfile.value.currency,
					pos_profile: posProfileSearch || null,
				},
				freeze: true,
				freeze_message: __("Reconciling Payments"),
			});

			const result = response?.message || {};
			const { summary, total_allocated, skipped_payments } = result;

			auto_reconcile_summary.value = summary || "";
			if (!auto_reconcile_summary.value) {
				const allocatedText = formatCurrency(
					result.total_allocated || 0,
				);
				const outstandingText = formatCurrency(
					result.remaining_outstanding || 0,
				);
				auto_reconcile_summary.value = __(
					"Auto reconciliation completed. Allocated: {0}{1}. Remaining outstanding: {0}{2}.",
					[
						currencySymbol(posProfile.value.currency),
						allocatedText,
						outstandingText,
					],
				);
			}

			await get_outstanding_invoices(posProfileSearch);
			await get_unallocated_payments();

			if (auto_reconcile_summary.value) {
				eventBus.emit("show_message", {
					title: auto_reconcile_summary.value,
					color: total_allocated ? "success" : "info",
				});
			}

			if (Array.isArray(skipped_payments) && skipped_payments.length) {
				const escapeHtml =
					frappe.utils?.escape_html || ((value: string) => value);
				const skippedMessage = skipped_payments
					.map((row: string) => `<div>${escapeHtml(row)}</div>`)
					.join("");
				frappe.msgprint({
					title: __("Skipped Payments"),
					message: skippedMessage,
					indicator: "orange",
				});
			}
		} catch (error: any) {
			console.error("Auto reconciliation failed", error);
			frappe.msgprint(
				error?.message || __("Failed to auto reconcile payments."),
			);
		} finally {
			auto_reconcile_loading.value = false;
		}
	}

	async function fetch_customer_details() {
		const customer =
			typeof customerName.value === "string"
				? customerName.value.trim()
				: "";
		if (!customer) return;

		if (isOffline()) {
			try {
				const cached = await getStoredCustomer(customer);
				if (cached) {
					customer_info.value = { ...cached };
					set_mpesa_search_params();
					useCustomersStore().setCustomerInfo(customer_info.value);
					return;
				}
			} catch (error) {
				console.error("Failed to fetch cached customer", error);
			}
			return;
		}

		try {
			const r = await frappe.call({
				method: "posawesome.posawesome.api.customers.get_customer_info",
				args: { customer },
			});
			if (r.message && !r.exc) {
				customer_info.value = { ...r.message };
				set_mpesa_search_params();
				useCustomersStore().setCustomerInfo(customer_info.value);
			}
		} catch (error) {
			console.error("Failed to fetch customer details", error);
		}
	}

	function set_mpesa_search_params() {
		if (!posProfile.value.posa_allow_mpesa_reconcile_payments) return;
		if (!customerName.value || !customer_info.value) return;
		mpesa_search_name.value =
			String(customer_info.value.customer_name || "").split(" ")[0] || "";
		if (customer_info.value.mobile_no) {
			const mobile = String(customer_info.value.mobile_no);
			mpesa_search_mobile.value =
				mobile.substring(0, 4) + " ***** " + mobile.substring(9);
		}
	}

	async function get_pos_profiles() {
		try {
			const r = await frappe.call("frappe.client.get_list", {
				doctype: "POS Profile",
				fields: ["name"],
				limit_page_length: 100,
			});
			pos_profiles_list.value = r.message || [];
		} catch (e) {
			console.error("Failed to fetch POS profiles", e);
		}
	}

	return {
		outstanding_invoices,
		unallocated_payments,
		mpesa_payments,
		invoices_loading,
		unallocated_payments_loading,
		mpesa_payments_loading,
		auto_reconcile_loading,
		auto_reconcile_summary,
		customer_info,
		pos_profiles_list,
		mpesa_search_name,
		mpesa_search_mobile,
		get_outstanding_invoices,
		get_unallocated_payments,
		get_draft_mpesa_payments_register,
		get_pos_profiles,
		autoReconcile,
		fetch_customer_details,
		set_mpesa_search_params,
	};
}
