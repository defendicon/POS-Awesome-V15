import { nextTick, watch, type Ref } from "vue";

type UseItemsSelectorLayoutLifecycleArgs = {
	displayedItems: Ref<unknown[]>;
	checkItemContainerOverflow: () => void;
	scheduleCardMetricsUpdate: () => void;
	scheduleLastInvoiceRateRefresh: () => void;
	scheduleLastBuyingRateRefresh: () => void;
	syncHighlightedItem: () => void;
};

export function useItemsSelectorLayoutLifecycle({
	displayedItems,
	checkItemContainerOverflow,
	scheduleCardMetricsUpdate,
	scheduleLastInvoiceRateRefresh,
	scheduleLastBuyingRateRefresh,
	syncHighlightedItem,
}: UseItemsSelectorLayoutLifecycleArgs) {
	const refreshCardMetrics = () => {
		nextTick(() => {
			checkItemContainerOverflow();
			scheduleCardMetricsUpdate();
		});
	};

	const stopDisplayedItemsWatcher = watch(displayedItems, () => {
		refreshCardMetrics();
		scheduleLastInvoiceRateRefresh();
		scheduleLastBuyingRateRefresh();
		syncHighlightedItem();
	});

	const mount = () => {
		if (typeof window !== "undefined") {
			window.addEventListener("resize", checkItemContainerOverflow);
		}
		refreshCardMetrics();
	};

	const cleanup = () => {
		stopDisplayedItemsWatcher();
		if (typeof window !== "undefined") {
			window.removeEventListener("resize", checkItemContainerOverflow);
		}
	};

	return {
		mount,
		cleanup,
	};
}
