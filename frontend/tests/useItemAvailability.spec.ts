import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import stockCoordinator from "../src/posapp/utils/stockCoordinator";
import { useItemAvailability } from "../src/features/catalog/composables/useItemAvailability";

describe("useItemAvailability", () => {
	beforeEach(() => {
		stockCoordinator.clearAll();
	});

	afterEach(() => {
		stockCoordinator.clearAll();
	});

	it("recomputes selector stock when cart quantities change", () => {
		const itemAvailability = useItemAvailability();
		const item = {
			item_code: "ITEM-001",
			actual_qty: 10,
			available_qty: 10,
		};
		const items = [item];

		itemAvailability.registerCallbacks({
			getItems: () => items,
			getDisplayedItems: () => items,
			getFilteredItems: () => items,
		});
		itemAvailability.initAvailability();
		itemAvailability.captureBaseAvailability(item, 10);

		itemAvailability.handleCartQuantitiesUpdated({
			"ITEM-001": 2,
		});

		expect(item.actual_qty).toBe(8);
		expect(stockCoordinator.getReserved("ITEM-001")).toBe(2);
	});

	it("applies coordinator updates after local invoice consumption", () => {
		const itemAvailability = useItemAvailability();
		const item = {
			item_code: "ITEM-LOCAL",
			actual_qty: 10,
			available_qty: 10,
			_base_actual_qty: 10,
		};
		const items = [item];

		itemAvailability.registerCallbacks({
			getItems: () => items,
			getDisplayedItems: () => items,
			getFilteredItems: () => items,
		});
		itemAvailability.initAvailability();
		itemAvailability.captureBaseAvailability(item, 10);

		stockCoordinator.applyInvoiceConsumption(
			[{ item_code: "ITEM-LOCAL", stock_qty: 3 }],
			{ source: "invoice" },
		);

		expect(item.actual_qty).toBe(7);
	});
});
