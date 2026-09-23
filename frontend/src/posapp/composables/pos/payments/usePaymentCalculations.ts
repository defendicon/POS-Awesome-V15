import { computed, unref, type Ref } from "vue";
import { formatUtils } from "../../../format";
import {
	fromCompanyCurrency,
	toCompanyCurrency,
} from "../../../utils/erpnextCurrency";

declare const window: any;

export interface PaymentCalculationOptions {
	invoiceDoc: Ref<any>;
	posProfile: Ref<any>;
	currencyPrecision: Ref<number>;
	loyaltyAmount: Ref<number>;
	redeemedCustomerCredit: Ref<number>;
	customerCreditDict: Ref<any[]>;
	customerInfo: Ref<any>;
	giftCardRedemptions?: Ref<any[]>;
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
		giftCardRedemptions,
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

	const currencyContext = (doc = unref(invoiceDoc)) => ({
		...(doc || {}),
		pos_profile: unref(posProfile),
	});

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
				total += flt(fromCompanyCurrency(currencyContext(doc), lAmount));
			} else {
				total += flt(lAmount);
			}
		}

		if (rCredit && doc) {
			if (doc.currency && doc.currency !== profile.currency) {
				total += flt(fromCompanyCurrency(currencyContext(doc), rCredit));
			} else {
				total += flt(rCredit);
			}
		}

		const giftCardRows = giftCardRedemptions ? unref(giftCardRedemptions) : [];
		const giftCardTotal = Array.isArray(giftCardRows)
			? giftCardRows.reduce(
					(sum, row) => sum + flt(row?.amount || 0),
					0,
				)
			: 0;
		total += giftCardTotal;

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
				amount = flt(fromCompanyCurrency(currencyContext(doc), amount));
			}
		}
		return amount;
	});

	const diff_payment = computed(() => {
		const doc = unref(invoiceDoc);
		if (!doc) return 0;

		const rawInvoiceTotal = flt(doc.rounded_total || doc.grand_total);
		const invoiceTotal = doc.is_return
			? rawInvoiceTotal
			: Math.max(rawInvoiceTotal - Math.max(0, flt(doc.posa_exchange_credit || 0)), 0);
		const diff = flt(invoiceTotal - total_payments.value);
		// For returns: negative diff means more refund needed, positive means over-refunded (cap to 0)
		if (doc.is_return) return diff > 0 ? 0 : diff;
		return diff;
	});

	const change_due = computed(() => {
		const doc = unref(invoiceDoc);
		if (!doc) return 0;

		const rawInvoiceTotal = flt(doc.rounded_total || doc.grand_total);
		const invoiceTotal = doc.is_return
			? rawInvoiceTotal
			: Math.max(rawInvoiceTotal - Math.max(0, flt(doc.posa_exchange_credit || 0)), 0);
		const change = flt(total_payments.value - invoiceTotal);
		return change > 0 ? change : 0;
	});

	const base_settlement = computed(() => {
		const doc = unref(invoiceDoc);
		if (!doc) {
			return { paid: 0, target: 0, difference: 0, remaining: 0, change: 0 };
		}

		const invoiceTotal = flt(doc.rounded_total || doc.grand_total);
		const explicitBaseTotal = doc.base_rounded_total || doc.base_grand_total;
		const target = flt(
			explicitBaseTotal || toCompanyCurrency(currencyContext(doc), invoiceTotal),
		);
		let paid = paymentAmountSummary.value.payments.reduce((sum, payment) => {
			const baseAmount = payment?.base_amount;
			return (
				sum +
				flt(
					baseAmount !== undefined && baseAmount !== null
						? baseAmount
						: toCompanyCurrency(currencyContext(doc), payment?.amount || 0),
				)
			);
		}, 0);

		paid += flt(unref(loyaltyAmount) || 0);
		paid += flt(unref(redeemedCustomerCredit) || 0);
		const giftCardRows = giftCardRedemptions ? unref(giftCardRedemptions) : [];
		if (Array.isArray(giftCardRows)) {
			paid += giftCardRows.reduce(
				(sum, row) =>
					sum + flt(toCompanyCurrency(currencyContext(doc), row?.amount || 0)),
				0,
			);
		}

		paid = flt(paid);
		const difference = Number(
			(target - paid).toFixed(unref(currencyPrecision)),
		);
		return {
			paid,
			target,
			difference,
			remaining: difference > 0 ? difference : 0,
			change: difference < 0 ? Math.abs(difference) : 0,
		};
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
		if (doc?.is_return) {
			return diff_payment.value < 0
				? `Remaining Refund (${currency})`
				: `Change (${currency})`;
		}
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
		base_settlement,
		diff_label,
		available_points_amount,
		available_customer_credit,
		shouldAutoApplyCreditChange,
		flt,
	};
}
