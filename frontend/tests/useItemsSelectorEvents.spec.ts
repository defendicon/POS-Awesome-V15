import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { registerItemsSelectorEvents } from "../src/posapp/composables/pos/items/useItemsSelectorEvents";

const createRegistration = () => {
	const handlers = new Map<string, (...args: any[]) => void>();
	const eventBus = {
		on: vi.fn((event: string, handler: (...args: any[]) => void) => {
			handlers.set(event, handler);
		}),
		off: vi.fn(),
	};
	const injectTypeToSearchCharacter = vi.fn();

	const cleanup = registerItemsSelectorEvents({
		eventBus,
		selectedCurrency: ref(""),
		selectedExchangeRate: ref(1),
		selectedConversionRate: ref(1),
		selectedSupplier: ref(null),
		syncSelectorPriceList: vi.fn(),
		scheduleLastBuyingRateRefresh: vi.fn(),
		requestItemSearchFocus: vi.fn(),
		injectTypeToSearchCharacter,
		handleCartQuantitiesUpdated: vi.fn(),
		handleRemoteStockAdjustment: vi.fn(),
	});

	return { cleanup, eventBus, handlers, injectTypeToSearchCharacter };
};

describe("registerItemsSelectorEvents", () => {
	it("injects cart quantity typing into item search", () => {
		const { handlers, injectTypeToSearchCharacter } = createRegistration();

		handlers.get("type_to_item_search")?.("A");

		expect(injectTypeToSearchCharacter).toHaveBeenCalledWith("A");
	});

	it("cleans up the cart quantity type-to-search listener", () => {
		const { cleanup, eventBus } = createRegistration();

		cleanup();

		expect(eventBus.off).toHaveBeenCalledWith("type_to_item_search", expect.any(Function));
	});
});
