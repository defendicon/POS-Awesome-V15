/**
 * Stock Coordinator - Manages stock availability tracking and coordination
 */

/**
 * Listener callback type for stock changes.
 */
export type StockListener = (_event: StockChangeEvent) => void;

/**
 * Stock change event interface.
 */
export interface StockChangeEvent {
	type: string;
	codes: string[];
	snapshot: AvailabilitySnapshot;
	meta: Record<string, any>;
}

/**
 * Availability snapshot for item codes.
 */
export interface AvailabilitySnapshot {
	[itemCode: string]: {
		baseActual: number | null;
		reserved: number;
		available: number | null;
	};
}

/**
 * Stock update options.
 */
export interface StockUpdateOptions {
	silent?: boolean;
	pruneMissing?: boolean;
	source?: string;
	updateBase?: boolean;
	updateBaseAvailable?: boolean;
	updateActual?: boolean;
	updateAvailable?: boolean;
}

/**
 * Stock entry for updates.
 */
export interface StockEntry {
	item_code?: string;
	code?: string;
	name?: string;
	actual_qty?: number;
	available_qty?: number;
	base_actual_qty?: number;
	base_available_qty?: number;
	base_qty?: number;
	qty?: number;
	stock_qty?: number;
	[key: string]: any;
}

const listeners = new Set<StockListener>();
const baseQuantities = new Map<string, number>();
const reservedQuantities = new Map<string, number>();
const availabilityMap = new Map<string, number>();

const normalizeCode = (code: any): string | null => {
	if (code === undefined || code === null) {
		return null;
	}
	const normalized = String(code).trim();
	return normalized ? normalized : null;
};

const toNumber = (value: any): number | null => {
	if (value === undefined || value === null) {
		return null;
	}
	const num = Number(value);
	if (!Number.isFinite(num)) {
		return null;
	}
	return num;
};

const computeAvailability = (code: string): number | null => {
	if (!code) {
		return null;
	}
	if (!baseQuantities.has(code)) {
		availabilityMap.delete(code);
		return null;
	}
	const base = baseQuantities.get(code)!;
	const reserved = reservedQuantities.get(code) || 0;
	const available = base - reserved;
	availabilityMap.set(code, available);
	return available;
};

const buildSnapshot = (codes: string[]): AvailabilitySnapshot => {
	const snapshot: AvailabilitySnapshot = {};
	codes.forEach((code) => {
		const normalized = normalizeCode(code);
		if (!normalized) {
			return;
		}
		const base = baseQuantities.has(normalized)
			? baseQuantities.get(normalized)!
			: null;
		const reserved = reservedQuantities.get(normalized) || 0;
		const available = availabilityMap.has(normalized)
			? availabilityMap.get(normalized)!
			: computeAvailability(normalized);
		snapshot[normalized] = {
			baseActual: base,
			reserved,
			available,
		};
	});
	return snapshot;
};

const notifyListeners = (
	type: string,
	codes: string[],
	meta: Record<string, any> = {},
): void => {
	if (!Array.isArray(codes) || !codes.length) {
		return;
	}
	const snapshot = buildSnapshot(codes);
	listeners.forEach((listener) => {
		try {
			listener({ type, codes, snapshot, meta });
		} catch (error) {
			console.error("Stock listener failed", error);
		}
	});
};

