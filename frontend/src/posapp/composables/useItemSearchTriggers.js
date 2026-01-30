import { ref, nextTick } from "vue";
import _ from "lodash";
import { isOffline } from "../../utils/frappe.js";
import { shouldReloadOnSearchClear } from "../../utils/searchUtils.js";

/**
 * useItemSearchTriggers
 * 
 * Manages UI-specific search interactions like focus, clear, and paste.
 * Acts as a bridge between the component template and search logic.
 */
export function useItemSearchTriggers({
    itemHeaderRef,
    cameraScannerActive,
    itemDetailFetcher,
    scannerInput,
    itemSelection,
    barcodeIndexing,
    eventBus,
} = {}) {
    const search_backup = ref("");
    const clearingSearch = ref(false);

    // Helpers to get input element
    const getSearchInputField = () => {
        const header = itemHeaderRef.value;
        const inputRef = header?.debounce_search;
        return inputRef?.value ?? inputRef ?? null;
    };

    const focusItemSearch = () => {
        if (cameraScannerActive.value) return;

        nextTick(() => {
            if (cameraScannerActive.value) return;
            const input = getSearchInputField();
            if (input && typeof input.focus === "function") {
                input.focus();
            }
        });
    };

    const blurItemSearch = () => {
        const input = getSearchInputField();
        if (input && typeof input.blur === "function") {
            input.blur();
        }
    };

    const clearSearch = async (context) => {
        if (clearingSearch.value) return;

        const {
            first_search,
            search,
            itemsLoaded,
            items,
            pos_profile,
            storageAvailable,
            get_items,
            loadVisibleItems,
            isBackgroundLoading,
            verifyServerItemCount,
        } = context;

        const shouldReload = shouldReloadOnSearchClear({
            currentSearch: first_search.value,
            previousSearch: search.value,
            itemsLoaded: itemsLoaded.value,
            itemsCount: items.value.length,
        });

        search_backup.value = first_search.value;
        clearingSearch.value = true;

        // Reset search states in context
        first_search.value = "";
        search.value = "";

        const release = () => {
            nextTick(() => {
                clearingSearch.value = false;
            });
        };

        if (!shouldReload) {
            release();
            return;
        }

        if (pos_profile.value?.posa_local_storage && storageAvailable.value) {
            await loadVisibleItems(true);
            if (!isBackgroundLoading.value) {
                verifyServerItemCount();
            }
            release();
            return;
        }

        if (isBackgroundLoading.value) {
            // Defer reload
            release();
            return;
        }

        await get_items(true);
        release();
    };

    const restoreSearch = (first_search, search) => {
        if (first_search.value === "") {
            first_search.value = search_backup.value;
            search.value = search_backup.value;
        }
    };

    const handleSearchPaste = (event) => {
        if (scannerInput?.handleSearchPaste) {
            scannerInput.handleSearchPaste(event);
        }
    };

    return {
        clearingSearch,
        focusItemSearch,
        blurItemSearch,
        clearSearch,
        restoreSearch,
        handleSearchPaste,
        getSearchInputField
    };
}
