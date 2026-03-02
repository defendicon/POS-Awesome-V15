import stockCoordinator from "./stockCoordinator";
import { bus } from "../bus";

export interface RealtimeStockItem {
	item_code: string;
	warehouse: string | null;
	company: string | null;
	actual_qty: number | null;
}

export interface RealtimeStockPayload {
	items: RealtimeStockItem[];
	item_codes: string[];
	warehouses: string[];
	companies: string[];
	source_doctype: string | null;
}

type DispatchDeps = {
	emit?: (_event: string, _payload: RealtimeStockPayload) => void;
	setLastStockAdjustment?: (_payload: RealtimeStockPayload) => void;
	updateBaseQuantities?: (
		_entries: Array<{ item_code: string; warehouse?: string | null; actual_qty: number }>,
		_options?: { source?: string },
	) => void;
};

const normalizeString = (value: unknown): string | null => {
	if (value === undefined || value === null) {
		return null;
	}
	const normalized = String(value).trim();
	return normalized ? normalized : null;
};

const normalizeQty = (value: unknown): number | null => {
	if (value === undefined || value === null || value === "") {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

export function normalizeRealtimeStockPayload(
	input: any,
): RealtimeStockPayload | null {
	const rows = Array.isArray(input?.items)
		? input.items
		: input && typeof input === "object"
			? [input]
			: [];

	const items: RealtimeStockItem[] = rows
		.map((row) => {
			const item_code = normalizeString(
				row?.item_code ?? row?.itemCode ?? row?.code,
			);
			if (!item_code) {
				return null;
			}

			return {
				item_code,
				warehouse: normalizeString(row?.warehouse),
				company: normalizeString(row?.company),
				actual_qty: normalizeQty(
					row?.actual_qty ?? row?.actualQty ?? row?.available_qty,
				),
			};
		})
		.filter((row): row is RealtimeStockItem => !!row);

	if (!items.length) {
		return null;
	}

	const item_codes = Array.from(new Set(items.map((row) => row.item_code)));
	const warehouses = Array.from(
		new Set(items.map((row) => row.warehouse).filter(Boolean) as string[]),
	);
	const companies = Array.from(
		new Set(items.map((row) => row.company).filter(Boolean) as string[]),
	);

	return {
		items,
		item_codes,
		warehouses,
		companies,
		source_doctype: normalizeString(input?.source_doctype),
	};
}

export function dispatchRealtimeStockPayload(
	input: any,
	deps: DispatchDeps = {},
): RealtimeStockPayload | null {
	const payload = normalizeRealtimeStockPayload(input);
	if (!payload) {
		return null;
	}

	const updateBaseQuantities =
		deps.updateBaseQuantities || stockCoordinator.updateBaseQuantities;
	const emit = deps.emit || bus.emit;
	const baseEntries = payload.items
		.filter(
			(row): row is RealtimeStockItem & { actual_qty: number } =>
				typeof row.actual_qty === "number",
		)
		.map((row) => ({
			item_code: row.item_code,
			warehouse: row.warehouse,
			actual_qty: row.actual_qty,
		}));

	if (baseEntries.length) {
		updateBaseQuantities(baseEntries, { source: "realtime" });
	}

	if (deps.setLastStockAdjustment) {
		deps.setLastStockAdjustment(payload);
	}

	emit("remote_stock_adjustment", payload);
	return payload;
}
