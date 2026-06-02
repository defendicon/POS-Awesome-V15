import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { configurePerfMonitor, getPerfEvents, resetPerfEvents } from "../src/posapp/utils/perf";
import { useBootReadinessStore } from "../src/posapp/stores/bootReadinessStore";
import { db, memory } from "../src/offline/db";
import { resetInventoryEngine } from "../src/offline/inventoryEngine";

const profile = {
	name: "Main POS",
	modified: "2026-06-01 10:00:00",
	company: "Example Co",
	warehouse: "Stores - EX",
	selling_price_list: "Standard Selling",
	currency: "USD",
	payments: [{ mode_of_payment: "Cash", currency: "USD" }],
};

describe("boot readiness store", () => {
	beforeEach(async () => {
		setActivePinia(createPinia());
		configurePerfMonitor({ enabled: true, sampleRate: 1, bufferSize: 100 });
		resetPerfEvents();
		if (!db.isOpen()) {
			await db.open();
		}
		await db.table("items").clear();
		await db.table("operational_items").clear();
		resetInventoryEngine();
		await db.table("settings").clear();
		memory.pos_opening_storage = null;
		memory.local_snapshot_manifest = null;
		memory.local_snapshot_manifest_status = null;
		memory.price_list_cache = {};
		memory.currency_options_cache = {};
		memory.exchange_rate_cache = {};
		memory.payment_method_currency_cache = {};
	});

	it("emits sell-ready only after required local item/payment/currency data exists", async () => {
		await db.table("items").put({
			item_code: "ITEM-1",
			item_name: "Test Item",
			profile_scope: "Main POS_Stores - EX",
		});
		const store = useBootReadinessStore();

		await store.applyRegisterData({
			pos_profile: profile,
			pos_opening_shift: { name: "SHIFT-1", user: "cashier@example.com" },
		});

		expect(store.sellReady).toBe(true);
		expect(store.sellReadySource).toBe("local_valid_snapshot");
		expect(store.blockingResource).toBe(null);
		expect(getPerfEvents().some((event) => event.name === "pos.boot.sell_ready")).toBe(true);
	});

	it("blocks sell-ready when offline with no valid local item snapshot", async () => {
		const store = useBootReadinessStore();

		await store.applyRegisterData({
			pos_profile: profile,
			pos_opening_shift: { name: "SHIFT-1", user: "cashier@example.com" },
		});

		expect(store.sellReady).toBe(false);
		expect(store.blockingResource).toBe("items");
		expect(
			getPerfEvents().some(
				(event) => event.name === "pos.boot.blocked_no_valid_snapshot",
			),
		).toBe(true);
	});
});
