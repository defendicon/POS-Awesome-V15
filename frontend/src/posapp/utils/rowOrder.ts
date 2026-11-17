export function reorderRows<T>(
	rows: readonly T[],
	keyOf: (row: T) => string,
	source: string,
	target: string,
	after: boolean,
	visibleKeys: string[] = [],
): T[] | null {
	const byKey = new Map(rows.map((row) => [keyOf(row), row]));
	if (
		byKey.size !== rows.length ||
		!byKey.has(source) ||
		!byKey.has(target) ||
		source === target
	)
		return null;
	// Honour the currently rendered (possibly column-sorted) slice. Unrendered and
	// search-hidden rows keep their relative positions, including duplicate item codes in a cart.
	const keys = [...new Set(visibleKeys)].filter((key) => byKey.has(key));
	const visible = new Set(keys);
	let index = 0;
	const result = rows.map((row) =>
		visible.has(keyOf(row)) ? byKey.get(keys[index++]!)! : row,
	);
	const from = result.findIndex((row) => keyOf(row) === source);
	const moved = result.splice(from, 1)[0]!;
	const to = result.findIndex((row) => keyOf(row) === target) + Number(after);
	result.splice(to, 0, moved);
	return result;
}

export function applyRowOrder<T>(
	rows: T[],
	order: string[],
	keyOf: (row: T) => string,
): T[] {
	if (!order.length) return rows;
	const ranks = new Map(order.map((key, index) => [key, index]));
	return [...rows].sort(
		(a, b) =>
			(ranks.get(keyOf(a)) ?? Infinity) -
			(ranks.get(keyOf(b)) ?? Infinity),
	);
}
