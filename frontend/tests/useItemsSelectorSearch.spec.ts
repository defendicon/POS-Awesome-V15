import { describe, expect, it, vi } from "vitest";

import { useItemsSelectorSearch } from "../src/features/catalog/composables/useItemsSelectorSearch";

const createScannerInput = () => ({
	ensureScaleBarcodeSettings: vi.fn().mockResolvedValue(undefined),
	getScaleBarcodePrefix: vi.fn(() => ""),
	scaleBarcodeMatches: vi.fn(() => false),
	onBarcodeScanned: vi.fn(),
	handleSearchKeydown: vi.fn(() => false),
});

describe("useItemsSelectorSearch", () => {
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
