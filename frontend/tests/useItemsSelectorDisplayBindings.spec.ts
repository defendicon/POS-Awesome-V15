import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { useItemsSelectorDisplayBindings } from "../src/posapp/composables/pos/items/useItemsSelectorDisplayBindings";

describe("useItemsSelectorDisplayBindings", () => {
	it("proxies item display bindings without freezing reactive values", () => {
		const headers = ref([{ title: "Code", key: "item_code" }]);
		const currencyFormatter = vi.fn((value: unknown) => `currency:${value}`);
		const numberFormatter = vi.fn((value: unknown) => `number:${value}`);
		const itemDisplay = {
			headers,
			memoizedFormatCurrency: ref(currencyFormatter),
			memoizedFormatNumber: ref(numberFormatter),
			ratePrecision: vi.fn((value: string | number) => (Number(value) % 1 === 0 ? 0 : 2)),
			format_currency: vi.fn(),
			format_number: vi.fn(),
			currencySymbol: vi.fn(),
		};
		const itemSelection = {
			highlightedIndex: ref(0),
			isItemHighlighted: vi.fn(),
			getItemRowClass: vi.fn(),
			getItemRowProps: vi.fn(),
		};

		const bindings = useItemsSelectorDisplayBindings({
			itemDisplay,
			itemSelection,
		});

		expect(bindings.headers.value).toEqual([{ title: "Code", key: "item_code" }]);
		expect(bindings.memoizedFormatCurrency.value(5, "USD")).toBe("currency:5");
		expect(bindings.memoizedFormatNumber.value(7)).toBe("number:7");
		expect(bindings.ratePrecision).toBe(itemDisplay.ratePrecision);
		expect(bindings.format_currency).toBe(itemDisplay.format_currency);
		expect(bindings.format_number).toBe(itemDisplay.format_number);
		expect(bindings.currencySymbol).toBe(itemDisplay.currencySymbol);

		headers.value = [{ title: "Name", key: "item_name" }];
		expect(bindings.headers.value).toEqual([{ title: "Name", key: "item_name" }]);
	});

	it("provides table header props and item row/highlight wrappers", () => {
		const item = { item_code: "ITEM-001" };
		const itemSelection = {
			highlightedIndex: ref(2),
			isItemHighlighted: vi.fn((candidate) => candidate === item),
			getItemRowClass: vi.fn(() => "item-row-highlighted"),
			getItemRowProps: vi.fn(() => ({ class: "item-row-highlighted" })),
		};

		const bindings = useItemsSelectorDisplayBindings({
			itemDisplay: {
				headers: ref([]),
				memoizedFormatCurrency: ref(vi.fn()),
				memoizedFormatNumber: ref(vi.fn()),
				ratePrecision: vi.fn(),
				format_currency: vi.fn(),
				format_number: vi.fn(),
				currencySymbol: vi.fn(),
			},
			itemSelection,
		});

		expect(bindings.headerProps).toMatchObject({
			"sort-icon": "mdi-arrow-up",
			class: "pos-table-header",
		});
		expect(bindings.isItemHighlighted(item)).toBe(true);
		expect(bindings.isItemHighlighted(2)).toBe(true);
		expect(bindings.isItemHighlighted(1)).toBe(false);
		expect(bindings.isNegative(-0.01)).toBe(true);
		expect(bindings.isNegative(0)).toBe(false);
		expect(bindings.getItemRowClass(item)).toBe("item-row-highlighted");
		expect(bindings.getItemRowProps(item)).toEqual({
			class: "item-row-highlighted",
			"data-item-code": "ITEM-001",
			draggable: true,
		});
	});
});
