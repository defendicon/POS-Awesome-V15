const toNumber = (value: unknown): number => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
};

export const getNetInvoiceSettlementAmount = (
	doc: { rounded_total?: number; grand_total?: number; is_return?: number | boolean } | null | undefined,
	coveredAmount = 0,
) => {
	if (!doc) {
		return 0;
	}

	const invoiceTotal = toNumber(doc.rounded_total || doc.grand_total);
	if (doc.is_return) {
		return Math.abs(invoiceTotal);
	}

	return Math.max(invoiceTotal - toNumber(coveredAmount), 0);
};
