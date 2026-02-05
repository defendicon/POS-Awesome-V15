import { ref, unref, type Ref, type ComputedRef } from "vue";

declare const frappe: any;
declare const __: (str: string, args?: any[]) => string;

export interface PaymentMethodsOptions {
	invoiceDoc: Ref<any>;
	posProfile: Ref<any>;
	diffPayment?: ComputedRef<number>;
	formatFloat?: (val: any) => number;
	stores: {
		toastStore: any;
		uiStore: any;
	};
	eventBus?: any;
	onSubmit?: (args: any, submitPrint: boolean) => void;
	setRedeemCustomerCredit?: (val: boolean) => void;
	customerCreditDict?: Ref<any[]>;
	redeemedCustomerCredit?: Ref<number>;
	isCashback?: Ref<boolean>;
	getTotalChange?: () => number;
	getPaidChange?: () => number;
	getCreditChange?: () => number;
	onBackToInvoice?: () => void;
}

export function usePaymentMethods(options: PaymentMethodsOptions) {
	const {
		invoiceDoc,
		posProfile,
		// diffPayment,
		formatFloat,
		stores,
		eventBus,
		onSubmit,
	} = options;

	const mpesa_modes = ref<string[]>([]);
	const phone_dialog = ref(false);

	const flt = (v: any) => (formatFloat ? formatFloat(v) : parseFloat(String(v)) || 0);

	// Get M-Pesa payment modes from backend
	const get_mpesa_modes = () => {
		const company = unref(posProfile)?.company;
		if (!company) return;

		frappe.call({
			method: "posawesome.posawesome.api.m_pesa.get_mpesa_mode_of_payment",
			args: { company },
			async: true,
			callback: function (r: any) {
				if (!r.exc) {
					mpesa_modes.value = r.message || [];
				} else {
					mpesa_modes.value = [];
				}
			},
		});
	};

	// Check if payment is M-Pesa C2B
	const is_mpesa_c2b_payment = (payment: any) => {
		if (mpesa_modes.value.includes(payment.mode_of_payment) && payment.type === "Bank") {
			payment.amount = 0;
			return true;
		} else {
			return false;
		}
	};

	// Open M-Pesa payment dialog
	const mpesa_c2b_dialog = (payment: any) => {
		const doc = unref(invoiceDoc);
		const company = unref(posProfile)?.company;
		const data = {
			company: company,
			mode_of_payment: payment.mode_of_payment,
			customer: doc.customer,
		};
		if (eventBus) {
			eventBus.emit("open_mpesa_payments", data);
		}
	};

	// Set M-Pesa payment as customer credit
	const set_mpesa_payment = (payment: any) => {
		const doc = unref(invoiceDoc);
		const profile = unref(posProfile);
		if (profile) {
			profile.use_customer_credit = true;
		}
		
		if (options.setRedeemCustomerCredit) {
			options.setRedeemCustomerCredit(true);
		}

		const invoiceAmount = doc.rounded_total || doc.grand_total;
		let amount =
			payment.unallocated_amount > invoiceAmount ? invoiceAmount : payment.unallocated_amount;
		amount = amount > 0 ? amount : 0;
		const advance = {
			type: "Advance",
			credit_origin: payment.name,
			total_credit: flt(payment.unallocated_amount),
			credit_to_redeem: flt(amount),
		};

		clear_all_amounts();
		
		if (options.customerCreditDict) {
			options.customerCreditDict.value.push(advance);
		}
	};

	// Set full amount for a payment mode
	const set_full_amount = (payment: any, isReturn = false) => {
		const doc = unref(invoiceDoc);
		const invoiceAmount = doc.rounded_total || doc.grand_total;
		// Reset other payments
		doc.payments.forEach((p: any) => {
			if (p.mode_of_payment !== payment.mode_of_payment) {
				p.amount = 0;
				if (p.base_amount !== undefined) p.base_amount = 0;
			}
		});

		payment.amount = invoiceAmount;
		if (payment.base_amount !== undefined) {
			payment.base_amount = isReturn ? -Math.abs(invoiceAmount) : invoiceAmount;
		}
	};

	const set_rest_amount = (payment: any, isReturn = false) => {
		const doc = unref(invoiceDoc);
		const invoiceAmount = doc.rounded_total || doc.grand_total;
		const currentPaid = doc.payments.reduce((acc: number, p: any) => acc + flt(p.amount), 0);
		const currentPaymentAmount = flt(payment.amount);
		
		const otherPayments = currentPaid - currentPaymentAmount;
		let amount = invoiceAmount - otherPayments;
		amount = flt(amount);
		
		payment.amount = amount;
		if (payment.base_amount !== undefined) {
			payment.base_amount = isReturn ? -Math.abs(amount) : amount;
		}
	};

	const clear_all_amounts = () => {
		const doc = unref(invoiceDoc);
		if (doc && doc.payments) {
			doc.payments.forEach((payment: any) => {
				payment.amount = 0;
			});
		}
	};

	const request_payment = async (params?: any) => {
		const doc = unref(invoiceDoc);
		phone_dialog.value = false;

		if (!doc.contact_mobile) {
			stores.toastStore.show({
				title: __("Please set the customer's mobile number"),
				color: "error",
			});
			if (eventBus) eventBus.emit("open_edit_customer");
			if (options.onBackToInvoice) options.onBackToInvoice();
			return;
		}

		stores.uiStore.freeze(__("Waiting for payment..."));

		try {
			doc.payments.forEach((payment: any) => {
				payment.amount = flt(payment.amount);
			});
			
			const argsData = {
				...doc,
				total_change: options.getTotalChange ? options.getTotalChange() : 0,
				paid_change: options.getPaidChange ? options.getPaidChange() : 0,
				credit_change: options.getCreditChange ? options.getCreditChange() : 0,
				redeemed_customer_credit: options.redeemedCustomerCredit?.value || 0,
				customer_credit_dict: options.customerCreditDict?.value || [],
				is_cashback: options.isCashback?.value || false,
			};

			const updateResponse = await frappe.call({
				method: "posawesome.posawesome.api.invoices.update_invoice",
				args: { data: argsData },
			});

			if (updateResponse?.message) {
				Object.assign(doc, updateResponse.message);
			}

			const paymentResponse = await frappe.call({
				method: "posawesome.posawesome.api.payments.create_payment_request",
				args: { doc: doc },
			});

			const payment_request_name = paymentResponse?.message?.name;
			if (!payment_request_name) {
				throw new Error("Payment request failed");
			}

			await new Promise<void>((resolve, reject) => {
				setTimeout(async () => {
					try {
						const { message } = await frappe.db.get_value(
							"Payment Request",
							payment_request_name,
							["status", "grand_total"],
						);

						if (!message) {
							stores.toastStore.show({
								title: __("Payment request status could not be retrieved. Please try again"),
								color: "error",
							});
							resolve();
							return;
						}

						if (message.status !== "Paid") {
							stores.toastStore.show({
								title: __("Payment Request took too long to respond. Please try requesting for payment again"),
								color: "error",
							});
							resolve();
							return;
						}

						stores.toastStore.show({
							title: __("Payment of {0} received successfully.", [
								message.grand_total,
							]),
							color: "success",
						});

						const newDoc = await frappe.db.get_doc(
							doc.doctype,
							doc.name,
						);
						Object.assign(doc, newDoc);
						
						if (onSubmit) onSubmit(null, true);
						resolve();
					} catch (error) {
						reject(error);
					}
				}, 30000);
			});
		} catch (error: any) {
			console.error("Payment request error:", error);
			stores.toastStore.show({
				title: __(error.message || "Payment request failed"),
				color: "error",
			});
		} finally {
			stores.uiStore.unfreeze();
		}
	};

	return {
		mpesa_modes,
		phone_dialog,
		get_mpesa_modes,
		is_mpesa_c2b_payment,
		mpesa_c2b_dialog,
		set_mpesa_payment,
		set_full_amount,
		set_rest_amount,
		clear_all_amounts,
		request_payment,
	};
}
