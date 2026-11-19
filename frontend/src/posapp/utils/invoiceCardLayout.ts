import { resizedLayoutPercent } from "./continuousLayout";

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
	width: "auto" | "full" | number;
	startRow?: boolean;
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
					entry.width === "auto" ||
					entry.width === "full" ||
					(typeof entry.width === "number" &&
						Number.isFinite(entry.width) &&
						entry.width >= 3 &&
						entry.width <= 12)
						? entry.width
						: card.width,
				...(typeof entry.startRow === "boolean"
					? { startRow: entry.startRow }
					: {}),
			});
		}
	}
	for (const card of invoiceCardDefaults) {
		if (!result.some((saved) => saved.id === card.id))
			result.push({ id: card.id, width: card.width });
	}
	return result;
}

export type CardDropPosition = "before" | "after" | "above" | "below";

export function repositionInvoiceCard(
	layout: InvoiceCardPreference[],
	id: InvoiceCardId,
	targetId: InvoiceCardId,
	position: CardDropPosition,
): InvoiceCardPreference[] {
	const result = layout.map((card) => ({ ...card }));
	const from = result.findIndex((card) => card.id === id);
	const target = result.find((card) => card.id === targetId);
	if (from < 0 || !target || id === targetId) return result;
	const moved = result.splice(from, 1)[0]!;
	const index = result.indexOf(target);
	if (position === "above" || position === "below") {
		moved.width = "full";
		moved.startRow = true;
	} else {
		moved.width = 6;
		target.width = 6;
		moved.startRow = position === "before" && target.startRow === true;
		if (position === "before") target.startRow = false;
	}
	result.splice(
		index + (position === "after" || position === "below" ? 1 : 0),
		0,
		moved,
	);
	return result;
}

export function resizedCardSpan(
	startSpan: number,
	delta: number,
	containerWidth: number,
	gap: number,
): number {
	return (
		(resizedLayoutPercent(
			(startSpan / 12) * 100,
			delta,
			containerWidth,
			gap,
		) /
			100) *
		12
	);
}

export function invoiceCardLayoutKey(user: string, profile: string): string {
	return `posawesome:invoice-cards:v1:${JSON.stringify([user, profile])}`;
}
