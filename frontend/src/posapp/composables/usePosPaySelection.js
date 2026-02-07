import { ref, computed } from "vue";

export function usePosPaySelection({ posProfile, currency_filter }) {
	const selected_invoices = ref([]);
	const selected_payments = ref([]);
	const selected_mpesa_payments = ref([]);
	const payment_methods = ref([]);

	const total_selected_invoices = computed(() => {
		if (!selected_invoices.value.length) return 0;
		return selected_invoices.value.reduce((acc, cur) => {
			const invoice_currency = cur.currency || posProfile.value.currency;
			if (
				currency_filter.value === "ALL" ||
				!currency_filter.value ||
				invoice_currency === currency_filter.value
			) {
				return acc + flt(cur?.outstanding_amount || 0);
			}
			return acc;
		}, 0);
	});

	const total_selected_payments = computed(() => {
		if (!selected_payments.value.length) return 0;
		return selected_payments.value.reduce((acc, cur) => acc + flt(cur?.unallocated_amount || 0), 0);
	});

	const total_selected_mpesa_payments = computed(() => {
		if (!selected_mpesa_payments.value.length) return 0;
		return selected_mpesa_payments.value.reduce((acc, cur) => acc + flt(cur?.amount || 0), 0);
	});

	const total_payment_methods = computed(() => {
		if (!payment_methods.value.length) return 0;
		return payment_methods.value.reduce((acc, cur) => {
			const amount = parseFloat(cur?.amount || 0);
			return acc + (isNaN(amount) ? 0 : amount);
		}, 0);
	});

	const total_of_diff = computed(() => {
		const invoiceTotal = total_selected_invoices.value || 0;
		const paymentTotal =
			total_selected_payments.value + total_selected_mpesa_payments.value + total_payment_methods.value;
		return flt(invoiceTotal - paymentTotal);
	});

	function toggleInvoiceSelection(item, customerName, onCustomerSelected) {
		const index = selected_invoices.value.findIndex((i) => i.voucher_no === item.voucher_no);
		if (index > -1) {
			selected_invoices.value.splice(index, 1);
		} else {
			selected_invoices.value.push(item);
			if (item.customer && !customerName.value && onCustomerSelected) {
				onCustomerSelected(item.customer);
			}
		}
	}

	function isInvoiceSelected(item) {
		return selected_invoices.value.some((i) => i.voucher_no === item.voucher_no);
	}

	function clearSelections() {
		selected_invoices.value = [];
		selected_payments.value = [];
		selected_mpesa_payments.value = [];
	}

	return {
		selected_invoices,
		selected_payments,
		selected_mpesa_payments,
		payment_methods,
		total_selected_invoices,
		total_selected_payments,
		total_selected_mpesa_payments,
		total_payment_methods,
		total_of_diff,
		toggleInvoiceSelection,
		isInvoiceSelected,
		clearSelections,
	};
}
