import { describe, expect, it, vi } from "vitest";

import { resolveBooleanSetting } from "../src/posapp/composables/pos/items/selectorSearch/resolveBooleanSetting";
import { useItemsSelectorSearch } from "../src/posapp/composables/pos/items/useItemsSelectorSearch";

const createScannerInput = () => ({
	ensureScaleBarcodeSettings: vi.fn().mockResolvedValue(undefined),
	getScaleBarcodePrefix: vi.fn(() => ""),
	scaleBarcodeMatches: vi.fn(() => false),
	onBarcodeScanned: vi.fn(),
	handleSearchKeydown: vi.fn(() => false),
	playScanTone: vi.fn(),
});

describe("useItemsSelectorSearch", () => {
	it("uses the standard barcode uom when adding a visible barcode match", async () => {
		(globalThis as any).flt = (value: unknown) => Number(value || 0);
		const addItem = vi.fn().mockResolvedValue(undefined);
		const clearSearch = vi.fn();
		const focusItemSearch = vi.fn();
		const vm = {
			first_search: "BOX-001",
			search: "",
			search_from_scanner: true,
			scannerLocked: true,
			pendingScanCode: "BOX-001",
			awaitingScanResult: false,
			scanErrorDialog: false,
			qty: 1,
			displayedItems: [
				{
					item_code: "ITEM-001",
					item_name: "Item 001",
					stock_uom: "Nos",
					item_barcode: [{ barcode: "BOX-001", uom: "Box" }],
				},
			],
			flags: {},
			add_item: addItem,
			clearSearch,
			focusItemSearch,
		};

		const api = useItemsSelectorSearch({
			getVM: () => vm,
			scannerInput: createScannerInput(),
		});

		await api.enter_event();

		expect(addItem).toHaveBeenCalledTimes(1);
		expect(addItem.mock.calls[0][0].uom).toBe("Box");
		expect(clearSearch).toHaveBeenCalledTimes(1);
		expect(focusItemSearch).toHaveBeenCalledTimes(1);
	});

	it("uses the nested integration search path for limit search enter actions", async () => {
		const searchItems = vi.fn().mockResolvedValue([]);
		const selectHighlightedItem = vi.fn();
		const vm = {
			first_search: "abc",
			search_input: "abc",
			search: "",
			search_from_scanner: false,
			isBackgroundLoading: false,
			pos_profile: { posa_use_limit_search: 1 },
			itemSelection: {
				highlightedIndex: 0,
				selectHighlightedItem,
			},
			itemsIntegration: {
				searchItems,
			},
		};

		const api = useItemsSelectorSearch({
			getVM: () => vm,
			scannerInput: createScannerInput(),
			itemSelection: vm.itemSelection,
		});

		await api._performSearch();

		expect(searchItems).toHaveBeenCalledWith("abc");
		expect(vm.search).toBe("abc");
		expect(selectHighlightedItem).not.toHaveBeenCalled();
	});

	it("prioritizes search over highlighted selection when enter is pressed in limit search mode", async () => {
		const searchItems = vi.fn().mockResolvedValue([]);
		const selectHighlightedItem = vi.fn();
		const preventDefault = vi.fn();
		const vm = {
			first_search: "abcd",
			search_input: "abcd",
			search: "",
			search_from_scanner: false,
			isBackgroundLoading: false,
			pos_profile: { posa_use_limit_search: 1 },
			itemSelection: {
				highlightedIndex: 0,
				selectHighlightedItem,
			},
			itemsIntegration: {
				searchItems,
			},
		};

		const api = useItemsSelectorSearch({
			getVM: () => vm,
			scannerInput: createScannerInput(),
			itemSelection: vm.itemSelection,
		});

		api.onEnter({ preventDefault } as unknown as KeyboardEvent);
		await Promise.resolve();

		expect(preventDefault).toHaveBeenCalled();
		expect(searchItems).toHaveBeenCalledWith("abcd");
		expect(selectHighlightedItem).not.toHaveBeenCalled();
	});

	it("selects the highlighted item when enter is pressed with a highlighted ref index", () => {
		const selectHighlightedItem = vi.fn();
		const preventDefault = vi.fn();
		const vm = {
			first_search: "abcd",
			search_input: "abcd",
			search: "",
			search_from_scanner: false,
			isBackgroundLoading: false,
			pos_profile: { posa_use_limit_search: 0 },
			itemSelection: {
				highlightedIndex: { value: 0 },
				selectHighlightedItem,
			},
		};

		const api = useItemsSelectorSearch({
			getVM: () => vm,
			scannerInput: createScannerInput(),
			itemSelection: vm.itemSelection,
		});

		api.onEnter({ preventDefault } as unknown as KeyboardEvent);

		expect(preventDefault).toHaveBeenCalled();
		expect(selectHighlightedItem).toHaveBeenCalledTimes(1);
	});
});

describe("resolveBooleanSetting", () => {
	it("enables only explicit affirmative string settings", () => {
		expect(resolveBooleanSetting("1")).toBe(true);
		expect(resolveBooleanSetting(" true ")).toBe(true);
		expect(resolveBooleanSetting("YES")).toBe(true);
		expect(resolveBooleanSetting("0")).toBe(false);
		expect(resolveBooleanSetting("false")).toBe(false);
		expect(resolveBooleanSetting("enabled")).toBe(false);
	});

	it("enables only numeric one for numeric settings", () => {
		expect(resolveBooleanSetting(1)).toBe(true);
		expect(resolveBooleanSetting(0)).toBe(false);
		expect(resolveBooleanSetting(2)).toBe(false);
	});

	it("falls back to JavaScript truthiness for non-string and non-number settings", () => {
		expect(resolveBooleanSetting(true)).toBe(true);
		expect(resolveBooleanSetting(false)).toBe(false);
		expect(resolveBooleanSetting(null)).toBe(false);
		expect(resolveBooleanSetting({})).toBe(true);
	});
});
