import { ref, reactive } from "vue";
import {
	getCachedItemDetails,
	saveItemDetailsCache,
	saveItemsBulk,
	updateLocalStockCache,
	saveItemUOMs,
	getItemUOMs,
	getLocalStock,
	getLocalStockCache,
	isStockCacheReady,
	initializeStockCache,
	isOffline,
} from "../../../../offline/index";
import { scheduleFrame } from "../../../utils/perf.js";

declare const frappe: any;

type ItemDetailRequestCache = {
	key: string | null;
	promise: Promise<any> | null;
	result: any[] | null;
};

/**
 * useItemDetailFetcher
 *
 * Managing fetching and updating of item details including:
 * - Fetching realtime stock/price from server
 * - Caching item details
 * - Handling offline fallbacks
 * - Background refreshing
 */
export function useItemDetailFetcher() {
	// State
	const itemDetailsRequestCache = reactive<ItemDetailRequestCache>({
		key: null,
		promise: null,
		result: null,
	});
	const itemDetailsRetryCount = ref(0);
	const itemDetailsRetryTimeout = ref<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const refreshInFlight = ref(false);
	const prePopulateInProgress = ref(false);
	const background_sync_details_in_flight = ref(false);
	const abortController = ref<AbortController | null>(null);

	// Context (Late Binding)
	const ctx: any = {
		pos_profile: null,
		active_price_list: null,
		items: [],
		displayedItems: [],
		itemAvailability: null,
		itemCurrencyUtils: null,
		usesLimitSearch: false,
		storageAvailable: true,
		markStorageUnavailable: null,
		applyCurrencyConversionToItem: null,
		forceUpdate: null,
	};

	function registerContext(context: any) {
		if (!context || typeof context !== "object") {
			return;
		}

		Object.defineProperties(
			ctx,
			Object.getOwnPropertyDescriptors(context),
		);
	}

	function getStorageScope() {
		const profileName = ctx.pos_profile?.name || "no_profile";
		const warehouse = ctx.pos_profile?.warehouse || "no_warehouse";
		return `${profileName}_${warehouse}`;
	}

	function buildItemDetailsRequestKey(
		items: any[],
		priceListOverride: string | null = null,
	) {
		const effectivePriceList =
			typeof priceListOverride === "string" &&
			priceListOverride.trim().length
				? priceListOverride.trim()
				: ctx.active_price_list || "";
		const itemCodes = Array.from(
			new Set(
				items
					.map((item) => item?.item_code)
					.filter(
						(code) =>
							code !== undefined && code !== null && code !== "",
					),
			),
		)
			.map((code) => String(code))
			.sort();

		return [
			ctx.pos_profile?.name || "",
			effectivePriceList,
			itemCodes.join(","),
		].join(":");
	}

	function cancelItemDetailsRequest() {
		if (abortController.value) {
			abortController.value.abort();
			abortController.value = null;
		}
		itemDetailsRequestCache.key = null;
		itemDetailsRequestCache.promise = null;
		itemDetailsRequestCache.result = null;
	}

	async function fetchItemDetails(
		items: any[],
		priceListOverride: string | null = null,
		options: { bypassRequestCache?: boolean } = {},
	) {
		const { bypassRequestCache = false } = options;
		if (!items || items.length === 0) {
			return [];
		}

		// Guard against calling server without a valid POS profile
		if (!ctx.pos_profile || !ctx.pos_profile.name) {
			return [];
		}

		const effectivePriceList =
			typeof priceListOverride === "string" &&
			priceListOverride.trim().length
				? priceListOverride.trim()
				: ctx.active_price_list || "";
		const key = buildItemDetailsRequestKey(items, effectivePriceList);

		if (
			!bypassRequestCache &&
			itemDetailsRequestCache.key === key &&
			itemDetailsRequestCache.result
		) {
			return itemDetailsRequestCache.result;
		}

		if (
			!bypassRequestCache &&
			itemDetailsRequestCache.key === key &&
			itemDetailsRequestCache.promise
		) {
			return itemDetailsRequestCache.promise;
		}

		cancelItemDetailsRequest();
		itemDetailsRequestCache.key = key;
		abortController.value = new AbortController();

		let timeoutId: ReturnType<typeof setTimeout>;
		const timeoutPromise = new Promise((_, reject) => {
			timeoutId = setTimeout(
				() => reject(new Error("Request timed out")),
				5000,
			);
		});

		const requestPromise = frappe.call({
			method: "posawesome.posawesome.api.items.get_items_details",
			args: {
				pos_profile: JSON.stringify(ctx.pos_profile),
				items_data: JSON.stringify(items),
				price_list: effectivePriceList,
			},
			freeze: false,
			signal: abortController.value.signal,
		});

		const wrappedRequestPromise = requestPromise
			.then((res) => {
				clearTimeout(timeoutId);
				return res;
			})
			.catch((err) => {
				clearTimeout(timeoutId);
				throw err;
			});

		itemDetailsRequestCache.promise = Promise.race([
			wrappedRequestPromise,
			timeoutPromise,
		]);

		try {
			const r = await itemDetailsRequestCache.promise;
			const msg = (r && r.message) || [];
			if (itemDetailsRequestCache.key === key) {
				itemDetailsRequestCache.result = msg;
			}
			return msg;
		} catch (err: any) {
			if (err?.message === "Request timed out") {
				if (abortController.value) {
					abortController.value.abort();
				}
				console.warn(
					"Item details fetch timed out, proceeding with local data.",
				);
				// Prevent unhandled rejection from the aborted request
				wrappedRequestPromise.catch(() => {});
			} else if (err?.name !== "AbortError") {
				console.error("Error fetching item details:", err);
			}
			throw err;
		} finally {
			if (itemDetailsRequestCache.key === key) {
				itemDetailsRequestCache.promise = null;
			}
			abortController.value = null;
		}
	}

	async function refreshPricesForVisibleItems() {
		if (!ctx.displayedItems || ctx.displayedItems.length === 0) return;
		if (refreshInFlight.value) return;

		refreshInFlight.value = true;

		try {
			const displayedItemMap = new Map<any, any>(
				ctx.displayedItems.map((it: any) => [it.item_code, it]),
			);
			const itemCodes = ctx.displayedItems.map((it) => it.item_code);
			const cacheResult = await getCachedItemDetails(
				ctx.pos_profile?.name,
				ctx.active_price_list,
				itemCodes,
			);
			const missingCodes = new Set(cacheResult?.missing || []);
			const updates: Array<{ item: any; upd: any }> = [];

			cacheResult.cached.forEach((det: any) => {
				const item = displayedItemMap.get(det.item_code);
				if (item) {
					const upd: any = { actual_qty: det.actual_qty };
					if (det.item_uoms && det.item_uoms.length > 0) {
						upd.item_uoms = det.item_uoms;
						saveItemUOMs(item.item_code, det.item_uoms);
					}
					if (det.rate !== undefined) {
						const force =
							ctx.pos_profile
								?.posa_force_price_from_customer_price_list !==
							false;
						const price = det.price_list_rate ?? det.rate ?? 0;
						if (force || price) {
							upd.rate = price;
							upd.price_list_rate = price;
							upd.original_rate = price;
						}
					}
					if (det.currency) {
						upd.currency = det.currency;
						upd.original_currency = det.currency;
					}
					updates.push({ item, upd });
				}
			});

			if (cacheResult.missing.length === 0) {
				updates.forEach(({ item, upd }) => Object.assign(item, upd));
				updateLocalStockCache(cacheResult.cached);
				return;
			}

			const itemsToFetch = ctx.displayedItems.filter((it) =>
				missingCodes.has(it.item_code),
			);

			const details = await fetchItemDetails(itemsToFetch);
			details.forEach((updItem: any) => {
				const item = displayedItemMap.get(updItem.item_code);
				if (item) {
					const upd: any = { actual_qty: updItem.actual_qty };
					if (updItem.item_uoms && updItem.item_uoms.length > 0) {
						upd.item_uoms = updItem.item_uoms;
						saveItemUOMs(item.item_code, updItem.item_uoms);
					}
					if (updItem.rate !== undefined) {
						const force =
							ctx.pos_profile
								?.posa_force_price_from_customer_price_list !==
							false;
						const price =
							updItem.price_list_rate ?? updItem.rate ?? 0;
						if (force || price) {
							upd.rate = price;
							upd.price_list_rate = price;
							upd.original_rate = price;
						}
					}
					if (updItem.currency) {
						upd.currency = updItem.currency;
						upd.original_currency = updItem.currency;
					}
					if (updItem.batch_no_data) {
						upd.batch_no_data = updItem.batch_no_data;
					}
					if (updItem.serial_no_data) {
						upd.serial_no_data = updItem.serial_no_data;
					}
					updates.push({ item, upd });
				}
			});

			updates.forEach(({ item, upd }) => Object.assign(item, upd));
			updateLocalStockCache(details);
			saveItemDetailsCache(
				ctx.pos_profile?.name,
				ctx.active_price_list,
				details,
			);

			if (
				ctx.pos_profile &&
				ctx.storageAvailable &&
				!ctx.usesLimitSearch
			) {
				try {
					await saveItemsBulk(details, getStorageScope());
				} catch (e: any) {
					console.error("Failed to persist item details", e);
					if (ctx.markStorageUnavailable)
						ctx.markStorageUnavailable();
				}
			}
		} catch (error: any) {
			console.error("Failed to refresh prices for visible items:", error);
		} finally {
			refreshInFlight.value = false;
		}
	}

	async function update_items_details(
		items: any[],
		options: { forceRefresh?: boolean; priceListOverride?: string | null } = {},
	) {
		const { forceRefresh = false, priceListOverride = null } = options;
		const effectivePriceList =
			typeof priceListOverride === "string" &&
			priceListOverride.trim().length
				? priceListOverride.trim()
				: ctx.active_price_list || "";

		if (!items || !items.length) return;

		// reset any pending retry timer
		if (itemDetailsRetryTimeout.value) {
			clearTimeout(itemDetailsRetryTimeout.value);
			itemDetailsRetryTimeout.value = null;
		}

		const itemCodes = items.map((it) => it.item_code);
		const affectedCodes = Array.from(
			new Set(
				itemCodes.filter((code) => code !== undefined && code !== null),
			),
		);
		const baseRecords = new Map<string, number>();
		const cacheResult = await getCachedItemDetails(
			ctx.pos_profile?.name,
			effectivePriceList,
			itemCodes,
			forceRefresh ? 0 : undefined,
		);
		const missingCodes = new Set(cacheResult?.missing || []);

		const itemMap = new Map<any, any>(
			items.map((it) => [it.item_code, it]),
		);

		cacheResult.cached.forEach((det: any) => {
			const item = itemMap.get(det.item_code);
			if (item) {
				Object.assign(item, {
					actual_qty: det.actual_qty,
					has_batch_no: det.has_batch_no,
					has_serial_no: det.has_serial_no,
				});
				if (det.item_uoms && det.item_uoms.length > 0) {
					item.item_uoms = det.item_uoms;
					saveItemUOMs(item.item_code, det.item_uoms);
				}
				if (det.rate !== undefined) {
					const force =
						ctx.pos_profile
							?.posa_force_price_from_customer_price_list !==
						false;
					const price = det.price_list_rate ?? det.rate ?? 0;
					if (force || price) {
						item.rate = price;
						item.price_list_rate = price;
						item.original_rate = price;
					}
				}
				if (det.currency) {
					item.currency = det.currency;
					item.original_currency = det.currency;
				}

				if (ctx.itemAvailability) {
					ctx.itemAvailability.captureBaseAvailability(
						item,
						det.actual_qty,
					);
				}
				if (det.actual_qty !== undefined && det.actual_qty !== null) {
					baseRecords.set(item.item_code, det.actual_qty);
				}
				if (!item.original_rate) {
					item.original_rate = item.rate;
					item.original_currency =
						item.currency || ctx.pos_profile?.currency;
				}

				if (ctx.itemAvailability) ctx.itemAvailability.indexItem(item);
				// Call applyCurrencyConversionToItem from context
				if (ctx.applyCurrencyConversionToItem)
					ctx.applyCurrencyConversionToItem(item);
			}
		});

		let allCached = cacheResult.missing.length === 0;
		items.forEach((item) => {
			const localQty = getLocalStock(item.item_code);
			if (localQty !== null) {
				item.actual_qty = localQty;
				if (ctx.itemAvailability)
					ctx.itemAvailability.captureBaseAvailability(
						item,
						localQty,
					);
				baseRecords.set(item.item_code, localQty);
			} else {
				allCached = false;
			}

			if (!item.item_uoms || item.item_uoms.length === 0) {
				const cachedUoms = getItemUOMs(item.item_code);
				if (cachedUoms.length > 0) {
					item.item_uoms = cachedUoms;
				} else if (isOffline()) {
					item.item_uoms = [
						{ uom: item.stock_uom, conversion_factor: 1.0 },
					];
				} else {
					allCached = false;
				}
			}
		});

		if (
			ctx.itemAvailability &&
			ctx.itemAvailability.updateBaseQuantities &&
			baseRecords.size > 0
		) {
			const baseEntries = Array.from(baseRecords.entries()).map(
				([code, qty]) => ({
					item_code: code,
					actual_qty: qty,
				}),
			);
			ctx.itemAvailability.updateBaseQuantities(baseEntries, {
				source: "items-selector",
			});
			baseRecords.clear();
		}

		if (isOffline() || allCached) {
			itemDetailsRetryCount.value = 0;
			if (ctx.itemAvailability)
				ctx.itemAvailability.recomputeAvailabilityForCodes(
					affectedCodes,
				);
			return;
		}

		const itemsToFetch = items.filter(
			(it) => missingCodes.has(it.item_code) && !it.has_variants,
		);

		if (itemsToFetch.length === 0) {
			itemDetailsRetryCount.value = 0;
			if (ctx.itemAvailability)
				ctx.itemAvailability.recomputeAvailabilityForCodes(
					affectedCodes,
				);
			return;
		}

		try {
			const details = await fetchItemDetails(
				itemsToFetch,
				effectivePriceList,
				{ bypassRequestCache: forceRefresh },
			);
			if (details && details.length) {
				itemDetailsRetryCount.value = 0;
				let qtyChanged = false;
				let updatedItems: Array<{ item: any; updates: any }> = [];
				const detailMap = new Map<any, any>(
					details.map((detail: any) => [detail.item_code, detail]),
				);

				items.forEach((item) => {
					const updated_item = detailMap.get(item.item_code);
					if (updated_item) {
						const prev_qty = item.actual_qty;

						updatedItems.push({
							item: item,
							updates: {
								actual_qty: updated_item.actual_qty,
								has_batch_no: updated_item.has_batch_no,
								has_serial_no: updated_item.has_serial_no,
								batch_no_data: Array.isArray(
									updated_item.batch_no_data,
								)
									? updated_item.batch_no_data
									: item.batch_no_data,
								serial_no_data: Array.isArray(
									updated_item.serial_no_data,
								)
									? updated_item.serial_no_data
									: item.serial_no_data,
								item_uoms:
									updated_item.item_uoms &&
									updated_item.item_uoms.length > 0
										? updated_item.item_uoms
										: item.item_uoms,
								rate:
									updated_item.rate !== undefined
										? updated_item.rate
										: item.rate,
								price_list_rate:
									updated_item.price_list_rate !== undefined
										? updated_item.price_list_rate
										: item.price_list_rate,
								original_rate:
									updated_item.price_list_rate !== undefined
										? updated_item.price_list_rate
										: updated_item.rate !== undefined
											? updated_item.rate
											: item.original_rate,
								currency:
									updated_item.currency || item.currency,
								original_currency:
									updated_item.currency ||
									item.original_currency ||
									item.currency,
							},
						});

						if (prev_qty > 0 && updated_item.actual_qty === 0) {
							qtyChanged = true;
						}

						if (
							updated_item.item_uoms &&
							updated_item.item_uoms.length > 0
						) {
							saveItemUOMs(
								item.item_code,
								updated_item.item_uoms,
							);
						}
					}
				});

				updatedItems.forEach(({ item, updates }) => {
					Object.assign(item, updates);
					if (ctx.itemAvailability)
						ctx.itemAvailability.captureBaseAvailability(
							item,
							updates.actual_qty,
						);
					if (
						updates.actual_qty !== undefined &&
						updates.actual_qty !== null
					) {
						baseRecords.set(item.item_code, updates.actual_qty);
					}
					if (ctx.itemAvailability)
						ctx.itemAvailability.indexItem(item);
					if (ctx.applyCurrencyConversionToItem)
						ctx.applyCurrencyConversionToItem(item);
				});

				// Flush base records again after fetch
				if (
					ctx.itemAvailability &&
					ctx.itemAvailability.updateBaseQuantities &&
					baseRecords.size > 0
				) {
					const baseEntries = Array.from(baseRecords.entries()).map(
						([code, qty]) => ({
							item_code: code,
							actual_qty: qty,
						}),
					);
					ctx.itemAvailability.updateBaseQuantities(baseEntries, {
						source: "items-selector",
					});
					baseRecords.clear();
				}

				updateLocalStockCache(details);
				saveItemDetailsCache(
					ctx.pos_profile?.name,
					effectivePriceList,
					details,
				);

				if (
					ctx.pos_profile &&
					ctx.storageAvailable &&
					!ctx.usesLimitSearch
				) {
					try {
						await saveItemsBulk(details, getStorageScope());
					} catch (e) {
						console.error("Failed to persist item details", e);
						if (ctx.markStorageUnavailable)
							ctx.markStorageUnavailable();
					}
				}

				if (qtyChanged && ctx.forceUpdate) {
					ctx.forceUpdate();
				}
			}
		} catch (err: any) {
			const isTimeout = err?.message === "Request timed out";
			if (err?.name !== "AbortError") {
				console.error("Error fetching item details:", err);
				items.forEach((item) => {
					const localQty = getLocalStock(item.item_code);
					if (localQty !== null) {
						item.actual_qty = localQty;
						if (ctx.itemAvailability)
							ctx.itemAvailability.captureBaseAvailability(
								item,
								localQty,
							);
						baseRecords.set(item.item_code, localQty);
					}
					if (!item.item_uoms || item.item_uoms.length === 0) {
						const cached = getItemUOMs(item.item_code);
						if (cached.length > 0) {
							item.item_uoms = cached;
						}
					}
				});
				if (
					ctx.itemAvailability &&
					ctx.itemAvailability.updateBaseQuantities &&
					baseRecords.size > 0
				) {
					const baseEntries = Array.from(baseRecords.entries()).map(
						([code, qty]) => ({
							item_code: code,
							actual_qty: qty,
						}),
					);
					ctx.itemAvailability.updateBaseQuantities(baseEntries, {
						source: "items-selector",
					});
					baseRecords.clear();
				}

				if (!isOffline() && !isTimeout) {
					itemDetailsRetryCount.value += 1;
					const delay = Math.min(
						32000,
						1000 * Math.pow(2, itemDetailsRetryCount.value - 1),
					);
					itemDetailsRetryTimeout.value = setTimeout(() => {
						update_items_details(items);
					}, delay);
				}
			}
		}

		if (ctx.itemAvailability)
			ctx.itemAvailability.recomputeAvailabilityForCodes(affectedCodes);
	}

	function update_cur_items_details() {
		if (ctx.displayedItems && ctx.displayedItems.length > 0) {
			update_items_details(ctx.displayedItems);
		}
	}

	async function prePopulateStockCache(items) {
		if (prePopulateInProgress.value) return;
		if (!Array.isArray(items) || items.length === 0) return;

		prePopulateInProgress.value = true;
		try {
			const cache = getLocalStockCache();
			const cacheSize = Object.keys(cache).length;
			if (isStockCacheReady() && cacheSize >= items.length) {
				console.debug("Stock cache already initialized");
				return;
			}
			if (items.length > 500) {
				console.info(
					"Pre-populating stock cache for",
					items.length,
					"items in batches",
				);
			} else {
				console.info(
					"Pre-populating stock cache for",
					items.length,
					"items",
				);
			}
			await initializeStockCache(items, ctx.pos_profile);
		} catch (error: any) {
			console.error("Failed to pre-populate stock cache:", error);
		} finally {
			prePopulateInProgress.value = false;
		}
	}

	async function refreshAllItemDetailsInBatches(
		batchSize = 100,
		options: { priceListOverride?: string | null } = {},
	) {
		if (background_sync_details_in_flight.value) return;
		if (!Array.isArray(ctx.items) || ctx.items.length === 0) return;

		background_sync_details_in_flight.value = true;
		try {
			for (let start = 0; start < ctx.items.length; start += batchSize) {
				const chunk = ctx.items.slice(start, start + batchSize);
				if (chunk.length === 0) break;

				await update_items_details(chunk, {
					forceRefresh: true,
					priceListOverride: options.priceListOverride,
				});
				await scheduleFrame();
			}
		} catch (error: any) {
			console.error(
				"Failed to refresh all item details in background",
				error,
			);
		} finally {
			background_sync_details_in_flight.value = false;
		}
	}

	return {
		itemDetailsRetryCount,
		refreshInFlight,
		registerContext,
		fetchItemDetails,
		update_items_details,
		refreshPricesForVisibleItems,
		update_cur_items_details,
		prePopulateStockCache,
		refreshAllItemDetailsInBatches,
		cancelItemDetailsRequest,
	};
}
