import { describe, expect, it, vi } from "vitest";

import {
	buildSelectorRowProps,
	createItemHighlightMatcher,
} from "../src/posapp/utils/itemSelectorHighlightBindings";

describe("item selector highlight bindings", () => {
	it("matches highlighted cards by delegating item objects to itemSelection", () => {
		const item = { item_code: "ITEM-002" };
		const itemSelection = {
			highlightedIndex: { value: 1 },
			isItemHighlighted: vi.fn((candidate) => candidate === item),
			getItemRowProps: vi.fn(),
		};

		const isItemHighlighted = createItemHighlightMatcher(itemSelection as any);

		expect(isItemHighlighted(item)).toBe(true);
		expect(itemSelection.isItemHighlighted).toHaveBeenCalledWith(item);
	});

	it("matches highlighted rows when an index is provided", () => {
		const itemSelection = {
			highlightedIndex: { value: 2 },
			isItemHighlighted: vi.fn(),
			getItemRowProps: vi.fn(),
		};

		const isItemHighlighted = createItemHighlightMatcher(itemSelection as any);

		expect(isItemHighlighted(2)).toBe(true);
		expect(isItemHighlighted(1)).toBe(false);
		expect(itemSelection.isItemHighlighted).not.toHaveBeenCalled();
	});

	it("merges highlight row props with selector row metadata", () => {
		const item = { item_code: "ITEM-003" };
		const itemSelection = {
			getItemRowProps: vi.fn(() => ({ class: "item-row-highlighted" })),
		};

		expect(buildSelectorRowProps(itemSelection as any, item)).toEqual({
			"data-item-code": "ITEM-003",
			class: "item-row-highlighted",
			draggable: true,
		});
	});
});
