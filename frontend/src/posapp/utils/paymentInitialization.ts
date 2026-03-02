export type PaymentLine = {
	mode_of_payment?: string;
	amount?: number;
	base_amount?: number;
	default?: number | boolean;
	type?: string;
};

export type PaymentInitDoc = {
	payments?: PaymentLine[];
	rounded_total?: number;
	grand_total?: number;
	conversion_rate?: number;
	is_return?: number | boolean;
};

const toNumber = (value: unknown): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

const hasMeaningfulAmount = (
	payment: PaymentLine | null | undefined,
	precision = 2,
): boolean => {
	const epsilon = Math.pow(10, -(Math.max(precision, 0) + 1));
	return Math.abs(toNumber(payment?.amount)) > epsilon;
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

	const payments = doc.payments.filter((payment) => !!payment?.mode_of_payment);
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
	const normalizedTotal =
		doc.is_return ? -Math.abs(total) : Math.abs(total);
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
		preferredPayment.base_amount = normalizedTotal * conversionRate;
	}

	return preferredPayment;
};
