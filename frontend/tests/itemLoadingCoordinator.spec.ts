import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	ensureItemsReady,
	resetItemLoadingCoordinator,
} from "../src/posapp/modules/items/itemLoadingCoordinator";

describe("item loading coordinator", () => {
	beforeEach(() => {
		resetItemLoadingCoordinator();
	});

	it("deduplicates concurrent initializations for the same profile, customer, and price list", async () => {
		const profile = { name: "POS-1", modified: "2026-04-23T10:00:00" };
		let resolveInit: (() => void) | null = null;
		const initialize = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveInit = resolve;
				}),
		);

		const first = ensureItemsReady({
			profile,
			customer: "CUST-1",
			priceList: "Retail",
			initialize,
		});
		const second = ensureItemsReady({
			profile,
			customer: "CUST-1",
			priceList: "Retail",
			initialize,
		});

		expect(initialize).toHaveBeenCalledTimes(1);
		resolveInit?.();
		await Promise.all([first, second]);
	});

	it("re-initializes when the customer changes", async () => {
		const profile = { name: "POS-1", modified: "2026-04-23T10:00:00" };
		const initialize = vi.fn(async () => {});

		await ensureItemsReady({
			profile,
			customer: "CUST-1",
			priceList: "Retail",
			initialize,
		});
		await ensureItemsReady({
			profile,
			customer: "CUST-2",
			priceList: "Retail",
			initialize,
		});

		expect(initialize).toHaveBeenCalledTimes(2);
	});

	it("skips repeated initialization after the same profile, customer, and price list completed", async () => {
		const profile = { name: "POS-1", modified: "2026-04-23T10:00:00" };
		const initialize = vi.fn(async () => {});

		await ensureItemsReady({
			profile,
			customer: "CUST-1",
			priceList: "Retail",
			initialize,
		});
		await ensureItemsReady({
			profile,
			customer: "CUST-1",
			priceList: "Retail",
			initialize,
		});

		expect(initialize).toHaveBeenCalledTimes(1);
	});
});
