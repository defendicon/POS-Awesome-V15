import { nextTick, watch, type Ref } from "vue";

type EventBusLike = {
	emit?: (_event: string, _payload?: unknown) => void;
};

type ScannerInputLike = {
	handleSearchInput?: (_value: string) => void;
	setInputHandlers?: (_handlers: {
		get: () => string;
		set: (_value: string) => void;
		clear: () => void;
		focus: () => void;
	}) => void;
};

type SearchFocusGuardLike = {
	armPreserveNextFocusClear: () => void;
	shouldClearSearchOnFocus: () => boolean;
};

type UseItemsSelectorSearchInputArgs = {
	searchInput: Ref<string>;
	firstSearch: Ref<string>;
	clearingSearch?: Ref<boolean>;
	activeView: Ref<string>;
	eventBus: EventBusLike | null | undefined;
	scannerInput: ScannerInputLike;
	searchFocusGuard: SearchFocusGuardLike;
	clearHighlightedItem: () => void;
	focusItemSearch: () => void;
	setActiveView: (_view: string) => void;
	triggerItemSearchFocus: () => void;
	onSearchInput?: (_value: string) => void;
};

export function useItemsSelectorSearchInput({
	searchInput,
	firstSearch,
	clearingSearch,
	activeView,
	eventBus,
	scannerInput,
	searchFocusGuard,
	clearHighlightedItem,
	focusItemSearch,
	setActiveView,
	triggerItemSearchFocus,
	onSearchInput,
}: UseItemsSelectorSearchInputArgs) {
	const clearSearch = () => {
		if (clearingSearch) {
			clearingSearch.value = true;
		}
		searchInput.value = "";
		firstSearch.value = "";
		if (clearingSearch) {
			clearingSearch.value = false;
		}
	};

	const handleSearchInput = (value: unknown) => {
		const normalized = String(value ?? "");
		searchInput.value = normalized;
		firstSearch.value = normalized;
		scannerInput.handleSearchInput?.(normalized);
		onSearchInput?.(normalized);
	};

	const prepareSearchInjection = () => {
		clearSearch();
		searchFocusGuard.armPreserveNextFocusClear();
	};

	const appendSearchCharacter = (character: string) => {
		const nextValue = `${String(searchInput.value || "")}${character}`;
		handleSearchInput(nextValue);
	};

	const revealItemSearchView = () => {
		eventBus?.emit?.("set_compact_panel", "selector");
		if (activeView.value !== "items") {
			setActiveView("items");
		}
	};

	const requestItemSearchFocus = () => {
		if (activeView.value !== "items") {
			return;
		}
		nextTick(() => {
			focusItemSearch();
		});
	};

	const requestForegroundItemSearchFocus = () => {
		revealItemSearchView();
		triggerItemSearchFocus();
		eventBus?.emit?.("focus_item_search");
	};

	const handleItemSearchFocus = () => {
		if (!searchFocusGuard.shouldClearSearchOnFocus()) {
			requestItemSearchFocus();
			return;
		}
		clearSearch();
		requestItemSearchFocus();
	};

	const stopSearchInputWatcher = watch(searchInput, (value) => {
		firstSearch.value = value;
		clearHighlightedItem();
	});

	scannerInput.setInputHandlers?.({
		get: () => String(searchInput.value || ""),
		set: (value: string) => {
			prepareSearchInjection();
			handleSearchInput(String(value ?? ""));
		},
		clear: clearSearch,
		focus: requestForegroundItemSearchFocus,
	});

	return {
		clearSearch,
		handleSearchInput,
		prepareSearchInjection,
		appendSearchCharacter,
		revealItemSearchView,
		requestItemSearchFocus,
		requestForegroundItemSearchFocus,
		handleItemSearchFocus,
		cleanup: stopSearchInputWatcher,
	};
}
