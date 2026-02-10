import { computed, unref, type Ref } from "vue";
import { formatUtils } from "../../../format";

declare const window: any;

export interface PaymentCalculationOptions {
	invoiceDoc: Ref<any>;
	posProfile: Ref<any>;
	currencyPrecision: Ref<number>;
	loyaltyAmount: Ref<number>;
	redeemedCustomerCredit: Ref<number>;
	customerCreditDict: Ref<any[]>;
	customerInfo: Ref<any>;
	formatCurrency: (_value: number, _currency: string) => string;
}

/**
 * Composable for payment calculations (totals, differences, change due).
 * Extracted from Payments.vue for better maintainability and reusability.
 */
export function usePaymentCalculations(options: PaymentCalculationOptions) {
	const {
		invoiceDoc,
		posProfile,
		currencyPrecision,
		loyaltyAmount,
		redeemedCustomerCredit,
		customerCreditDict,
		customerInfo,
		formatCurrency,
	} = options;

	// Local flt helper using global flt or falling back to parseFloat
	const flt = (val: any, prec?: number): number => {
		const precision = prec !== undefined ? prec : unref(currencyPrecision);
		if (typeof val === "string") {
			val = formatUtils.fromArabicNumerals(val).replace(/,/g, "");
		}
		return typeof window !== "undefined" && window.flt
			? window.flt(val, precision)
			: parseFloat(String(val)) || 0;
	};

	/**
	 * Performance: normalize payment amounts once per reactive update.
	 */
	const paymentAmountSummary = computed(() => {
		const doc = unref(invoiceDoc);
		const payments = Array.isArray(doc?.payments) ? doc.payments : [];
		let total = 0;
		const amountByPayment = new Map<any, number>();

		payments.forEach((payment) => {
			const amount = flt(payment?.amount);
			amountByPayment.set(payment, amount);
			total += amount;
		});

		return {
			payments,
			amountByPayment,
			total: flt(total),
		};
	});

	/**
	 * Calculate total payments including all methods, loyalty points, and customer credit.
	 */
	const total_payments = computed(() => {
		let total = paymentAmountSummary.value.total;
		const doc = unref(invoiceDoc);
		const profile = unref(posProfile);
		const lAmount = unref(loyaltyAmount);
		const rCredit = unref(redeemedCustomerCredit);

		if (lAmount && doc) {
			if (doc.currency && doc.currency !== profile.currency) {
				total += flt(lAmount / (doc.conversion_rate || 1));
			} else {
				total += flt(lAmount);
			}
		}

		if (rCredit && doc) {
			if (doc.currency && doc.currency !== profile.currency) {
				total += flt(rCredit / (doc.conversion_rate || 1));
			} else {
				total += flt(rCredit);
			}
		}

		return flt(total);
	});

	const available_customer_credit = computed(() => {
		const dict = unref(customerCreditDict);
		if (!Array.isArray(dict)) return 0;
		return dict.reduce((total, row) => total + flt(row.total_credit), 0);
	});

	const available_points_amount = computed(() => {
		let amount = 0;
		const doc = unref(invoiceDoc);
		const info = unref(customerInfo);
		const profile = unref(posProfile);

		if (info?.loyalty_points && doc) {
			amount = info.loyalty_points * (info.conversion_factor || 1);
			if (doc.currency !== profile.currency) {
				amount = flt(amount / (doc.conversion_rate || 1));
			}
		}
		return amount;
	});

	const diff_payment = computed(() => {
		const doc = unref(invoiceDoc);
		const profile = unref(posProfile);
		if (!doc) return 0;

		let invoice_total;
		if (
			profile.posa_allow_multi_currency &&
			doc.currency !== profile.currency
		) {
			invoice_total = flt(doc.grand_total);
		} else {
			invoice_total = flt(doc.rounded_total || doc.grand_total);
		}

		let diff = flt(invoice_total - total_payments.value);
		if (doc.is_return) return diff >= 0 ? diff : 0;
		return diff;
	});

	const change_due = computed(() => {
		const doc = unref(invoiceDoc);
		const profile = unref(posProfile);
		if (!doc) return 0;

		let invoice_total;
		if (
			profile.posa_allow_multi_currency &&
			doc.currency !== profile.currency
		) {
			invoice_total = flt(doc.grand_total);
		} else {
			invoice_total = flt(doc.rounded_total || doc.grand_total);
		}

		let change = flt(total_payments.value - invoice_total);
		return change > 0 ? change : 0;
	});

	const isCashLikePayment = (payment: any) => {
		const mop = payment?.mode_of_payment?.toLowerCase() || "";
		return (
			mop.includes("cash") ||
			mop.includes("money") ||
			mop.includes("نقدي")
		);
	};

	const shouldAutoApplyCreditChange = computed(() => {
		const doc = unref(invoiceDoc);
		if (!doc || doc.is_return || change_due.value <= 0) return false;

		const { payments, amountByPayment } = paymentAmountSummary.value;
		const totals = payments.reduce(
			(accumulator, payment) => {
				if (!payment) return accumulator;
				const amount = flt(amountByPayment.get(payment) || 0);
				if (isCashLikePayment(payment)) accumulator.cash += amount;
				else accumulator.nonCash += amount;
				return accumulator;
			},
			{ cash: 0, nonCash: 0 },
		);

		return totals.nonCash > 0 && totals.cash === 0;
	});

	const diff_label = computed(() => {
		const doc = unref(invoiceDoc);
		const currency = doc ? doc.currency : "";
		return diff_payment.value > 0
			? `To Be Paid (${currency})`
			: `Change (${currency})`;
	});

	const total_payments_display = computed(() => {
		const doc = unref(invoiceDoc);
		return formatCurrency(total_payments.value, doc?.currency);
	});

	const diff_payment_display = computed(() => {
		const doc = unref(invoiceDoc);
		const value = Math.abs(diff_payment.value);
		return formatCurrency(value, doc?.currency);
	});

	return {
		paymentAmountSummary,
		total_payments,
		total_payments_display,
		diff_payment,
		diff_payment_display,
		change_due,
		diff_label,
		available_points_amount,
		available_customer_credit,
		shouldAutoApplyCreditChange,
		flt,
	};
}
