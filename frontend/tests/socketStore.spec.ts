import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const {
	toastShow,
	setLastStockAdjustment,
	dispatchRealtimeStockPayload,
} = vi.hoisted(() => ({
	toastShow: vi.fn(),
	setLastStockAdjustment: vi.fn(),
	dispatchRealtimeStockPayload: vi.fn(),
}));

vi.mock("../src/posapp/stores/toastStore", () => ({
	useToastStore: () => ({
		show: toastShow,
	}),
}));

vi.mock("../src/posapp/stores/uiStore", () => ({
	useUIStore: () => ({
		setLastStockAdjustment,
	}),
}));

vi.mock("../src/posapp/utils/realtimeStock", () => ({
	dispatchRealtimeStockPayload,
}));

import { useSocketStore } from "../src/posapp/stores/socketStore";

type Handler = (payload: any) => void;

function createRealtimeMock() {
	const handlers = new Map<string, Handler[]>();

	return {
		on(event: string, handler: Handler) {
			const current = handlers.get(event) || [];
			current.push(handler);
			handlers.set(event, current);
		},
		off(event: string, handler: Handler) {
			const current = handlers.get(event) || [];
			handlers.set(
				event,
				current.filter((candidate) => candidate !== handler),
			);
		},
		emit(event: string, payload: any) {
			for (const handler of handlers.get(event) || []) {
				handler(payload);
			}
		},
		count(event: string) {
			return (handlers.get(event) || []).length;
		},
	};
}

describe("socketStore realtime listeners", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		toastShow.mockReset();
		setLastStockAdjustment.mockReset();
		dispatchRealtimeStockPayload.mockReset();
		(globalThis as any).__ = (text: string, args?: unknown[]) =>
			args && args.length ? `${text} ${args.join(" ")}` : text;
	});

	it("does not register duplicate realtime listeners on repeated init", () => {
		const realtime = createRealtimeMock();
		(globalThis as any).frappe = {
			realtime,
			msgprint: vi.fn(),
		};

		const store = useSocketStore();
		store.init();
		store.init();

		expect(realtime.count("pos_invoice_submit_error")).toBe(1);
		expect(realtime.count("pos_invoice_processed")).toBe(1);
		expect(realtime.count("posa_stock_changed")).toBe(1);
	});

	it("removes listeners during dispose", () => {
		const realtime = createRealtimeMock();
		(globalThis as any).frappe = {
			realtime,
			msgprint: vi.fn(),
		};

		const store = useSocketStore();
		store.init();
		store.dispose();

		expect(realtime.count("pos_invoice_submit_error")).toBe(0);
		expect(realtime.count("pos_invoice_processed")).toBe(0);
		expect(realtime.count("posa_stock_changed")).toBe(0);
	});

	it("dispatches stock updates only once after repeated init calls", () => {
		const realtime = createRealtimeMock();
		(globalThis as any).frappe = {
			realtime,
			msgprint: vi.fn(),
		};

		const store = useSocketStore();
		store.init();
		store.init();

		realtime.emit("posa_stock_changed", { item_code: "ITEM-1" });

		expect(dispatchRealtimeStockPayload).toHaveBeenCalledTimes(1);
		expect(dispatchRealtimeStockPayload).toHaveBeenCalledWith(
			{ item_code: "ITEM-1" },
			{ setLastStockAdjustment },
		);
	});
});
