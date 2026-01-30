import { ref, computed, nextTick } from "vue";
import _ from "lodash";
import { getCardColumns, getCardGap, getCardPadding } from "../utils/itemSelectorLayout.js";

/**
 * useItemSelectorLayout
 * 
 * Manages UI metrics, container resizing, and scrolling synchronization.
 * Handles the responsive grid for cards and vertical scroll position for tables.
 */
export function useItemSelectorLayout({
    itemsContainerRef,
    itemsTableRef,
    itemsView,
    items,
    displayedItems
} = {}) {
    const containerWidth = ref(0);
    const scrollPosition = ref(0);
    const isOverflowing = ref(false);

    // Responsive metrics derived from width
    const cardColumns = computed(() => getCardColumns(containerWidth.value));
    const cardGap = computed(() => getCardGap(containerWidth.value));
    const cardPadding = computed(() => getCardPadding(containerWidth.value));

    const updateContainerMetrics = (width) => {
        if (typeof width === "number") {
            containerWidth.value = width;
        }
    };

    const checkItemContainerOverflow = () => {
        if (itemsView.value !== "card") return;

        nextTick(() => {
            const container = itemsContainerRef?.value?.$el || itemsContainerRef?.value;
            if (container) {
                isOverflowing.value = container.scrollHeight > container.clientHeight;
            }
        });
    };

    const scheduleCardMetricsUpdate = _.debounce(() => {
        checkItemContainerOverflow();
    }, 150);

    const onListScroll = (event) => {
        if (event?.target) {
            scrollPosition.value = event.target.scrollTop;
        }
    };

    const scrollHighlightedItemIntoView = (index) => {
        nextTick(() => {
            if (itemsView.value === "card") {
                itemsContainerRef.value?.scrollToItem?.(index);
                return;
            }

            const tableRef = itemsTableRef.value;
            const scrollToIndex = tableRef?.scrollToIndex || tableRef?.$?.exposed?.scrollToIndex || null;
            if (scrollToIndex) {
                const scheduleScroll = typeof requestAnimationFrame === "function"
                    ? requestAnimationFrame
                    : (callback) => setTimeout(callback, 0);

                scheduleScroll(() => {
                    scrollToIndex(index);
                });
                return;
            }

            // Fallback manual scroll
            const tableEl = tableRef?.getTableElement?.() || tableRef?.$el || tableRef;
            const wrapper = tableEl?.querySelector?.(".v-table__wrapper");
            const rows = tableEl?.querySelectorAll?.("tbody tr");
            if (wrapper && rows && rows[index]) {
                const targetRow = rows[index];
                if (typeof targetRow.offsetTop === "number") {
                    wrapper.scrollTop = Math.max(0, targetRow.offsetTop - wrapper.clientHeight / 2);
                } else {
                    targetRow.scrollIntoView({ block: "nearest" });
                }
            }
        });
    };

    return {
        containerWidth,
        scrollPosition,
        isOverflowing,
        cardColumns,
        cardGap,
        cardPadding,
        updateContainerMetrics,
        checkItemContainerOverflow,
        scheduleCardMetricsUpdate,
        onListScroll,
        scrollHighlightedItemIntoView
    };
}
