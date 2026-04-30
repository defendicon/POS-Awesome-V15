import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useItemsSelectorPriceListSync } from "../src/posapp/composables/pos/items/useItemsSelectorPriceListSync";

describe("useItemsSelectorPriceListSync", () => {
	it("uses the incoming price list when it is a non-empty string", async () => {
		const activePriceList = ref("Retail");
		const updatePriceList = vi.fn(async (priceList: string) => {
			activePriceList.value = priceList;
			return "server-loaded";
		});
		const getItems = vi.fn(async () => []);

		const sync = useItemsSelectorPriceListSync({
			activePriceList,
			getDefaultPriceList: () => "Retail",
			updatePriceList,
			getItems,
		});

		await sync.syncSelectorPriceList(" Wholesale ");

		expect(updatePriceList).toHaveBeenCalledWith("Wholesale");
		expect(getItems).not.toHaveBeenCalled();
	});

	it("falls back to the profile selling price list for blank input", async () => {
		const activePriceList = ref("Retail");
		const updatePriceList = vi.fn();
		const getItems = vi.fn(async () => []);

		const sync = useItemsSelectorPriceListSync({
			activePriceList,
			getDefaultPriceList: () => "Retail",
			updatePriceList,
			getItems,
		});

		await sync.syncSelectorPriceList("  ");

		expect(updatePriceList).not.toHaveBeenCalled();
		expect(getItems).not.toHaveBeenCalled();
	});

	it("refreshes visible selector items after applying cached price list data", async () => {
		const activePriceList = ref("Retail");
		const updatePriceList = vi.fn(async (priceList: string) => {
			activePriceList.value = priceList;
			return "cache-applied";
		});
		const getItems = vi.fn(async () => []);
		const refreshVisibleItems = vi.fn(async () => {});

		const sync = useItemsSelectorPriceListSync({
			activePriceList,
			getDefaultPriceList: () => "Retail",
			updatePriceList,
			getItems,
			refreshVisibleItems,
		});

		await sync.syncSelectorPriceList("Wholesale");

		expect(updatePriceList).toHaveBeenCalledWith("Wholesale");
		expect(getItems).not.toHaveBeenCalled();
		expect(refreshVisibleItems).toHaveBeenCalledWith("Wholesale");
	});

	it("does nothing when no incoming or default price list is available", async () => {
		const updatePriceList = vi.fn();
		const getItems = vi.fn();
		const sync = useItemsSelectorPriceListSync({
			activePriceList: ref(""),
			getDefaultPriceList: () => "",
			updatePriceList,
			getItems,
		});

		await sync.syncSelectorPriceList(null);

		expect(sync.resolveIncomingPriceList(null)).toBe("");
		expect(updatePriceList).not.toHaveBeenCalled();
		expect(getItems).not.toHaveBeenCalled();
	});
});
