import { toCompanyCurrency } from "./erpnextCurrency";

export type PaymentLine = {
	mode_of_payment?: string;
	amount?: number;
	base_amount?: number;
	default?: number | boolean;
	type?: string;
	account?: string;
};

export type PaymentInitDoc = {
	payments?: PaymentLine[];
	rounded_total?: number;
	grand_total?: number;
	currency?: string;
	selected_currency?: string;
	pos_profile?: { currency?: string };
	conversion_rate?: number;
	is_return?: number | boolean;
	// Max cash refundable on a return (= amount paid on the original invoice).
	// Undefined means "no cap known" → fall back to the full return total.
	posa_refundable_amount?: number;
};

export type PreferredPaymentRebalanceOptions = {
	precision?: number;
	isCashLikePayment: (_payment: PaymentLine) => boolean;
	loyaltyAmount?: number;
	redeemedCustomerCredit?: number;
	giftCardAmount?: number;
};

const toNumber = (value: unknown): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const roundToPrecision = (value: number, precision = 2): number => {
	const factor = Math.pow(10, Math.max(precision, 0));
	return Math.round((value + Number.EPSILON) * factor) / factor;
};

const hasMeaningfulAmount = (
	payment: PaymentLine | null | undefined,
	precision = 2,
): boolean => {
	const epsilon = Math.pow(10, -(Math.max(precision, 0) + 1));
	return Math.abs(toNumber(payment?.amount)) > epsilon;
};

/**
 * Default payment amount to pre-fill for a document.
 *
 * For normal invoices this is the positive grand total. For returns it is the
 * negative grand total, BUT capped at how much the customer actually paid on
 * the original invoice (`posa_refundable_amount`). For a return of an unpaid
 * (credit) invoice the cap is 0, so nothing is refunded as cash and the return
 * is recorded as a credit note that reduces the customer's outstanding balance.
 * When the cap is unknown (undefined) we fall back to the full return total to
 * preserve the previous behaviour for paid invoices.
 */
export const resolveReturnDefaultAmount = (
	doc: PaymentInitDoc | null | undefined,
	total: number,
): number => {
	if (!doc?.is_return) {
		return Math.abs(total);
	}
	const refundable = doc.posa_refundable_amount;
	if (refundable === undefined || refundable === null) {
		return -Math.abs(total);
	}
	return -Math.min(Math.abs(total), Math.max(0, toNumber(refundable)));
};

export const resolvePreferredPaymentLine = (
	doc: PaymentInitDoc | null | undefined,
	isCashLikePayment: (_payment: PaymentLine) => boolean,
): PaymentLine | null => {
	const payments = Array.isArray(doc?.payments)
		? doc.payments.filter((payment) => !!payment?.mode_of_payment)
		: [];

	if (!payments.length) {
		return null;
	}

	return (
		payments.find(
			(payment) => payment.default === 1 || payment.default === true,
		) ||
		payments.find((payment) => isCashLikePayment(payment)) ||
		payments[0] ||
		null
	);
};

export const initializePaymentLinesForDialog = (
	doc: PaymentInitDoc | null | undefined,
	precision: number,
	isCashLikePayment: (_payment: PaymentLine) => boolean,
): PaymentLine | null => {
	if (!doc || !Array.isArray(doc.payments) || !doc.payments.length) {
		return null;
	}

	const payments = doc.payments.filter(
		(payment) => !!payment?.mode_of_payment,
	);
	if (!payments.length) {
		return null;
	}

	const preferredPayment = resolvePreferredPaymentLine(
		doc,
		isCashLikePayment,
	);
	if (!preferredPayment) {
		return null;
	}

	const total = toNumber(doc.rounded_total || doc.grand_total);
	const normalizedTotal = resolveReturnDefaultAmount(doc, total);
	const conversionRate = toNumber(doc.conversion_rate) || 1;
	const existingAmounts = payments.some((payment) =>
		hasMeaningfulAmount(payment, precision),
	);

	if (existingAmounts) {
		if (doc.is_return) {
			payments.forEach((payment) => {
				const amount = toNumber(payment.amount);
				if (amount > 0) {
					payment.amount = -Math.abs(amount);
				}
				if (payment.base_amount !== undefined) {
					const baseAmount = toNumber(payment.base_amount);
					if (baseAmount > 0) {
						payment.base_amount = -Math.abs(baseAmount);
					}
				}
			});
		}
		return preferredPayment;
	}

	payments.forEach((payment) => {
		payment.amount = 0;
		if (payment.base_amount !== undefined) {
			payment.base_amount = 0;
		}
	});

	preferredPayment.amount = normalizedTotal;
	if (preferredPayment.base_amount !== undefined) {
		preferredPayment.base_amount = toCompanyCurrency(doc, normalizedTotal);
	}

	return preferredPayment;
};

