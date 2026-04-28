import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useItemsSelectorPriceListSync } from "../src/posapp/composables/pos/items/useItemsSelectorPriceListSync";

describe("useItemsSelectorPriceListSync", () => {
	it("uses the incoming price list without forcing a second item reload", async () => {
		const activePriceList = ref("Retail");
		const updatePriceList = vi.fn(async (priceList: string) => {
			activePriceList.value = priceList;
		});
		const getItems = vi.fn(async () => []);

		const sync = useItemsSelectorPriceListSync({
			activePriceList,
			getDefaultPriceList: () => "Retail",
			updatePriceList,
		});

		await sync.syncSelectorPriceList(" Wholesale ");

		expect(updatePriceList).toHaveBeenCalledWith("Wholesale");
		expect(getItems).not.toHaveBeenCalled();
	});

	it("refreshes visible item rates for the new price list without full item reload", async () => {
		const activePriceList = ref("Retail");
		const updatePriceList = vi.fn(async (priceList: string) => {
			activePriceList.value = priceList;
		});
		const refreshVisibleItemRates = vi.fn(async () => []);
		const getItems = vi.fn(async () => []);

		const sync = useItemsSelectorPriceListSync({
			activePriceList,
			getDefaultPriceList: () => "Retail",
			updatePriceList,
			refreshVisibleItemRates,
		});

		await sync.syncSelectorPriceList("Wholesale");

		expect(updatePriceList).toHaveBeenCalledWith("Wholesale");
		expect(refreshVisibleItemRates).toHaveBeenCalledWith("Wholesale");
		expect(getItems).not.toHaveBeenCalled();
	});

	it("falls back to the profile selling price list for blank input without reloading when unchanged", async () => {
		const activePriceList = ref("Retail");
		const updatePriceList = vi.fn();
		const getItems = vi.fn(async () => []);

		const sync = useItemsSelectorPriceListSync({
			activePriceList,
			getDefaultPriceList: () => "Retail",
			updatePriceList,
		});

		await sync.syncSelectorPriceList("  ");

		expect(updatePriceList).not.toHaveBeenCalled();
		expect(getItems).not.toHaveBeenCalled();
	});

	it("switches back to the default price list without forcing a full reload", async () => {
		const activePriceList = ref("Wholesale");
		const updatePriceList = vi.fn(async (priceList: string) => {
			activePriceList.value = priceList;
		});
		const getItems = vi.fn(async () => []);

		const sync = useItemsSelectorPriceListSync({
			activePriceList,
			getDefaultPriceList: () => "Retail",
			updatePriceList,
		});

		await sync.syncSelectorPriceList(null);

		expect(updatePriceList).toHaveBeenCalledWith("Retail");
		expect(getItems).not.toHaveBeenCalled();
	});

	it("does nothing when no incoming or default price list is available", async () => {
		const updatePriceList = vi.fn();
		const getItems = vi.fn();
		const sync = useItemsSelectorPriceListSync({
			activePriceList: ref(""),
			getDefaultPriceList: () => "",
			updatePriceList,
		});

		await sync.syncSelectorPriceList(null);

		expect(sync.resolveIncomingPriceList(null)).toBe("");
		expect(updatePriceList).not.toHaveBeenCalled();
		expect(getItems).not.toHaveBeenCalled();
	});
});
