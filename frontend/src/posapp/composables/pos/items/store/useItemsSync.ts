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
const BACKGROUND_SYNC_PAGE_SIZE = 200;
const BACKGROUND_SYNC_CONCURRENCY = 5;
const BACKGROUND_PAGINATION_REFRESH_BATCHES = 5;
const BACKGROUND_PROGRESS_YIELD_INTERVAL = 10;

const yieldToBrowser = () =>
	new Promise<void>((resolve) => {
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(() => resolve());
			return;
		}
		setTimeout(resolve, 0);
	});

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
		let paginationNeedsRefresh = false;
		let remainingCatalogTotal = 0;
		const limit = resolvePageSize(BACKGROUND_SYNC_PAGE_SIZE);
		const updateLiveProgress = (count: number) => {
			syncedItemsCount.value = count;
			if (remainingCatalogTotal > 0) {
				loadProgress.value = Math.min(
					99,
					Math.round((count / remainingCatalogTotal) * 100),
				);
				return;
			}
			if (count > 0) {
				loadProgress.value = Math.min(
					99,
					Math.round((count / (count + limit)) * 100),
				);
			}
		};
		const publishBatchProgress = async (
			previousCount: number,
			batchSize: number,
		) => {
			for (let index = 1; index <= batchSize; index += 1) {
				if (backgroundSyncState.value.token !== token) {
					return previousCount + index - 1;
				}
				const nextCount = previousCount + index;
				updateLiveProgress(nextCount);
				if (
					index % BACKGROUND_PROGRESS_YIELD_INTERVAL === 0 ||
					index === batchSize
				) {
					await yieldToBrowser();
				}
			}
			return previousCount + batchSize;
		};
		const fetchPageWave = async (waveOffset: number) => {
			const offsets = Array.from(
				{ length: BACKGROUND_SYNC_CONCURRENCY },
				(_, index) => waveOffset + index * limit,
			);

			return await Promise.all(
				offsets.map(async (offset) => {
					// Clone the profile per request because reset flags are request-specific.
					const requestProfile = JSON.parse(
						JSON.stringify(posProfile),
					);
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
							offset,
							limit,
						},
						freeze: false,
					});

					return {
						offset,
						batch: Array.isArray(response?.message)
							? response.message
							: [],
					};
				}),
			);
		};
		const fetchServerCatalogTotal = async () => {
			try {
				const countArgs: {
					pos_profile: string;
					item_groups?: string[];
				} = {
					pos_profile: JSON.stringify(posProfile),
				};
				if (normalizedGroup !== "ALL") {
					countArgs.item_groups = [normalizedGroup];
				}
				const serverCatalogTotal =
					await itemService.getItemsCountData(countArgs);
				return Number.isFinite(serverCatalogTotal) &&
					serverCatalogTotal > 0
					? serverCatalogTotal
					: 0;
			} catch (error) {
				console.warn(
					"Failed to load item count for background sync:",
					error,
				);
				return 0;
			}
		};
		const preparePageWave = async (
			pageResults: Array<{ offset: number; batch: Item[] }>,
		) => {
			let reachedEnd = false;
			const completedBatches: Item[][] = [];
			for (const { batch } of pageResults) {
				if (batch.length > 0) {
					completedBatches.push(batch);
				}
				reachedEnd = batch.length < limit;
				if (reachedEnd) {
					break;
				}
			}

			const waveItems = completedBatches.flat();
			if (waveItems.length > 0) {
				primeItemDetailsCache(
					waveItems,
					posProfile,
					activePriceList,
				);
				if (containsStockQuantities(waveItems)) {
					updateLocalStockCache(waveItems);
					stockCacheReady = true;
				}
				await saveItemsBulk(waveItems, scope);
				paginationNeedsRefresh = true;
			}

			return {
				reachedEnd,
				completedBatchCount: completedBatches.length,
				waveItems,
			};
		};

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
			let nextOffset = reset
				? bootstrapCount
				: Math.max(bootstrapCount, items.value.length);
			const [serverCatalogTotal, firstPageResults] = await Promise.all([
				fetchServerCatalogTotal(),
				fetchPageWave(nextOffset),
			]);
			if (serverCatalogTotal > 0) {
				totalItemCount.value = serverCatalogTotal;
				remainingCatalogTotal = Math.max(
					0,
					serverCatalogTotal - nextOffset,
				);
			} else {
				remainingCatalogTotal =
					totalItemCount.value > nextOffset
						? totalItemCount.value - nextOffset
						: 0;
			}

			let pendingPreparedWave = preparePageWave(firstPageResults);

			while (
				backgroundSyncState.value.token === token &&
				shouldPersistItems
			) {
				const {
					reachedEnd,
					completedBatchCount,
					waveItems,
				} = await pendingPreparedWave;

				if (backgroundSyncState.value.token !== token) {
					break;
				}

				const nextWaveOffset =
					nextOffset + BACKGROUND_SYNC_CONCURRENCY * limit;
				const nextPageResults = !reachedEnd
					? fetchPageWave(nextWaveOffset)
					: null;

				if (waveItems.length > 0) {
					setItems(waveItems, { append: true });
					appended.push(...waveItems);
					loaded += waveItems.length;
					batchesSincePaginationRefresh += completedBatchCount;

					const shouldRefreshPagination =
						reachedEnd ||
						batchesSincePaginationRefresh >=
							BACKGROUND_PAGINATION_REFRESH_BATCHES;
					const paginationRefresh = shouldRefreshPagination
						? updateCachedPaginationFromStorage()
						: Promise.resolve();
					const nextPreparedWave = nextPageResults
						? nextPageResults.then(preparePageWave)
						: null;
					[syncedCount] = await Promise.all([
						publishBatchProgress(
							syncedCount,
							waveItems.length,
						),
						paginationRefresh,
					]);
					if (shouldRefreshPagination) {
						batchesSincePaginationRefresh = 0;
						paginationNeedsRefresh = false;
					}
					if (nextPreparedWave) {
						pendingPreparedWave = nextPreparedWave;
					}
				}

				if (
					reachedEnd ||
					backgroundSyncState.value.token !== token
				) {
					break;
				}

				nextOffset = nextWaveOffset;
			}

			if (backgroundSyncState.value.token === token) {
				loadProgress.value = 100;
				itemsLoaded.value = true;
				if (paginationNeedsRefresh) {
					await updateCachedPaginationFromStorage();
				}
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