export const applyPreferredPaymentAmount = (
	doc: PaymentInitDoc | null | undefined,
	amount: number,
	precision: number,
	isCashLikePayment: (_payment: PaymentLine) => boolean,
): PaymentLine | null => {
	if (!doc || !Number.isFinite(Number(amount))) {
		return null;
	}

	const preferredPayment = resolvePreferredPaymentLine(
		doc,
		isCashLikePayment,
	);
	if (!preferredPayment) {
		return null;
	}

	const normalizedAmount = roundToPrecision(
		Math.abs(Number(amount)),
		precision,
	);
	const signedAmount = doc.is_return
		? resolveReturnDefaultAmount(doc, normalizedAmount)
		: normalizedAmount;

	(doc.payments || []).forEach((payment) => {
		payment.amount = payment === preferredPayment ? signedAmount : 0;
		if (payment.base_amount !== undefined) {
			payment.base_amount =
				payment === preferredPayment
					? roundToPrecision(
							toCompanyCurrency(doc, signedAmount),
							precision,
						)
					: 0;
		}
	});

	return preferredPayment;
};

export const rebalancePreferredPaymentLine = (
	doc: PaymentInitDoc | null | undefined,
	options: PreferredPaymentRebalanceOptions,
): PaymentLine | null => {
	if (!doc || !Array.isArray(doc.payments) || !doc.payments.length) {
		return null;
	}

	const payments = doc.payments.filter(
		(payment) => !!payment?.mode_of_payment,
	);
	if (!payments.length) {
		return null;
	}

	const preferredPayment = resolvePreferredPaymentLine(
		doc,
		options.isCashLikePayment,
	);
	if (!preferredPayment) {
		return null;
	}

	const precision = options.precision ?? 2;
	const invoiceTotal = toNumber(doc.rounded_total || doc.grand_total);
	const coveredAmount =
		toNumber(options.loyaltyAmount) +
		toNumber(options.redeemedCustomerCredit) +
		toNumber(options.giftCardAmount);
	const otherPaymentsTotal = payments.reduce((sum, payment) => {
		if (payment === preferredPayment) {
			return sum;
		}
		return sum + toNumber(payment.amount);
	}, 0);

	let nextAmount = invoiceTotal - coveredAmount - otherPaymentsTotal;
	if (doc.is_return) {
		nextAmount = -Math.abs(nextAmount);
		// Never auto-refund more cash than was paid on the original invoice.
		const refundable = doc.posa_refundable_amount;
		if (refundable !== undefined && refundable !== null) {
			nextAmount = Math.max(
				nextAmount,
				-Math.max(0, toNumber(refundable)),
			);
		}
	} else {
		nextAmount = Math.max(nextAmount, 0);
	}

	const normalizedAmount = roundToPrecision(nextAmount, precision);
	preferredPayment.amount = normalizedAmount;

	if (preferredPayment.base_amount !== undefined) {
		preferredPayment.base_amount = roundToPrecision(
			toCompanyCurrency(doc, normalizedAmount),
			precision,
		);
	}

	return preferredPayment;
};
