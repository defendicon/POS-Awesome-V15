import { ref } from "vue";
import { isOffline, getStoredCustomer } from "../../offline/index.js";
import { useCustomersStore } from "../stores/customersStore.js";

export function usePosPayData({
	posProfile,
	company,
	customerName,
	eventBus,
	currencySymbol,
	formatCurrency,
}) {
	const outstanding_invoices = ref([]);
	const unallocated_payments = ref([]);
	const mpesa_payments = ref([]);
	const invoices_loading = ref(false);
	const unallocated_payments_loading = ref(false);
	const mpesa_payments_loading = ref(false);
	const auto_reconcile_loading = ref(false);
	const auto_reconcile_summary = ref("");
	const customer_info = ref("");

	const pos_profiles_list = ref([]);
	const mpesa_search_name = ref("");
	const mpesa_search_mobile = ref("");

	async function get_outstanding_invoices(posProfileSearch = null) {
		invoices_loading.value = true;

		if (isOffline()) {
			outstanding_invoices.value = [];
			invoices_loading.value = false;
			return;
		}

		try {
			const r = await frappe.call("posawesome.posawesome.api.payment_entry.get_outstanding_invoices", {
				customer: customerName.value,
				company: company.value,
				currency: posProfile.value.currency,
				pos_profile: posProfileSearch || null,
				include_all_currencies: true,
			});
			if (r.message) {
				outstanding_invoices.value = r.message;
			}
		} finally {
			invoices_loading.value = false;
		}
	}

	async function get_unallocated_payments() {
		if (!posProfile.value.posa_allow_reconcile_payments) return;
		unallocated_payments_loading.value = true;

		if (!customerName.value || isOffline()) {
			unallocated_payments.value = [];
			unallocated_payments_loading.value = false;
			return;
		}

		try {
			const r = await frappe.call("posawesome.posawesome.api.payment_entry.get_unallocated_payments", {
				customer: customerName.value,
				company: company.value,
				currency: posProfile.value.currency,
			});
			const payments = Array.isArray(r.message) ? r.message : [];
			unallocated_payments.value = payments.map((payment) => ({
				...payment,
				is_credit_note: Boolean(payment?.is_credit_note),
				mode_of_payment: payment?.is_credit_note ? __("Credit Note") : payment?.mode_of_payment,
			}));
		} finally {
			unallocated_payments_loading.value = false;
		}
	}

	async function get_draft_mpesa_payments_register(paymentMethodsList = []) {
		if (!posProfile.value.posa_allow_mpesa_reconcile_payments) return;
		mpesa_payments_loading.value = true;

		if (isOffline()) {
			mpesa_payments.value = [];
			mpesa_payments_loading.value = false;
			return;
		}

		try {
			const r = await frappe.call("posawesome.posawesome.api.m_pesa.get_mpesa_draft_payments", {
				company: company.value,
				mode_of_payment: null,
				full_name: mpesa_search_name.value || null,
				mobile_no: mpesa_search_mobile.value || null,
				payment_methods_list: paymentMethodsList,
			});
			mpesa_payments.value = r.message || [];
		} finally {
			mpesa_payments_loading.value = false;
		}
	}

	async function autoReconcile(posProfileSearch = null) {
		if (!posProfile.value.posa_allow_reconcile_payments) return;
		if (!customerName.value) {
			frappe.msgprint(__("Please select a customer before reconciling."));
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
				const allocatedText = formatCurrency(result.total_allocated || 0);
				const outstandingText = formatCurrency(result.remaining_outstanding || 0);
				auto_reconcile_summary.value = __(
					"Auto reconciliation completed. Allocated: {0}{1}. Remaining outstanding: {0}{2}.",
					[currencySymbol(posProfile.value.currency), allocatedText, outstandingText],
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
				const escapeHtml = frappe.utils?.escape_html || ((value) => value);
				const skippedMessage = skipped_payments
					.map((row) => `<div>${escapeHtml(row)}</div>`)
					.join("");
				frappe.msgprint({
					title: __("Skipped Payments"),
					message: skippedMessage,
					indicator: "orange",
				});
			}
		} catch (error) {
			console.error("Auto reconciliation failed", error);
			frappe.msgprint(error?.message || __("Failed to auto reconcile payments."));
		} finally {
			auto_reconcile_loading.value = false;
		}
	}

	async function fetch_customer_details() {
		if (!customerName.value) return;

		if (isOffline()) {
			try {
				const cached = await getStoredCustomer(customerName.value);
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
				args: { customer: customerName.value },
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
		mpesa_search_name.value = customer_info.value.customer_name.split(" ")[0];
		if (customer_info.value.mobile_no) {
			mpesa_search_mobile.value =
				customer_info.value.mobile_no.substring(0, 4) +
				" ***** " +
				customer_info.value.mobile_no.substring(9);
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
