/** A draft/name/transport acknowledgement alone is never proof of submission. */
export function getSubmittedInvoice(response: any) {
	const result = response?.message ?? response;
	const invoice = result?.invoice || result;
	return invoice?.name && Number(invoice.docstatus ?? invoice.status) === 1
		? invoice
		: null;
}

export function requireSubmittedInvoice(response: any) {
	const invoice = getSubmittedInvoice(response);
	if (!invoice)
		throw new Error(
			"Invoice is not submitted. It remains queued for review and retry.",
		);
	return invoice;
}
