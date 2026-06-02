import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";

import { useItemsSelectorSearchInput } from "../src/posapp/composables/pos/items/useItemsSelectorSearchInput";

const createSearchFocusGuard = () => ({
	armPreserveNextFocusClear: vi.fn(),
	shouldClearSearchOnFocus: vi.fn(() => false),
});

describe("useItemsSelectorSearchInput", () => {
	it("runs the selector search callback when the visible search input changes", () => {
		const searchInput = ref("");
		const firstSearch = ref("");
		const scannerInput = {
			handleSearchInput: vi.fn(),
			setInputHandlers: vi.fn(),
		};
		const onSearchInput = vi.fn();

		const api = useItemsSelectorSearchInput({
			searchInput,
			firstSearch,
			activeView: ref("items"),
			eventBus: null,
			scannerInput,
			searchFocusGuard: createSearchFocusGuard(),
			clearHighlightedItem: vi.fn(),
			focusItemSearch: vi.fn(),
			setActiveView: vi.fn(),
			triggerItemSearchFocus: vi.fn(),
			onSearchInput,
		});

		api.handleSearchInput("zinc");

		expect(searchInput.value).toBe("zinc");
		expect(firstSearch.value).toBe("zinc");
		expect(scannerInput.handleSearchInput).toHaveBeenCalledWith("zinc");
		expect(onSearchInput).toHaveBeenCalledWith("zinc");
		api.cleanup();
	});
});
