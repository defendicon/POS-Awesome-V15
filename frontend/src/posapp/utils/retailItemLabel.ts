/**
 * Short label shown on Retail item tiles when an item has no image:
 * a trailing size code ("Bakl-BLA-XL" -> "XL"), otherwise up to two initials
 * ("Chocolate Cake" -> "CC").
 */
const SIZE_SUFFIX = /(?:^|[\s\-_/])(XXXS|XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i;

export function retailItemLabel(item: { item_name?: unknown; item_code?: unknown } | null | undefined): string {
	const name = String(item?.item_name || item?.item_code || "").trim();
	const size = name.match(SIZE_SUFFIX)?.[1];
	if (size) {
		return size.toUpperCase();
	}
	const initials = name
		.split(/[\s\-_/]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word.charAt(0))
		.join("");
	return (initials || name.charAt(0) || "?").toUpperCase();
}