export const updateBaseQuantities = (
	entries: StockEntry[] = [],
	options: StockUpdateOptions = {},
): string[] => {
	const { silent = false, pruneMissing = false } = options;
	const changed = new Set<string>();
	const seen = new Set<string>();

	entries.forEach((entry) => {
		if (!entry) {
			return;
		}
		const code = normalizeCode(entry.item_code ?? entry.code ?? entry.name);
		if (!code) {
			return;
		}
		seen.add(code);
		const baseCandidate = toNumber(
			entry.actual_qty ??
				entry.available_qty ??
				entry.base_actual_qty ??
				entry.base_available_qty ??
				entry.base_qty ??
				entry.qty ??
				entry.stock_qty,
		);
		if (baseCandidate === null) {
			return;
		}
		const current = baseQuantities.get(code);
		if (current === undefined || current !== baseCandidate) {
			baseQuantities.set(code, baseCandidate);
			changed.add(code);
		}
	});

	if (pruneMissing) {
		Array.from(baseQuantities.keys()).forEach((code) => {
			if (!seen.has(code)) {
				baseQuantities.delete(code);
				changed.add(code);
			}
		});
	}

	const affected = Array.from(changed);
	affected.forEach((code) => computeAvailability(code));

	if (!silent && affected.length) {
		notifyListeners("base", affected, { source: options.source });
	}

	return affected;
};

export const updateReservations = (
	totals: Record<string, any> = {},
	options: StockUpdateOptions = {},
): string[] => {
	const { silent = false } = options;
	const incoming = new Map<string, number>();
	if (totals && typeof totals === "object") {
		Object.entries(totals).forEach(([codeValue, qtyValue]) => {
			const code = normalizeCode(codeValue);
			const qty = toNumber(qtyValue);
			if (!code || qty === null) {
				return;
			}
			const positive = qty > 0 ? qty : 0;
			if (positive > 0) {
				incoming.set(code, positive);
			}
		});
	}

	const changed = new Set<string>();
	const processed = new Set<string>();

	incoming.forEach((qty, code) => {
		processed.add(code);
		const previous = reservedQuantities.get(code) || 0;
		if (previous !== qty) {
			reservedQuantities.set(code, qty);
			changed.add(code);
		}
	});

	Array.from(reservedQuantities.keys()).forEach((code) => {
		if (!processed.has(code)) {
			const previous = reservedQuantities.get(code) || 0;
			if (previous !== 0) {
				changed.add(code);
			}
			reservedQuantities.delete(code);
		}
	});

	const affected = Array.from(changed);
	affected.forEach((code) => computeAvailability(code));

	if (!silent && affected.length) {
		notifyListeners("reservation", affected, { source: options.source });
	}

	return affected;
};

export const clearAll = (): string[] => {
	const affected = Array.from(
		new Set([
			...baseQuantities.keys(),
			...reservedQuantities.keys(),
			...availabilityMap.keys(),
		]),
	);
	baseQuantities.clear();
	reservedQuantities.clear();
	availabilityMap.clear();
	if (affected.length) {
		notifyListeners("reset", affected, {});
	}
	return affected;
};

export const getAvailability = (code: any): number | null => {
	const normalized = normalizeCode(code);
	if (!normalized) {
		return null;
	}
	if (availabilityMap.has(normalized)) {
		return availabilityMap.get(normalized)!;
	}
	return computeAvailability(normalized);
};

export const getReserved = (code: any): number => {
	const normalized = normalizeCode(code);
	if (!normalized) {
		return 0;
	}
	return reservedQuantities.get(normalized) || 0;
};

export const getBase = (code: any): number | null => {
	const normalized = normalizeCode(code);
	if (!normalized) {
		return null;
	}
	return baseQuantities.has(normalized)
		? baseQuantities.get(normalized)!
		: null;
};

export const getSnapshot = (
	codes?: string[] | string,
): AvailabilitySnapshot => {
	if (!codes) {
		return buildSnapshot([
			...new Set([
				...baseQuantities.keys(),
				...reservedQuantities.keys(),
				...availabilityMap.keys(),
			]),
		]);
	}
	return buildSnapshot(Array.isArray(codes) ? codes : [codes]);
};

