<template>
	<div :style="responsiveStyles">
		<ScanErrorDialog
			v-model="scanErrorDialog"
			:message="scanErrorMessage"
			:code="scanErrorCode"
			:details="scanErrorDetails"
			@acknowledge="acknowledgeScanError"
		/>
		<v-card
			:class="[
				'selection mx-auto my-0 py-0 mt-3 pos-card dynamic-card resizable pos-themed-card',
				rtlClasses,
			]"
			:style="{
				height: responsiveStyles['--container-height'],
				maxHeight: responsiveStyles['--container-height'],
				resize: 'vertical',
				overflow: 'auto',
				position: 'relative',
			}"
		>
			<v-progress-linear
				:active="isLoadingOrSyncing"
				:indeterminate="isLoadingOrSyncing"
				absolute
				location="top"
				color="info"
			></v-progress-linear>

			<!-- Add dynamic-padding wrapper like Invoice component -->
			<div class="dynamic-padding">
				<ItemHeader
					v-model:search-input="search_input"
					v-model:qty-input="debounce_qty"
					v-model:new-line="new_line"
					:pos-profile="pos_profile"
					:scanner-locked="scannerLocked"
					:enable-background-sync="enable_background_sync"
					:last-sync-time="formatBackgroundSyncTime()"
					:context="context"
					@esc="esc_event"
					@enter="onEnter"
					@search-keydown="handleSearchKeydown"
					@clear-search="clearSearch"
					@search-input="handleSearchInput"
					@search-paste="handleSearchPaste"
					@focus="handleItemSearchFocus"
					@clear-qty="clearQty"
					@start-camera="startCameraScanning"
					@open-new-item="openNewItemDialog"
					@toggle-settings="toggleItemSettings"
					@reload-items="forceReloadItems"
					ref="itemHeader"
				/>

				<ItemSettingsDialog
					v-model="show_item_settings"
					:initial-settings="{
						hide_qty_decimals,
						hide_zero_rate_items,
						show_last_invoice_rate,
						enable_background_sync,
						background_sync_interval,
						enable_custom_items_per_page,
						items_per_page,
						force_server_items: temp_force_server_items,
					}"
					@save="applyItemSettings"
				/>

				<v-row class="items">
					<v-col cols="12" class="pt-0 mt-0">
						<ItemsSelectorCards
							v-if="items_view === 'card'"
							ref="itemsContainer"
							:displayed-items="displayedItems"
							:is-loading="isLoadingOrSyncing"
							:search-input="search_input"
							:item-group="item_group"
							:is-overflowing="isOverflowing"
							:card-slot-height="cardSlotHeight"
							:card-columns="cardColumns"
							:card-slot-width="cardSlotWidth"
							:card-column-width="cardColumnWidth"
							:card-row-height="cardRowHeight"
							:virtual-scroll-buffer="virtualScrollBuffer"
							:pos-profile="pos_profile"
							:context="context"
							:selected-currency="selected_currency"
							:hide-qty-decimals="hide_qty_decimals"
							:get-last-invoice-rate="getLastInvoiceRate"
							:is-item-highlighted="isItemHighlighted"
							:currency-symbol="currencySymbol"
							:format-currency="memoizedFormatCurrency"
							:format-number="memoizedFormatNumber"
							:rate-precision="ratePrecision"
							:is-negative="isNegative"
							:no-items-title="__('No items found')"
							:no-items-subtitle="__('Try adjusting your search or filters')"
							:clear-search-label="__('Clear Search')"
							@select-item="select_item"
							@dragstart="onDragStart"
							@dragend="onDragEnd"
							@virtual-range-update="onVirtualRangeUpdate"
							@clear-search="clearSearch"
						/>
						<ItemsSelectorTable
							v-else
							ref="itemsTable"
							:headers="headers"
							:displayed-items="displayedItems"
							:header-props="headerProps"
							:context="context"
							:pos-profile="pos_profile"
							:selected-currency="selected_currency"
							:hide-qty-decimals="hide_qty_decimals"
							:currency-symbol="currencySymbol"
							:format-currency="memoizedFormatCurrency"
							:format-number="memoizedFormatNumber"
							:rate-precision="ratePrecision"
							:get-last-invoice-rate="getLastInvoiceRate"
							:is-negative="isNegative"
							:item-class="getItemRowClass"
							:row-props="getItemRowProps"
							:no-data-text="__('No items found')"
							@row-click="click_item_row"
							@list-scroll="onListScroll"
						/>
					</v-col>
				</v-row>
			</div>
		</v-card>
		<ItemActionToolbar
			v-model="item_group"
			:items-group="items_group"
			v-model:items-view="items_view"
			:pos-profile="pos_profile"
			:active-price-list="active_price_list"
			:offers-count="offersCount"
			:coupons-count="couponsCount"
			@open-offers="uiStore.setActiveView('offers')"
			@open-coupons="uiStore.setActiveView('coupons')"
		/>

		<!-- New Item Dialog -->
		<NewItemDialog v-model="newItemDialog" :items-group="items_group" @item-created="handleItemCreated" />

		<!-- Camera Scanner Component -->
		<CameraScanner
			v-if="pos_profile.posa_enable_camera_scanning"
			ref="cameraScanner"
			:scan-type="pos_profile.posa_camera_scan_type || 'Both'"
			@barcode-scanned="onBarcodeScanned"
			@scanner-opened="onScannerOpened"
			@scanner-closed="onScannerClosed"
		/>
	</div>
</template>

<script type="module">
/* eslint-disable no-unused-vars */
/* global frappe, __, setLocalStockCache, flt, onScan, get_currency_symbol, current_items, wordCount */
import format from "../../format";
import _ from "lodash";
import CameraScanner from "./CameraScanner.vue";
import { ensurePosProfile } from "../../../utils/pos_profile.js";
import ItemActionToolbar from "./ItemActionToolbar.vue";
import ItemSettingsDialog from "./ItemSettingsDialog.vue";
import ItemHeader from "./ItemHeader.vue";
import ItemsSelectorCards from "./ItemsSelectorCards.vue";
import ItemsSelectorTable from "./ItemsSelectorTable.vue";
import NewItemDialog from "./NewItemDialog.vue";
import ScanErrorDialog from "./ScanErrorDialog.vue";
import placeholderImage from "./placeholder-image.png";
import {
	saveItemUOMs,
	getItemUOMs,
	getLocalStock,
	isOffline,
	getStoredItemsCount,
	initializeStockCache,
	saveItemsBulk,
	saveItems,
	clearStoredItems,
	getLocalStockCache,
	setLocalStockCache,
	initPromise,
	memoryInitPromise,
	checkDbHealth,
	getCachedPriceListItems,
	savePriceListItems,
	clearPriceListCache,
	updateLocalStockCache,
	isStockCacheReady,
	getCachedItemDetails,
	saveItemDetailsCache,
	saveItemGroups,
	getCachedItemGroups,
	getItemsLastSync,
	setItemsLastSync,
	forceClearAllCache,
} from "../../../offline/index.js";
import stockCoordinator from "../../utils/stockCoordinator.js";
import { useResponsive } from "../../composables/useResponsive.js";
import { useRtl } from "../../composables/useRtl.js";
import { useFlyAnimation } from "../../composables/useFlyAnimation.js";
import { withPerf, perfMarkStart, perfMarkEnd, scheduleFrame } from "../../utils/perf.js";
import { useCartValidation } from "../../composables/useCartValidation.js";
import { useItemsIntegration } from "../../composables/useItemsIntegration.js";
import { useItemSearch } from "../../composables/useItemSearch.js";
import { parseBooleanSetting, formatStockShortageError } from "../../utils/stock.js";
import { playScanTone, closeScanAudioContext } from "../../utils/scannerAudio.js";
import { getItemsTableHeaders } from "../../utils/itemsTableHeaders.js";
import { extractItemCodeFromSearch } from "../../utils/searchUtils.js";
import { openItemSelectionDialog } from "../../utils/itemSelectionDialog.js";
import { useCustomersStore } from "../../stores/customersStore.js";
import { useToastStore } from "../../stores/toastStore.js";
import { useUIStore } from "../../stores/uiStore.js";
import { useInvoiceStore } from "../../stores/invoiceStore.js";
import { storeToRefs } from "pinia";

