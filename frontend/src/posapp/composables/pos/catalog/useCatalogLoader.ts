import { ref } from "vue";
import { initPromise } from "../../../../offline/index";

type EventBus = {
	emit: (_event: string, _payload?: unknown) => void;
};

type ItemWithQty = {
	actual_qty?: number | null;
	[key: string]: unknown;
};

type ItemDetailFetcher = {
	update_items_details?: (_items: ItemWithQty[]) => Promise<void> | void;
};

type LoaderContext = {
	appendCachedItemsPage?: () => Promise<ItemWithQty[]>;
	eventBus?: EventBus;
	ensureStorageHealth?: () => Promise<void>;
	loadItems?: (_args: {
		searchValue?: unknown;
		groupFilter?: unknown;
		limit?: number;
	}) => Promise<unknown>;
	get_search?: (_value: unknown) => unknown;
	first_search?: unknown;
	item_group?: unknown;
	usesLimitSearch?: boolean;
	limitSearchCap?: number;
	items?: ItemWithQty[];
	itemDetailFetcher?: ItemDetailFetcher;
	itemsStore?: unknown;
	totalItemCount?: number;
	displayedItems?: ItemWithQty[];
	cardColumns?: number;
	hasMoreCachedItems?: boolean;
	loading?: boolean;
	scheduleCardMetricsUpdate?: () => void;
};

/**
 * useItemsLoader
 *
 * Manages high-level item loading orchestration, including progress tracking,
 * virtual scrolling pagination, and initial data fetching.
 */
