import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("../src/offline/index", () => ({
	isOffline: vi.fn(() => false),
	savePricingRulesSnapshot: vi.fn(),
	getCachedPricingRulesSnapshot: vi.fn(() => null),
	clearPricingRulesSnapshot: vi.fn(),
}));

import { usePricingRulesStore } from "../src/posapp/stores/pricingRulesStore";

describe("pricing rules store request coordination", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it("deduplicates concurrent requests for the same pricing context", async () => {
		let resolveRequest: ((_value: unknown) => void) | null = null;
		const call = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveRequest = resolve as (_value: unknown) => void;
				}),
		);
		(globalThis as any).frappe = { call };
		const store = usePricingRulesStore();
		const context = {
			company: "Test Co",
			price_list: "Retail",
			currency: "USD",
		};

		const first = store.ensureActiveRules(context);
		const second = store.ensureActiveRules(context);

		expect(call).toHaveBeenCalledTimes(1);
		resolveRequest?.({ message: [{ name: "RULE-1" }] });
		await Promise.all([first, second]);
		expect(store.rules).toHaveLength(1);
	});

	it("does not let an older context response overwrite the latest snapshot", async () => {
		const resolvers: Array<(_value: unknown) => void> = [];
		const call = vi.fn(
			() =>
				new Promise((resolve) => {
					resolvers.push(resolve as (_value: unknown) => void);
				}),
		);
		(globalThis as any).frappe = { call };
		const store = usePricingRulesStore();

		const first = store.ensureActiveRules({
			company: "Test Co",
			price_list: "Retail",
			currency: "USD",
			customer: "CUST-OLD",
		});
		const second = store.ensureActiveRules({
			company: "Test Co",
			price_list: "Retail",
			currency: "USD",
			customer: "CUST-NEW",
		});

		resolvers[1]({ message: [{ name: "NEW-RULE" }] });
		await second;
		resolvers[0]({ message: [{ name: "OLD-RULE" }] });
		await first;

		expect(store.rules.map((rule) => rule.name)).toEqual(["NEW-RULE"]);
		expect(store.contextKey).toContain("CUST-NEW");
	});
});
