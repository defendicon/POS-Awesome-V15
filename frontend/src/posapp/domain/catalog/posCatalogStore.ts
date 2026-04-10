import { ref } from "vue";

import { pushPosCatalogTimelineEvent } from "./catalogDiagnostics";
import type {
	PosCatalogBlocker,
	PosCatalogItem,
	PosCatalogStage,
	PosCatalogState,
	PosCatalogStatus,
	PosCatalogViewMode,
} from "./posCatalogTypes";

function createInitialCatalogState(): PosCatalogState {
	return {
		stage: "idle",
		status: "idle",
		blocker: null,
		timeline: [],
		preferredView: "cards",
		highlightedItemCode: null,
		selectedItemCode: null,
		searchTerm: "",
		activeGroup: "ALL",
		displayedItems: [],
	};
}

export function createPosCatalogStore() {
	const state = ref<PosCatalogState>(createInitialCatalogState());

	function markStarting() {
		state.value = {
			...createInitialCatalogState(),
			stage: "starting",
			status: "loading",
			timeline: pushPosCatalogTimelineEvent([], "starting"),
		};
	}

	function markStage(
		stage: Exclude<
			PosCatalogStage,
			"idle" | "starting" | "ready" | "degraded" | "blocked"
		>,
	) {
		state.value = {
			...state.value,
			stage,
			status: "loading",
			blocker: null,
			timeline: pushPosCatalogTimelineEvent(state.value.timeline, stage),
		};
	}

	function setStage(stage: PosCatalogStage, status: PosCatalogStatus = state.value.status) {
		state.value = {
			...state.value,
			stage,
			status,
		};
	}

	function setPreferredView(preferredView: PosCatalogViewMode) {
		state.value = {
			...state.value,
			preferredView,
		};
	}

	function setSearchTerm(searchTerm: string) {
		state.value = {
			...state.value,
			searchTerm,
		};
	}

	function setActiveGroup(activeGroup: string) {
		state.value = {
			...state.value,
			activeGroup,
		};
	}

	function setDisplayedItems(displayedItems: PosCatalogItem[]) {
		state.value = {
			...state.value,
			displayedItems: Array.isArray(displayedItems)
				? [...displayedItems]
				: [],
		};
	}

	function setHighlightedItemCode(highlightedItemCode: string | null) {
		state.value = {
			...state.value,
			highlightedItemCode,
		};
	}

	function setSelectedItemCode(selectedItemCode: string | null) {
		state.value = {
			...state.value,
			selectedItemCode,
		};
	}

	function markReady() {
		state.value = {
			...state.value,
			stage: "ready",
			status: "ready",
			blocker: null,
			timeline: pushPosCatalogTimelineEvent(state.value.timeline, "ready"),
		};
	}

	function markDegraded(blocker: PosCatalogBlocker) {
		state.value = {
			...state.value,
			status: "degraded",
			blocker,
			timeline: pushPosCatalogTimelineEvent(
				state.value.timeline,
				"degraded",
				blocker,
			),
		};
	}

	function blockCatalog(blocker: PosCatalogBlocker) {
		state.value = {
			...state.value,
			stage: "blocked",
			status: "blocked",
			blocker,
			timeline: pushPosCatalogTimelineEvent(
				state.value.timeline,
				"blocked",
				blocker,
			),
		};
	}

	function resetCatalog() {
		state.value = createInitialCatalogState();
	}

	return {
		state,
		markStarting,
		markStage,
		setStage,
		setPreferredView,
		setSearchTerm,
		setActiveGroup,
		setDisplayedItems,
		setHighlightedItemCode,
		setSelectedItemCode,
		markReady,
		markDegraded,
		blockCatalog,
		resetCatalog,
	};
}

let sharedPosCatalogStore: ReturnType<typeof createPosCatalogStore> | null =
	null;

export function usePosCatalogStore() {
	if (!sharedPosCatalogStore) {
		sharedPosCatalogStore = createPosCatalogStore();
	}

	return sharedPosCatalogStore;
}