export default {
	mixins: [format],
	setup() {
		const responsive = useResponsive();
		const rtl = useRtl();
		const { fly } = useFlyAnimation();
		const cartValidation = useCartValidation();

		// Initialize Pinia store integration
		const itemsIntegration = useItemsIntegration({
			// Disable integration debounce since ItemsSelector manages its own debounce
			// This prevents a double-debounce delay (300ms + 300ms = 600ms)
			enableDebounce: false,
			debounceDelay: 300,
		});

		const customersStore = useCustomersStore();
		const toastStore = useToastStore();
		const uiStore = useUIStore();
		const invoiceStore = useInvoiceStore();
		const { selectedCustomer } = storeToRefs(customersStore);

		const {
			showOnlyBarcodeItems: showOnlyBarcodeItemsRef,
			memoizedSearch,
			clearSearchCache,
			fetchServerItemsTimestamp,
			filterAndPaginate,
		} = useItemSearch();

		return {
			...responsive,
			...rtl,
			fly,
			cartValidation,
			...itemsIntegration,
			selectedCustomer,
			toastStore,
			uiStore,
			invoiceStore,
			// Expose search composable
			showOnlyBarcodeItemsRef,
			memoizedSearch,
			clearSearchCache,
			fetchServerItemsTimestamp,
			filterAndPaginate,
		};
	},
	components: {
		CameraScanner,
		ItemActionToolbar,
		ItemSettingsDialog,
		ItemHeader,
		ItemsSelectorCards,
		ItemsSelectorTable,
		NewItemDialog,
		ScanErrorDialog,
	},
	props: {
		context: {
			type: String,
			default: "pos", // 'pos', 'purchase'
		},
		showOnlyBarcodeItems: {
			type: Boolean,
			default: false,
		},
	},
	data: () => ({
		newItemDialog: false,
		// newItemForm and uom_list moved to NewItemDialog.vue
		pos_profile: {},
		stock_settings: {},
		flags: {},
		customer: "",
		items_view: "list",
		first_search: "",
		search_input: "",
		search_backup: "",
		// Limit the displayed items to avoid overly large lists
		itemsPerPage: 50,
		offersCount: 0,
		appliedOffersCount: 0,
		couponsCount: 0,
		appliedCouponsCount: 0,
		new_line: false,
		qty: 1,
		background_sync_timer: null,
		background_sync_in_flight: false,
		last_background_sync_time: null,
		background_sync_details_in_flight: false,
		abortController: null,
		itemDetailsRequestCache: { key: null, promise: null, result: null },
		itemDetailsRetryCount: 0,
		itemDetailsRetryTimeout: null,
		selected_currency: "",
		exchange_rate: 1,
		conversion_rate: 1,
		prePopulateInProgress: false,
		itemWorker: null,
		flyConfig: { speed: 0.6, easing: "ease-in-out" },
		storageAvailable: true,
		localStorageAvailable: true,
		stockUnsubscribe: null,
		items_request_token: 0,
		pendingGetItems: null,
		lastGetItemsKey: "",
		show_item_settings: false,
		hide_qty_decimals: false,
		temp_hide_qty_decimals: false,
		hide_zero_rate_items: false,
		temp_hide_zero_rate_items: false,
		show_last_invoice_rate: true,
		temp_show_last_invoice_rate: true,
		enable_background_sync: true,
		temp_enable_background_sync: true,
		background_sync_interval: 30,
		temp_background_sync_interval: 30,
		isDragging: false,
		// Items per page configuration
		enable_custom_items_per_page: false,
		temp_enable_custom_items_per_page: false,
		items_per_page: 50,
		temp_items_per_page: 50,
		temp_force_server_items: false,
		virtualScrollEnabled: true,
		virtualScrollBuffer: 200,
		renderBuffer: 10,
		lastScrollTop: 0,
		scrollThrottle: null,
		searchDebounce: null,
		// Prevent repeated server fetches when local storage is empty
		fallbackAttempted: false,
		cardContainerWidth: 0,
		virtualScrollPending: false,
		metricsRaf: null,
		// Fixed page size for incremental item loading to avoid
		// pulling the entire catalog at once.
		itemsPageLimit: 100,
		// Track if the current search was triggered by a scanner
		search_from_scanner: false,
		currentPage: 0,
		isOverflowing: false,
		// Track background loading state and pending searches
		isBackgroundLoading: false,
		pendingItemSearch: null,
		loadProgress: 0,
		totalItemCount: 0,
		scanErrorDialog: false,
		scanErrorMessage: "",
		scanErrorDetails: "",
		scanErrorCode: "",
		scaleBarcodeSettings: {
			prefix: "",
			prefix_included_or_not: 0,
			no_of_prefix_characters: 0,
		},
		scaleBarcodeSettingsLoaded: false,
		scannerLocked: false,
		cameraScannerActive: false,
		scanAudioContext: null,
		pendingScanCode: "",
		awaitingScanResult: false,
		scanDebounceId: null,
		scanQueuedCode: "",
		refreshInFlight: false,
		clearingSearch: false,
		keyboardScanBuffer: "",
		keyboardScanTimer: null,
		keyboardScanLastTime: 0,
		keyboardScanStartTime: 0,
		keyboardScanPendingValue: "",
		keyboardScanMinLength: 12,
		// Require scanner-like speed to avoid triggering on manual typing
		keyboardScanMaxInterval: 45,
		keyboardScanMaxDuration: 250,
		keyboardScanProcessingDelay: 100,
		highlightedIndex: -1,
		highlightedItemCode: null,
		lastInvoiceRates: {},
		lastInvoiceRateScheduler: null,
		lastInvoiceRateLoading: false,
	}),

	watch: {
		search_input(newValue) {
			this.first_search = newValue;
			this.clearHighlightedItem();
			this.search_onchange();
		},
		customer: _.debounce(function () {
			if (!this.customer) {
				this.lastInvoiceRates = {};
			}
			this.scheduleLastInvoiceRateRefresh();

			if (this.pos_profile.posa_force_reload_items) {
				if (this.pos_profile.posa_smart_reload_mode) {
					// When limit search is enabled there may be no items yet.
					// Fallback to full reload if nothing is loaded
					if (!this.itemsLoaded || !this.displayedItems.length) {
						if (!isOffline()) {
							this.get_items(true);
						} else {
							if (
								this.pos_profile &&
								(!this.pos_profile.posa_local_storage || !this.storageAvailable)
							) {
								this.get_items(true);
							} else {
								this.get_items();
							}
						}
					} else {
						// Only refresh prices for visible items when smart reload is enabled
						this.$nextTick(() => this.refreshPricesForVisibleItems());
					}
				} else {
					// Fall back to full reload
					if (!isOffline()) {
						this.get_items(true);
					} else {
						if (
							this.pos_profile &&
							(!this.pos_profile.posa_local_storage || !this.storageAvailable)
						) {
							this.get_items(true);
						} else {
							this.get_items();
						}
					}
				}
				return;
			}
			// When the customer changes, avoid reloading all items.
			// Simply refresh prices for visible items only
			if (this.itemsLoaded && this.displayedItems && this.displayedItems.length > 0) {
				this.$nextTick(() => this.refreshPricesForVisibleItems());
			} else {
				if (this.pos_profile && (!this.pos_profile.posa_local_storage || !this.storageAvailable)) {
					this.get_items(true);
				} else {
					this.get_items();
				}
			}
		}, 300),
		customer_price_list: _.debounce(async function () {
			if (this.pos_profile.posa_force_reload_items) {
				if (this.pos_profile.posa_smart_reload_mode) {
					// When limit search is enabled there may be no items yet.
					// Fallback to full reload if nothing is loaded
					if (!this.itemsLoaded || !this.items.length) {
						if (!isOffline()) {
							this.get_items(true);
						} else {
							this.get_items();
						}
					} else {
						// Only refresh prices for visible items when smart reload is enabled
						this.$nextTick(() => this.refreshPricesForVisibleItems());
					}
				} else {
					// Fall back to full reload
					if (!isOffline()) {
						this.get_items(true);
					} else {
						this.get_items();
					}
				}
				return;
			}
			// Apply cached rates if available for immediate update
			if (this.itemsLoaded && this.items && this.items.length > 0) {
				const cached = await getCachedPriceListItems(this.customer_price_list);
				if (cached && cached.length) {
					const map = {};
					cached.forEach((ci) => {
						map[ci.item_code] = ci;
					});
					this.items.forEach((it) => {
						const ci = map[it.item_code];
						if (ci) {
							const force =
								this.pos_profile?.posa_force_price_from_customer_price_list !== false;
							const price = ci.price_list_rate ?? ci.rate ?? 0;
							if (force || price) {
								it.rate = price;
								it.price_list_rate = price;
							}
						}
					});
					this.eventBus.emit("set_all_items", this.items);
					this.update_items_details(this.items);
					return;
				}
			}
			// No cache found - force a reload so prices are updated
			if (!isOffline()) {
				this.get_items(true);
			} else {
				if (this.pos_profile && (!this.pos_profile.posa_local_storage || !this.storageAvailable)) {
					this.get_items(true);
				} else {
					this.get_items();
				}
			}
		}, 300),
		new_line() {
			this.eventBus.emit("set_new_line", this.new_line);
		},
		item_group(newValue, oldValue) {
			if (this.usesLimitSearch && newValue !== oldValue) {
				if (this.pos_profile && (!this.pos_profile.posa_local_storage || !this.storageAvailable)) {
					this.get_items(true);
				} else {
					this.get_items();
				}
			} else if (this.pos_profile && this.pos_profile.posa_local_storage && newValue !== oldValue) {
				if (this.storageAvailable) {
					this.loadVisibleItems(true);
				} else {
					this.get_items(true);
				}
			}
		},
		displayedItems(new_value, old_value) {
			// Update item details if items changed
			if (!this.usesLimitSearch && new_value.length !== old_value.length) {
				this.update_items_details(new_value);
			}
			this.$nextTick(() => {
				this.checkItemContainerOverflow();
				this.scheduleCardMetricsUpdate();
			});
			this.scheduleLastInvoiceRateRefresh();
			this.syncHighlightedItem();
		},
		// Automatically search when the query has at least 3 characters
		first_search: _.debounce(function (val, oldVal) {
			if (this.clearingSearch) {
				return;
			}
			const newLen = (val || "").trim().length;
			const oldLen = (oldVal || "").trim().length;

			// Check if we should trigger search
			if (newLen >= 3) {
				// Call without arguments so search_onchange treats it like an Enter key/Auto trigger
				this.search_onchange();
			} else if (oldLen >= 3 && newLen === 0) {
				// Reset items only when search is fully cleared
				this.clearSearch();
			}
		}, 300),

		// Refresh item prices whenever the user changes currency
		selected_currency() {
			if (this.formatCache) this.formatCache.clear();
			this.applyCurrencyConversionToItems();
		},

		// Also react when exchange rate is adjusted manually
		exchange_rate() {
			this.applyCurrencyConversionToItems();
		},
		windowWidth() {
			// Keep the configured items per page on resize
			this.itemsPerPage = this.items_per_page;
			this.scheduleCardMetricsUpdate();
		},
		windowHeight() {
			// Maintain the configured items per page on resize
			this.itemsPerPage = this.items_per_page;
			this.scheduleCardMetricsUpdate();
		},
		itemsLoaded(val) {
			if (val) {
				this.eventBus.emit("itemsLoaded");
				this.eventBus.emit("data-loaded", "items");
			}
		},
		items_view() {
			this.$nextTick(() => {
				if (this.items_view === "card") {
					this.checkItemContainerOverflow();
					this.scheduleCardMetricsUpdate();
				} else {
					this.isOverflowing = false;
				}
			});
		},
	},

	methods: {
		openNewItemDialog() {
			this.newItemDialog = true;
		},
		handleItemCreated(newItem) {
			this.items.unshift(newItem);
			this.eventBus.emit("set_all_items", this.items);
			if (this.search_input) {
				this.clearSearch();
			}
		},
		// get_uoms, closeNewItemDialog, submitNewItem moved to NewItemDialog.vue
		normalizeScaleBarcodeSettings(rawSettings = {}) {
			const settings = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
			const prefix = String(settings.prefix || "").trim();
			const prefixIncludedRaw = Number(settings.prefix_included_or_not);
			const prefixLengthRaw = Number(settings.no_of_prefix_characters);

			const prefixIncluded = Number.isFinite(prefixIncludedRaw) ? prefixIncludedRaw : 0;
			const prefixLength = Number.isFinite(prefixLengthRaw) ? prefixLengthRaw : 0;

			return {
				prefix,
				prefix_included_or_not: prefixIncluded,
				no_of_prefix_characters: prefixLength,
			};
		},
		updateScaleBarcodeSettings(settings) {
			const normalized = this.normalizeScaleBarcodeSettings(settings);
			this.scaleBarcodeSettings = {
				...this.scaleBarcodeSettings,
				...normalized,
			};
			this.scaleBarcodeSettingsLoaded = true;
			return this.scaleBarcodeSettings;
		},
		startItemWorker() {
			// Avoid spawning duplicate workers which doubles script downloads and background threads
			if (this.itemWorker || typeof Worker === "undefined") {
				return;
			}

			try {
				// Use the plain URL so the service worker can match the cached file
				// even when offline. Using a query string causes cache lookups to fail
				// which results in "Failed to fetch a worker script" errors.
				const workerUrl = "/assets/posawesome/dist/js/posapp/workers/itemWorker.js";
				this.itemWorker = new Worker(workerUrl, { type: "classic" });
				this.itemWorker.onerror = function (event) {
					console.error("Worker error:", event);
					console.error("Message:", event.message);
					console.error("Filename:", event.filename);
					console.error("Line number:", event.lineno);
				};
			} catch (e) {
				console.error("Failed to start item worker", e);
				this.itemWorker = null;
			}
		},
		async ensureScaleBarcodeSettings(force = false) {
			if (!force && this.scaleBarcodeSettingsLoaded) {
				return this.scaleBarcodeSettings;
			}

			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.parse_scale_barcode",
					args: { barcode: "" },
				});

				let settings = null;
				const message = res && res.message ? res.message : null;
				const hasKey = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

				if (message) {
					if (message.settings) {
						settings = message.settings;
					} else if (
						typeof message === "object" &&
						(hasKey(message, "prefix") ||
							hasKey(message, "prefix_included_or_not") ||
							hasKey(message, "no_of_prefix_characters"))
					) {
						settings = message;
					}
				}

				if (settings) {
					this.updateScaleBarcodeSettings(settings);
				} else {
					this.scaleBarcodeSettings = this.normalizeScaleBarcodeSettings();
					this.scaleBarcodeSettingsLoaded = true;
				}
			} catch (error) {
				console.error("Failed to load scale barcode settings", error);
				this.scaleBarcodeSettings = this.normalizeScaleBarcodeSettings();
				this.scaleBarcodeSettingsLoaded = true;
			}

			return this.scaleBarcodeSettings;
		},
		getScaleBarcodePrefix() {
			const prefix = this.scaleBarcodeSettings?.prefix;
			return typeof prefix === "string" ? prefix.trim() : "";
		},
		scaleBarcodeMatches(value) {
			const prefix = this.getScaleBarcodePrefix();
			if (!prefix) {
				return false;
			}
			return String(value || "").startsWith(prefix);
		},

		scheduleCardMetricsUpdate() {
			if (this.metricsRaf) {
				cancelAnimationFrame(this.metricsRaf);
			}
			this.metricsRaf = requestAnimationFrame(() => {
				this.metricsRaf = null;
				this.updateCardContainerMetrics();
			});
		},
		getItemsContainerElement() {
			const ref = this.$refs.itemsContainer;
			if (!ref) {
				return null;
			}
			if (typeof ref.getScrollerElement === "function") {
				return ref.getScrollerElement();
			}
			return ref.$el || ref;
		},
		updateCardContainerMetrics() {
			this.$nextTick(() => {
				const el = this.getItemsContainerElement();
				if (!el || typeof el.getBoundingClientRect !== "function") {
					return;
				}
				const { width } = el.getBoundingClientRect();
				if (width && Math.round(width) !== Math.round(this.cardContainerWidth)) {
					this.cardContainerWidth = width;
				}
			});
		},
		async onVirtualRangeUpdate(_startIndex, _endIndex, _visibleStartIndex, visibleEndIndex) {
			const total = this.displayedItems ? this.displayedItems.length : 0;
			if (!total) {
				this.scheduleCardMetricsUpdate();
				return;
			}

			const threshold = Math.max(1, this.cardColumns * 2);
			const nearEnd = visibleEndIndex >= total - threshold;

			if (nearEnd && this.hasMoreCachedItems && !this.virtualScrollPending && !this.loading) {
				this.virtualScrollPending = true;
				try {
					await this.appendCachedItemsPage();
				} catch (error) {
					console.warn("Failed to append cached items page", error);
				} finally {
					this.virtualScrollPending = false;
					this.scheduleCardMetricsUpdate();
				}
			} else {
				this.scheduleCardMetricsUpdate();
			}
		},

		// Optimized scroll handler with throttling
		onCardScroll() {
			if (this.scrollThrottle) return;

			this.scrollThrottle = requestAnimationFrame(() => {
				try {
					const el = this.getItemsContainerElement();
					if (!el) return;

					const scrollTop = el.scrollTop;
					const clientHeight = el.clientHeight;
					const scrollHeight = el.scrollHeight;

					// Only trigger load more if we're near the bottom
					if (scrollTop + clientHeight >= scrollHeight - 50) {
						this.currentPage += 1;
						this.loadVisibleItems();
					}

					this.lastScrollTop = scrollTop;
				} catch (error) {
					console.error("Error in card scroll handler:", error);
				} finally {
					this.scrollThrottle = null;
				}
			});
		},
		markStorageUnavailable(localOnly = false) {
			if (localOnly) {
				this.localStorageAvailable = false;
				return;
			}
			this.storageAvailable = false;
			this.localStorageAvailable = false;
			this.itemsPageLimit = null;
			if (this.itemWorker) {
				this.itemWorker.terminate();
				this.itemWorker = null;
			}
			if (this.pos_profile) {
				this.pos_profile.posa_local_storage = false;
			}
		},
		async ensureStorageHealth() {
			let localHealthy = true;
			try {
				if (typeof localStorage !== "undefined") {
					const t = "posa_test";
					localStorage.setItem(t, "1");
					localStorage.removeItem(t);
				}
			} catch (e) {
				console.warn("localStorage unavailable", e);
				localHealthy = false;
			}
			const dbHealthy = await checkDbHealth().catch(() => false);
			if (dbHealthy) {
				this.storageAvailable = true;
				if (!localHealthy) {
					this.markStorageUnavailable(true);
				} else {
					this.localStorageAvailable = true;
				}
				if (this.pos_profile && this.pos_profile.posa_local_storage) {
					this.startItemWorker();
				}
			} else {
				this.markStorageUnavailable();
			}
			return dbHealthy;
		},
		async loadVisibleItems(reset = false) {
			this.loadProgress = 0;
			this.eventBus.emit("data-load-progress", { name: "items", progress: 0 });
			await initPromise;
			await this.ensureStorageHealth();

			if (reset) {
				this.currentPage = 0;
				await this.loadItems({
					searchValue: this.get_search(this.first_search),
					groupFilter: this.item_group,
					limit: this.usesLimitSearch ? this.limitSearchCap : undefined,
				});
			}

			const pageItems = await this.appendCachedItemsPage();

			if (Array.isArray(pageItems) && pageItems.length) {
				this.eventBus.emit("set_all_items", this.items);
				await this.update_items_details(pageItems);

				this.loadProgress = this.totalItemCount
					? Math.round((this.items.length / this.totalItemCount) * 100)
					: 100;

				this.eventBus.emit("data-load-progress", {
					name: "items",
					progress: this.loadProgress,
				});
			}
		},
		onListScroll(event) {
			if (this.scrollThrottle) return;

			this.scrollThrottle = requestAnimationFrame(() => {
				try {
					const el = event.target;
					if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
						this.currentPage += 1;
						this.loadVisibleItems();
					}
				} catch (error) {
					console.error("Error in list scroll handler:", error);
				} finally {
					this.scrollThrottle = null;
				}
			});
		},

		checkItemContainerOverflow() {
			const el = this.getItemsContainerElement();
			if (!el) {
				this.isOverflowing = false;
				return;
			}

			const containerHeight = parseFloat(getComputedStyle(el).getPropertyValue("--container-height"));
			if (isNaN(containerHeight)) {
				this.isOverflowing = false;
				return;
			}

			const stickyHeader = el.closest(".dynamic-padding")?.querySelector(".sticky-header");
			const headerHeight = stickyHeader ? stickyHeader.offsetHeight : 0;
			const availableHeight = containerHeight - headerHeight;

			el.style.maxHeight = `${availableHeight}px`;
			this.isOverflowing = el.scrollHeight > availableHeight;
			this.scheduleCardMetricsUpdate();
		},

		async fetchItemDetails(items) {
			if (!items || items.length === 0) {
				return [];
			}

			const key = [
				this.pos_profile.name,
				this.active_price_list,
				items.map((i) => i.item_code).join(","),
			].join(":");

			if (this.itemDetailsRequestCache.key === key && this.itemDetailsRequestCache.result) {
				return this.itemDetailsRequestCache.result;
			}

			if (this.itemDetailsRequestCache.key === key && this.itemDetailsRequestCache.promise) {
				return this.itemDetailsRequestCache.promise;
			}

			this.cancelItemDetailsRequest();
			this.itemDetailsRequestCache.key = key;

			this.abortController = new AbortController();

			let timeoutId;
			const timeoutPromise = new Promise((_, reject) => {
				timeoutId = setTimeout(() => reject(new Error("Request timed out")), 5000);
			});

			const requestPromise = frappe.call({
				method: "posawesome.posawesome.api.items.get_items_details",
				args: {
					pos_profile: JSON.stringify(this.pos_profile),
					items_data: JSON.stringify(items),
					price_list: this.active_price_list,
				},
				freeze: false,
				signal: this.abortController.signal,
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

			this.itemDetailsRequestCache.promise = Promise.race([wrappedRequestPromise, timeoutPromise]);

			try {
				const r = await this.itemDetailsRequestCache.promise;
				const msg = (r && r.message) || [];
				if (this.itemDetailsRequestCache.key === key) {
					this.itemDetailsRequestCache.result = msg;
				}
				return msg;
			} catch (err) {
				if (err.message === "Request timed out") {
					if (this.abortController) {
						this.abortController.abort();
					}
					console.warn("Item details fetch timed out, proceeding with local data.");
					// Prevent unhandled rejection from the aborted request
					wrappedRequestPromise.catch(() => {});
				} else if (err.name !== "AbortError") {
					console.error("Error fetching item details:", err);
				}
				throw err;
			} finally {
				if (this.itemDetailsRequestCache.key === key) {
					this.itemDetailsRequestCache.promise = null;
				}
				this.abortController = null;
			}
		},
		cancelItemDetailsRequest() {
			if (this.abortController) {
				this.abortController.abort();
				this.abortController = null;
			}
			if (this.itemDetailsRequestCache) {
				this.itemDetailsRequestCache.key = null;
				this.itemDetailsRequestCache.promise = null;
				this.itemDetailsRequestCache.result = null;
			}
		},
		async refreshPricesForVisibleItems() {
			const vm = this;
			if (!vm.displayedItems || vm.displayedItems.length === 0) return;

			if (vm.refreshInFlight) {
				return;
			}

			vm.refreshInFlight = true;

			try {
				const itemCodes = vm.displayedItems.map((it) => it.item_code);
				const cacheResult = await getCachedItemDetails(
					vm.pos_profile.name,
					vm.active_price_list,
					itemCodes,
				);
				const updates = [];

				cacheResult.cached.forEach((det) => {
					const item = vm.displayedItems.find((it) => it.item_code === det.item_code);
					if (item) {
						const upd = { actual_qty: det.actual_qty };
						if (det.item_uoms && det.item_uoms.length > 0) {
							upd.item_uoms = det.item_uoms;
							saveItemUOMs(item.item_code, det.item_uoms);
						}
						if (det.rate !== undefined) {
							const force = vm.pos_profile?.posa_force_price_from_customer_price_list !== false;
							const price = det.price_list_rate ?? det.rate ?? 0;
							if (force || price) {
								upd.rate = price;
								upd.price_list_rate = price;
							}
						}
						if (det.currency) {
							upd.currency = det.currency;
						}
						updates.push({ item, upd });
					}
				});

				if (cacheResult.missing.length === 0) {
					vm.$nextTick(() => {
						updates.forEach(({ item, upd }) => Object.assign(item, upd));
						updateLocalStockCache(cacheResult.cached);
					});
					return;
				}

				const itemsToFetch = vm.displayedItems.filter((it) =>
					cacheResult.missing.includes(it.item_code),
				);

				const details = await vm.fetchItemDetails(itemsToFetch);
				details.forEach((updItem) => {
					const item = vm.displayedItems.find((it) => it.item_code === updItem.item_code);
					if (item) {
						const upd = { actual_qty: updItem.actual_qty };
						if (updItem.item_uoms && updItem.item_uoms.length > 0) {
							upd.item_uoms = updItem.item_uoms;
							saveItemUOMs(item.item_code, updItem.item_uoms);
						}
						if (updItem.rate !== undefined) {
							const force = vm.pos_profile?.posa_force_price_from_customer_price_list !== false;
							const price = updItem.price_list_rate ?? updItem.rate ?? 0;
							if (force || price) {
								upd.rate = price;
								upd.price_list_rate = price;
							}
						}
						if (updItem.currency) {
							upd.currency = updItem.currency;
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

				vm.$nextTick(async () => {
					updates.forEach(({ item, upd }) => Object.assign(item, upd));
					updateLocalStockCache(details);
					saveItemDetailsCache(vm.pos_profile.name, vm.active_price_list, details);
					if (
						vm.pos_profile &&
						vm.pos_profile.posa_local_storage &&
						vm.storageAvailable &&
						!vm.usesLimitSearch
					) {
						try {
							await saveItemsBulk(details);
						} catch (e) {
							console.error("Failed to persist item details", e);
							vm.markStorageUnavailable && vm.markStorageUnavailable();
						}
					}
					// releaseLoading() removed - logic handled by refreshInFlight flag in finally block
				});
			} catch (err) {
				if (err.name !== "AbortError") {
					console.error("Error fetching item details:", err);
				}
			} finally {
				vm.refreshInFlight = false;
			}
		},

		scheduleLastInvoiceRateRefresh() {
			if (!this.show_last_invoice_rate) {
				this.lastInvoiceRates = {};
				return;
			}

			if (!this.lastInvoiceRateScheduler) {
				this.lastInvoiceRateScheduler = _.debounce(() => {
					this.refreshLastInvoiceRatesForVisibleItems();
				}, 200);
			}

			this.lastInvoiceRateScheduler();
		},

		async refreshLastInvoiceRatesForVisibleItems() {
			if (!this.show_last_invoice_rate) {
				this.lastInvoiceRates = {};
				return this.lastInvoiceRates;
			}

			if (!this.displayedItems || !this.displayedItems.length) {
				this.lastInvoiceRates = {};
				return this.lastInvoiceRates;
			}

			const itemCodes = this.displayedItems.map((it) => it.item_code).filter(Boolean);
			return this.fetchLastInvoiceRates(itemCodes);
		},

		async fetchLastInvoiceRates(itemCodes = []) {
			if (!this.show_last_invoice_rate) {
				this.lastInvoiceRates = {};
				return this.lastInvoiceRates;
			}

			const customer = this.customer || this.selectedCustomer;

			if (!customer) {
				this.lastInvoiceRates = {};
				return {};
			}

			const normalizedCodes = Array.from(new Set(itemCodes.filter(Boolean)));
			const cachedForCustomer = this.lastInvoiceRateCache.get(customer) || new Map();
			this.lastInvoiceRates = Object.fromEntries(cachedForCustomer);

			const missingCodes = normalizedCodes.filter((code) => !cachedForCustomer.has(code));
			if (!missingCodes.length) {
				return this.lastInvoiceRates;
			}

			if (isOffline()) {
				return this.lastInvoiceRates;
			}

			this.lastInvoiceRateLoading = true;
			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.invoices.get_last_invoice_rates",
					args: {
						customer,
						item_codes: missingCodes,
						company: this.pos_profile?.company,
					},
				});

				const rows = (res && res.message) || [];
				const updatedCache = new Map(cachedForCustomer);
				rows.forEach((row) => {
					if (row && row.item_code) {
						updatedCache.set(row.item_code, {
							rate: row.rate,
							currency: row.currency,
							invoice: row.invoice,
							uom: row.uom,
							posting_date: row.posting_date,
						});
					}
				});

				this.lastInvoiceRateCache.set(customer, updatedCache);
				this.lastInvoiceRates = Object.fromEntries(updatedCache);
				return this.lastInvoiceRates;
			} catch (error) {
				console.error("Failed to fetch last invoice rates", error);
				this.lastInvoiceRates = Object.fromEntries(cachedForCustomer);
				return this.lastInvoiceRates;
			} finally {
				this.lastInvoiceRateLoading = false;
			}
		},

		getLastInvoiceRate(item) {
			if (!this.show_last_invoice_rate) {
				return null;
			}

			if (!item || !item.item_code) {
				return null;
			}

			return this.lastInvoiceRates[item.item_code] || null;
		},

		show_offers() {
			this.eventBus.emit("show_offers", "true");
		},
		show_coupons() {
			this.eventBus.emit("show_coupons", "true");
		},
		async initializeItems() {
			if (!this.pos_profile || !this.pos_profile.name) {
				return;
			}
			await this.ensureStorageHealth();
			if (
				this.pos_profile &&
				this.pos_profile.posa_local_storage &&
				this.storageAvailable &&
				!this.usesLimitSearch
			) {
				const localCount = await getStoredItemsCount();
				if (localCount > 0) {
					await this.loadVisibleItems(true);
					await this.verifyServerItemCount();
					return;
				}
			}
			await this.get_items(true);

			if (
				this.pos_profile &&
				this.pos_profile.posa_local_storage &&
				this.storageAvailable &&
				!this.usesLimitSearch
			) {
				await this.verifyServerItemCount();
			}

			this.$nextTick(() => {
				this.primeStockState();
			});
		},
		async forceReloadItems() {
			if (isOffline()) {
				frappe.msgprint(__("Cannot reload items while offline. Please connect to the internet."));
				return;
			}

			console.log("[ItemsSelector] forceReloadItems called - Full Refresh");

			// 1. Clear local component caches
			this.itemDetailsRequestCache = { key: null, promise: null, result: null };
			if (this.lastInvoiceRateCache) {
				this.lastInvoiceRateCache.clear();
			}
			this.lastInvoiceRates = {};

			// 2. Reset search if empty to ensure full load
			if (!this.first_search || !this.first_search.trim()) {
				this.first_search = "";
				this.search = "";
			}

			// 3. Delegate to Store for full cache wipe and reload
			// This calls itemsStore.refreshItems() which:
			// - Clears memory/session/IDB caches
			// - Resets pagination
			// - Forces server fetch
			// - Triggers background details sync
			try {
				await this.refreshItems();
				frappe.show_alert({ message: __("Items reloaded from server"), indicator: "green" });
			} catch (error) {
				console.error("Failed to reload items:", error);
				frappe.msgprint(__("Failed to reload items"));
			}

			console.log("[ItemsSelector] forceReloadItems finished");
		},
		async verifyServerItemCount() {
			if (this.usesLimitSearch) {
				console.log("[ItemsSelector] limit search enabled, skipping background reconciliation");
				return;
			}
			if (!this.pos_profile || !this.pos_profile.posa_local_storage || !this.storageAvailable) {
				console.log("[ItemsSelector] local caching disabled, skipping background reconciliation");
				return;
			}
			if (this.isBackgroundLoading) {
				console.log("[ItemsSelector] background load already in progress, skipping reconciliation");
				return;
			}
			if (isOffline()) {
				console.log("[ItemsSelector] offline, skipping server item count check");
				return;
			}
			try {
				const localCount = await getStoredItemsCount();
				console.log("[ItemsSelector] verifying server item count", { localCount });
				const profileGroups = (this.pos_profile?.item_groups || []).map((g) => g.item_group);
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items_count",
					args: {
						pos_profile: JSON.stringify(this.pos_profile),
						item_groups: profileGroups,
					},
				});
				const serverCount = res.message || 0;
				console.log("[ItemsSelector] server item count result", { serverCount });
				if (typeof serverCount === "number") {
					this.totalItemCount = serverCount;
					if (serverCount <= localCount) {
						this.loadProgress = serverCount
							? Math.min(100, Math.round((localCount / serverCount) * 100))
							: 100;
						this.eventBus.emit("data-load-progress", {
							name: "items",
							progress: this.loadProgress,
						});
						if (serverCount < localCount) {
							console.log("[ItemsSelector] local cache has extra items, forcing reload");
							await this.forceReloadItems();
						}
						return;
					}

					this.loadProgress = serverCount ? Math.round((localCount / serverCount) * 100) : 0;
					this.eventBus.emit("data-load-progress", {
						name: "items",
						progress: this.loadProgress,
					});

					const lastSync = getItemsLastSync();
					const requestToken = ++this.items_request_token;
					await this.backgroundLoadItems();
				}
			} catch (err) {
				console.error("Error checking item count:", err);
			}
		},
		async get_items(force_server = false) {
			if (this.isBackgroundLoading) {
				if (this.pendingGetItems) {
					this.pendingGetItems.force_server = this.pendingGetItems.force_server || force_server;
				} else {
					this.pendingGetItems = { force_server };
				}
				return;
			}

			if (!this.pos_profile || !this.pos_profile.name) {
				console.warn("No POS Profile available, attempting to get it...");
				try {
					if (frappe.boot && frappe.boot.pos_profile) {
						this.pos_profile = frappe.boot.pos_profile;
					} else {
						frappe.msgprint(__("Please configure a POS Profile first"));
						return;
					}
				} catch (error) {
					console.error("Failed to get POS Profile:", error);
					return;
				}
			}

			const searchValue = this.get_search(this.first_search);
			const normalizedGroup =
				typeof this.item_group === "string" && this.item_group.length > 0 ? this.item_group : "ALL";

			console.log("[ItemsSelector] get_items via store", {
				force_server,
				searchValue,
				normalizedGroup,
			});

			this.eventBus.emit("data-load-progress", { name: "items", progress: 0 });
			const requestToken = ++this.items_request_token;

			try {
				const result = await this.loadItems({
					forceServer: force_server,
					searchValue,
					groupFilter: normalizedGroup,
					priceList: this.customer_price_list,
					limit: this.usesLimitSearch ? this.limitSearchCap : undefined,
				});

				const resolvedItems = Array.isArray(result) && result.length ? result : this.items;
				this.replaceBarcodeIndex(resolvedItems);
				this.eventBus.emit("set_all_items", resolvedItems);
				this.scheduleLastInvoiceRateRefresh();

				const progress = this.loadProgress
					? this.loadProgress
					: this.totalItemCount
						? Math.round((resolvedItems.length / this.totalItemCount) * 100)
						: 100;

				this.eventBus.emit("data-load-progress", {
					name: "items",
					progress,
				});

				if (!this.usesLimitSearch && this.hasMoreCachedItems) {
					await this.appendCachedItemsPage();
				}

				if (!this.usesLimitSearch && requestToken === this.items_request_token) {
					this.kickoffBackgroundSync();
				}
			} catch (error) {
				console.error("Failed to load items via store:", error);
				frappe.msgprint(__("Failed to load items. Please try again."));
			}
		},
		kickoffBackgroundSync() {
			if (this.isBackgroundLoading || this.usesLimitSearch) {
				return Promise.resolve([]);
			}

			const normalizedSearch = this.get_search(this.first_search || "").trim();

			this.isBackgroundLoading = true;

			return this.backgroundSyncItems({
				groupFilter: this.item_group,
				searchValue: normalizedSearch,
			})
				.then((appended) => {
					if (Array.isArray(appended) && appended.length) {
						this.eventBus.emit("set_all_items", this.items);
					}
					return appended;
				})
				.finally(() => {
					this.finishBackgroundLoad();
				});
		},
		finishBackgroundLoad() {
			this.isBackgroundLoading = false;

			const pendingSearch = this.pendingItemSearch;
			this.pendingItemSearch = null;
			if (pendingSearch) {
				this.search_onchange(pendingSearch);
				if (this.search_onchange.flush) {
					this.search_onchange.flush();
				}
				return;
			}

			if (this.pendingGetItems) {
				const { force_server: forceServer } = this.pendingGetItems;
				this.pendingGetItems = null;
				this.get_items(!!forceServer);
			}
		},
		async backgroundLoadItems() {
			return this.kickoffBackgroundSync();
		},

		get_items_groups() {
			if (!this.pos_profile) {
				console.log("No POS Profile");
				return;
			}
			this.items_group = ["ALL"];
			if (this.pos_profile.item_groups.length > 0) {
				const groups = [];
				this.pos_profile.item_groups.forEach((element) => {
					if (element.item_group !== "All Item Groups") {
						this.items_group.push(element.item_group);
						groups.push(element.item_group);
					}
				});
				saveItemGroups(groups);
			} else if (isOffline()) {
				const cached = getCachedItemGroups();
				cached.forEach((g) => {
					this.items_group.push(g);
				});
			} else {
				const vm = this;
				frappe.call({
					method: "posawesome.posawesome.api.items.get_items_groups",
					args: {},
					callback: function (r) {
						if (r.message) {
							const groups = [];
							r.message.forEach((element) => {
								vm.items_group.push(element.name);
								groups.push(element.name);
							});
							saveItemGroups(groups);
						}
					},
				});
			}
		},
		getItemsHeaders() {
			if (this.context === "purchase") {
				return [
					{
						title: __("Item"),
						key: "item_name",
						align: "start",
						sortable: true,
						width: "40%",
					},
					{
						title: __("Buying Price"),
						key: "rate",
						align: "end",
						sortable: true,
						width: "25%",
					},
					{
						title: __("Stock"),
						key: "actual_qty",
						align: "end",
						sortable: true,
						width: "20%",
					},
				];
			}
			const items_headers = [
				{
					title: __("Name"),
					align: "start",
					sortable: true,
					key: "item_name",
				},
				{
					title: __("Code"),
					align: "start",
					sortable: true,
					key: "item_code",
				},
				{ title: __("Rate"), key: "rate", align: "start" },
				{ title: __("Available QTY"), key: "actual_qty", align: "start" },
				{ title: __("UOM"), key: "stock_uom", align: "start" },
			];
			if (!this.pos_profile.posa_display_item_code) {
				items_headers.splice(1, 1);
			}

			return items_headers;
		},
		select_item(event, item) {
			const targets = document.querySelectorAll(".items-table-container");
			const target = targets[targets.length - 1];
			const source = event.currentTarget?.querySelector?.(".card-item-image") || event.currentTarget;
			if (target && source && this.fly) {
				this.fly(source, target, this.flyConfig);
			}
			this.add_item(item);
		},
		selectTopItem() {
			if (!this.displayedItems || !this.displayedItems.length) {
				return;
			}
			this.add_item(this.displayedItems[0]);
		},
		async click_item_row(event, { item }) {
			const targets = document.querySelectorAll(".items-table-container");
			const target = targets[targets.length - 1];
			if (target && this.fly) {
				const placeholder = document.createElement("div");
				placeholder.className = "item-fly-placeholder";
				placeholder.style.width = "40px";
				placeholder.style.height = "40px";
				placeholder.style.borderRadius = "50%";
				placeholder.style.position = "fixed";
				placeholder.style.top = `${event.clientY - 20}px`;
				placeholder.style.left = `${event.clientX - 20}px`;
				document.body.appendChild(placeholder);
				this.fly(placeholder, target, this.flyConfig);
				placeholder.remove();
			}
			await this.add_item(item);
		},
		async add_item(item, options = {}) {
			const { suppressNegativeWarning = false } = options;
			item = { ...item };

			// Handle variant items
			if (item.has_variants) {
				await this.handleVariantItem(item);
				return;
			}

			// PERF: Skip blocking update_items_details call.
			// The background sync mechanism (flushBackgroundUpdates) in invoiceItemMethods.js
			// will handle fetching fresh details asynchronously after the item is added.
			// await this.update_items_details([item]);

			// Validate item before adding to cart
			const requestedQty = this.qty != null ? Math.abs(this.qty) : 1;

			if (this.context !== "purchase") {
				const isValid = await this.cartValidation.validateCartItem(
					item,
					requestedQty,
					this.pos_profile,
					this.stock_settings,
					null, // EventBus removed
					this.blockSaleBeyondAvailableQty,
					!suppressNegativeWarning,
					true, // Skip server-side validation for instant add
				);

				if (!isValid) {
					// Validation failed, error message already shown by validator
					return;
				}
			}

			// Prepare item for cart
			await this.prepareItemForCart(item, requestedQty);

			// Add item to cart
			const payload = { ...item };
			delete payload._barcode_qty;
			this.$emit("add-item", payload);
			this.qty = 1;
		},

		/**
		 * Handle variant item selection
		 */
		async handleVariantItem(item) {
			let variants = this.items.filter((it) => it.variant_of == item.item_code);
			let attrsMeta = {};

			// Fetch variants if not already loaded
			if (!variants.length) {
				try {
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_item_variants",
						args: {
							pos_profile: JSON.stringify(this.pos_profile),
							parent_item_code: item.item_code,
							price_list: this.active_price_list,
							customer: this.customer,
						},
					});
					if (res.message) {
						variants = res.message.variants || res.message;
						attrsMeta = res.message.attributes_meta || {};
						this.items.push(...variants);
					}
				} catch (e) {
					console.error("Failed to fetch variants", e);
				}
			}

			// Show variant selection dialog
			this.toastStore.show({
				title: __("This is an item template. Please choose a variant."),
				color: "warning",
			});

			attrsMeta = attrsMeta || {};
			this.uiStore.openVariants({
				item,
				items: variants,
				profile: this.pos_profile,
				attrsMeta,
			});
		},

		/**
		 * Prepare item for adding to cart (UOMs, currency conversion, etc.)
		 */
		async prepareItemForCart(item, requestedQty) {
			// Ensure UOMs are initialized
			if (!item.uom) {
				item.uom = item.stock_uom;
			}
			if (!item.item_uoms || item.item_uoms.length === 0) {
				const cachedUoms = getItemUOMs(item.item_code);
				if (cachedUoms.length > 0) {
					item.item_uoms = cachedUoms;
				} else {
					item.item_uoms = [{ uom: item.stock_uom, conversion_factor: 1.0 }];
				}
				// Benchmark: avoid awaiting item detail fetch to keep click-to-add responsive.
				if (this.pos_profile?.name) {
					this.update_items_details([item]).catch((error) => {
						console.error("Failed to refresh item details for cart", error);
					});
				}
			}

			// Handle multi-currency conversion
			if (this.pos_profile?.posa_allow_multi_currency) {
				this.applyCurrencyConversionToItem(item);

				const companyCurrency = this.pos_profile.currency;
				const plcToCompanyRate = this._getPlcToCompanyRate(item);
				const base_rate =
					item.original_currency === companyCurrency
						? item.original_rate
						: item.original_rate * plcToCompanyRate;

				item.base_rate = base_rate;
				item.base_price_list_rate = base_rate;
			}

			// Set final quantity
			const hasBarcodeQty = item._barcode_qty;
			if (!item.qty || (item.qty === 1 && !hasBarcodeQty)) {
				let qtyVal = requestedQty;
				if (this.hide_qty_decimals) {
					qtyVal = Math.trunc(qtyVal);
				}
				item.qty = qtyVal;
			}
		},
		async enter_event(scannedCode) {
			const searchTerm = scannedCode || this.first_search;
			await this.ensureScaleBarcodeSettings();
			if (!this.displayedItems.length || !searchTerm) {
				return;
			}

			// Derive the searchable code and detect scale barcode
			const search = this.get_search(searchTerm);
			const isScaleBarcode = this.scaleBarcodeMatches(searchTerm);
			this.search = search;

			const qty = parseFloat(this.get_item_qty(searchTerm));
			const new_item = { ...this.displayedItems[0] };
			new_item.qty = flt(qty);
			if (isScaleBarcode) {
				new_item._barcode_qty = true;
			}

			let match = false;
			if (Array.isArray(new_item.item_barcode)) {
				new_item.item_barcode.forEach((element) => {
					if (search === element.barcode) {
						new_item.uom = element.posa_uom;
						match = true;
					}
				});
			}
			if (!match && new_item.barcode === search) {
				match = true;
			}
			if (!match && Array.isArray(new_item.barcodes)) {
				match = new_item.barcodes.some((bc) => String(bc) === search);
			}

			if (this.flags.serial_no) {
				new_item.to_set_serial_no = this.flags.serial_no;
			}
			if (this.flags.batch_no) {
				new_item.to_set_batch_no = this.flags.batch_no;
			}

			if (match) {
				const fromScanner = this.search_from_scanner;
				if (fromScanner) {
					this.awaitingScanResult = true;
				}

				try {
					await this.add_item(new_item, { suppressNegativeWarning: true });
					if (fromScanner) {
						this.playScanTone("success");
						this.scannerLocked = false;
						this.pendingScanCode = "";
					}
				} finally {
					if (fromScanner) {
						this.awaitingScanResult = false;
					}
				}

				this.flags.serial_no = null;
				this.flags.batch_no = null;
				this.qty = 1;

				if (fromScanner) {
					this.search_from_scanner = false;
				}

				if (!this.scanErrorDialog) {
					// Clear search field after successfully adding an item
					this.clearSearch();
					this.focusItemSearch();
				}
			}
		},
		onEnter(event) {
			if (this.highlightedIndex >= 0) {
				if (event && typeof event.preventDefault === "function") {
					event.preventDefault();
				}
				this.selectHighlightedItem();
				return;
			}
			if (this.search_onchange.cancel) {
				this.search_onchange.cancel();
			}
			this._performSearch();
		},
		search_onchange: _.debounce(function () {
			this._performSearch();
		}, 300),

		async _performSearch() {
			const vm = this;

			vm.cancelItemDetailsRequest();

			// Determine the actual query string and trim whitespace
			const trimmedQuery = (vm.first_search || "").trim();

			// Keep first_search in sync with the value we are about to search for
			vm.first_search = trimmedQuery;

			// If the input is a numeric string 12 characters or longer, treat it as a barcode
			if (/^\d{12,}$/.test(trimmedQuery)) {
				vm.onBarcodeScanned(trimmedQuery);
				return;
			}

			// Require a minimum of three characters before running a search
			if (!trimmedQuery || trimmedQuery.length < 3) {
				vm.search_from_scanner = false;
				return;
			}

			// If background loading is in progress, defer the search without changing the active query
			if (vm.isBackgroundLoading) {
				vm.pendingItemSearch = trimmedQuery;
				return;
			}

			vm.search = trimmedQuery;

			const fromScanner = vm.search_from_scanner;

			if (vm.usesLimitSearch) {
				const shouldForceServer =
					!vm.pos_profile.posa_local_storage || !vm.storageAvailable || !isOffline();
				await vm.get_items(shouldForceServer);
			} else if (vm.pos_profile && vm.pos_profile.posa_local_storage) {
				if (vm.storageAvailable) {
					await vm.loadVisibleItems(true);
					vm.enter_event();
				} else {
					vm.get_items(true);
				}
			} else {
				// When local storage is disabled, always fetch items
				// from the server so searches aren't limited to the
				// initially loaded set.
				await vm.get_items(true);
				vm.enter_event();

				if (vm.displayedItems && vm.displayedItems.length > 0) {
					setTimeout(() => {
						vm.update_items_details(vm.displayedItems);
					}, 300);
				}
			}

			// Clear the input only when triggered via scanner
			if (fromScanner) {
				vm.clearSearch();
				vm.focusItemSearch();
				vm.search_from_scanner = false;
			}
		},
		get_item_qty(first_search) {
			const qtyVal = this.qty != null ? this.qty : 1;
			let scal_qty = Math.abs(qtyVal);
			const prefix = this.getScaleBarcodePrefix();
			const prefix_len = prefix.length;

			if (this.scaleBarcodeMatches(first_search)) {
				// Determine item code length dynamically based on EAN-13 structure:
				// prefix + item_code + 5 qty digits + 1 check digit
				const item_code_len = first_search.length - prefix_len - 6;
				let pesokg1 = first_search.substr(prefix_len + item_code_len, 5);
				let pesokg;
				if (pesokg1.startsWith("0000")) {
					pesokg = "0.00" + pesokg1.substr(4);
				} else if (pesokg1.startsWith("000")) {
					pesokg = "0.0" + pesokg1.substr(3);
				} else if (pesokg1.startsWith("00")) {
					pesokg = "0." + pesokg1.substr(2);
				} else if (pesokg1.startsWith("0")) {
					pesokg = pesokg1.substr(1, 1) + "." + pesokg1.substr(2, pesokg1.length);
				} else if (!pesokg1.startsWith("0")) {
					pesokg = pesokg1.substr(0, 2) + "." + pesokg1.substr(2, pesokg1.length);
				}
				scal_qty = pesokg;
			}
			if (this.hide_qty_decimals) {
				scal_qty = Math.trunc(scal_qty);
			}
			return scal_qty;
		},
		get_search(first_search) {
			if (!first_search) return "";
			const prefix = this.getScaleBarcodePrefix();
			const prefix_len = prefix.length;
			if (!this.scaleBarcodeMatches(first_search)) {
				return first_search;
			}
			// Calculate item code length from total barcode length
			const item_code_len = first_search.length - prefix_len - 6;
			return first_search.substr(0, prefix_len + item_code_len);
		},
		esc_event() {
			this.clearSearch();
			this.qty = 1;
			this.focusItemSearch();
		},
		syncItemsWithStockState(codes = null, options = {}) {
			const collections = [];
			if (Array.isArray(this.items)) {
				collections.push(this.items);
			}
			if (Array.isArray(this.displayedItems)) {
				collections.push(this.displayedItems);
			}
			if (Array.isArray(this.filteredItems)) {
				collections.push(this.filteredItems);
			}
			const codesSet = (() => {
				if (codes === null) {
					return null;
				}
				const iterable = Array.isArray(codes)
					? codes
					: codes instanceof Set || typeof codes[Symbol.iterator] === "function"
						? Array.from(codes)
						: [codes];
				return new Set(
					iterable
						.map((code) => (code !== undefined && code !== null ? String(code).trim() : ""))
						.filter(Boolean),
				);
			})();
			collections.forEach((items) => {
				stockCoordinator.applyAvailabilityToCollection(items, codesSet, options);
			});
			if (collections.length) {
				this.$forceUpdate();
			}
		},
		primeStockState(source = "items-selector") {
			const allItems = Array.isArray(this.items) ? [...this.items] : [];
			const extra = Array.isArray(this.displayedItems) ? this.displayedItems : [];
			extra.forEach((item) => {
				if (allItems.includes(item)) {
					return;
				}
				allItems.push(item);
			});
			if (!allItems.length) {
				return;
			}
			stockCoordinator.primeFromItems(allItems, { silent: true, source });
			this.syncItemsWithStockState(
				allItems
					.map((item) =>
						item && item.item_code !== undefined ? String(item.item_code).trim() : null,
					)
					.filter(Boolean),
				{ updateBaseAvailable: false },
			);
		},
		handleStockSnapshotUpdate(event = {}) {
			const codes = Array.isArray(event.codes) ? event.codes : [];
			if (!codes.length) {
				return;
			}
			this.syncItemsWithStockState(codes, { updateBaseAvailable: false });
		},
		captureBaseAvailability(item, explicitActualQty = undefined) {
			if (!item) {
				return;
			}

			let resolvedBase = null;

			if (typeof item.available_qty === "number" && !Number.isNaN(item.available_qty)) {
				item._base_available_qty = item.available_qty;
				resolvedBase = item.available_qty;
			}

			const hasExplicit = typeof explicitActualQty === "number" && !Number.isNaN(explicitActualQty);
			if (hasExplicit) {
				item._base_actual_qty = explicitActualQty;
				resolvedBase = explicitActualQty;
			} else if (typeof item.actual_qty === "number" && !Number.isNaN(item.actual_qty)) {
				item._base_actual_qty = item.actual_qty;
				resolvedBase = item.actual_qty;
			}

			if (resolvedBase !== null && item.item_code) {
				stockCoordinator.updateBaseQuantities(
					[
						{
							item_code: item.item_code,
							actual_qty: resolvedBase,
						},
					],
					{ silent: true, source: "items-selector" },
				);
			}
		},
		getBaseActualQty(item) {
			if (!item) {
				return null;
			}

			if (typeof item._base_actual_qty === "number" && !Number.isNaN(item._base_actual_qty)) {
				return item._base_actual_qty;
			}

			if (typeof item.actual_qty === "number" && !Number.isNaN(item.actual_qty)) {
				item._base_actual_qty = item.actual_qty;
				return item.actual_qty;
			}

			if (typeof item.available_qty === "number" && !Number.isNaN(item.available_qty)) {
				item._base_available_qty = item.available_qty;
				item._base_actual_qty = item.available_qty;
				return item.available_qty;
			}

			return null;
		},
		applyReservationToItem(item) {
			if (!item || !item.item_code) {
				return;
			}

			const codeKey = String(item.item_code).trim();
			if (!codeKey) {
				return;
			}

			if (this.getBaseActualQty(item) !== null) {
				stockCoordinator.updateBaseQuantities(
					[
						{
							item_code: codeKey,
							actual_qty: item._base_actual_qty,
						},
					],
					{ silent: true, source: "items-selector" },
				);
			}

			stockCoordinator.applyAvailabilityToItem(item, { updateBaseAvailable: false });
		},
		recomputeAvailabilityForCodes(codes = []) {
			if (!Array.isArray(codes) || !codes.length) {
				return;
			}

			const normalizedCodes = codes
				.filter((code) => code !== undefined && code !== null && String(code).trim())
				.map((code) => String(code).trim());
			if (!normalizedCodes.length) {
				return;
			}

			const targetCodes = new Set(normalizedCodes);
			this.syncItemsWithStockState(targetCodes, { updateBaseAvailable: false });
			targetCodes.forEach((code) => {
				const indexedItem = this.lookupItemByBarcode(code);
				if (indexedItem) {
					this.applyReservationToItem(indexedItem);
				}
			});
		},
		handleCartQuantitiesUpdated(totals = {}) {
			const impacted = stockCoordinator.updateReservations(totals, {
				source: "items-selector",
			});
			if (impacted.length) {
				this.recomputeAvailabilityForCodes(impacted);
			}
		},
		async handleInvoiceStockAdjusted(payload = {}) {
			const collectedCodes = new Set();

			const collectCode = (code) => {
				if (code === undefined || code === null) {
					return;
				}
				const normalized = String(code).trim();
				if (normalized) {
					collectedCodes.add(normalized);
				}
			};

			const collectFromItems = (items) => {
				if (!Array.isArray(items)) {
					return;
				}
				items.forEach((entry) => {
					if (!entry) {
						return;
					}
					if (typeof entry === "string" || typeof entry === "number") {
						collectCode(entry);
					} else if (entry.item_code !== undefined) {
						collectCode(entry.item_code);
					}
				});
			};

			if (Array.isArray(payload)) {
				collectFromItems(payload);
			} else if (payload && typeof payload === "object") {
				collectFromItems(payload.items);
				collectFromItems(payload.item_codes);
				if (payload.item_code !== undefined) {
					collectCode(payload.item_code);
				}
			} else {
				collectCode(payload);
			}

			if (!collectedCodes.size) {
				return;
			}

			const codes = Array.from(collectedCodes);
			const targetCodes = new Set(codes);
			const seenItems = new Set();
			const candidates = [];

			const considerItem = (item) => {
				if (!item || !item.item_code) {
					return;
				}
				const code = String(item.item_code).trim();
				if (!code || !targetCodes.has(code)) {
					return;
				}
				if (seenItems.has(item)) {
					return;
				}
				seenItems.add(item);
				candidates.push(item);
			};

			if (Array.isArray(this.items)) {
				this.items.forEach(considerItem);
			}

			if (Array.isArray(this.displayedItems)) {
				this.displayedItems.forEach(considerItem);
			}

			targetCodes.forEach((code) => {
				const indexed = this.lookupItemByBarcode(code);
				if (indexed) {
					considerItem(indexed);
				}
			});

			try {
				if (candidates.length) {
					await this.update_items_details(candidates, { forceRefresh: true });
				}
			} catch (error) {
				console.error("Failed to refresh item details after invoice submission", error);
			} finally {
				this.recomputeAvailabilityForCodes(codes);
			}
		},
		async update_items_details(items, options = {}) {
			const { forceRefresh = false } = options;
			const vm = this;
			if (!items || !items.length) return;

			// reset any pending retry timer
			if (vm.itemDetailsRetryTimeout) {
				clearTimeout(vm.itemDetailsRetryTimeout);
				vm.itemDetailsRetryTimeout = null;
			}

			const itemCodes = items.map((it) => it.item_code);
			const affectedCodes = Array.from(
				new Set(itemCodes.filter((code) => code !== undefined && code !== null)),
			);
			const baseRecords = new Map();
			const flushBaseRecords = () => {
				if (!baseRecords.size) {
					return;
				}
				const baseEntries = Array.from(baseRecords.entries()).map(([code, qty]) => ({
					item_code: code,
					actual_qty: qty,
				}));
				stockCoordinator.updateBaseQuantities(baseEntries, { source: "items-selector" });
				baseRecords.clear();
			};
			const cacheResult = await getCachedItemDetails(
				vm.pos_profile.name,
				vm.active_price_list,
				itemCodes,
				forceRefresh ? 0 : undefined,
			);
			cacheResult.cached.forEach((det) => {
				const item = items.find((it) => it.item_code === det.item_code);
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
						const force = vm.pos_profile?.posa_force_price_from_customer_price_list !== false;
						const price = det.price_list_rate ?? det.rate ?? 0;
						if (force || price) {
							item.rate = price;
							item.price_list_rate = price;
						}
					}
					if (det.currency) {
						item.currency = det.currency;
					}

					vm.captureBaseAvailability(item, det.actual_qty);
					if (det.actual_qty !== undefined && det.actual_qty !== null) {
						baseRecords.set(item.item_code, det.actual_qty);
					}
					if (!item.original_rate) {
						item.original_rate = item.rate;
						item.original_currency = item.currency || vm.pos_profile.currency;
					}

					vm.indexItem(item);
					vm.applyCurrencyConversionToItem(item);
				}
			});

			let allCached = cacheResult.missing.length === 0;
			items.forEach((item) => {
				const localQty = getLocalStock(item.item_code);
				if (localQty !== null) {
					item.actual_qty = localQty;
					vm.captureBaseAvailability(item, localQty);
					baseRecords.set(item.item_code, localQty);
				} else {
					allCached = false;
				}

				if (!item.item_uoms || item.item_uoms.length === 0) {
					const cachedUoms = getItemUOMs(item.item_code);
					if (cachedUoms.length > 0) {
						item.item_uoms = cachedUoms;
					} else if (isOffline()) {
						item.item_uoms = [{ uom: item.stock_uom, conversion_factor: 1.0 }];
					} else {
						allCached = false;
					}
				}
			});

			// When offline or everything is cached, skip server call
			if (isOffline() || allCached) {
				vm.itemDetailsRetryCount = 0;
				flushBaseRecords();
				vm.recomputeAvailabilityForCodes(affectedCodes);
				return;
			}

			const itemsToFetch = items.filter(
				(it) => cacheResult.missing.includes(it.item_code) && !it.has_variants,
			);

			if (itemsToFetch.length === 0) {
				vm.itemDetailsRetryCount = 0;
				flushBaseRecords();
				vm.recomputeAvailabilityForCodes(affectedCodes);
				return;
			}

			try {
				const details = await vm.fetchItemDetails(itemsToFetch);
				if (details && details.length) {
					vm.itemDetailsRetryCount = 0;
					let qtyChanged = false;
					let updatedItems = [];

					items.forEach((item) => {
						const updated_item = details.find((element) => element.item_code == item.item_code);
						if (updated_item) {
							const prev_qty = item.actual_qty;

							updatedItems.push({
								item: item,
								updates: {
									actual_qty: updated_item.actual_qty,
									has_batch_no: updated_item.has_batch_no,
									has_serial_no: updated_item.has_serial_no,
									batch_no_data:
										updated_item.batch_no_data && updated_item.batch_no_data.length > 0
											? updated_item.batch_no_data
											: item.batch_no_data,
									serial_no_data:
										updated_item.serial_no_data && updated_item.serial_no_data.length > 0
											? updated_item.serial_no_data
											: item.serial_no_data,
									item_uoms:
										updated_item.item_uoms && updated_item.item_uoms.length > 0
											? updated_item.item_uoms
											: item.item_uoms,
									rate: updated_item.rate !== undefined ? updated_item.rate : item.rate,
									price_list_rate:
										updated_item.price_list_rate !== undefined
											? updated_item.price_list_rate
											: item.price_list_rate,
									currency: updated_item.currency || item.currency,
								},
							});

							if (prev_qty > 0 && updated_item.actual_qty === 0) {
								qtyChanged = true;
							}

							if (updated_item.item_uoms && updated_item.item_uoms.length > 0) {
								saveItemUOMs(item.item_code, updated_item.item_uoms);
							}
						}
					});

					updatedItems.forEach(({ item, updates }) => {
						Object.assign(item, updates);
						vm.captureBaseAvailability(item, updates.actual_qty);
						if (updates.actual_qty !== undefined && updates.actual_qty !== null) {
							baseRecords.set(item.item_code, updates.actual_qty);
						}
						vm.indexItem(item);
						vm.applyCurrencyConversionToItem(item);
					});

					updateLocalStockCache(details);
					saveItemDetailsCache(vm.pos_profile.name, vm.active_price_list, details);

					if (
						vm.pos_profile &&
						vm.pos_profile.posa_local_storage &&
						vm.storageAvailable &&
						!vm.usesLimitSearch
					) {
						try {
							await saveItemsBulk(details);
						} catch (e) {
							console.error("Failed to persist item details", e);
							vm.markStorageUnavailable && vm.markStorageUnavailable();
						}
					}

					if (qtyChanged) {
						vm.$forceUpdate();
					}
				}
			} catch (err) {
				const isTimeout = err.message === "Request timed out";
				if (err.name !== "AbortError") {
					console.error("Error fetching item details:", err);
					items.forEach((item) => {
						const localQty = getLocalStock(item.item_code);
						if (localQty !== null) {
							item.actual_qty = localQty;
							vm.captureBaseAvailability(item, localQty);
							baseRecords.set(item.item_code, localQty);
						}
						if (!item.item_uoms || item.item_uoms.length === 0) {
							const cached = getItemUOMs(item.item_code);
							if (cached.length > 0) {
								item.item_uoms = cached;
							}
						}
					});

					if (!isOffline() && !isTimeout) {
						vm.itemDetailsRetryCount += 1;
						const delay = Math.min(32000, 1000 * Math.pow(2, vm.itemDetailsRetryCount - 1));
						vm.itemDetailsRetryTimeout = setTimeout(() => {
							vm.update_items_details(items);
						}, delay);
					}
				}
			}

			// Cleanup on component destroy
			this.cleanupBeforeDestroy = () => {
				if (vm.abortController) {
					vm.abortController.abort();
				}
			};

			flushBaseRecords();
			vm.recomputeAvailabilityForCodes(affectedCodes);
		},
		update_cur_items_details() {
			if (this.displayedItems && this.displayedItems.length > 0) {
				this.update_items_details(this.displayedItems);
			}
		},
		async prePopulateStockCache(items) {
			if (this.prePopulateInProgress) {
				return;
			}
			if (!Array.isArray(items) || items.length === 0) {
				return;
			}
			this.prePopulateInProgress = true;
			try {
				const cache = getLocalStockCache();
				const cacheSize = Object.keys(cache).length;

				if (isStockCacheReady() && cacheSize >= items.length) {
					console.debug("Stock cache already initialized");
					return;
				}

				if (items.length > 500) {
					console.info("Pre-populating stock cache for", items.length, "items in batches");
				} else {
					console.info("Pre-populating stock cache for", items.length, "items");
				}

				await initializeStockCache(items, this.pos_profile);
			} catch (error) {
				console.error("Failed to pre-populate stock cache:", error);
			} finally {
				this.prePopulateInProgress = false;
			}
		},

		applyCurrencyConversionToItems() {
			if (!this.items || !this.items.length) return;
			this.items.forEach((it) => this.applyCurrencyConversionToItem(it));
		},

		_getPlcToCompanyRate(item) {
			const companyCurrency = this.pos_profile.currency;
			const priceListCurrency = this.price_list_currency || companyCurrency;
			// Benchmark note: favor item-level plc_conversion_rate to avoid recomputing PLC->CC.
			return (
				item.plc_conversion_rate ??
				(priceListCurrency === companyCurrency
					? 1
					: (this.exchange_rate || 1) * (this.conversion_rate || 1))
			);
		},

		applyCurrencyConversionToItem(item) {
			if (!item) return;
			const base = this.pos_profile.currency;

			if (!item.original_rate) {
				item.original_rate = item.rate;
				item.original_currency = item.currency || base;
			}

			// original_rate is in price list currency
			const price_list_rate = item.original_rate;

			// Determine base rate using available conversion info (Price List -> Company)
			const plc_to_cc_rate = this._getPlcToCompanyRate(item);
			const base_rate = price_list_rate * plc_to_cc_rate;

			item.base_rate = base_rate;
			item.base_price_list_rate = base_rate;

			// Determine selected rate using exchange rate (Price List -> Selected)
			// item.original_currency is the Price List Currency
			const priceListCurrency = this.price_list_currency || base;
			const selectedCurrency = this.selected_currency;
			// Benchmark note: when PLC === SC, keep the displayed rate in PLC to avoid CC bleed-through.
			const converted_rate =
				selectedCurrency === priceListCurrency
					? price_list_rate
					: item.original_currency === selectedCurrency
						? price_list_rate
						: price_list_rate * (this.exchange_rate || 1);

			item.rate = this.flt(converted_rate, this.currency_precision);
			item.currency = selectedCurrency;
			item.price_list_rate = item.rate;
		},
		scan_barcoud() {
			const vm = this;
			try {
				// Check if scanner is already attached to document
				if (document._scannerAttached) {
					return;
				}

				onScan.attachTo(document, {
					suffixKeyCodes: [],
					keyCodeMapper: function (oEvent) {
						oEvent.stopImmediatePropagation();
						oEvent.preventDefault();
						return onScan.decodeKeyEvent(oEvent);
					},
					onScan: function (sCode) {
						if (vm.scannerLocked) {
							vm.playScanTone("error");
							return;
						}
						vm.trigger_onscan(sCode);
					},
				});

				// Mark document as having scanner attached
				document._scannerAttached = true;
			} catch (error) {
				console.warn("Scanner initialization error:", error.message);
			}
		},
		trigger_onscan(sCode) {
			if (this.scannerLocked) {
				this.playScanTone("error");
				return;
			}
			// indicate this search came from a scanner
			this.search_from_scanner = true;
			// apply scanned code as search term
			this.first_search = sCode;
			this.search = sCode;
			this.pendingScanCode = sCode;

			this.$nextTick(() => {
				if (this.displayedItems.length == 0) {
					this.toastStore.show({
						title: `No Item has this barcode "${sCode}"`,
						color: "error",
					});
					this.showScanError({
						message: `${this.__("Item not found")}: ${sCode}`,
						code: sCode,
						details: this.__("Please verify the barcode or search manually."),
					});
				} else {
					this.enter_event(sCode);
				}

				// clear search field for next scan and refocus input
				if (!this.scanErrorDialog) {
					this.clearSearch();
					this.focusItemSearch();
				}
			});
		},
		generateWordCombinations(inputString) {
			const words = inputString.split(" ");
			const wordCount = words.length;
			const combinations = [];

			// Helper function to generate all permutations
			function permute(arr, m = []) {
				if (arr.length === 0) {
					combinations.push(m.join(" "));
				} else {
					for (let i = 0; i < arr.length; i++) {
						const current = arr.slice();
						const next = current.splice(i, 1);
						permute(current.slice(), m.concat(next));
					}
				}
			}

			permute(words);

			return combinations;
		},
		clearSearch() {
			this.resetKeyboardScanDetection();
			if (this.clearingSearch) {
				return;
			}

			const hadQuery = Boolean(
				(this.first_search && this.first_search.trim()) || (this.search && this.search.trim()),
			);
			const shouldReload = hadQuery || !this.itemsLoaded || !this.items.length;

			this.search_backup = this.first_search;
			this.clearingSearch = true;
			this.search_input = "";
			this.first_search = "";
			this.search = "";

			const release = () => {
				this.$nextTick(() => {
					this.clearingSearch = false;
				});
			};

			if (this.usesLimitSearch) {
				const preservedItems =
					this.clearLimitSearchResults({ preserveItems: true }) || this.items || [];
				this.resetBarcodeIndex();

				if (Array.isArray(preservedItems) && preservedItems.length) {
					this.eventBus.emit("set_all_items", preservedItems);
				} else if (Array.isArray(this.items) && this.items.length) {
					this.eventBus.emit("set_all_items", this.items);
				}

				if (shouldReload) {
					this.eventBus.emit("data-load-progress", { name: "items", progress: 0 });
					const reloadPromise = this.get_items(true);
					if (reloadPromise && typeof reloadPromise.finally === "function") {
						reloadPromise.finally(release);
						return reloadPromise;
					}
				}

				release();
				return;
			}

			if (!shouldReload) {
				release();
				return;
			}

			if (this.pos_profile?.posa_local_storage && this.storageAvailable) {
				this.loadVisibleItems(true);
				if (!this.isBackgroundLoading) {
					this.verifyServerItemCount();
				}
				release();
				return;
			}

			if (this.isBackgroundLoading) {
				if (this.pendingGetItems) {
					this.pendingGetItems.force_server = this.pendingGetItems.force_server || false;
				} else {
					this.pendingGetItems = { force_server: false };
				}
				release();
				return;
			}

			if (!this.itemsLoaded || !this.items.length) {
				this.get_items(true);
			} else {
				this.eventBus.emit("set_all_items", this.items);
			}

			release();
		},

		restoreSearch() {
			if (this.first_search === "") {
				this.first_search = this.search_backup;
				this.search = this.search_backup;
				// No need to reload items when focus is lost
			}
		},
		handleItemSearchFocus() {
			this.search_input = "";
		},

		focusItemSearch() {
			if (this.cameraScannerActive) {
				return;
			}
			this.$nextTick(() => {
				if (this.cameraScannerActive) {
					return;
				}
				if (this.showManualScanInput) {
					this.queueManualScanFocus();
					return;
				}
				const input = this.getSearchInputField();
				if (input && typeof input.focus === "function") {
					input.focus();
				}
			});
		},

		blurItemSearch() {
			const input = this.getSearchInputField();
			if (input && typeof input.blur === "function") {
				input.blur();
			}
		},
		getSearchInputField() {
			// Benchmark: use exposed ref to avoid DOM querying for focus/blur actions.
			const header = this.$refs.itemHeader;
			const inputRef = header?.debounce_search;
			return inputRef?.value ?? inputRef ?? null;
		},

		clearQty() {
			this.qty = null;
		},

		ensureScanAudioContext() {
			if (typeof window === "undefined") {
				return null;
			}
			if (!this.scanAudioContext) {
				const AudioContext = window.AudioContext || window.webkitAudioContext;
				if (!AudioContext) {
					return null;
				}
				this.scanAudioContext = new AudioContext();
			}
			if (this.scanAudioContext?.state === "suspended") {
				this.scanAudioContext.resume().catch(() => {});
			}
			return this.scanAudioContext;
		},
		playScanTone(type = "success") {
			if (typeof window === "undefined") {
				return;
			}
			try {
				const ctx = this.ensureScanAudioContext();
				if (!ctx) {
					if (frappe?.utils?.play_sound) {
						frappe.utils.play_sound(type === "success" ? "submit" : "error");
					}
					return;
				}
				const now = ctx.currentTime;
				const duration = type === "success" ? 0.16 : 0.35;
				const oscillator = ctx.createOscillator();
				const gainNode = ctx.createGain();
				oscillator.type = "sine";
				oscillator.frequency.value = type === "success" ? 880 : 220;
				gainNode.gain.setValueAtTime(type === "success" ? 0.18 : 0.28, now);
				gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
				oscillator.connect(gainNode);
				gainNode.connect(ctx.destination);
				oscillator.start(now);
				oscillator.stop(now + duration);
			} catch (error) {
				console.warn("Scan tone playback failed:", error);
				if (frappe?.utils?.play_sound) {
					frappe.utils.play_sound(type === "success" ? "submit" : "error");
				}
			}
		},
		showScanError({ message, code = "", details = "" } = {}) {
			this.scanErrorMessage = message || this.__("Unable to add scanned item.");
			this.scanErrorCode = code;
			this.scanErrorDetails = details;
			if (code) {
				this.pendingScanCode = code;
			}
			this.awaitingScanResult = false;
			this.search_from_scanner = false;
			this.scanErrorDialog = true;
			this.scannerLocked = true;
			if (this.$refs.cameraScanner?.pauseForExternalLock) {
				this.$refs.cameraScanner.pauseForExternalLock();
			}
			this.playScanTone("error");
			if (frappe?.show_alert) {
				frappe.show_alert(
					{
						message: this.scanErrorMessage,
						indicator: "red",
					},
					5,
				);
			}
		},
		handleScanPipelineError(error, code = "") {
			const normalizedCode = code || this.pendingScanCode || "";
			console.error("Unexpected barcode processing error:", error);
			const details =
				error && typeof error.message === "string" && error.message.trim()
					? error.message
					: this.__("Please try again or enter the item manually.");
			this.showScanError({
				message: this.__("Unable to add scanned item."),
				code: normalizedCode,
				details,
			});
		},
		acknowledgeScanError() {
			this.scanErrorDialog = false;
			this.scannerLocked = false;
			this.scanErrorMessage = "";
			this.scanErrorCode = "";
			this.scanErrorDetails = "";
			this.pendingScanCode = "";
			this.awaitingScanResult = false;
			if (this.$refs.cameraScanner?.resumeFromExternalLock) {
				this.$refs.cameraScanner.resumeFromExternalLock();
			}
			this.clearSearch();
			this.focusItemSearch();
		},

		onScannerOpened() {
			this.cameraScannerActive = true;
			this.blurItemSearch();
		},

		onScannerClosed() {
			this.cameraScannerActive = false;
			this.focusItemSearch();
		},

		startCameraScanning() {
			if (this.scannerLocked) {
				this.playScanTone("error");
				return;
			}
			if (this.$refs.cameraScanner) {
				this.$refs.cameraScanner.startScanning();
			}
		},
		onBarcodeScanned(scannedCode) {
			this.resetKeyboardScanDetection();
			if (this.scannerLocked) {
				this.playScanTone("error");
				if (frappe?.show_alert) {
					frappe.show_alert(
						{
							message: this.__("Acknowledge the error to resume scanning."),
							indicator: "red",
						},
						3,
					);
				}
				return;
			}

			if (this.search_onchange.cancel) {
				this.search_onchange.cancel();
			}

			// Clear the search field immediately to allow for rapid scanning
			this.search_input = "";

			const runScanPipeline = async (code) => {
				const mark = perfMarkStart("pos:scan-handler");
				try {
					console.log("Barcode scanned:", code);
					this.pendingScanCode = code;

					// mark this search as coming from a scanner
					this.search_from_scanner = true;

					// Show scanning feedback
					if (this.eventBus?.emit) {
						this.toastStore.show({
							title: this.__("Scanning for: {0}", [code]),
							summary: this.__("Scanning items"),
							detail: code,
							color: "info",
							timeout: 2000,
							groupId: "scanner-progress",
						});
					} else if (frappe?.show_alert) {
						frappe.show_alert(
							{
								message: `Scanning for: ${code}`,
								indicator: "blue",
							},
							2,
						);
					}

					// Enhanced item search and submission logic
					await this.processScannedItem(code);
				} catch (error) {
					this.handleScanPipelineError(error, code);
				} finally {
					perfMarkEnd("pos:scan-handler", mark);
				}
			};

			if (this.scanDebounceId) {
				clearTimeout(this.scanDebounceId);
			}
			this.scanQueuedCode = scannedCode;
			this.scanDebounceId = setTimeout(() => {
				this.scanDebounceId = null;
				const code = this.scanQueuedCode || scannedCode;
				this.scanQueuedCode = "";
				scheduleFrame(() => {
					const maybePromise = runScanPipeline(code);
					if (maybePromise && typeof maybePromise.catch === "function") {
						maybePromise.catch((error) => {
							this.handleScanPipelineError(error, code);
						});
					}
				});
			}, 12);
		},
		handleSearchPaste(event) {
			if (!event || !event.clipboardData) {
				return;
			}

			const pastedText = event.clipboardData.getData("text");
			if (!pastedText) {
				return;
			}

			const sanitized = pastedText.replace(/\s+/g, "").trim();

			if (!sanitized) {
				event.preventDefault();
				return;
			}

			if (!/^\d+$/.test(sanitized) || sanitized.length < this.keyboardScanMinLength) {
				return;
			}

			event.preventDefault();

			this.search_input = sanitized;

			this.$nextTick(() => {
				this.onBarcodeScanned(sanitized);
			});
		},
		handleSearchInput(event) {
			const value =
				event && event.target && typeof event.target.value === "string"
					? event.target.value
					: typeof event === "string"
						? event
						: "";

			this.keyboardScanPendingValue = value;

			if (!value) {
				this.resetKeyboardScanDetection();
				return;
			}

			if (!/^\d+$/.test(value)) {
				this.resetKeyboardScanDetection();
				return;
			}

			if (this.keyboardScanBuffer && value.length < this.keyboardScanBuffer.length) {
				this.resetKeyboardScanDetection();
			}
		},
		handleSearchKeydown(event) {
			if (!event) {
				return;
			}

			const key = event.key || "";

			if (key === "ArrowDown" || key === "ArrowUp") {
				event.preventDefault();
				this.navigateHighlightedItem(key === "ArrowDown" ? 1 : -1);
				return;
			}

			if (key === "Enter" || key === "Escape") {
				return;
			}

			if (event.metaKey || event.ctrlKey || event.altKey) {
				this.resetKeyboardScanDetection();
				return;
			}

			if (!/^\d$/.test(key)) {
				this.resetKeyboardScanDetection();
				return;
			}

			if (!this.isSearchFieldPrimedForScan()) {
				this.resetKeyboardScanDetection();
				return;
			}

			const now =
				typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

			if (this.keyboardScanLastTime && now - this.keyboardScanLastTime > this.keyboardScanMaxInterval) {
				this.keyboardScanBuffer = "";
				this.keyboardScanStartTime = now;
			}

			if (!this.keyboardScanBuffer) {
				this.keyboardScanStartTime = now;
			}

			this.keyboardScanBuffer += key;
			this.keyboardScanLastTime = now;

			if (this.keyboardScanTimer) {
				clearTimeout(this.keyboardScanTimer);
			}

			this.keyboardScanTimer = setTimeout(() => {
				this.evaluateKeyboardScan();
			}, this.keyboardScanProcessingDelay);
		},
		isSearchFieldPrimedForScan() {
			if (!this.search_input) {
				return true;
			}
			return /^\d*$/.test(this.search_input);
		},
		evaluateKeyboardScan() {
			if (this.keyboardScanTimer) {
				clearTimeout(this.keyboardScanTimer);
				this.keyboardScanTimer = null;
			}

			const code = (this.keyboardScanPendingValue || this.search_input || "").trim();

			const now =
				typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
			const duration = this.keyboardScanStartTime ? now - this.keyboardScanStartTime : 0;

			if (this.isLikelyKeyboardScan(code, duration)) {
				this.resetKeyboardScanDetection();
				if (code) {
					this.onBarcodeScanned(code);
				}
				return;
			}

			this.resetKeyboardScanDetection();
		},
		isLikelyKeyboardScan(code, duration) {
			if (!code || !/^\d+$/.test(code)) {
				return false;
			}

			if (code.length < this.keyboardScanMinLength) {
				return false;
			}

			if (!duration || duration <= 0) {
				return true;
			}

			if (
				this.keyboardScanMaxDuration &&
				typeof this.keyboardScanMaxDuration === "number" &&
				duration > this.keyboardScanMaxDuration
			) {
				return false;
			}

			const averageInterval = duration / code.length;
			return averageInterval <= this.keyboardScanMaxInterval;
		},
		resetKeyboardScanDetection() {
			if (this.keyboardScanTimer) {
				clearTimeout(this.keyboardScanTimer);
				this.keyboardScanTimer = null;
			}
			this.keyboardScanBuffer = "";
			this.keyboardScanLastTime = 0;
			this.keyboardScanStartTime = 0;
			this.keyboardScanPendingValue = "";
		},
		clearHighlightedItem() {
			this.highlightedIndex = -1;
			this.highlightedItemCode = null;
		},
		syncHighlightedItem() {
			if (!Array.isArray(this.displayedItems) || this.displayedItems.length === 0) {
				this.clearHighlightedItem();
				return;
			}

			if (this.highlightedItemCode) {
				const index = this.displayedItems.findIndex(
					(item) => item && item.item_code === this.highlightedItemCode,
				);
				if (index >= 0) {
					this.highlightedIndex = index;
					return;
				}
			}

			this.clearHighlightedItem();
		},
		navigateHighlightedItem(direction) {
			if (!Array.isArray(this.displayedItems) || this.displayedItems.length === 0) {
				this.clearHighlightedItem();
				return;
			}

			let nextIndex = this.highlightedIndex;
			if (nextIndex < 0) {
				nextIndex = direction > 0 ? 0 : this.displayedItems.length - 1;
			} else {
				nextIndex += direction;
			}

			if (nextIndex < 0) {
				nextIndex = 0;
			}

			if (nextIndex >= this.displayedItems.length) {
				nextIndex = this.displayedItems.length - 1;
			}

			const nextItem = this.displayedItems[nextIndex];
			if (!nextItem) {
				this.clearHighlightedItem();
				return;
			}

			this.highlightedIndex = nextIndex;
			this.highlightedItemCode = nextItem.item_code || null;
			this.scrollHighlightedItemIntoView(nextIndex);
		},
		scrollHighlightedItemIntoView(index) {
			this.$nextTick(() => {
				if (this.items_view === "card") {
					this.$refs.itemsContainer?.scrollToItem?.(index);
					return;
				}

				const tableRef = this.$refs.itemsTable;
				const scrollToIndex = tableRef?.scrollToIndex || tableRef?.$?.exposed?.scrollToIndex || null;
				if (scrollToIndex) {
					const scheduleScroll =
						typeof requestAnimationFrame === "function"
							? requestAnimationFrame
							: (callback) => setTimeout(callback, 0);
					scheduleScroll(() => {
						scrollToIndex(index);
					});
					return;
				}

				const tableEl = tableRef?.getTableElement?.() || tableRef?.$el || tableRef;
				const wrapper = tableEl?.querySelector?.(".v-table__wrapper");
				const rows = tableEl?.querySelectorAll?.("tbody tr");
				if (wrapper && rows && rows.length > 0) {
					const targetRow = rows[index];
					if (targetRow && typeof targetRow.offsetTop === "number") {
						wrapper.scrollTop = Math.max(0, targetRow.offsetTop - wrapper.clientHeight / 2);
						return;
					}

					const rowHeight = rows[0].getBoundingClientRect().height || 0;
					if (rowHeight > 0) {
						wrapper.scrollTop = rowHeight * index;
						return;
					}
				}

				if (rows && rows[index]) {
					rows[index].scrollIntoView({ block: "nearest" });
				}
			});
		},
		isItemHighlighted(item) {
			const resolvedItem = this.resolveHighlightedItem(item);
			if (!resolvedItem || !this.highlightedItemCode) {
				return false;
			}
			return resolvedItem.item_code === this.highlightedItemCode;
		},
		getItemRowClass(item) {
			return this.isItemHighlighted(item) ? "item-row-highlighted" : "";
		},
		getItemRowProps(item) {
			return this.isItemHighlighted(item) ? { class: "item-row-highlighted" } : {};
		},
		resolveHighlightedItem(item) {
			if (!item || typeof item !== "object") {
				return item;
			}

			if (item.raw) {
				return item.raw;
			}

			if (item.item) {
				return item.item.raw || item.item;
			}

			return item;
		},
		async selectHighlightedItem() {
			if (!Array.isArray(this.displayedItems) || this.displayedItems.length === 0) {
				return;
			}

			const index = this.highlightedIndex;
			if (index < 0 || index >= this.displayedItems.length) {
				return;
			}

			const item = this.displayedItems[index];
			if (!item) {
				return;
			}

			await this.add_item(item);
			this.clearHighlightedItem();
			this.clearSearch();
			this.focusItemSearch();
		},
		async processScannedItem(scannedCode) {
			const mark = perfMarkStart("pos:scan-process");
			this.pendingScanCode = scannedCode;
			await this.ensureScaleBarcodeSettings();
			// Handle scale barcodes by extracting the item code and quantity
			let searchCode = scannedCode;
			let qtyFromBarcode = null;
			let priceFromBarcode = null;
			let scaleResponse = null;

			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.parse_scale_barcode",
					args: { barcode: scannedCode },
				});
				if (res && res.message) {
					scaleResponse = res.message;
				}
			} catch (error) {
				console.error("Failed to parse scale barcode via API:", error);
			}

			if (scaleResponse && scaleResponse.settings) {
				this.updateScaleBarcodeSettings(scaleResponse.settings);
			}

			const configuredPrefix = this.getScaleBarcodePrefix();

			if (
				scaleResponse &&
				configuredPrefix &&
				!String(scannedCode || "").startsWith(configuredPrefix)
			) {
				scaleResponse = null;
				searchCode = scannedCode;
				qtyFromBarcode = null;
				priceFromBarcode = null;
			}

			if (scaleResponse && scaleResponse.item_code) {
				searchCode = scaleResponse.item_code;
				const parsedQty = parseFloat(scaleResponse.qty);
				if (!Number.isNaN(parsedQty)) {
					qtyFromBarcode = parsedQty;
				}
				const parsedPrice = parseFloat(scaleResponse.price);
				if (!Number.isNaN(parsedPrice)) {
					priceFromBarcode = parsedPrice;
				}
			} else if (this.scaleBarcodeMatches(scannedCode)) {
				searchCode = this.get_search(scannedCode);
				qtyFromBarcode = parseFloat(this.get_item_qty(scannedCode));
			}

			// First try to find exact match by processed code using the pre-built index
			const barcodeIndex = this.ensureBarcodeIndex();
			let foundItem = this.lookupItemByBarcode(searchCode);

			if (!foundItem && barcodeIndex.size === 0) {
				// Index not populated yet, build it and fall back to a direct scan once
				this.replaceBarcodeIndex(this.items);
				foundItem = this.items.find((item) => {
					const barcodeMatch =
						item.barcode === searchCode ||
						(Array.isArray(item.item_barcode) &&
							item.item_barcode.some((b) => b.barcode === searchCode)) ||
						(Array.isArray(item.barcodes) &&
							item.barcodes.some((bc) => String(bc) === searchCode));
					return barcodeMatch || item.item_code === searchCode;
				});
			}

			if (foundItem) {
				console.log("Found item by processed code:", foundItem);
				await this.addScannedItemToInvoice(foundItem, searchCode, qtyFromBarcode, priceFromBarcode);
				return;
			}

			// If not found locally, attempt to fetch from server using processed code
			try {
				let newItem = null;
				if (qtyFromBarcode !== null) {
					// Scale barcodes use a direct, faster lookup
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_item_detail",
						args: {
							item: JSON.stringify({ item_code: searchCode }),
							warehouse: this.pos_profile.warehouse,
							price_list: this.active_price_list,
							company: this.pos_profile.company,
						},
					});
					if (res && res.message) {
						newItem = res.message;
					}
				} else {
					// Regular barcodes and searches use the generic search
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_items",
						args: {
							pos_profile: this.pos_profile,
							price_list: this.active_price_list,
							search_value: searchCode,
						},
					});

					if (res && res.message && res.message.length > 0) {
						newItem = res.message[0];
					}
				}

				if (newItem) {
					this.items.push(newItem);
					this.indexItem(newItem);

					if (this.searchCache) {
						this.searchCache.clear();
					}

					await saveItems(this.items);
					await savePriceListItems(this.customer_price_list, this.items);
					this.eventBus.emit("set_all_items", this.items);
					await this.update_items_details([newItem]);
					await this.addScannedItemToInvoice(newItem, searchCode, qtyFromBarcode, priceFromBarcode);
					return;
				}

				this.first_search = scannedCode;
				this.search = scannedCode;
				this.showScanError({
					message: `${this.__("Item not found")}: ${scannedCode}`,
					code: scannedCode,
					details: this.__("Please verify the barcode or check the item's availability."),
				});
				return;
			} catch (e) {
				console.error("Error fetching item from barcode:", e);
				this.first_search = scannedCode;
				this.search = scannedCode;
				this.showScanError({
					message: `${this.__("Item not found")}: ${scannedCode}`,
					code: scannedCode,
					details: this.__("The system could not retrieve the item details. Please try again."),
				});
				return;
			} finally {
				perfMarkEnd("pos:scan-process", mark);
			}
		},
		searchItemsByCode(code) {
			return this.items.filter((item) => {
				const searchTerm = code.toLowerCase();
				const barcodeMatch =
					(item.barcode && item.barcode.toLowerCase().includes(searchTerm)) ||
					(Array.isArray(item.barcodes) &&
						item.barcodes.some((bc) => String(bc).toLowerCase().includes(searchTerm))) ||
					(Array.isArray(item.item_barcode) &&
						item.item_barcode.some(
							(b) => b.barcode && b.barcode.toLowerCase().includes(searchTerm),
						));
				return (
					item.item_code.toLowerCase().includes(searchTerm) ||
					item.item_name.toLowerCase().includes(searchTerm) ||
					barcodeMatch
				);
			});
		},
		// PERF: maintain a barcode index so unfound scans do not walk the full list
		ensureBarcodeIndex() {
			if (!this.barcodeIndex || typeof this.barcodeIndex.set !== "function") {
				this.barcodeIndex = new Map();
			}
			return this.barcodeIndex;
		},
		resetBarcodeIndex() {
			const index = this.ensureBarcodeIndex();
			index.clear();
		},
		indexItem(item) {
			if (!item) {
				return;
			}
			const index = this.ensureBarcodeIndex();
			const register = (code) => {
				if (code === undefined || code === null) {
					return;
				}
				const normalized = String(code).trim();
				if (!normalized) {
					return;
				}
				if (!index.has(normalized)) {
					index.set(normalized, item);
				}
				const lower = normalized.toLowerCase();
				if (!index.has(lower)) {
					index.set(lower, item);
				}
			};
			register(item.item_code);
			register(item.barcode);
			if (Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((barcode) => register(barcode?.barcode));
			}
			if (Array.isArray(item.barcodes)) {
				item.barcodes.forEach((barcode) => register(barcode));
			}
			if (Array.isArray(item.serial_no_data)) {
				item.serial_no_data.forEach((serial) => register(serial?.serial_no));
			}
			if (Array.isArray(item.batch_no_data)) {
				item.batch_no_data.forEach((batch) => register(batch?.batch_no));
			}
		},
		replaceBarcodeIndex(items = this.items) {
			this.resetBarcodeIndex();
			items.forEach((item) => this.indexItem(item));
		},
		lookupItemByBarcode(code) {
			if (code === undefined || code === null) {
				return null;
			}
			const index = this.ensureBarcodeIndex();
			const normalized = String(code).trim();
			if (!normalized) {
				return null;
			}
			return index.get(normalized) || index.get(normalized.toLowerCase()) || null;
		},
		async addScannedItemToInvoice(item, scannedCode, qtyFromBarcode = null, priceFromBarcode = null) {
			console.log("Adding scanned item to invoice:", item, scannedCode);

			// Clone the item to avoid mutating list data
			const newItem = { ...item };

			// If the scanned barcode has a specific UOM, apply it
			if (Array.isArray(newItem.item_barcode)) {
				const barcodeMatch = newItem.item_barcode.find((b) => b.barcode === scannedCode);
				if (barcodeMatch && barcodeMatch.posa_uom) {
					newItem.uom = barcodeMatch.posa_uom;

					// Try fetching the rate for this UOM from the active price list
					try {
						const res = await frappe.call({
							method: "posawesome.posawesome.api.items.get_price_for_uom",
							args: {
								item_code: newItem.item_code,
								price_list: this.active_price_list,
								uom: barcodeMatch.posa_uom,
							},
						});

						const uomInfo =
							newItem.item_uoms &&
							newItem.item_uoms.find((u) => u.uom === barcodeMatch.posa_uom);
						const conversionFactor =
							uomInfo && uomInfo.conversion_factor
								? parseFloat(uomInfo.conversion_factor)
								: null;
						const currentConversion = newItem.conversion_factor || 1;
						const baseUnitRate =
							parseFloat(
								(newItem.base_price_list_rate ||
									newItem.base_rate ||
									newItem.price_list_rate ||
									newItem.rate ||
									0) / (currentConversion || 1),
							) || 0;

						if (res.message) {
							const price = parseFloat(res.message);
							newItem.rate = price;
							newItem.price_list_rate = price;
							const basePrice = conversionFactor ? price / conversionFactor : price;
							newItem.base_rate = basePrice;
							newItem.base_price_list_rate = basePrice;
							if (conversionFactor) {
								newItem.conversion_factor = conversionFactor;
							}
							newItem._manual_rate_set = true;
							newItem.skip_force_update = true;
						} else if (conversionFactor) {
							const newPrice = baseUnitRate * conversionFactor;

							newItem.rate = newPrice;
							newItem.price_list_rate = newPrice;
							newItem.base_rate = baseUnitRate;
							newItem.base_price_list_rate = baseUnitRate;
							newItem.conversion_factor = conversionFactor;
							newItem._manual_rate_set = true;
							newItem.skip_force_update = true;
						}
					} catch (e) {
						console.error("Failed to fetch UOM price", e);
					}
				}
			}

			let effectiveQty = qtyFromBarcode;
			if (
				(effectiveQty === null || Number.isNaN(effectiveQty)) &&
				newItem._scale_qty !== undefined &&
				newItem._scale_qty !== null
			) {
				const parsedScaleQty = parseFloat(newItem._scale_qty);
				if (!Number.isNaN(parsedScaleQty)) {
					effectiveQty = parsedScaleQty;
				}
			}

			// Apply quantity from scale barcode if available
			if (effectiveQty !== null && !Number.isNaN(effectiveQty)) {
				newItem.qty = effectiveQty;
				newItem._barcode_qty = true;
			}

			let effectivePrice = priceFromBarcode;
			if (
				(effectivePrice === null || Number.isNaN(effectivePrice)) &&
				newItem._scale_price !== undefined &&
				newItem._scale_price !== null
			) {
				const parsedScalePrice = parseFloat(newItem._scale_price);
				if (!Number.isNaN(parsedScalePrice)) {
					effectivePrice = parsedScalePrice;
				}
			}

			if (effectivePrice !== null && !Number.isNaN(effectivePrice)) {
				const parsedPrice = parseFloat(effectivePrice);
				if (!Number.isNaN(parsedPrice)) {
					newItem.rate = parsedPrice;
					newItem.price_list_rate = parsedPrice;
					newItem.base_rate = parsedPrice;
					newItem.base_price_list_rate = parsedPrice;
					newItem._manual_rate_set = true;
					newItem.skip_force_update = true;
				}
			}

			const requestedQtyRaw =
				qtyFromBarcode !== null && !isNaN(qtyFromBarcode) ? qtyFromBarcode : (newItem.qty ?? 1);
			const requestedQty = Math.abs(requestedQtyRaw || 1);
			const availableQty =
				typeof newItem.available_qty === "number"
					? newItem.available_qty
					: typeof newItem.actual_qty === "number"
						? newItem.actual_qty
						: null;

			if (availableQty !== null && availableQty < requestedQty) {
				const formattedAvailable = this.format_number
					? this.format_number(availableQty, this.hide_qty_decimals ? 0 : this.float_precision)
					: availableQty;
				const formattedRequested = this.format_number
					? this.format_number(requestedQty, this.hide_qty_decimals ? 0 : this.float_precision)
					: requestedQty;
				const negativeStockEnabled = this.isNegativeStockEnabled(newItem);
				const exceedsAvailable = availableQty < requestedQty;
				const shouldBlock =
					(this.blockSaleBeyondAvailableQty && exceedsAvailable) ||
					(!negativeStockEnabled && exceedsAvailable);

				if (shouldBlock) {
					this.showScanError({
						message: formatStockShortageError(
							newItem.item_name || newItem.item_code || scannedCode,
							availableQty,
							requestedQty,
						),
						code: scannedCode,
						details: this.__("Adjust the quantity or enable negative stock to continue."),
					});
					return;
				}

				// Suppress low stock notifications when negative stock is allowed
			}

			this.awaitingScanResult = true;

			try {
				// Use existing add_item method with enhanced feedback
				await this.add_item(newItem, {
					suppressNegativeWarning: true,
					skipNotification: true,
				});
				this.playScanTone("success");
				this.scannerLocked = false;
				this.search_from_scanner = false;
				this.pendingScanCode = "";

				// Show success message
				const itemName = newItem.item_name || newItem.item_code || scannedCode || this.__("Item");
				const rawPrecision = Number(this.float_precision);
				const precision = Number.isInteger(rawPrecision) ? Math.min(Math.max(rawPrecision, 0), 6) : 2;
				const displayQty = Number.isInteger(requestedQty)
					? requestedQty
					: Number(requestedQty.toFixed(precision));

				if (this.eventBus?.emit) {
					this.toastStore.show({
						title: this.__("Item {0} added to invoice", [itemName]),
						summary: this.__("Items added to invoice"),
						detail: this.__("{0} (Qty: {1})", [itemName, displayQty]),
						color: "success",
						groupId: "invoice-item-added",
					});
				} else if (frappe?.show_alert) {
					frappe.show_alert(
						{
							message: `Added: ${itemName}`,
							indicator: "green",
						},
						3,
					);
				}

				// Clear search after successful addition and refocus input
				this.clearSearch();
				this.focusItemSearch();
			} finally {
				this.awaitingScanResult = false;
			}
		},
		isNegativeStockEnabled(item = null) {
			const allowNegativeSetting = parseBooleanSetting(this.stock_settings?.allow_negative_stock);
			const allowNegativeItem = item ? parseBooleanSetting(item.allow_negative_stock) : false;
			return allowNegativeSetting || allowNegativeItem;
		},
		showMultipleItemsDialog(items, scannedCode) {
			openItemSelectionDialog({
				items,
				scannedCode,
				currency: this.pos_profile.currency,
				formatCurrency: this.format_currency,
				ratePrecision: this.ratePrecision,
				placeholderImage,
				translate: this.__,
				onSelect: (item) => this.addScannedItemToInvoice(item, scannedCode, null, null),
			});
		},
		handleItemNotFound(scannedCode) {
			console.warn("Item not found for scanned code:", scannedCode);

			this.first_search = scannedCode;
			this.search = scannedCode;
			this.showScanError({
				message: `${this.__("Item not found")}: ${scannedCode}`,
				code: scannedCode,
				details: this.__("This barcode could not be matched to any item."),
			});
		},

		currencySymbol(currency) {
			return get_currency_symbol(currency);
		},
		format_currency(value, currency, precision) {
			const prec = typeof precision === "number" ? precision : this.currency_precision;
			return this.formatCurrencyPlain(value, prec);
		},
		ratePrecision(value) {
			const numericValue = typeof value === "string" ? parseFloat(value) : value;
			return Number.isInteger(numericValue) ? 0 : this.currency_precision;
		},
		format_number(value, precision) {
			const prec = typeof precision === "number" ? precision : this.float_precision;
			return this.formatFloatPlain(value, prec);
		},
		hasDecimalPrecision(value) {
			// Check if the value has any decimal precision when converted by exchange rate
			if (this.exchange_rate && this.exchange_rate !== 1) {
				let convertedValue = value * this.exchange_rate;
				return !Number.isInteger(convertedValue);
			}
			return !Number.isInteger(value);
		},

		// Force load quantities for all visible items
		forceLoadQuantities() {
			if (this.displayedItems && this.displayedItems.length > 0) {
				// Set default quantities if not available
				this.displayedItems.forEach((item) => {
					if (item.actual_qty === undefined || item.actual_qty === null) {
						item.actual_qty = 0;
					}
				});
				// Force update quantities from server
				this.update_items_details(this.displayedItems);
			}
		},

		// Ensure all items have quantities set
		ensureAllItemsHaveQuantities() {
			if (this.items && this.items.length > 0) {
				this.items.forEach((item) => {
					if (item.actual_qty === undefined || item.actual_qty === null) {
						item.actual_qty = 0;
					}
				});
			}
			if (this.displayedItems && this.displayedItems.length > 0) {
				this.displayedItems.forEach((item) => {
					if (item.actual_qty === undefined || item.actual_qty === null) {
						item.actual_qty = 0;
					}
				});
			}
		},

		toggleItemSettings() {
			this.temp_hide_qty_decimals = this.hide_qty_decimals;
			this.temp_hide_zero_rate_items = this.hide_zero_rate_items;
			this.temp_enable_custom_items_per_page = this.enable_custom_items_per_page;
			this.temp_items_per_page = this.items_per_page;
			this.temp_force_server_items = !!(this.pos_profile && this.pos_profile.posa_force_server_items);
			this.temp_show_last_invoice_rate = this.show_last_invoice_rate;
			this.temp_enable_background_sync = this.enable_background_sync;
			this.temp_background_sync_interval = this.background_sync_interval;
			this.show_item_settings = true;
		},
		cancelItemSettings() {
			this.show_item_settings = false;
		},
		applyItemSettings() {
			this.hide_qty_decimals = this.temp_hide_qty_decimals;
			this.hide_zero_rate_items = this.temp_hide_zero_rate_items;
			this.show_last_invoice_rate = this.temp_show_last_invoice_rate;
			this.enable_background_sync = this.temp_enable_background_sync;
			this.background_sync_interval = this.normalizeBackgroundSyncInterval(
				this.temp_background_sync_interval,
			);
			this.temp_background_sync_interval = this.background_sync_interval;
			this.enable_custom_items_per_page = this.temp_enable_custom_items_per_page;
			if (this.enable_custom_items_per_page) {
				this.items_per_page = parseInt(this.temp_items_per_page) || 50;
			} else {
				this.items_per_page = 50;
			}
			this.itemsPerPage = this.items_per_page;
			this.pos_profile.posa_force_server_items = this.temp_force_server_items ? 1 : 0;
			this.savePosProfileSetting("posa_force_server_items", this.pos_profile.posa_force_server_items);
			if (!this.show_last_invoice_rate) {
				this.lastInvoiceRates = {};
			} else {
				this.scheduleLastInvoiceRateRefresh();
			}
			this.saveItemSettings();
			this.startBackgroundSyncScheduler();
			this.show_item_settings = false;
		},
		onDragStart(event, item) {
			this.isDragging = true;

			// Set drag data
			event.dataTransfer.setData(
				"application/json",
				JSON.stringify({
					type: "item-from-selector",
					item: item,
				}),
			);

			// Set drag effect
			event.dataTransfer.effectAllowed = "copy";

			// Update store state for feedback
			this.uiStore.setDraggedItem(item);
		},
		onDragEnd(event) {
			this.isDragging = false;
			// Reset store state
			this.uiStore.setDraggedItem(null);
		},
		saveItemSettings() {
			if (!this.localStorageAvailable) return;
			try {
				const settings = {
					hide_qty_decimals: this.hide_qty_decimals,
					hide_zero_rate_items: this.hide_zero_rate_items,
					show_last_invoice_rate: this.show_last_invoice_rate,
					enable_background_sync: this.enable_background_sync,
					background_sync_interval: this.background_sync_interval,
					enable_custom_items_per_page: this.enable_custom_items_per_page,
					items_per_page: this.items_per_page,
				};
				localStorage.setItem("posawesome_item_selector_settings", JSON.stringify(settings));
			} catch (e) {
				console.error("Failed to save item selector settings:", e);
			}
		},
		savePosProfileSetting(field, value) {
			if (!this.pos_profile || !this.pos_profile.name) {
				return;
			}
			frappe.db.set_value("POS Profile", this.pos_profile.name, field, value ? 1 : 0).catch((e) => {
				console.error("Failed to save POS Profile setting", e);
			});
		},
		loadItemSettings() {
			if (!this.localStorageAvailable) return;
			try {
				const saved = localStorage.getItem("posawesome_item_selector_settings");
				if (saved) {
					const opts = JSON.parse(saved);
					if (typeof opts.hide_qty_decimals === "boolean") {
						this.hide_qty_decimals = opts.hide_qty_decimals;
					}
					if (typeof opts.hide_zero_rate_items === "boolean") {
						this.hide_zero_rate_items = opts.hide_zero_rate_items;
					}
					if (typeof opts.show_last_invoice_rate === "boolean") {
						this.show_last_invoice_rate = opts.show_last_invoice_rate;
					}
					if (typeof opts.enable_background_sync === "boolean") {
						this.enable_background_sync = opts.enable_background_sync;
					}
					if (typeof opts.background_sync_interval === "number") {
						this.background_sync_interval = this.normalizeBackgroundSyncInterval(
							opts.background_sync_interval,
						);
					}
					if (typeof opts.enable_custom_items_per_page === "boolean") {
						this.enable_custom_items_per_page = opts.enable_custom_items_per_page;
					}
					if (typeof opts.items_per_page === "number") {
						this.items_per_page = opts.items_per_page;
						this.itemsPerPage = this.items_per_page;
					}
				}
			} catch (e) {
				console.error("Failed to load item selector settings:", e);
			}
		},
		formatBackgroundSyncTime() {
			const lastSync = this.last_background_sync_time;
			if (!lastSync) {
				return __("Never");
			}
			const parsed = new Date(lastSync);
			if (Number.isNaN(parsed.getTime())) {
				return __("Never");
			}
			return parsed.toLocaleTimeString();
		},
		async refreshAllItemDetailsInBatches(batchSize = 100) {
			if (this.background_sync_details_in_flight) {
				return;
			}
			if (!Array.isArray(this.items) || this.items.length === 0) {
				return;
			}

			this.background_sync_details_in_flight = true;
			try {
				for (let start = 0; start < this.items.length; start += batchSize) {
					const chunk = this.items.slice(start, start + batchSize);
					if (chunk.length === 0) {
						break;
					}
					await this.update_items_details(chunk, { forceRefresh: true });
					await scheduleFrame();
				}
			} catch (error) {
				console.error("Failed to refresh all item details in background", error);
			} finally {
				this.background_sync_details_in_flight = false;
			}
		},
		normalizeBackgroundSyncInterval(value) {
			const parsed = parseInt(value, 10);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				return 30;
			}
			return Math.max(10, parsed);
		},
		startBackgroundSyncScheduler() {
			this.stopBackgroundSyncScheduler();
			if (!this.enable_background_sync) {
				return;
			}

			const intervalMs = this.normalizeBackgroundSyncInterval(this.background_sync_interval) * 1000;
			this.background_sync_timer = setInterval(() => {
				this.performBackgroundSync({ source: "interval" });
			}, intervalMs);

			this.performBackgroundSync({ source: "initial" });
		},
		stopBackgroundSyncScheduler() {
			if (this.background_sync_timer) {
				clearInterval(this.background_sync_timer);
				this.background_sync_timer = null;
			}
		},
		async ensureBackgroundSyncBaseline() {
			const lastSync = getItemsLastSync();
			if (lastSync) {
				this.last_background_sync_time = lastSync;
				return lastSync;
			}

			const serverTimestamp = await this.fetchServerItemsTimestamp();
			if (serverTimestamp) {
				setItemsLastSync(serverTimestamp);
				this.last_background_sync_time = serverTimestamp;
				return serverTimestamp;
			}

			return null;
		},
		shouldRunBackgroundSync() {
			if (!this.pos_profile || !this.pos_profile.name) {
				return false;
			}
			if (!this.enable_background_sync) {
				return false;
			}
			if (this.background_sync_in_flight) {
				return false;
			}
			if (isOffline()) {
				return false;
			}
			if (this.usesLimitSearch) {
				return false;
			}
			return true;
		},
		async performBackgroundSync({ source = "manual" } = {}) {
			if (!this.shouldRunBackgroundSync()) {
				return;
			}

			this.background_sync_in_flight = true;
			try {
				// PERF: use modified_after sync to avoid full catalog reloads.
				// Benchmark note: keeps background sync payloads small even for large catalogs.
				await this.ensureBackgroundSyncBaseline();
				const { items: updatedItems } = await this.refreshModifiedItems();

				if (updatedItems && updatedItems.length) {
					await this.update_items_details(updatedItems, { forceRefresh: true });
					this.eventBus.emit("set_all_items", this.items);
				}

				// Refresh cached quantities/prices for all items so non-visible items stay in sync.
				await this.refreshAllItemDetailsInBatches(this.itemsPageLimit || 100);

				if (this.displayedItems && this.displayedItems.length > 0) {
					await this.update_items_details(this.displayedItems);
				}

				this.last_background_sync_time = new Date().toISOString();
			} catch (error) {
				console.error(`Background sync failed (${source})`, error);
			} finally {
				this.background_sync_in_flight = false;
			}
		},
	},

	computed: {
		memoizedFormatCurrency() {
			return (value, currency, precision) => {
				const prec = precision ?? this.currency_precision ?? 2;
				// Handle null/undefined values by defaulting to 0, consistent with format_currency
				const safeValue = value ?? 0;
				const key = `c_${safeValue}_${currency}_${prec}`;
				if (this.formatCache && this.formatCache.has(key)) return this.formatCache.get(key);
				const result = this.format_currency(value, currency, precision);
				if (this.formatCache) {
					this.formatCache.set(key, result);
					if (this.formatCache.size > 2000) this.formatCache.clear();
				}
				return result;
			};
		},
		memoizedFormatNumber() {
			return (value, precision) => {
				const prec = precision ?? this.float_precision ?? 2;
				// Handle null/undefined values by defaulting to 0, consistent with format_number
				const safeValue = value ?? 0;
				const key = `n_${safeValue}_${prec}`;
				if (this.formatCache && this.formatCache.has(key)) return this.formatCache.get(key);
				const result = this.format_number(value, precision);
				if (this.formatCache) {
					this.formatCache.set(key, result);
					if (this.formatCache.size > 2000) this.formatCache.clear();
				}
				return result;
			};
		},
		usesLimitSearch() {
			const rawValue =
				this.pos_profile?.pose_use_limit_search ?? this.pos_profile?.posa_use_limit_search;

			if (typeof rawValue === "string") {
				const normalized = rawValue.trim().toLowerCase();
				return normalized === "1" || normalized === "true" || normalized === "yes";
			}

			if (typeof rawValue === "number") {
				return rawValue === 1;
			}

			return Boolean(rawValue);
		},
		limitSearchCap() {
			if (!this.usesLimitSearch) {
				return null;
			}

			const rawLimit = this.pos_profile?.posa_search_limit;
			const parsed = parseInt(rawLimit, 10);

			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}

			return 500;
		},
		blockSaleBeyondAvailableQty() {
			return parseBooleanSetting(this.pos_profile?.posa_block_sale_beyond_available_qty);
		},
		headers() {
			return this.getItemsHeaders();
		},
		cardColumns() {
			if (this.windowWidth <= 768) {
				return 1;
			}
			if (this.windowWidth <= 1200) {
				return 2;
			}
			return 3;
		},
		cardGap() {
			if (this.windowWidth <= 768) {
				return 10;
			}
			if (this.windowWidth <= 1200) {
				return 12;
			}
			return 16;
		},
		cardPadding() {
			if (this.windowWidth <= 768) {
				return 10;
			}
			if (this.windowWidth <= 1200) {
				return 12;
			}
			return 16;
		},
		cardRowHeight() {
			if (this.windowWidth <= 768) {
				return 260;
			}
			if (this.windowWidth <= 1200) {
				return 280;
			}
			return 300;
		},
		cardSlotHeight() {
			return this.cardRowHeight + this.cardGap;
		},
		cardSlotWidth() {
			return this.cardColumnWidth + this.cardGap;
		},
		cardColumnWidth() {
			const columns = Math.max(1, this.cardColumns);
			const containerWidth = this.cardContainerWidth || 0;
			if (!containerWidth) {
				return 240;
			}

			const gapTotal = this.cardGap * (columns - 1);
			const paddingTotal = this.cardPadding * 2;
			const available = Math.max(0, containerWidth - gapTotal - paddingTotal);
			const width = Math.floor(available / columns);
			return Math.max(180, width);
		},
		displayedItems() {
			// PERF: Avoid unnecessary array cloning ([...this.filteredItems]) as it creates garbage and O(N) cost on every render
			const baseItems = Array.isArray(this.filteredItems) ? this.filteredItems : [];
			const searchTerm = this.get_search(this.first_search).trim().toLowerCase();

			return this.filterAndPaginate(baseItems, {
				searchTerm,
				hideZeroRate: this.hide_zero_rate_items,
				hideVariants: this.pos_profile?.posa_hide_variants_items,
				onlyBarcode: this.showOnlyBarcodeItemsRef,
				limit: this.enable_custom_items_per_page ? this.items_per_page : this.itemsPerPage,
			});
		},
		debounce_qty: {
			get() {
				// Display the raw quantity while typing to avoid forced decimal format
				if (this.qty === null || this.qty === "") return "";
				return this.hide_qty_decimals ? Math.trunc(this.qty) : this.qty;
			},
			set: _.debounce(function (value) {
				let parsed = parseFloat(String(value).replace(/,/g, ""));
				if (isNaN(parsed)) {
					parsed = null;
				}
				if (this.hide_qty_decimals && parsed != null) {
					parsed = Math.trunc(parsed);
				}
				this.qty = parsed;
			}, 200),
		},
		active_price_list() {
			return this.customer_price_list || (this.pos_profile && this.pos_profile.selling_price_list);
		},
		isLoadingOrSyncing() {
			return this.loading || this.isBackgroundLoading || this.refreshInFlight;
		},
	},

	async created() {
		// Performance optimizations - non-reactive caches
		this.searchCache = new Map();
		this.barcodeIndex = new Map();
		this.itemCache = new Map();
		this.lastInvoiceRateCache = new Map();
		this.formatCache = new Map();

		console.log("ItemsSelector created - starting initialization with Pinia store");

		this.stockUnsubscribe = stockCoordinator.subscribe(this.handleStockSnapshotUpdate);

		// Initialize the Pinia store with existing POS profile data
		if (this.pos_profile && this.pos_profile.name) {
			await this.initializeStore(this.pos_profile, this.customer, this.customer_price_list);
			console.log("Pinia store initialized successfully");
		} else {
			// Try to find POS profile from global state if missing in local data
			if (frappe.boot && frappe.boot.pos_profile) {
				this.pos_profile = frappe.boot.pos_profile;
			} else if (window.cur_pos && window.cur_pos.pos_profile) {
				this.pos_profile = window.cur_pos.pos_profile;
			}

			if (this.pos_profile && this.pos_profile.name) {
				await this.initializeStore(this.pos_profile, this.customer, this.customer_price_list);

				// Start workers now that we have profile
				this.startItemWorker();
				this.update_cur_items_details();
				this.startBackgroundSyncScheduler();

				console.log("Pinia store initialized successfully (from global state)");
			}
		}

		// Keep legacy initialization for backward compatibility
		this.replaceBarcodeIndex(this.items || []);

		// Setup search debounce (now handled by store, but keeping for compatibility)
		this.searchDebounce = _.debounce(() => {
			this.get_items();
		}, 300);

		// Load settings
		this.loadItemSettings();
		this.last_background_sync_time = getItemsLastSync();
		await this.ensureScaleBarcodeSettings();

		// Initialize after memory is ready
		memoryInitPromise.then(async () => {
			try {
				// Ensure POS profile is available
				if (!this.pos_profile || !this.pos_profile.name) {
					// Try to get POS profile from boot or current route
					if (frappe.boot && frappe.boot.pos_profile) {
						this.pos_profile = frappe.boot.pos_profile;
					} else if (frappe.router && frappe.router.current_route) {
						// Get from current route context
						const route_context = frappe.router.current_route;
						if (route_context.pos_profile) {
							this.pos_profile = route_context.pos_profile;
						}
					}

					// Final fallback to server/cache
					if (!this.pos_profile || !this.pos_profile.name) {
						this.pos_profile = await ensurePosProfile();
					}

					// Initialize store with fallback profile
					if (this.pos_profile && this.pos_profile.name) {
						await this.initializeStore(this.pos_profile, this.customer, this.customer_price_list);
					}
				}

				// Load initial items if we have a profile (now handled by store)
				if (this.pos_profile && this.pos_profile.name) {
					console.log("Loading items with POS Profile:", this.pos_profile.name);
					this.get_items_groups();
					// Store handles item loading automatically, but keep legacy method for compatibility
					await this.initializeItems();
				} else {
					console.warn("No POS Profile available during initialization");
				}
			} catch (error) {
				console.error("Error during initialization:", error);
			}

			// Start workers if we have profile
			if (this.pos_profile && this.pos_profile.name) {
				this.startItemWorker();
				this.update_cur_items_details();
				this.startBackgroundSyncScheduler();
			}
		});

		// Event listeners - consolidated with store watchers

		// Watch Store for Profile
		this.$watch(
			() => this.uiStore.posProfile,
			async (newProfile) => {
				if (newProfile && newProfile.name) {
					this.pos_profile = newProfile;
					await this.initializeStore(this.pos_profile, this.customer, this.customer_price_list);
					this.startItemWorker();
					this.update_cur_items_details();
					this.startBackgroundSyncScheduler();

					await this.ensureScaleBarcodeSettings(true);
					this.get_items_groups();
					await this.initializeItems();
					this.items_view = this.pos_profile.posa_default_card_view ? "card" : "list";
				}
			},
			{ deep: true, immediate: true },
		);

		// Store Watchers for UI Updates
		this.$watch(
			() => this.uiStore.offersCount,
			(val) => {
				this.offersCount = val;
			},
		);
		this.$watch(
			() => this.uiStore.appliedOffersCount,
			(val) => {
				this.appliedOffersCount = val;
			},
		);
		this.$watch(
			() => this.uiStore.couponsCount,
			(val) => {
				this.couponsCount = val;
			},
		);
		this.$watch(
			() => this.uiStore.appliedCouponsCount,
			(val) => {
				this.appliedCouponsCount = val;
			},
		);

		// Watch Invoice for Quantities
		this.eventBus.on("cart_quantities_updated", this.handleCartQuantitiesUpdated);

		// Watch for Settings Toggle
		this.$watch(
			() => this.uiStore.showItemSettings,
			(val) => {
				this.show_item_settings = val;
			},
		);
		this.$watch(
			() => this.show_item_settings,
			(val) => {
				if (val !== this.uiStore.showItemSettings) {
					this.uiStore.setItemSettings(val);
				}
			},
		);

		// Watch for Top Item Selection
		this.$watch(
			() => this.uiStore.triggerTopItemSelection,
			() => {
				this.selectTopItem();
			},
		);

		// Watch for Force Reload
		this.$watch(
			() => this.uiStore.forceReloadTrigger,
			async () => {
				await this.ensureStorageHealth();
				if (!isOffline()) {
					if (
						this.pos_profile &&
						(!this.pos_profile.posa_local_storage || !this.storageAvailable)
					) {
						await forceClearAllCache();
					}
					await this.get_items(true);
				} else {
					if (
						this.pos_profile &&
						(!this.pos_profile.posa_local_storage || !this.storageAvailable)
					) {
						await forceClearAllCache();
						await this.get_items(true);
					} else {
						await this.get_items();
					}
				}
			},
		);

		// Watch for Stock Adjustments (replacing invoice_stock_adjusted event)
		this.$watch(
			() => this.uiStore.lastStockAdjustment,
			(val) => {
				if (val) {
					this.handleInvoiceStockAdjusted(val);
				}
			},
		);

		// Legacy support: update_cur_items_details is handled internally or via invoice updates
		// update_customer_price_list is handled by useItemsIntegration via itemsStore watcher

		// Trigger focus on item search
		this.$watch(
			() => this.uiStore.searchFocusTrigger,
			() => {
				this.focusItemSearch();
			},
		);

		this.eventBus.on("server-online", async () => {
			if (this.items && this.items.length > 0) {
				await this.update_items_details(this.items);
			}
			await this.performBackgroundSync({ source: "server-online" });
		});

		// Workers are now started in memoryInitPromise.then or register_pos_profile

		// Add new event listener for currency changes
		this.eventBus.on("update_currency", (data) => {
			this.selected_currency = data.currency;
			this.exchange_rate = data.exchange_rate;
			this.conversion_rate = data.conversion_rate ?? this.conversion_rate ?? 1;

			// Refresh visible item prices when currency changes
			this.applyCurrencyConversionToItems();
			this.update_cur_items_details();
		});
	},

	async mounted() {
		this.$watch(
			() => this.selectedCustomer,
			(newCustomer) => {
				const normalized = newCustomer || "";
				if (this.customer !== normalized) {
					this.customer = normalized;
				}
			},
			{ immediate: true },
		);
		// Ensure POS profile is available
		if (!this.pos_profile || !this.pos_profile.name) {
			try {
				// Try to get from global frappe context
				if (frappe.boot && frappe.boot.pos_profile) {
					this.pos_profile = frappe.boot.pos_profile;
				} else if (window.cur_pos && window.cur_pos.pos_profile) {
					this.pos_profile = window.cur_pos.pos_profile;
				}
			} catch (error) {
				console.warn("Could not get POS profile in mounted:", error);
			}
		}

		// Load items if we have a profile and haven't loaded yet
		if (this.pos_profile && this.pos_profile.name && !this.itemsLoaded) {
			this.get_items_groups();
			// Only load all items if NOT using limit search (memory optimization)
			if (!this.usesLimitSearch) {
				await this.get_items();
			}
		}

		// Setup barcode scanner if enabled
		if (this.pos_profile?.posa_enable_barcode_scanning) {
			this.scan_barcoud();
		}

		// Apply the configured items per page on mount
		this.itemsPerPage = this.items_per_page;
		window.addEventListener("resize", this.checkItemContainerOverflow);
		this.$nextTick(() => {
			this.checkItemContainerOverflow();
			this.scheduleCardMetricsUpdate();
		});
	},

	beforeUnmount() {
		// Clear interval when component is destroyed
		this.stopBackgroundSyncScheduler();

		if (this.formatCache) {
			this.formatCache.clear();
		}

		if (this.keyboardScanTimer) {
			clearTimeout(this.keyboardScanTimer);
			this.keyboardScanTimer = null;
		}

		if (typeof this.stockUnsubscribe === "function") {
			this.stockUnsubscribe();
			this.stockUnsubscribe = null;
		}

		if (this.itemDetailsRetryTimeout) {
			clearTimeout(this.itemDetailsRetryTimeout);
		}
		this.itemDetailsRetryCount = 0;

		// Call cleanup function for abort controller
		if (this.cleanupBeforeDestroy) {
			this.cleanupBeforeDestroy();
		}

		// Detach scanner if it was attached
		if (document._scannerAttached) {
			try {
				onScan.detachFrom(document);
				document._scannerAttached = false;
			} catch (error) {
				console.warn("Scanner detach error:", error.message);
			}
		}

		if (this.itemWorker) {
			this.itemWorker.terminate();
		}

		if (this.scanAudioContext) {
			try {
				this.scanAudioContext.close();
			} catch (error) {
				console.warn("Scan audio context close failed:", error);
			}
			this.scanAudioContext = null;
		}

		this.eventBus.off("update_currency");
		this.eventBus.off("server-online");
		this.eventBus.off("register_pos_profile");
		this.eventBus.off("update_cur_items_details");
		this.eventBus.off("update_offers_counters");
		this.eventBus.off("update_coupons_counters");
		this.eventBus.off("cart_quantities_updated", this.handleCartQuantitiesUpdated);
		this.eventBus.off("invoice_stock_adjusted", this.handleInvoiceStockAdjusted);
		this.eventBus.off("update_customer_price_list");
		this.eventBus.off("force_reload_items");
		// this.eventBus.off("focus_item_search"); // Handled by uiStore watcher
		this.eventBus.off("select_top_item");
		this.eventBus.off("toggle_item_selector_settings");
		window.removeEventListener("resize", this.checkItemContainerOverflow);
		if (this.metricsRaf) {
			cancelAnimationFrame(this.metricsRaf);
			this.metricsRaf = null;
		}
	},
};
</script>

