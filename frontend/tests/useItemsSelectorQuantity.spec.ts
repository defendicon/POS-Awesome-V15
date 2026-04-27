import { describe, expect, it } from "vitest";
import { ref } from "vue";

import { useItemsSelectorQuantity } from "../src/posapp/composables/pos/items/useItemsSelectorQuantity";

describe("useItemsSelectorQuantity", () => {
	it("normalizes comma-formatted decimal input", () => {
		const quantity = useItemsSelectorQuantity({
			hideQtyDecimals: ref(false),
			initialQty: 1,
		});

		quantity.debounceQty.value = "1,234.50";

		expect(quantity.qty.value).toBe(1234.5);
		expect(quantity.debounceQty.value).toBe(1234.5);
	});

	it("rounds input and display when decimal quantities are hidden", () => {
		const quantity = useItemsSelectorQuantity({
			hideQtyDecimals: ref(true),
			initialQty: 1,
		});

		quantity.debounceQty.value = "2.6";

		expect(quantity.qty.value).toBe(3);
		expect(quantity.debounceQty.value).toBe(3);
	});

	it("restores quantity to one on blur when empty or non-positive", () => {
		const quantity = useItemsSelectorQuantity({
			hideQtyDecimals: ref(false),
			initialQty: 1,
		});

		quantity.clearQty();
		quantity.onQtyBlur();
		expect(quantity.qty.value).toBe(1);

		quantity.qty.value = 0;
		quantity.onQtyBlur();
		expect(quantity.qty.value).toBe(1);
	});
});
