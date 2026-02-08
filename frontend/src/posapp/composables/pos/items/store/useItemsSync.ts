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
} from "../../../../../offline/index";

export interface BackgroundSyncState {
	running: boolean;
	token: number;
}

export function useItemsSync() {
	const isLoading = ref(false);
	const isBackgroundLoading = ref(false);
	const loadProgress = ref(0);
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
			} else {
				// Fallback to API
				const response = await itemService.getItemGroups();

				if (response) {
					const groups = ["ALL"];
					response.forEach((element) => {
						groups.push(element.name);
					});
					itemGroups.value = groups;
				}
			}
		} catch (error) {
			console.error("Failed to load item groups:", error);
		}
	};

	const persistItemsToStorage = async (
		itemsBatch: Item[],
		shouldPersist: boolean,
		replaceExisting: boolean,
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
				await clearStoredItems();
			}

			await saveItemsBulk(itemsBatch);
			await updateCachedPaginationCallback();
		} catch (error) {
			console.error("Failed to persist items batch:", error);
		}
	};

	const backgroundLoadItemDetails = async (
		itemList: Item[],
		posProfile: POSProfile | null,
		activePriceList: string,
		getItemByCode: (_code: string) => Item | undefined,
	) => {
		if (!itemList || itemList.length === 0) return;

		try {
			// Process in batches to avoid overwhelming the server
			const batchSize = 20;
			for (let i = 0; i < itemList.length; i += batchSize) {
				const batch = itemList.slice(i, i + batchSize);

				// Add small delay between batches
				if (i > 0) {
					await new Promise((resolve) => setTimeout(resolve, 200));
				}

				await loadItemDetailsBatch(
					batch,
					posProfile,
					activePriceList,
					getItemByCode,
				);
			}
		} catch (error) {
			console.error("Background item details loading failed:", error);
		}
	};

	const loadItemDetailsBatch = async (
		itemBatch: Item[],
		posProfile: POSProfile | null,
		activePriceList: string,
		getItemByCode: (_code: string) => Item | undefined,
	) => {
		try {
			if (!posProfile) return;
			// @ts-ignore
			const response = await frappe.call({
				method: "posawesome.posawesome.api.items.get_items_details",
				args: {
					pos_profile: JSON.stringify(posProfile),
					items_data: JSON.stringify(itemBatch),
					price_list: activePriceList,
				},
			});

			const details = response.message || [];

			// Update items with details
			details.forEach((detail: any) => {
				const item = getItemByCode(detail.item_code);
				if (item) {
					Object.assign(item, detail);
				}
			});

			// Cache the details
			saveItemDetailsCache(posProfile.name, activePriceList, details);
		} catch (error) {
			console.error("Failed to load item details batch:", error);
		}
	};

	const cancelBackgroundSync = () => {
		backgroundSyncState.value.token += 1;
		backgroundSyncState.value.running = false;
		isBackgroundLoading.value = false;
	};

	const refreshModifiedItems = async (
		posProfile: POSProfile | null,
		activePriceList: string,
		customer: string | null,
		updateItemsInPlace: (_items: Item[]) => void,
		itemsMap: Map<string, Item>,
	) => {
		const lastSync = getItemsLastSync();
		if (!lastSync) return { size: 0, count: 0, items: [] };

		try {
			const args: any = {
				pos_profile: JSON.stringify(posProfile),
				price_list: activePriceList,
				item_group: "",
				search_value: "",
				customer: customer,
				include_image: 0,
				item_groups:
					posProfile?.item_groups?.map((g: any) => g.item_group) ||
					[],
				modified_after: lastSync,
				limit: 500,
			};

			const fetchedItems = (await itemService.getItems(args)) || [];
			const size = JSON.stringify(fetchedItems).length;
			let resolvedItems: Item[] = [];

			if (fetchedItems.length > 0) {
				updateItemsInPlace(fetchedItems);
				await saveItemsBulk(fetchedItems);
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

		const appended: Item[] = [];
		const DEFAULT_PAGE_SIZE = 200;

		try {
			if (reset) {
				await clearStoredItems();
				if (Array.isArray(initialBatch) && initialBatch.length) {
					await saveItemsBulk(initialBatch);
					await updateCachedPaginationFromStorage();
				}
			}

			let loaded = items.value.length;
			let lastItemName = items.value.length
				? items.value[items.value.length - 1]?.item_name || null
				: null;

			const limit = resolvePageSize(DEFAULT_PAGE_SIZE);

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

				await saveItemsBulk(batch);
				setItems(batch, { append: true });
				appended.push(...batch);
				loaded += batch.length;
				lastItemName =
					batch[batch.length - 1]?.item_name || lastItemName;

				await updateCachedPaginationFromStorage();

				if (totalItemCount.value > 0) {
					loadProgress.value = Math.min(
						99,
						Math.round((loaded / totalItemCount.value) * 100),
					);
				} else if (loaded > 0) {
					loadProgress.value = Math.min(
						99,
						Math.round((loaded / (loaded + limit)) * 100),
					);
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
		requestToken,
		abortControllers,
		backgroundSyncState,
		itemGroups,
		loadItemGroups,
		persistItemsToStorage,
		backgroundLoadItemDetails,
		cancelBackgroundSync,
		refreshModifiedItems,
		backgroundSyncItems,
	};
}
