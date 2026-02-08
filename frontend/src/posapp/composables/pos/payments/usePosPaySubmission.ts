import { ref, type Ref } from "vue";
import { isOffline, saveOfflinePayment } from "../../../../offline/index";

declare const frappe: any;
declare const __: (_text: string, _args?: any[]) => string;
declare const flt: (_value: unknown, _precision?: number) => number;

type PosPaySubmissionArgs = {
	customerName: Ref<string>;
	company: Ref<any>;
	posProfile: Ref<any>;
	posOpeningShift: Ref<any>;
	exchangeRate: Ref<number>;
	invoiceTotalCurrency: Ref<string>;
	payment_methods: Ref<any[]>;
	selected_invoices: Ref<any[]>;
	selected_payments: Ref<any[]>;
	selected_mpesa_payments: Ref<any[]>;
	total_selected_payments: Ref<number>;
	total_selected_mpesa_payments: Ref<number>;
	total_payment_methods: Ref<number>;
	clearSelections: () => void;
	load_print_page: (_name: string) => void;
	eventBus: { emit: (_event: string, _payload?: unknown) => void };
	get_outstanding_invoices: () => void;
	get_unallocated_payments: () => void;
	get_draft_mpesa_payments_register: () => void;
	set_mpesa_search_params: () => void;
};

export function usePosPaySubmission({
	customerName,
	company,
	posProfile,
	posOpeningShift,
	exchangeRate,
	invoiceTotalCurrency,
	payment_methods,
	selected_invoices,
	selected_payments,
	selected_mpesa_payments,
	total_selected_payments,
	total_selected_mpesa_payments,
	total_payment_methods,
	clearSelections,
	load_print_page,
	eventBus,
	get_outstanding_invoices,
	get_unallocated_payments,
	get_draft_mpesa_payments_register,
	set_mpesa_search_params,
}: PosPaySubmissionArgs) {
	const isSubmitting = ref(false);

	async function processPayment({
		printAfter = false,
	}: { printAfter?: boolean } = {}) {
		if (isSubmitting.value) return;

		isSubmitting.value = true;
		const customer = customerName.value;

		const finalizeSubmission = () => {
			clearSelections();
			customerName.value = customer;
			get_outstanding_invoices();
			get_unallocated_payments();
			set_mpesa_search_params();
			get_draft_mpesa_payments_register();
		};

		try {
			if (!customer) {
				frappe.throw(__("Please select a customer"));
			}

			const total_payments =
				total_selected_payments.value +
				total_selected_mpesa_payments.value +
				total_payment_methods.value;

			if (total_payments <= 0) {
				frappe.throw(__("Please make a payment or select an payment"));
			}

			const hasNewPayments = flt(total_payment_methods.value) > 0;
			const hasAllocatedSelections =
				flt(total_selected_payments.value) > 0 ||
				flt(total_selected_mpesa_payments.value) > 0;

			if (
				!hasNewPayments &&
				selected_invoices.value.length === 0 &&
				hasAllocatedSelections
			) {
				frappe.throw(__("Please select an invoice"));
			}

			const selectedInvoicesForPayload = selected_invoices.value.map(
				(invoice: any) => ({ ...invoice }),
			);

			const totalSelectedInvoicesAmount =
				selectedInvoicesForPayload.reduce(
					(acc: number, invoice: any) =>
						acc + flt(invoice?.outstanding_amount || 0),
					0,
				);

			const payload = {
				customer,
				company: company.value,
				currency: invoiceTotalCurrency.value,
				exchange_rate: exchangeRate.value || null,
				pos_opening_shift_name: posOpeningShift.value.name,
				pos_profile_name: posProfile.value.name,
				pos_profile: posProfile.value,
				payment_methods: payment_methods.value.filter(
					(m: any) => flt(m.amount) > 0,
				),
				selected_invoices: selectedInvoicesForPayload,
				selected_payments: selected_payments.value,
				total_selected_invoices: flt(totalSelectedInvoicesAmount),
				selected_mpesa_payments: selected_mpesa_payments.value,
				total_selected_payments: flt(total_selected_payments.value),
				total_payment_methods: flt(total_payment_methods.value),
				total_selected_mpesa_payments: flt(
					total_selected_mpesa_payments.value,
				),
			};

			if (isOffline()) {
				try {
					saveOfflinePayment({ args: { payload } });
					eventBus.emit("show_message", {
						title: __("Payment saved offline"),
						color: "warning",
					});
					finalizeSubmission();
				} catch (error: any) {
					frappe.msgprint(
						__("Cannot Save Offline Payment: ") +
							(error.message || __("Unknown error")),
					);
				}
				return;
			}

			const response: any = await new Promise((resolve, reject) => {
				frappe.call({
					method: "posawesome.posawesome.api.payment_entry.process_pos_payment",
					args: { payload },
					freeze: true,
					freeze_message: __("Processing Payment"),
					callback: (r: any) => resolve(r),
					error: (err: any) => reject(err),
				});
			});

			if (!response || !response.message) {
				return;
			}

			frappe.utils.play_sound("submit");

			if (printAfter) {
				const payment_name =
					response.message.new_payments_entry &&
					response.message.new_payments_entry.length > 0
						? response.message.new_payments_entry[0].name
						: null;

				if (payment_name) {
					load_print_page(payment_name);
				} else {
					frappe.msgprint(
						__(
							"Payment submitted but print function could not be executed. Payment name not found.",
						),
					);
				}
			}

			finalizeSubmission();
		} catch (error) {
			console.error("Failed to process payment", error);
			throw error;
		} finally {
			isSubmitting.value = false;
		}
	}

	return {
		isSubmitting,
		processPayment,
	};
}