export const applyAvailabilityToItem = (
	item: any,
	options: StockUpdateOptions = {},
): void => {
	if (!item || item.item_code === undefined || item.item_code === null) {
		return;
	}
	const code = normalizeCode(item.item_code);
	if (!code) {
		return;
	}

	if (!baseQuantities.has(code)) {
		const fallbackBase = toNumber(
			item._base_actual_qty ??
				item._base_available_qty ??
				item.actual_qty ??
				item.available_qty ??
				item.stock_qty,
		);
		if (fallbackBase !== null) {
			baseQuantities.set(code, fallbackBase);
		}
	}

	const base = baseQuantities.has(code) ? baseQuantities.get(code)! : null;
	if (base !== null && options.updateBase !== false) {
		item._base_actual_qty = base;
		if (options.updateBaseAvailable !== false) {
			item._base_available_qty = base;
		}
	}

	const available = getAvailability(code);
	if (available !== null) {
		if (options.updateActual !== false) {
			item.actual_qty = available;
		}
		if (
			options.updateAvailable !== false &&
			item.available_qty !== undefined
		) {
			item.available_qty = available;
		}
	} else if (base !== null && options.updateActual !== false) {
		item.actual_qty = base;
	}
};

export const applyAvailabilityToCollection = (
	items: any[],
	codesSet: Set<string> | null = null,
	options: StockUpdateOptions = {},
): void => {
	if (!Array.isArray(items) || !items.length) {
		return;
	}
	items.forEach((item) => {
		if (!item || item.item_code === undefined || item.item_code === null) {
			return;
		}
		const code = normalizeCode(item.item_code);
		if (!code) {
			return;
		}
		if (codesSet && !codesSet.has(code)) {
			return;
		}
		applyAvailabilityToItem(item, options);
	});
};

export const primeFromItems = (
	items: any[] = [],
	options: StockUpdateOptions = {},
): string[] => {
	const entries: StockEntry[] = [];
	items.forEach((item) => {
		if (!item || item.item_code === undefined || item.item_code === null) {
			return;
		}
		const code = normalizeCode(item.item_code);
		if (!code) {
			return;
		}
		const baseCandidate = toNumber(
			item._base_actual_qty ??
				item._base_available_qty ??
				item.actual_qty ??
				item.available_qty ??
				item.stock_qty,
		);
		if (baseCandidate === null) {
			return;
		}
		entries.push({ item_code: code, actual_qty: baseCandidate });
	});
	if (!entries.length) {
		return [];
	}
	return updateBaseQuantities(entries, {
		silent: options.silent !== false,
		source: options.source,
	});
};

export const applyInvoiceConsumption = (
	items: any[] = [],
	options: StockUpdateOptions = {},
): string[] => {
	const { silent = false } = options;
	const changed = new Set<string>();
	items.forEach((entry) => {
		if (!entry) {
			return;
		}
		const code = normalizeCode(entry.item_code);
		if (!code) {
			return;
		}
		if (!baseQuantities.has(code)) {
			return;
		}
		const stockQty = toNumber(entry.stock_qty);
		let consumption = stockQty;
		if (consumption === null) {
			const qty = toNumber(entry.qty);
			const factor = toNumber(entry.conversion_factor);
			if (qty !== null) {
				const multiplier = factor !== null && factor !== 0 ? factor : 1;
				consumption = qty * multiplier;
			}
		}
		if (consumption === null) {
			return;
		}
		const current = baseQuantities.get(code)!;
		const next = current - consumption;
		if (next !== current) {
			baseQuantities.set(code, next);
			changed.add(code);
		}
	});
	const affected = Array.from(changed);
	affected.forEach((code) => computeAvailability(code));
	if (!silent && affected.length) {
		notifyListeners("base", affected, {
			source: options.source || "invoice",
		});
	}
	return affected;
};

export const subscribe = (listener: StockListener): (() => void) => {
	if (typeof listener !== "function") {
		return () => {};
	}
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
};

export default {
	updateBaseQuantities,
	updateReservations,
	clearAll,
	getAvailability,
	getReserved,
	getBase,
	getSnapshot,
	applyAvailabilityToItem,
	applyAvailabilityToCollection,
	primeFromItems,
	applyInvoiceConsumption,
	subscribe,
};
