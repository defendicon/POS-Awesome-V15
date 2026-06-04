import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("pricingRulesStore", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		setActivePinia(createPinia());
	});

	it("waits for offline memory hydration before using cached rules after a hard refresh", async () => {
		let resolveMemory!: () => void;
		let cachedSnapshot = {
			snapshot: [] as any[],
			context: null as string | null,
			lastSync: null as string | null,
			staleAt: null as string | null,
		};
		const memoryInitPromise = new Promise<void>((resolve) => {
			resolveMemory = () => {
				cachedSnapshot = {
					snapshot: [
						{
							name: "OFFLINE-CACHED-RULE",
							item_code: "ITEM-1",
							price_or_discount: "Discount",
							discount_type: "Rate",
							rate_or_discount: 10,
						},
					],
					context: JSON.stringify({
						company: "Test Co",
						price_list: "Retail",
						currency: "USD",
						date: "2026-06-04",
					}),
					lastSync: "2026-06-04T08:00:00.000Z",
					staleAt: "2026-06-05T08:00:00.000Z",
				};
				resolve();
			};
		});

		vi.doMock("../src/offline/index", () => ({
			memoryInitPromise,
			isOffline: () => true,
			getCachedPricingRulesSnapshot: () => cachedSnapshot,
			savePricingRulesSnapshot: vi.fn(),
			clearPricingRulesSnapshot: vi.fn(),
		}));

		const { usePricingRulesStore } = await import(
			"../src/posapp/stores/pricingRulesStore"
		);
		const store = usePricingRulesStore();
		const ensurePromise = store.ensureActiveRules({
			company: "Test Co",
			price_list: "Retail",
			currency: "USD",
			date: "2026-06-04",
		});

		expect(store.rules).toHaveLength(0);
		resolveMemory();
		await ensurePromise;

		expect(store.rules).toHaveLength(1);
		expect(store.getIndexes().byItem.get("ITEM-1")?.[0]?.name).toBe(
			"OFFLINE-CACHED-RULE",
		);
		expect(store.hasSnapshot).toBe(true);
	});
});
