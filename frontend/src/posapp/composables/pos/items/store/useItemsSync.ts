import { ref } from "vue";
import type { Item, POSProfile } from "../../../../types/models";
import itemService from "../../../../services/itemService";
// @ts-ignore
import {
	saveItemsBulk,
	clearStoredItems,
	setItemsLastSync,
	getItemsLastSync,
	saveItemDetailsCache,
	saveItemUOMs,
	saveItemGroups,
	getCachedItemGroups,
	refreshBootstrapSnapshotFromCacheState,
	updateLocalStockCache,
	setStockCacheReady,
} from "../../../../../offline/index";

export interface BackgroundSyncState {
	running: boolean;
	token: number;
}

const hasStockQuantity = (item: Item) =>
	item && Object.prototype.hasOwnProperty.call(item, "actual_qty");

const containsStockQuantities = (items: Item[]) =>
	Array.isArray(items) && items.some(hasStockQuantity);

const DELTA_SYNC_LIMIT = 1000;
const BACKGROUND_SYNC_PAGE_SIZE = 1000;
const BACKGROUND_PAGINATION_REFRESH_BATCHES = 5;

export function useItemsSync() {
	const isLoading = ref(false);
	const isBackgroundLoading = ref(false);
	const loadProgress = ref(0);
	const syncedItemsCount = ref(0);
	const requestToken = ref(0);
	const abortControllers = ref(new Map<string, AbortController>());
	const backgroundSyncState = ref<BackgroundSyncState>({
		running: false,
		token: 0,
	});

	const itemGroups = ref<string[]>(["ALL"]);

	const loadItemGroups = async (posProfile: POSProfile | null) => {
		try {
			if (
				posProfile?.item_groups?.length &&
				posProfile.item_groups.length > 0
			) {
				const groups = ["ALL"];
				posProfile.item_groups.forEach((element: any) => {
					if (element.item_group !== "All Item Groups") {
						groups.push(element.item_group);
					}
				});
				itemGroups.value = groups;
				saveItemGroups(groups);
			} else {
				// Fallback to API
				const response = await itemService.getItemGroupsData();

				if (response) {
					const groups = ["ALL"];
					response.forEach((element) => {
						groups.push(element.name);
					});
					itemGroups.value = groups;
					saveItemGroups(groups);
				}
			}
		} catch (error) {
			console.error("Failed to load item groups:", error);
			const cachedGroups = getCachedItemGroups();
			if (Array.isArray(cachedGroups) && cachedGroups.length > 0) {
				itemGroups.value = cachedGroups as string[];
				saveItemGroups(cachedGroups as string[]);
			}
		}
	};

	const persistItemsToStorage = async (
		itemsBatch: Item[],
		shouldPersist: boolean,
		replaceExisting: boolean,
		scope: string,
		updateCachedPaginationCallback: () => Promise<void>,
	) => {
		if (!shouldPersist) {
			return;
		}

		if (!Array.isArray(itemsBatch) || itemsBatch.length === 0) {
			return;
		}

		try {
			if (replaceExisting) {
				await clearStoredItems(scope);
			}

			await saveItemsBulk(itemsBatch, scope);
			await updateCachedPaginationCallback();
		} catch (error) {
			console.error("Failed to persist items batch:", error);
		}
	};

	const primeItemDetailsCache = (
		itemList: Item[],
		posProfile: POSProfile | null,
		activePriceList: string,
	) => {
		if (
			!Array.isArray(itemList) ||
			itemList.length === 0 ||
			!posProfile?.name
		) {
			return;
		}

		const detailItems = itemList.filter((item): item is Item =>
			Boolean(item?.item_code),
		);
		if (!detailItems.length) {
			return;
		}

		saveItemDetailsCache(
			posProfile.name,
			typeof activePriceList === "string" ? activePriceList : "",
			detailItems,
		);

		detailItems.forEach((item) => {
			if (Array.isArray(item.item_uoms) && item.item_uoms.length > 0) {
				saveItemUOMs(item.item_code, item.item_uoms);
			}
		});
	};

	const cancelBackgroundSync = () => {
		backgroundSyncState.value.token += 1;
		backgroundSyncState.value.running = false;
		isBackgroundLoading.value = false;
		loadProgress.value = 0;
		syncedItemsCount.value = 0;
	};

	const refreshModifiedItems = async (
		posProfile: POSProfile | null,
		activePriceList: string,
		customer: string | null,
		scope: string,
		updateItemsInPlace: (_items: Item[]) => void,
		itemsMap: Map<string, Item>,
	) => {
		const lastSync = getItemsLastSync();
		if (!lastSync) return { size: 0, count: 0, items: [] };

		try {
			// @ts-ignore
			const response = await frappe.call({
				method: "posawesome.posawesome.api.items.get_delta_items",
				args: {
					pos_profile: JSON.stringify(posProfile),
					price_list: activePriceList,
					customer,
					modified_after: lastSync,
					limit: DELTA_SYNC_LIMIT,
				},
				freeze: false,
			});

			const fetchedItems = Array.isArray(response?.message)
				? response.message
				: [];
			const size = JSON.stringify(fetchedItems).length;
			let resolvedItems: Item[] = [];

			if (fetchedItems.length > 0) {
				updateItemsInPlace(fetchedItems);
				await saveItemsBulk(fetchedItems, scope);
				resolvedItems = fetchedItems
					.map((item) => itemsMap.get(item.item_code))
					.filter((item): item is Item => !!item);

				// Find the latest modification timestamp
				let maxModified = "";
				for (const item of fetchedItems) {
					if (item.modified && item.modified > maxModified) {
						maxModified = item.modified;
					}
				}

				if (maxModified) {
					setItemsLastSync(maxModified);
				}
			}

			return { size, count: fetchedItems.length, items: resolvedItems };
		} catch (error) {
			console.error("Failed to refresh modified items:", error);
			return { size: 0, count: 0, items: [], error };
		}
	};

	const backgroundSyncItems = async (
		options: {
			reset?: boolean;
			groupFilter?: string;
			searchValue?: string;
			initialBatch?: Item[];
		} = {},
		posProfile: POSProfile | null,
		activePriceList: string,
		scope: string,
		shouldPersistItems: boolean,
		resolvePageSize: (_pageSize?: number) => number,
		setItems: (_items: Item[], _options?: any) => void,
		updateCachedPaginationFromStorage: () => Promise<void>,
		totalItemCount: { value: number },
		itemsLoaded: { value: boolean },
		items: { value: Item[] },
		maxInMemoryItems = Number.POSITIVE_INFINITY,
	) => {
		const {
			reset = false,
			groupFilter = "",
			searchValue = "",
			initialBatch = [],
		} = options;

		if (!shouldPersistItems) {
			return [];
		}

		if (searchValue && searchValue.trim().length > 0) {
			return [];
		}

		const normalizedGroup =
			typeof groupFilter === "string" && groupFilter.length > 0
				? groupFilter
				: "ALL";

		const token = ++backgroundSyncState.value.token;
		backgroundSyncState.value.running = true;
		isBackgroundLoading.value = true;
		loadProgress.value = 0;
		syncedItemsCount.value = 0;

		const appended: Item[] = [];
		const bootstrapCount = Array.isArray(initialBatch)
			? initialBatch.length
			: items.value.length;
		let stockCacheReady = false;
		let batchesSincePaginationRefresh = 0;
		const remainingCatalogEstimate =
			totalItemCount.value > bootstrapCount
				? totalItemCount.value - bootstrapCount
				: 0;

		try {
			if (reset) {
				await clearStoredItems(scope);
				if (Array.isArray(initialBatch) && initialBatch.length) {
					await saveItemsBulk(initialBatch, scope);
					if (containsStockQuantities(initialBatch)) {
						updateLocalStockCache(initialBatch);
						stockCacheReady = true;
					}
					await updateCachedPaginationFromStorage();
				}
			} else if (Array.isArray(initialBatch) && initialBatch.length) {
				if (containsStockQuantities(initialBatch)) {
					updateLocalStockCache(initialBatch);
					stockCacheReady = true;
				}
			}

			let loaded = items.value.length;
			let syncedCount = 0;
			let lastItemName = items.value.length
				? items.value[items.value.length - 1]?.item_name || null
				: null;

			const limit = resolvePageSize(BACKGROUND_SYNC_PAGE_SIZE);

			while (
				backgroundSyncState.value.token === token &&
				shouldPersistItems
			) {
				// Clone posProfile and disable caching for this specific request
				const requestProfile = JSON.parse(JSON.stringify(posProfile));
				if (reset) {
					requestProfile.posa_use_server_cache = 0;
					requestProfile.posa_force_reload_items = 1;
				}

				// @ts-ignore
				const response = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items",
					args: {
						pos_profile: JSON.stringify(requestProfile),
						price_list: activePriceList,
						item_group:
							normalizedGroup !== "ALL"
								? normalizedGroup.toLowerCase()
								: "",
						start_after: lastItemName,
						limit,
					},
				});

				if (backgroundSyncState.value.token !== token) {
					break;
				}

				const batch = Array.isArray(response.message)
					? response.message
					: [];
				if (batch.length === 0) {
					break;
				}

				primeItemDetailsCache(batch, posProfile, activePriceList);
				if (containsStockQuantities(batch)) {
					updateLocalStockCache(batch);
					stockCacheReady = true;
				}
				await saveItemsBulk(batch, scope);
				const remainingMemorySlots = Math.max(
					0,
					maxInMemoryItems - items.value.length,
				);
				if (remainingMemorySlots > 0) {
					const memoryBatch = batch.slice(0, remainingMemorySlots);
					if (memoryBatch.length) {
						setItems(memoryBatch, { append: true });
						appended.push(...memoryBatch);
					}
				}
				loaded += batch.length;
				syncedCount += batch.length;
				syncedItemsCount.value = syncedCount;
				lastItemName =
					batch[batch.length - 1]?.item_name || lastItemName;
				batchesSincePaginationRefresh += 1;

				if (remainingCatalogEstimate > 0) {
					loadProgress.value = Math.min(
						99,
						Math.round(
							(syncedCount / remainingCatalogEstimate) * 100,
						),
					);
				} else if (syncedCount > 0) {
					loadProgress.value = Math.min(
						99,
						Math.round((syncedCount / (syncedCount + limit)) * 100),
					);
				}

				const reachedEnd = batch.length < limit;
				if (
					reachedEnd ||
					batchesSincePaginationRefresh >=
						BACKGROUND_PAGINATION_REFRESH_BATCHES
				) {
					await updateCachedPaginationFromStorage();
					batchesSincePaginationRefresh = 0;
				}

				if (batch.length < limit) {
					break;
				}
			}

			if (backgroundSyncState.value.token === token) {
				loadProgress.value = 100;
				itemsLoaded.value = true;
				await updateCachedPaginationFromStorage();
				setItemsLastSync(new Date().toISOString());
				if (stockCacheReady) {
					setStockCacheReady(true);
				}
				const snapshotState: Record<string, unknown> = {
					itemsCount: loaded,
				};
				if (stockCacheReady) {
					snapshotState.stockCacheReady = true;
				}
				refreshBootstrapSnapshotFromCacheState(snapshotState);
			}

			return appended;
		} catch (error) {
			console.error("Background item sync failed:", error);
			return appended;
		} finally {
			if (backgroundSyncState.value.token === token) {
				backgroundSyncState.value.running = false;
				isBackgroundLoading.value = false;
			}
		}
	};

	return {
		isLoading,
		isBackgroundLoading,
		loadProgress,
		syncedItemsCount,
		requestToken,
		abortControllers,
		backgroundSyncState,
		itemGroups,
		loadItemGroups,
		persistItemsToStorage,
		primeItemDetailsCache,
		cancelBackgroundSync,
		refreshModifiedItems,
		backgroundSyncItems,
	};
}
