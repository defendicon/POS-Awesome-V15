import { ref, onUnmounted } from "vue";
import {
	getItemsLastSync,
	setItemsLastSync,
	isOffline,
} from "../../../../offline/index";
import {
	normalizeBackgroundSyncInterval,
	shouldRunBackgroundSync,
} from "../../../utils/backgroundSync.js";

/**
 * useItemSync Composable
 *
 * Manages background synchronization and incremental loading of items.
 */
export function useItemSync() {
	type SyncItem = { [key: string]: unknown };
	type ItemDetailFetcher = {
		update_items_details: (
			_items: SyncItem[],
			_options?: {
				forceRefresh?: boolean;
				priceListOverride?: string | null;
			},
		) => Promise<void>;
	};
	type EventBus = { emit: (_event: string, _payload?: unknown) => void };
	type ItemSyncContext = {
		pos_profile: unknown;
		enable_background_sync: boolean;
		background_sync_interval: number;
		usesLimitSearch: boolean;
		itemsPageLimit: number;
		refreshModifiedItems:
			| null
			| ((
					_priceListOverride?: string | null,
			  ) => Promise<{ items?: SyncItem[] }>);
		backgroundSyncItems: null | ((_args?: unknown) => unknown);
		get_items: null | ((_force?: boolean) => Promise<unknown>);
		search_onchange:
			| null
			| ((_value?: string, _fromScanner?: boolean) => Promise<unknown>);
		itemDetailFetcher: ItemDetailFetcher | null;
		eventBus: EventBus | null;
		fetchServerItemsTimestamp: null | (() => Promise<string | null>);
		getBackgroundSyncPriceList: null | (() => string | null);
		getItems: () => SyncItem[];
		getDisplayedItems: () => SyncItem[];
		onBackgroundLoadFinished?: () => void;
	};

	// State
	const background_sync_timer = ref<ReturnType<typeof setInterval> | null>(
		null,
	);
	const background_sync_in_flight = ref(false);
	const isBackgroundLoading = ref(false);
	const last_background_sync_time = ref<string | null>(null);
	const BG_SYNC_LOG = "[POSA][BackgroundSync]";

	// Context (Late Binding)
	const ctx: ItemSyncContext = {
		pos_profile: null,
		enable_background_sync: true,
		background_sync_interval: 30,
		usesLimitSearch: false,
		itemsPageLimit: 100,
		// Methods to be provided via context
		refreshModifiedItems: null,
		backgroundSyncItems: null,
		get_items: null,
		search_onchange: null,
		itemDetailFetcher: null,
		eventBus: null,
		fetchServerItemsTimestamp: null,
		getBackgroundSyncPriceList: null,
		// Data references
		getItems: () => [],
		getDisplayedItems: () => [],
	};

	function registerContext(context: Partial<ItemSyncContext>) {
		if (!context || typeof context !== "object") {
			return;
		}

		Object.defineProperties(
			ctx,
			Object.getOwnPropertyDescriptors(context),
		);
	}

	function startBackgroundSyncScheduler() {
		stopBackgroundSyncScheduler();
		console.debug(`${BG_SYNC_LOG} scheduler start requested`, {
			enabled: ctx.enable_background_sync,
			intervalSeconds: normalizeBackgroundSyncInterval(
				ctx.background_sync_interval,
			),
		});
		// Always hydrate last sync from local cache so UI can show it
		// even before the next network sync cycle runs.
		ensureBackgroundSyncBaseline().catch((error) => {
			console.warn("Failed to load background sync baseline", error);
		});

		if (!ctx.enable_background_sync) {
			return;
		}

		const intervalMs =
			normalizeBackgroundSyncInterval(ctx.background_sync_interval) *
			1000;
		background_sync_timer.value = setInterval(() => {
			performBackgroundSync({ source: "interval" });
		}, intervalMs);
		console.debug(`${BG_SYNC_LOG} scheduler active`, { intervalMs });

		performBackgroundSync({ source: "initial" });
	}

	function stopBackgroundSyncScheduler() {
		if (background_sync_timer.value) {
			clearInterval(background_sync_timer.value);
			background_sync_timer.value = null;
			console.debug(`${BG_SYNC_LOG} scheduler stopped`);
		}
	}

	async function ensureBackgroundSyncBaseline() {
		const lastSync = getItemsLastSync();
		if (lastSync) {
			last_background_sync_time.value = lastSync;
			console.debug(`${BG_SYNC_LOG} baseline loaded from local cache`, {
				lastSync,
			});
			return lastSync;
		}

		if (ctx.fetchServerItemsTimestamp) {
			const serverTimestamp = await ctx.fetchServerItemsTimestamp();
			if (serverTimestamp) {
				setItemsLastSync(serverTimestamp);
				last_background_sync_time.value = serverTimestamp;
				console.debug(`${BG_SYNC_LOG} baseline fetched from server`, {
					serverTimestamp,
				});
				return serverTimestamp;
			}
		}

		console.debug(`${BG_SYNC_LOG} baseline unavailable`);
		return null;
	}

	async function performBackgroundSync({
		source = "manual",
	}: { source?: string } = {}) {
		const skipReasons: string[] = [];
		if (!ctx.pos_profile || !(ctx.pos_profile as any)?.name) {
			skipReasons.push("missing_pos_profile");
		}
		if (!ctx.enable_background_sync) {
			skipReasons.push("disabled");
		}
		if (background_sync_in_flight.value) {
			skipReasons.push("in_flight");
		}
		if (isOffline()) {
			skipReasons.push("offline");
		}
		if (ctx.usesLimitSearch) {
			skipReasons.push("limit_search_enabled");
		}

		if (
			!shouldRunBackgroundSync({
				posProfile: ctx.pos_profile,
				enableBackgroundSync: ctx.enable_background_sync,
				backgroundSyncInFlight: background_sync_in_flight.value,
				isOffline: isOffline(),
				usesLimitSearch: ctx.usesLimitSearch,
			})
		) {
			console.debug(`${BG_SYNC_LOG} skipped`, { source, skipReasons });
			return;
		}

		background_sync_in_flight.value = true;
		const startedAt = Date.now();
		let modifiedCount = 0;
		try {
			console.info(`${BG_SYNC_LOG} started`, { source });
			await ensureBackgroundSyncBaseline();
			const syncCursorBefore = getItemsLastSync();
			const backgroundPriceList =
				typeof ctx.getBackgroundSyncPriceList === "function"
					? ctx.getBackgroundSyncPriceList()
					: null;

			if (ctx.refreshModifiedItems) {
				const { items: updatedItems } =
					await ctx.refreshModifiedItems(backgroundPriceList);
				modifiedCount = Array.isArray(updatedItems)
					? updatedItems.length
					: 0;
				console.info(`${BG_SYNC_LOG} modified items fetched`, {
					source,
					modifiedCount,
				});

				if (updatedItems && updatedItems.length) {
					if (ctx.itemDetailFetcher) {
						await ctx.itemDetailFetcher.update_items_details(
							updatedItems,
							{
								forceRefresh: true,
								priceListOverride: backgroundPriceList,
							},
						);
					}
					if (ctx.eventBus) {
						ctx.eventBus.emit("set_all_items", ctx.getItems());
					}
				}
			}

			// Delta-only background sync: avoid full catalog refresh.
			// Detailed refresh is applied only to changed items above.

			const completedAt = new Date().toISOString();
			let deltaCursor = getItemsLastSync();
			if (!deltaCursor || deltaCursor === syncCursorBefore) {
				let serverTimestamp: string | null = null;
				if (ctx.fetchServerItemsTimestamp) {
					serverTimestamp = await ctx.fetchServerItemsTimestamp();
				}
				deltaCursor = serverTimestamp || completedAt;
				setItemsLastSync(deltaCursor);
			}
			last_background_sync_time.value = completedAt;
			console.info(`${BG_SYNC_LOG} completed`, {
				source,
				modifiedCount,
				durationMs: Date.now() - startedAt,
				syncedAt: completedAt,
				deltaCursor,
			});
		} catch (error) {
			console.error(`${BG_SYNC_LOG} failed`, { source, error });
		} finally {
			background_sync_in_flight.value = false;
		}
	}

	function kickoffBackgroundSync(): Promise<SyncItem[]> {
		if (isBackgroundLoading.value || ctx.usesLimitSearch) {
			return Promise.resolve([]);
		}

		isBackgroundLoading.value = true;

		if (!ctx.backgroundSyncItems) {
			isBackgroundLoading.value = false;
			return Promise.resolve([]);
		}

		return Promise.resolve(ctx.backgroundSyncItems())
			.then((appended) => {
				if (Array.isArray(appended) && appended.length) {
					if (ctx.eventBus) {
						ctx.eventBus.emit("set_all_items", ctx.getItems());
					}
				}
				return Array.isArray(appended) ? appended : [];
			})
			.finally(() => {
				finishBackgroundLoad();
			});
	}

	function finishBackgroundLoad() {
		isBackgroundLoading.value = false;

		// Note: pendingItemSearch handling might still be needed in the component
		// if it needs to re-trigger search after background load.
		// We can expose a way to tell the component to re-check pending state.

		if (ctx.onBackgroundLoadFinished) {
			ctx.onBackgroundLoadFinished();
		}
	}

	onUnmounted(() => {
		stopBackgroundSyncScheduler();
	});

	return {
		// State
		background_sync_in_flight,
		isBackgroundLoading,
		last_background_sync_time,

		// Methods
		registerContext,
		startBackgroundSyncScheduler,
		stopBackgroundSyncScheduler,
		performBackgroundSync,
		ensureBackgroundSyncBaseline,
		kickoffBackgroundSync,
		finishBackgroundLoad,
	};
}
