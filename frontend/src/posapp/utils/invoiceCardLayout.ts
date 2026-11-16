export const invoiceCardDefaults = [
	{ id: "customer", label: "Customer Details", width: "auto" },
	{ id: "delivery", label: "Delivery Charges", width: "auto" },
	{ id: "posting", label: "Posting and Price List", width: "auto" },
	{ id: "currency", label: "Multi Currency", width: "auto" },
	{ id: "items", label: "Invoice Items", width: "full" },
] as const;

export type InvoiceCardId = (typeof invoiceCardDefaults)[number]["id"];
export type InvoiceCardPreference = {
	id: InvoiceCardId;
	width: "auto" | "full";
};

// Keep every supported card once, including cards currently disabled by the profile.
export function normalizeInvoiceCardLayout(
	value: unknown,
): InvoiceCardPreference[] {
	const result: InvoiceCardPreference[] = [];
	if (Array.isArray(value)) {
		for (const entry of value) {
			const card = invoiceCardDefaults.find(
				(card) => card.id === entry?.id,
			);
			if (!card || result.some((saved) => saved.id === card.id)) continue;
			result.push({
				id: card.id,
				width:
					entry.width === "auto" || entry.width === "full"
						? entry.width
						: card.width,
			});
		}
	}
	for (const card of invoiceCardDefaults) {
		if (!result.some((saved) => saved.id === card.id))
			result.push({ id: card.id, width: card.width });
	}
	return result;
}

export function invoiceCardLayoutKey(user: string, profile: string): string {
	return `posawesome:invoice-cards:v1:${JSON.stringify([user, profile])}`;
}
