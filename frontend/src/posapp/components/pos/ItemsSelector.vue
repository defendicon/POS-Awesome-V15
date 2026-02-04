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
import { getCurrentInstance, onMounted, ref, computed } from "vue";
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
import { useResponsive } from "../../composables/useResponsive.js";
import { useRtl } from "../../composables/useRtl.js";
import { useFlyAnimation } from "../../composables/useFlyAnimation.js";
import { withPerf, perfMarkStart, perfMarkEnd, scheduleFrame } from "../../utils/perf.js";
import { useCartValidation } from "../../composables/useCartValidation.js";
import { useItemsIntegration } from "../../composables/useItemsIntegration.js";
import { useItemSearch } from "../../composables/useItemSearch.js";
import { useItemCurrency } from "../../composables/useItemCurrency.js";
import { useScannerInput } from "../../composables/useScannerInput.js";
import { useItemAvailability } from "../../composables/useItemAvailability.js";
import { useItemDetailFetcher } from "../../composables/useItemDetailFetcher.js";
import { useItemAddition } from "../../composables/useItemAddition.js";
import { useItemSelection } from "../../composables/useItemSelection.js";
import { useItemSelectorLayout } from "../../composables/useItemSelectorLayout.js";
import { useLastInvoiceRate } from "../../composables/useLastInvoiceRate.js";
import { useItemSync } from "../../composables/useItemSync.js";
import { useBatchSerial } from "../../composables/useBatchSerial.js";
import { useItemStorageSafety } from "../../composables/useItemStorageSafety.js";
import { useItemsSelectorSearch } from "../../composables/useItemsSelectorSearch.js";
import { useItemsSelectorSettings } from "../../composables/useItemsSelectorSettings.js";
import { useItemsSelectorFocus } from "../../composables/useItemsSelectorFocus.js";
import { useItemDisplay } from "../../composables/useItemDisplay.js";
import { useItemsLoader } from "../../composables/useItemsLoader.js";
import { parseBooleanSetting, formatStockShortageError } from "../../utils/stock.js";
import { playScanTone, closeScanAudioContext } from "../../utils/scannerAudio.js";
import { getItemsTableHeaders } from "../../utils/itemsTableHeaders.js";
import { openItemSelectionDialog } from "../../utils/itemSelectionDialog.js";
import {
	normalizeScaleBarcodeSettings,
	parseScaleBarcodeSettingsResponse,
	getScaleBarcodePrefix,
	scaleBarcodeMatches,
} from "../../utils/scaleBarcode.js";
import { getCardColumns, getCardGap, getCardPadding } from "../../utils/itemSelectorLayout.js";
import {
	getScanTimestamp,
	sanitizeClipboardText,
	isScanCandidate,
	shouldResetScanOnInput,
	isLikelyKeyboardScan,
	isSearchFieldPrimedForScan,
} from "../../utils/keyboardScan.js";
import { shouldRunBackgroundSync } from "../../utils/backgroundSync.js";
import { useBarcodeIndexing } from "../../composables/useBarcodeIndexing.js";
import { useScanProcessor } from "../../composables/useScanProcessor.js";

import { useCustomersStore } from "../../stores/customersStore.js";

import { useToastStore } from "../../stores/toastStore.js";
import { useUIStore } from "../../stores/uiStore.js";
import { useInvoiceStore } from "../../stores/invoiceStore.js";
import { storeToRefs } from "pinia";

