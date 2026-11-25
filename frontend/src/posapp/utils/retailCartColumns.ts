// Compact defaults are presentation only. Persisted column widths still take priority.
const widths: Record<string, number> = {
	item_name: 140, qty: 70, uom: 58, price_list_rate: 72,
	discount_percentage: 62, discount_amount: 74, rate: 70, amount: 80,
	actions: 28, posa_is_offer: 88, "data-table-expand": 28,
};

export function getRetailCartLayout(columns: Array<{ key: string; width?: unknown; maxWidth?: unknown }>) {
	const sizes = columns.map(column => {
		const fixed = Number(column.maxWidth);
		return Number.isFinite(fixed) && fixed > 0 ? fixed : widths[column.key] || 72;
	});
	return {
		"--retail-cart-columns": columns.map((column, index) =>
			column.maxWidth ? `${sizes[index]}px` : `minmax(${sizes[index]}px, ${column.key === "item_name" ? 2 : 1}fr)`,
		).join(" "),
		"--retail-cart-min-width": `${sizes.reduce((sum, width) => sum + width, 0) + Math.max(0, columns.length - 1) * 4}px`,
	};
}