<style scoped>
/* "dynamic-card" no longer composes from pos-card; the pos-card class is added directly in the template */
.dynamic-padding {
	/* Equal spacing on all sides for consistent alignment */
	padding: var(--dynamic-sm);
}

.dynamic-scroll {
	transition: max-height 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	padding-bottom: var(--dynamic-sm);
	contain: layout style;
}

.item-fly-placeholder {
	background-color: rgba(var(--v-theme-on-surface), 0.2);
}

:deep(.text-success) {
	color: rgb(var(--v-theme-success)) !important;
}

:deep(.text-primary),
:deep(.text-success),
:deep(.golden--text) {
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	letter-spacing: 0.02em;
}

:deep(.negative-number) {
	color: rgb(var(--v-theme-error)) !important;
	font-weight: 600;
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Enhanced input fields for Arabic number support */
.v-text-field :deep(input),
.v-select :deep(input),
.v-autocomplete :deep(input) {
	/* Enhanced Arabic number font stack for input fields */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	letter-spacing: 0.01em;
}

/* Dark theme row styling */
.truncate {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.selection {
	background-color: var(--surface-secondary) !important;
}

.item-selection-option {
	border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
	transition:
		border-color 0.2s ease,
		background-color 0.2s ease;
}

.item-selection-option:hover {
	background-color: rgba(var(--v-theme-primary), 0.06);
	border-color: rgba(var(--v-theme-primary), 0.4);
}

.item-selection-image {
	width: 50px;
	height: 50px;
	object-fit: cover;
	margin-right: 15px;
	background-color: rgb(var(--v-theme-surface-variant));
}

/* Responsive breakpoints */
@media (max-width: 1200px) {
	.items-card-grid {
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
		padding: 12px;
	}
}

@media (max-width: 768px) {
	.dynamic-padding {
		/* Reduce spacing uniformly on smaller screens */
		padding: var(--dynamic-xs);
	}

	.items-card-grid {
		grid-template-columns: 1fr;
		gap: 10px;
		padding: 10px;
	}
}

@media (max-width: 480px) {
	.dynamic-padding {
		padding: var(--dynamic-xs);
	}
}

/* ===============================================================
   PERFORMANCE OPTIMIZATIONS FOR THEME SWITCHING
   =============================================================== */

/* Reduce paint and layout operations during theme transitions */
* {
	/* Optimize font rendering to reduce repaints */
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Enable hardware acceleration for better performance */
.items-card-grid {
	/* Force hardware acceleration */
	transform: translate3d(0, 0, 0);
	-webkit-transform: translate3d(0, 0, 0);
	/* Improve compositing performance */
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
}

/* Optimize scrolling performance */
.items-card-grid,
.item-container {
	/* Improve scroll performance */
	overscroll-behavior: contain;
	scroll-behavior: smooth;
	/* Enable scroll anchoring */
	overflow-anchor: auto;
}

/* Disable animations on reduced motion preference */
@media (prefers-reduced-motion: reduce) {
	.items-card-grid {
		transition: none !important;
		animation: none !important;
		transform: none !important;
	}
}
</style>