export default {
	mixins: [format],
	setup(props, { emit }) {
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
		const itemAddition = useItemAddition(); // Initialize composable
		const { selectedCustomer } = storeToRefs(customersStore);

		const {
			showOnlyBarcodeItems: showOnlyBarcodeItemsRef,
			memoizedSearch,
			clearSearchCache,
			fetchServerItemsTimestamp,
			filterAndPaginate,
		} = useItemSearch();

		const scannerInput = useScannerInput();
		const itemAvailability = useItemAvailability();
		const itemDetailFetcher = useItemDetailFetcher();
		const itemSelection = useItemSelection();

		const itemSync = useItemSync();
		const itemDisplay = useItemDisplay();
		const itemsLoader = useItemsLoader();
		const { setBatchQty, setSerialNo, getBatchAvailability } = useBatchSerial();

		const {
			windowWidth,
			isOverflowing,
			itemsContainerRef,
			cardColumns,
			cardGap,
			cardPadding,
			cardRowHeight,
			cardSlotHeight,
			cardSlotWidth,
			cardColumnWidth,
			checkItemContainerOverflow,
			scheduleCardMetricsUpdate,
			onListScroll: handleListScroll,
		} = useItemSelectorLayout({
			resizeDebounce: 100,
			loadVisibleItems: () => {
				const vm = getCurrentInstance()?.proxy;
				if (vm && vm.currentPage !== undefined) {
					vm.currentPage += 1;
					vm.loadVisibleItems();
				}
			},
		});

		const instance = getCurrentInstance();
		const getValidVM = () => {
			return instance ? instance.proxy : null;
		};

		const itemsSelectorSearch = useItemsSelectorSearch({
			getVM: getValidVM,
			scannerInput,
			itemSelection,
		});

		const itemsSelectorSettings = useItemsSelectorSettings({
			getVM: getValidVM,
			itemSync,
		});

		const itemsSelectorFocus = useItemsSelectorFocus({
			getVM: getValidVM,
			scannerInput,
			itemSelection,
		});

		const {
			lastInvoiceRates,
			lastInvoiceRateLoading,
			getLastInvoiceRate,
			scheduleLastInvoiceRateRefresh,
			fetchLastInvoiceRates,
			clearLastInvoiceRateCache,
		} = useLastInvoiceRate({
			pos_profile: () => getValidVM()?.pos_profile,
			customer: () => getValidVM()?.customer || selectedCustomer.value,
			displayedItems: () => getValidVM()?.displayedItems,
			show_last_invoice_rate: () => getValidVM()?.show_last_invoice_rate,
			autoRefresh: true,
		});

		const { last_background_sync_time } = itemSync;

		const { storageAvailable, itemWorker, ensureStorageHealth, markStorageUnavailable, startItemWorker } =
			useItemStorageSafety();

		const {
			ensureBarcodeIndex,
			resetBarcodeIndex,
			indexItem,
			replaceBarcodeIndex,
			lookupItemByBarcode,
			searchItemsByCode: searchItemsByCodeFn,
		} = useBarcodeIndexing();

		const add_item = async (item, options = {}) => {
			// In 'pos' context, we use the internal store logic directly
			if (props.context === "pos") {
				const vm = getValidVM();
				if (!vm) return;

				// 1. Determine requested quantity from options or component state
				let requestedQty = options.qty !== undefined ? options.qty : vm.qty;

				// Robust quantity parsing (Math.abs("") is 0, which we want to avoid)
				if (requestedQty === "" || requestedQty == null) {
					requestedQty = 1;
				} else {
					requestedQty = Math.abs(parseFloat(requestedQty) || 1);
				}

				// Create a shallow copy to avoid mutating the reactive list
				item = { ...item };

				// Handle variant items
				if (item.has_variants) {
					await itemAddition.handleVariantItem(item, vm);
					return;
				}

				// Use a Proxy to create a robust context that delegates to the component instance
				// but allows local overrides and method binding
				const context = new Proxy(vm, {
					// ... (rest of proxy kept)
					get(target, prop, receiver) {
						// 1. Check options override
						if (options && options[prop] !== undefined) {
							return options[prop];
						}
						// 2. Map specific missing methods/properties
						if (prop === "update_items_details") {
							return vm.itemDetailFetcher?.update_items_details;
						}
						if (prop === "itemCurrencyUtils") {
							return vm.itemCurrencyUtils;
						}
						if (prop === "items") {
							// Map 'items' to invoiceStore items for merge logic (ItemsSelector uses 'items' for search results)
							return vm.invoiceStore?.items || Reflect.get(target, "items", receiver);
						}

						// Specific methods expected by useItemAddition / useStockUtils
						if (prop === "setBatchQty" || prop === "set_batch_qty") {
							return (...args) => vm.eventBus.emit("set_batch_qty", ...args);
						}
						if (prop === "setSerialNo" || prop === "set_serial_no") {
							return (...args) => vm.eventBus.emit("set_serial_no", ...args);
						}
						if (prop === "calc_uom" || prop === "calcUom") {
							return (...args) => vm.eventBus.emit("calc_uom", ...args);
						}
						if (prop === "calc_stock_qty" || prop === "calcStockQty") {
							return (...args) => vm.eventBus.emit("calc_stock_qty", ...args);
						}
						if (prop === "triggerBackgroundFlush") {
							return (...args) => vm.eventBus.emit("trigger_background_flush", ...args);
						}
						if (prop === "forceUpdate") {
							return () => vm.$forceUpdate?.();
						}

						// 3. Delegate to component instance
						const value = Reflect.get(target, prop, receiver);
						// Bind functions to the original VM to ensure 'this' context is correct
						if (typeof value === "function") {
							return value.bind(target);
						}
						return value;
					},
					// Allow writing specific properties back to the VM (e.g. cache)
					set(target, prop, value, receiver) {
						// We can allow all writes to flow through to the VM, or restrict them.
						// useItemAddition writes to _mergeIndexCache, items (via push/splice), etc.
						return Reflect.set(target, prop, value, receiver);
					},
				});

				// 2. Validate item before adding to cart
				const { suppressNegativeWarning = false } = options;
				if (props.context !== "purchase") {
					const isValid = await cartValidation.validateCartItem(
						item,
						requestedQty,
						vm.pos_profile,
						vm.stock_settings,
						null, // EventBus removed
						blockSaleBeyondAvailableQty.value,
						!suppressNegativeWarning,
						true, // Skip server-side validation for instant add
					);

					if (!isValid) {
						// Validation failed, error message already shown by validator
						return;
					}
				}

				// 3. Prepare item for cart (UOM, rate, qty)
				await itemAddition.prepareItemForCart(item, requestedQty, context);

				// 4. Add to cart
				const result = await itemAddition.addItem(item, context);

				// 5. Reset quantity in component
				vm.qty = 1;

				return result;
			} else {
				// In other contexts (e.g. Purchase Orders), we emit the event for the parent to handle
				emit("add-item", item);
			}
		};

		// Define computed properties for settings needed by scan processor
		const posProfile = itemsIntegration.posProfile;
		const searchCache = ref(new Map());

		const float_precision = computed(() => {
			const raw =
				posProfile.value?.currency_precision || itemsIntegration.posProfile.value?.float_precision;
			return raw !== undefined ? raw : 2;
		});

		const currency_precision = computed(() => posProfile.value?.currency_precision || 2);

		const hide_qty_decimals = computed(() =>
			posProfile.value?.posa_hide_qty_decimals ? !!posProfile.value.posa_hide_qty_decimals : false,
		);

		const blockSaleBeyondAvailableQty = computed(() =>
			posProfile.value
				? parseBooleanSetting(posProfile.value.posa_block_sale_beyond_available_qty)
				: false,
		);

		const exchange_rate = computed(() => 1); // Default, update if needed from store

		// Initialize useScanProcessor with context
		const scanProcessor = useScanProcessor({
			items: itemsIntegration.items,
			pos_profile: posProfile, // Corrected variable name
			active_price_list: itemsIntegration.active_price_list,
			customer_price_list: itemsIntegration.customer_price_list,
			itemDetailFetcher,
			itemAddition: { addItem: add_item }, // Pass wrapper for correct context
			barcodeIndex: {
				lookupItemByBarcode,
				searchItemsByCode: searchItemsByCodeFn,
				ensureBarcodeIndex,
				replaceBarcodeIndex,
				indexItem,
				resetBarcodeIndex,
			},
			scannerInput,
			searchCache, // Use local ref
			eventBus: getValidVM()?.eventBus || { emit: () => {} }, // Fallback safely
			format_number: getValidVM()?.format_number || ((v) => v),
			float_precision,
			hide_qty_decimals,
			blockSaleBeyondAvailableQty,
			currency_precision,
			exchange_rate,
			format_currency: getValidVM()?.format_currency || ((v) => v),
			ratePrecision: getValidVM()?.ratePrecision || (() => 2),
			customer: itemsIntegration.customer,
			// Callbacks or methods expected by processor
			add_item_wrapper: add_item,
			search_from_scanner_ref: scannerInput.search_from_scanner || ref(false), // scannerInput might have it, or create local
			get_search: (code) => (getValidVM()?.get_search ? getValidVM().get_search(code) : code),
			get_item_qty: (code) => (getValidVM()?.get_item_qty ? getValidVM().get_item_qty(code) : 1),
			onItemAdded: () => {
				const vm = getValidVM();
				if (vm) {
					vm.clearSearch();
					vm.focusItemSearch();
				}
			},
			onItemNotFound: (code) => {
				// itemsIntegration might not expose these direct refs if they are wrapped in 'search' computed
				// But let's try to set search value
				if (getValidVM()) {
					getValidVM().search = code;
					getValidVM().first_search = code;
				}
			},
			stock_settings: getValidVM()?.stock_settings, // might be undefined in setup, check lifecycle
		});

		// Register scan handler
		onMounted(() => {
			if (scannerInput && scannerInput.setScanHandler) {
				scannerInput.setScanHandler(scanProcessor.processScannedItem);
			}
		});


		// Register context for itemSelection
		itemSelection.registerContext({
			addItem: add_item,
			clearSearch: itemsSelectorSearch.clearSearch,
			focusItemSearch: itemsSelectorFocus.focusItemSearch,
			fly,
			get flyConfig() {
				return getValidVM()?.flyConfig;
			},
			get displayedItems() {
				return getValidVM()?.displayedItems || [];
			},
		});

		return {
			select_item: itemSelection.handleItemSelection,
			click_item_row: itemSelection.handleRowClick,
			add_item,
			...responsive,
			...rtl,
			fly,
			cartValidation,

			// Layout
			windowWidth,
			isOverflowing,
			itemsContainerRef,
			cardColumns,
			cardGap,
			cardPadding,
			cardRowHeight,
			cardSlotHeight,
			cardSlotWidth,
			cardColumnWidth,
			checkItemContainerOverflow,
			scheduleCardMetricsUpdate,
			handleListScroll,
			...itemsIntegration,
			...itemsSelectorSearch,
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
			// Expose currency utils
			itemCurrencyUtils: useItemCurrency(),
			// Expose scanner input
			scannerInput,
			// Expose scanner state and methods for Template/Options API
			scannerLocked: scannerInput.scannerLocked,
			last_background_sync_time,
			scanErrorDialog: scannerInput.scanErrorDialog,
			scanErrorMessage: scannerInput.scanErrorMessage,
			scanErrorCode: scannerInput.scanErrorCode,
			scanErrorDetails: scannerInput.scanErrorDetails,
			cameraScannerActive: scannerInput.cameraScannerActive,
			acknowledgeScanError: scannerInput.acknowledgeScanError,
			onBarcodeScanned: scannerInput.onBarcodeScanned,
			// Expose scale barcode methods
			ensureScaleBarcodeSettings: scannerInput.ensureScaleBarcodeSettings,
			updateScaleBarcodeSettings: scannerInput.updateScaleBarcodeSettings,
			getScaleBarcodePrefix: scannerInput.getScaleBarcodePrefix,
			scaleBarcodeMatches: scannerInput.scaleBarcodeMatches,
			playScanTone: scannerInput.playScanTone,
			// Expose item availability
			itemAvailability,
			itemDetailFetcher,
			itemSelection,
			...itemSelection,
			itemSync,
			...itemsSelectorSearch,
			...itemsSelectorSettings,
			...itemsSelectorFocus,

			// Batch/Serial methods
			setBatchQty,
			setSerialNo,
			getBatchAvailability,
			// Expose Scan Processor (replaces processScannedItem)
			scanProcessor,
			processScannedItem: scanProcessor.processScannedItem,
			addScannedItemToInvoice: scanProcessor.addScannedItemToInvoice,
			showMultipleItemsDialog: scanProcessor.showMultipleItemsDialog,
			// Last Invoice Rate
			lastInvoiceRates,
			lastInvoiceRateLoading,
			getLastInvoiceRate,
			scheduleLastInvoiceRateRefresh,
			fetchLastInvoiceRates,
			clearLastInvoiceRateCache,
			clearLastInvoiceRateCache,
			// Storage Safety
			storageAvailable,
			itemWorker,
			ensureStorageHealth,
			markStorageUnavailable,
			startItemWorker,
			// Barcode Indexing
			ensureBarcodeIndex,
			resetBarcodeIndex,
			indexItem,
			replaceBarcodeIndex,
			lookupItemByBarcode,
			searchItemsByCodeFn,
			itemDisplay,
			itemsLoader,
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
		// last_background_sync_time: null, // Managed by composable
		background_sync_details_in_flight: false,
		abortController: null,
		itemDetailsRequestCache: { key: null, promise: null, result: null },
		itemDetailsRetryCount: 0,
		itemDetailsRetryTimeout: null,
		selected_currency: "",
		exchange_rate: 1,
		conversion_rate: 1,
		prePopulateInProgress: false,
		// itemWorker: null, // Managed by composable
		flyConfig: { speed: 0.6, easing: "ease-in-out" },
		// storageAvailable: true, // Managed by composable
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
		pendingItemSearch: null,
		loadProgress: 0,
		totalItemCount: 0,
		// Scanner state managed by useScannerInput
		refreshInFlight: false,
		clearingSearch: false,

		// lastInvoiceRates removed (moved to composable)
		// lastInvoiceRateScheduler removed
	}),

	watch: {
		search_input(newValue) {
			this.first_search = newValue;
			this.clearHighlightedItem();
			this.search_onchange();
		},
		customer: _.debounce(function () {
			if (!this.customer) {
				this.clearLastInvoiceRateCache();
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
						this.$nextTick(() => this.itemDetailFetcher.refreshPricesForVisibleItems());
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
				this.$nextTick(() => this.itemDetailFetcher.refreshPricesForVisibleItems());
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
						this.$nextTick(() => this.itemDetailFetcher.refreshPricesForVisibleItems());
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
					this.itemDetailFetcher.update_items_details(this.items);
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
				this.itemDetailFetcher.update_items_details(new_value);
			}
			this.$nextTick(() => {
				this.checkItemContainerOverflow();
				this.scheduleCardMetricsUpdate();
			});
			this.scheduleLastInvoiceRateRefresh();
			this.itemSelection.syncHighlightedItem();
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
		// Formatting delegates to useItemDisplay composable
		ratePrecision(value) {
			return this.itemDisplay.ratePrecision(value);
		},
		format_currency(value, currency, precision) {
			return this.itemDisplay.format_currency(value, currency, precision);
		},
		format_number(value, precision) {
			return this.itemDisplay.format_number(value, precision);
		},
		currencySymbol(currency) {
			return this.itemDisplay.currencySymbol(currency);
		},
		hasDecimalPrecision(value) {
			return this.itemDisplay.hasDecimalPrecision(value);
		},
		// get_uoms, closeNewItemDialog, submitNewItem moved to NewItemDialog.vue


		async onVirtualRangeUpdate(_startIndex, _endIndex, _visibleStartIndex, visibleEndIndex) {
			return await this.itemsLoader.onVirtualRangeUpdate(
				_startIndex,
				_endIndex,
				_visibleStartIndex,
				visibleEndIndex,
			);
		},

		// Optimized scroll handler with throttling


		async loadVisibleItems(reset = false) {
			return await this.itemsLoader.loadVisibleItems(reset);
		},
		onListScroll(event) {
			this.handleListScroll(event);
		},

		// checkItemContainerOverflow removed (handled by composable)
		// scheduleCardMetricsUpdate removed (handled by composable)

		// scheduleLastInvoiceRateRefresh removed (handled by composable)
		// refreshLastInvoiceRatesForVisibleItems removed
		// fetchLastInvoiceRates removed
		// getLastInvoiceRate removed (but used in template, so mapped in setup return, we should ensure it's available on 'this' context via composition API support or manual mapping if not using <script setup>)
		// Since we are using Options API with setup(), setup returns are exposed to template AND 'this'.

		show_offers() {
			this.eventBus.emit("show_offers", "true");
		},
		show_coupons() {
			this.eventBus.emit("show_coupons", "true");
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
		// ensureStorageHealth, markStorageUnavailable, startItemWorker moved to useItemStorageSafety.js
	},

	computed: {
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
			set(value) {
				let parsed = parseFloat(String(value).replace(/,/g, ""));
				if (isNaN(parsed)) {
					parsed = null;
				}
				if (this.hide_qty_decimals && parsed != null) {
					parsed = Math.trunc(parsed);
				}
				this.qty = parsed;
			},
		},
		headers() {
			return this.itemDisplay.headers.value;
		},
		memoizedFormatCurrency() {
			return this.itemDisplay.memoizedFormatCurrency.value;
		},
		memoizedFormatNumber() {
			return this.itemDisplay.memoizedFormatNumber.value;
		},
		active_price_list() {
			return this.customer_price_list || (this.pos_profile && this.pos_profile.selling_price_list);
		},
		isLoadingOrSyncing() {
			return this.loading || this.isBackgroundLoading || this.refreshInFlight;
		},
	},

	async created() {
		const vm = this;
		// Performance optimizations - non-reactive caches
		this.searchCache = new Map();
		this.itemCache = new Map();
		this.formatCache = new Map();

		// Initialize Composables
		// this.lastInvoiceRate = useLastInvoiceRate(); // Initialized in setup()

		// Initialize Availability Composable
		this.itemAvailability.registerCallbacks({
			getItems: () => this.items,
			getDisplayedItems: () => this.displayedItems,
			getFilteredItems: () => this.filteredItems,
			updateItemsDetails: (items, options) =>
				this.itemDetailFetcher.update_items_details(items, options),
		});
		this.itemAvailability.initAvailability();

		// Configure Item Display with component context
		this.itemDisplay.registerContext({
			get context() {
				return vm.context;
			},
			get pos_profile() {
				return vm.pos_profile;
			},
			get float_precision() {
				return vm.float_precision;
			},
			get currency_precision() {
				return vm.currency_precision;
			},
			get exchange_rate() {
				return vm.exchange_rate;
			},
			formatCurrencyPlain: (v, p) => this.formatCurrencyPlain(v, p),
			formatFloatPlain: (v, p) => this.formatFloatPlain(v, p),
		});

		// Configure Items Loader with component context
		this.itemsLoader.registerContext({
			get eventBus() {
				return vm.eventBus;
			},
			get itemsStore() {
				return vm.itemsStore;
			},
			get itemDetailFetcher() {
				return vm.itemDetailFetcher;
			},
			get ensureStorageHealth() {
				return vm.ensureStorageHealth;
			},
			get loadItems() {
				return vm.loadItems;
			},
			get appendCachedItemsPage() {
				return vm.appendCachedItemsPage;
			},
			get get_search() {
				return vm.get_search;
			},
			get first_search() {
				return vm.first_search;
			},
			get item_group() {
				return vm.item_group;
			},
			get usesLimitSearch() {
				return vm.usesLimitSearch;
			},
			get limitSearchCap() {
				return vm.limitSearchCap;
			},
			get items() {
				return vm.items;
			},
			get totalItemCount() {
				return vm.totalItemCount;
			},
			get displayedItems() {
				return vm.displayedItems;
			},
			get cardColumns() {
				return vm.cardColumns;
			},
			get hasMoreCachedItems() {
				return vm.hasMoreCachedItems;
			},
			get loading() {
				return vm.loading;
			},
			scheduleCardMetricsUpdate: () => vm.scheduleCardMetricsUpdate(),
		});

		// Configure Item Detail Fetcher with component context (Late Binding)
		this.itemDetailFetcher.registerContext({
			get pos_profile() {
				return vm.pos_profile;
			},
			get active_price_list() {
				return vm.active_price_list;
			},
			get items() {
				return vm.items;
			},
			get displayedItems() {
				return vm.displayedItems;
			},
			itemAvailability: this.itemAvailability,
			itemCurrencyUtils: this.itemCurrencyUtils,
			get usesLimitSearch() {
				return vm.usesLimitSearch;
			},
			get storageAvailable() {
				return vm.storageAvailable;
			},
			markStorageUnavailable: (args) => vm.markStorageUnavailable(args),
			applyCurrencyConversionToItem: (item) => vm.applyCurrencyConversionToItem(item),
			forceUpdate: () => vm.$forceUpdate(),
		});

		// Configure Item Selection with component context
		this.itemSelection.registerContext({
			get items() {
				return vm.items;
			},
			get displayedItems() {
				return vm.displayedItems;
			},
			addItem: (item) => vm.add_item(item),
			clearSearch: () => vm.clearSearch(),
			focusItemSearch: () => vm.focusItemSearch(),
			fly: this.fly,
			get flyConfig() {
				return vm.flyConfig;
			},
			get items_view() {
				return vm.items_view;
			},
		});

		// Configure Scanner Input with component handler
		this.scannerInput.setScanHandler((code) => this.processScannedItem(code));

		// Configure Item Sync with component context
		this.itemSync.registerContext({
			get pos_profile() {
				return vm.pos_profile;
			},
			get enable_background_sync() {
				return vm.enable_background_sync;
			},
			get background_sync_interval() {
				return vm.background_sync_interval;
			},
			get usesLimitSearch() {
				return vm.usesLimitSearch;
			},
			itemsPageLimit: this.itemsPageLimit,
			refreshModifiedItems: () => this.refreshModifiedItems(),
			backgroundSyncItems: (args) => {
				const normalizedSearch = this.get_search(this.first_search || "").trim();
				return this.backgroundSyncItems({
					groupFilter: this.item_group,
					searchValue: normalizedSearch,
					...args,
				});
			},
			get_items: (force) => this.get_items(force),
			search_onchange: (val) => this.search_onchange(val),
			itemDetailFetcher: this.itemDetailFetcher,
			eventBus: this.eventBus,
			fetchServerItemsTimestamp: () => this.fetchServerItemsTimestamp(),
			getItems: () => this.items,
			getDisplayedItems: () => this.displayedItems,
			onBackgroundLoadFinished: () => {
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
		});

		// Watch for highlighted index changes (triggered by keyboard nav in composable)
		this.$watch(
			() => this.itemSelection.highlightedIndex,
			(newIndex) => {
				this.scrollHighlightedItemIntoView(newIndex);
			},
		);

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
				this.itemDetailFetcher.update_cur_items_details();
				this.itemSync.startBackgroundSyncScheduler();

				console.log("Pinia store initialized successfully (from global state)");
			}
		}

		// Keep legacy initialization for backward compatibility
		this.replaceBarcodeIndex(this.items || []);

		// Setup search debounce (now handled by store, but keeping for compatibility)
		this.searchDebounce = _.debounce(() => {
			// Removed get_items() - handled by store
		}, 300);

		// Load settings
		this.loadItemSettings();
		this.itemSync.ensureBackgroundSyncBaseline();
		await this.scannerInput.ensureScaleBarcodeSettings();

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
					// Removed get_items_groups() - handled by store
					// Removed initializeItems() - handled by store initialization
				} else {
					console.warn("No POS Profile available during initialization");
				}
			} catch (error) {
				console.error("Error during initialization:", error);
			}

			// Start workers if we have profile
			if (this.pos_profile && this.pos_profile.name) {
				this.startItemWorker();
				this.itemDetailFetcher.update_cur_items_details();
				this.itemSync.startBackgroundSyncScheduler();
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
					this.itemDetailFetcher.update_cur_items_details();
					this.itemSync.startBackgroundSyncScheduler();

					await this.scannerInput.ensureScaleBarcodeSettings(true);
					await this.scannerInput.ensureScaleBarcodeSettings(true);
					// Removed get_items_groups() - handled by store
					// Removed initializeItems() - handled by store initialization
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
		this.eventBus.on("cart_quantities_updated", this.itemAvailability.handleCartQuantitiesUpdated);

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
					await this.refreshItems(); // Use Store refreshItems
				} else {
					if (
						this.pos_profile &&
						(!this.pos_profile.posa_local_storage || !this.storageAvailable)
					) {
						await forceClearAllCache();
						await this.refreshItems(); // Use Store refreshItems
					} else {
						// Store handles offline load automatically or via cached items
						// No need to call legacy get_items
					}
				}
			},
		);

		// Watch for Stock Adjustments (replacing invoice_stock_adjusted event)
		this.$watch(
			() => this.uiStore.lastStockAdjustment,
			(val) => {
				if (val) {
					this.itemAvailability.handleInvoiceStockAdjusted(val);
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
				await this.itemDetailFetcher.update_items_details(this.items);
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
			this.itemDetailFetcher.update_cur_items_details();
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
			// Removed get_items_groups() - handled by store
			// Only load all items if NOT using limit search (memory optimization)
			if (!this.usesLimitSearch) {
				// Removed get_items() - handled by store
			}
		}

		// Setup barcode scanner if enabled
		if (this.pos_profile?.posa_enable_barcode_scanning) {
			// Scanner initialized by composable
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
		if (this.itemSync) {
			this.itemSync.stopBackgroundSyncScheduler();
		}

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

		// Scanner & Audio context cleanup handled by useScannerInput
		if (this.itemWorker) {
			this.itemWorker.terminate();
			this.itemWorker = null;
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