export function useItemsLoader() {
	const loadProgress = ref(0);
	const virtualScrollPending = ref(false);
	const ctxSource = ref<LoaderContext | null>(null);

	function registerContext(context: LoaderContext) {
		ctxSource.value = context;
	}

	const getCtx = <T>(key: keyof LoaderContext): T | null => {
		if (ctxSource.value && ctxSource.value[key] !== undefined) {
			return ctxSource.value[key] as T;
		}
		return null;
	};

	/**
	 * Appends the next page of cached items to the current list.
	 */
	async function appendCachedItemsPage() {
		const loadPage = getCtx<LoaderContext["appendCachedItemsPage"]>(
			"appendCachedItemsPage",
		);
		if (typeof loadPage === "function") {
			return await loadPage();
		}
		return [];
	}

	/**
	 * Loads visible items, optionally resetting the current view.
	 */
	async function loadVisibleItems(reset = false) {
		loadProgress.value = 0;
		const eventBus = getCtx<EventBus>("eventBus");
		if (eventBus) {
			eventBus.emit("data-load-progress", { name: "items", progress: 0 });
		}

		await initPromise;
		const ensureStorageHealth = getCtx<
			LoaderContext["ensureStorageHealth"]
		>("ensureStorageHealth");
		if (ensureStorageHealth) await ensureStorageHealth();

		if (reset) {
			const loadItems = getCtx<LoaderContext["loadItems"]>("loadItems");
			if (typeof loadItems === "function") {
				const get_search =
					getCtx<LoaderContext["get_search"]>("get_search") ||
					((v: unknown) => v);
				await loadItems({
					searchValue: get_search(getCtx("first_search")),
					groupFilter: getCtx("item_group"),
					limit: getCtx<boolean>("usesLimitSearch")
						? (getCtx<number>("limitSearchCap") ?? undefined)
						: undefined,
				});
			}
		}

		const pageItems = await appendCachedItemsPage();

		if (Array.isArray(pageItems) && pageItems.length) {
			if (eventBus) {
				eventBus.emit("set_all_items", getCtx("items"));
			}
			const itemDetailFetcher =
				getCtx<ItemDetailFetcher>("itemDetailFetcher");
			if (
				itemDetailFetcher &&
				typeof itemDetailFetcher.update_items_details === "function"
			) {
				await itemDetailFetcher.update_items_details(pageItems);
			}

			const totalItemCount = getCtx<number>("totalItemCount");
			const items = getCtx<ItemWithQty[]>("items") || [];
			loadProgress.value = totalItemCount
				? Math.round((items.length / totalItemCount) * 100)
				: 100;

			if (eventBus) {
				eventBus.emit("data-load-progress", {
					name: "items",
					progress: loadProgress.value,
				});
			}
		}
		return pageItems;
	}

	/**
	 * Handles virtual scroll range updates to trigger lazy loading.
	 */
	async function onVirtualRangeUpdate(
		_startIndex,
		_endIndex,
		_visibleStartIndex,
		visibleEndIndex,
	) {
		const displayedItems = getCtx<ItemWithQty[]>("displayedItems") || [];
		const total = displayedItems.length;
		if (!total) {
			const scheduleCardMetricsUpdate = getCtx<
				LoaderContext["scheduleCardMetricsUpdate"]
			>("scheduleCardMetricsUpdate");
			if (typeof scheduleCardMetricsUpdate === "function")
				scheduleCardMetricsUpdate();
			return;
		}

		const cardColumns = getCtx<number>("cardColumns") || 1;
		const threshold = Math.max(1, cardColumns * 2);
		const nearEnd = visibleEndIndex >= total - threshold;

		const hasMoreCachedItems = getCtx<boolean>("hasMoreCachedItems");
		const loading = getCtx<boolean>("loading");

		if (
			nearEnd &&
			hasMoreCachedItems &&
			!virtualScrollPending.value &&
			!loading
		) {
			virtualScrollPending.value = true;
			try {
				await appendCachedItemsPage();
			} catch (error) {
				console.warn("Failed to append cached items page", error);
			} finally {
				virtualScrollPending.value = false;
				const scheduleCardMetricsUpdate = getCtx<
					LoaderContext["scheduleCardMetricsUpdate"]
				>("scheduleCardMetricsUpdate");
				if (typeof scheduleCardMetricsUpdate === "function")
					scheduleCardMetricsUpdate();
			}
		} else {
			const scheduleCardMetricsUpdate = getCtx<
				LoaderContext["scheduleCardMetricsUpdate"]
			>("scheduleCardMetricsUpdate");
			if (typeof scheduleCardMetricsUpdate === "function")
				scheduleCardMetricsUpdate();
		}
	}

	/**
	 * Forces loading of quantities for currently displayed items.
	 */
	function forceLoadQuantities() {
		const displayedItems = getCtx<ItemWithQty[]>("displayedItems");
		if (displayedItems && displayedItems.length > 0) {
			displayedItems.forEach((item: ItemWithQty) => {
				if (item.actual_qty === undefined || item.actual_qty === null) {
					item.actual_qty = 0;
				}
			});
			const itemDetailFetcher =
				getCtx<ItemDetailFetcher>("itemDetailFetcher");
			if (
				itemDetailFetcher &&
				typeof itemDetailFetcher.update_items_details === "function"
			) {
				itemDetailFetcher.update_items_details(displayedItems);
			}
		}
	}

	/**
	 * Ensures all items in the lists have a defined actual_qty.
	 */
	function ensureAllItemsHaveQuantities() {
		const items = getCtx<ItemWithQty[]>("items");
		if (items && items.length > 0) {
			items.forEach((item: ItemWithQty) => {
				if (item.actual_qty === undefined || item.actual_qty === null) {
					item.actual_qty = 0;
				}
			});
		}
		const displayedItems = getCtx<ItemWithQty[]>("displayedItems");
		if (displayedItems && displayedItems.length > 0) {
			displayedItems.forEach((item: ItemWithQty) => {
				if (item.actual_qty === undefined || item.actual_qty === null) {
					item.actual_qty = 0;
				}
			});
		}
	}

	return {
		loadProgress,
		virtualScrollPending,
		registerContext,
		loadVisibleItems,
		appendCachedItemsPage,
		onVirtualRangeUpdate,
		forceLoadQuantities,
		ensureAllItemsHaveQuantities,
	};
}
