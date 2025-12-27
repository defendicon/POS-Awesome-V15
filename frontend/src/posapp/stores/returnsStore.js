/**
 * Centralized returns dialog state management using Pinia.
 */

import { defineStore } from "pinia";
import { ref } from "vue";

export const useReturnsStore = defineStore("returns", () => {
	const invoicesDialog = ref(false);
	const selected = ref([]);
	const dialog_data = ref([]);
	const company = ref("");
	const invoice_name = ref("");
	const customer_name = ref("");
	const customer_id = ref("");
	const mobile_no = ref("");
	const tax_id = ref("");
	const from_date = ref(null);
	const to_date = ref(null);
	const from_date_formatted = ref(null);
	const to_date_formatted = ref(null);
	const min_amount = ref("");
	const max_amount = ref("");
	const pos_profile = ref(null);
	const page = ref(1);
	const has_more_invoices = ref(false);
	const loading_more = ref(false);
	const searched_once = ref(false);
	const current_search_params = ref(null);

	const resetSearch = () => {
		invoice_name.value = "";
		customer_name.value = "";
		customer_id.value = "";
		mobile_no.value = "";
		tax_id.value = "";
		from_date.value = null;
		to_date.value = null;
		from_date_formatted.value = null;
		to_date_formatted.value = null;
		min_amount.value = "";
		max_amount.value = "";
		dialog_data.value = [];
		page.value = 1;
		has_more_invoices.value = false;
		loading_more.value = false;
		searched_once.value = false;
		current_search_params.value = null;
	};

	const resetDialog = () => {
		resetSearch();
		selected.value = [];
	};

	const openDialog = (companyName = "") => {
		invoicesDialog.value = true;
		company.value = companyName || "";
		resetDialog();
	};

	const closeDialog = () => {
		invoicesDialog.value = false;
	};

	const setPosProfile = (profile) => {
		pos_profile.value = profile || null;
	};

	return {
		invoicesDialog,
		selected,
		dialog_data,
		company,
		invoice_name,
		customer_name,
		customer_id,
		mobile_no,
		tax_id,
		from_date,
		to_date,
		from_date_formatted,
		to_date_formatted,
		min_amount,
		max_amount,
		pos_profile,
		page,
		has_more_invoices,
		loading_more,
		searched_once,
		current_search_params,
		resetSearch,
		resetDialog,
		openDialog,
		closeDialog,
		setPosProfile,
	};
});
