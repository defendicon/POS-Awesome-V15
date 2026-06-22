import type { Item } from "../../../src/posapp/types/models";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MockApiOptions {
	/** Per-API-call artificial latency */
	latencyMs: number;
	/** Random jitter added to latency (±jitterMs) */
	jitterMs: number;
	/** Items returned per paginated page */
	pageSize: number;
}

export const DEFAULT_MOCK_API_OPTIONS: MockApiOptions = {
	latencyMs: 50,
	jitterMs: 10,
	pageSize: 200,
};

interface FrappeCallFn {
	(request: any): Promise<{ message: any }>;
}

export function createMockFrappeCall(
	items: Item[],
	options: Partial<MockApiOptions> = {},
): FrappeCallFn {
	const opts = { ...DEFAULT_MOCK_API_OPTIONS, ...options };

	return async (request: any) => {
		const jitter = Math.random() * opts.jitterMs * 2 - opts.jitterMs;
		const delay = Math.max(0, opts.latencyMs + jitter);
		await sleep(delay);

		const method: string =
			typeof request === "string" ? request : request.method;
		const args: Record<string, any> =
			typeof request === "string" ? {} : request.args || {};

		if (
			method.endsWith("get_items_count") ||
			method.endsWith("get_items_count_data")
		) {
			return { message: items.length };
		}

		if (method.endsWith("get_items") || method.endsWith("get_items_data")) {
			const offset = args.offset ?? 0;
			const limit = args.limit ?? opts.pageSize;
			const page = items.slice(offset, offset + limit);
			return { message: page };
		}

		if (method.endsWith("get_items_from_barcode")) {
			const barcode: string = args.barcode || "";
			const found = items.find(
				(item: any) => item.barcode === barcode,
			);
			return { message: found ?? null };
		}

		return { message: [] };
	};
}

export function createPaginationObserver() {
	const calls: Array<{ offset: number; timestamp: number }> = [];
	return {
		record(offset: number) {
			calls.push({ offset, timestamp: performance.now() });
		},
		get pageCount(): number {
			return calls.length;
		},
		get lastOffset(): number {
			return calls.length > 0 ? calls[calls.length - 1].offset : 0;
		},
		get totalDurationMs(): number {
			if (calls.length < 2) return 0;
			return calls[calls.length - 1].timestamp - calls[0].timestamp;
		},
		reset() {
			calls.length = 0;
		},
	};
}
