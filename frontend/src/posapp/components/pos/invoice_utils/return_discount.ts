export function getReturnDiscountProration(context: any) {
	if (
		!context ||
		!context.isReturnInvoice ||
		context.pos_profile?.posa_use_percentage_discount ||
		!context.return_doc ||
		typeof context.return_doc !== "object"
	) {
		return null;
	}

	const returnDoc = context.return_doc;
	const originalDiscount = Math.abs(
		Number(context.return_discount_base_amount || returnDoc.discount_amount || 0),
	);
	const originalTotal = Math.abs(
		Number(
			context.return_discount_base_total ??
				returnDoc.total ??
				returnDoc.net_total ??
				returnDoc.grand_total ??
				0,
		),
	);
	const returnTotal = Math.abs(Number(context.Total || 0));

	if (!originalDiscount || !originalTotal || !returnTotal) {
		return null;
	}

	const ratio = Math.min(1, returnTotal / originalTotal);
	const prorated = -Math.abs(originalDiscount * ratio);

	return {
		originalDiscount,
		originalTotal,
		returnTotal,
		ratio,
		prorated,
	};
}

export function syncReturnDiscountProration(context: any, logLabel?: string) {
	const proration = getReturnDiscountProration(context);
	if (!proration) {
		return null;
	}

	const current = Number(context.additional_discount || 0);
	if (Math.abs(current - proration.prorated) > 0.0001) {
		if (logLabel) {
			console.log(logLabel, proration);
		}
		context.additional_discount = proration.prorated;
		context.discount_amount = proration.prorated;
		context.additional_discount_percentage = 0;
	}

	return proration;
}
