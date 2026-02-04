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
					:sync-status="syncStatus"
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

<script setup>
/* eslint-disable no-unused-vars */
/* global frappe, __, flt, memoryInitPromise */
import { getCurrentInstance, onMounted, onBeforeUnmount, ref, computed, watch, nextTick, reactive, inject } from "vue";
import { storeToRefs } from "pinia";
import format from "../../format";
import _ from "lodash";
import { memoryInitPromise, forceClearAllCache } from "../../../offline/index.js";

import CameraScanner from "./CameraScanner.vue";
import ItemActionToolbar from "./ItemActionToolbar.vue";
import ItemSettingsDialog from "./ItemSettingsDialog.vue";
import ItemHeader from "./ItemHeader.vue";
import ItemsSelectorCards from "./ItemsSelectorCards.vue";
import ItemsSelectorTable from "./ItemsSelectorTable.vue";
import NewItemDialog from "./NewItemDialog.vue";
import ScanErrorDialog from "./ScanErrorDialog.vue";

import { useResponsive } from "../../composables/useResponsive.js";
import { useRtl } from "../../composables/useRtl.js";
import { useFlyAnimation } from "../../composables/useFlyAnimation.js";
import { useCartValidation } from "../../composables/useCartValidation.js";
import { useItemsIntegration } from "../../composables/useItemsIntegration.js";
import { useItemSearch } from "../../composables/useItemSearch.js";
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
import { useBarcodeIndexing } from "../../composables/useBarcodeIndexing.js";
import { useScanProcessor } from "../../composables/useScanProcessor.js";

import { useCustomersStore } from "../../stores/customersStore.js";
import { useToastStore } from "../../stores/toastStore.js";
import { useUIStore } from "../../stores/uiStore.js";
import { useInvoiceStore } from "../../stores/invoiceStore.js";

import { parseBooleanSetting } from "../../utils/stock.js";

const props = defineProps({
	context: {
		type: String,
		default: "pos",
	},
	showOnlyBarcodeItems: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["add-item"]);

// 1. Initialize Stores and Core Composables
const vmInstance = getCurrentInstance();
const customersStore = useCustomersStore();
const toastStore = useToastStore();
const uiStore = useUIStore();
const invoiceStore = useInvoiceStore();
const { selectedCustomer } = storeToRefs(customersStore);
const { posProfile: uiPosProfile } = storeToRefs(uiStore);

const eventBus = inject("eventBus");
const selected_currency = ref("");
const isInitialized = ref(false);
const initTimeout = ref(null);
const initError = ref(null);

const responsive = useResponsive();
const rtl = useRtl();
const { fly } = useFlyAnimation();
const cartValidation = useCartValidation();

const itemsIntegration = useItemsIntegration({
	enableDebounce: false,
	debounceDelay: 300,
});

const {
	showOnlyBarcodeItems: showOnlyBarcodeItemsRef,
	filterAndPaginate,
} = useItemSearch();

const scannerInput = useScannerInput();
const itemAvailability = useItemAvailability();
const itemDetailFetcher = useItemDetailFetcher();
const itemSelection = useItemSelection();
const itemSync = useItemSync();
const itemDisplay = useItemDisplay();
const itemsLoader = useItemsLoader();
const { startItemWorker, itemWorker } = useItemStorageSafety();
const {
	ensureBarcodeIndex,
	resetBarcodeIndex,
	indexItem,
	replaceBarcodeIndex,
	lookupItemByBarcode,
	searchItemsByCode: searchItemsByCodeFn,
} = useBarcodeIndexing();

// 2. Local State & Settings
const newItemDialog = ref(false);
const qty = ref(1);
const search_input = ref("");
const first_search = ref("");
const items_view = ref("list");
const itemsPerPage = ref(50);
const clearingSearch = ref(false);
const isDragging = ref(false);
const new_line = ref(false);
const item_group = ref("");
const virtualScrollBuffer = ref(200);
const localStorageAvailable = ref(true);

// Settings Refs
const hide_qty_decimals = ref(false);
const hide_zero_rate_items = ref(false);
const show_last_invoice_rate = ref(true);
const enable_background_sync = ref(true);
const background_sync_interval = ref(30);
const enable_custom_items_per_page = ref(false);
const items_per_page = ref(50);

// Temporary Settings Refs (for dialog)
const show_item_settings = ref(false);
const temp_hide_qty_decimals = ref(false);
const temp_hide_zero_rate_items = ref(false);
const temp_enable_custom_items_per_page = ref(false);
const temp_items_per_page = ref(50);
const temp_force_server_items = ref(false);
const temp_show_last_invoice_rate = ref(true);
const temp_enable_background_sync = ref(true);
const temp_background_sync_interval = ref(30);

const flyConfig = reactive({ speed: 0.6, easing: "ease-in-out" });
const headerProps = reactive({
	'sort-icon': 'mdi-arrow-up',
	'class': 'pos-table-header'
});

// 3. Computed Properties
const pos_profile = computed(() => itemsIntegration.posProfile.value || {});
const { stockSettings: stock_settings_ref } = storeToRefs(uiStore);
const stock_settings = computed(() => stock_settings_ref.value || {});
const items_group = computed(() => itemsIntegration.items_group.value || []);
const offersCount = computed(() => invoiceStore.offersCount || 0);
const couponsCount = computed(() => invoiceStore.couponsCount || 0);
// selected_currency is now a local ref synced via eventBus
const active_price_list = computed(() => itemsIntegration.active_price_list.value || pos_profile.value?.selling_price_list);

const blockSaleBeyondAvailableQty = computed(() =>
	parseBooleanSetting(pos_profile.value?.posa_block_sale_beyond_available_qty),
);

const { items, filteredItems, customer_price_list, loading, isBackgroundLoading } = itemsIntegration;

const displayedItems = computed(() => {
	const baseItems = Array.isArray(filteredItems.value) ? filteredItems.value : [];
	const rawTerm = first_search.value;
	const term = (typeof rawTerm === "string" ? rawTerm : "").trim().toLowerCase();
	return filterAndPaginate(baseItems, {
		searchTerm: term,
		hideZeroRate: hide_zero_rate_items.value,
		hideVariants: pos_profile.value?.posa_hide_variants_items,
		onlyBarcode: showOnlyBarcodeItemsRef.value,
		limit: enable_custom_items_per_page.value ? items_per_page.value : itemsPerPage.value,
	});
});

const debounce_qty = computed({
	get() {
		if (qty.value === null || qty.value === "") return "";
		return pos_profile.value?.posa_hide_qty_decimals ? Math.trunc(qty.value) : qty.value;
	},
	set(value) {
		let parsed = parseFloat(String(value).replace(/,/g, ""));
		if (isNaN(parsed)) parsed = null;
		if (pos_profile.value?.posa_hide_qty_decimals && parsed != null) parsed = Math.trunc(parsed);
		qty.value = parsed;
	},
});

const isLoadingOrSyncing = computed(() => {
	if (loading.value) return true;
	if (isBackgroundLoading.value && items.value.length === 0) return true;
	return false;
});

const syncStatus = computed(() => {
	if (loading.value) return __("Loading items...");
	if (isBackgroundLoading.value) return __("Syncing offline catalog...");
	return "";
});

// 4. Initialization logic for Composables needing Context

// Settings context object for useItemsSelectorSettings
const settingsContext = reactive({
	hide_qty_decimals,
	hide_zero_rate_items,
	show_last_invoice_rate,
	enable_background_sync,
	background_sync_interval,
	enable_custom_items_per_page,
	items_per_page,
	temp_hide_qty_decimals,
	temp_hide_zero_rate_items,
	temp_enable_custom_items_per_page,
	temp_items_per_page,
	temp_force_server_items,
	temp_show_last_invoice_rate,
	temp_enable_background_sync,
	temp_background_sync_interval,
	show_item_settings,
	localStorageAvailable,
	pos_profile,
	itemsPerPage,
	clearLastInvoiceRateCache: () => clearLastInvoiceRateCache(),
	scheduleLastInvoiceRateRefresh: () => scheduleLastInvoiceRateRefresh(),
	itemSync,
});

const itemsSelectorSearch = useItemsSelectorSearch({ getVM: () => vmInstance.proxy, scannerInput, itemSelection });
const itemsSelectorSettings = useItemsSelectorSettings({ getVM: () => settingsContext, itemSync });
const itemsSelectorFocus = useItemsSelectorFocus({ getVM: () => vmInstance.proxy, scannerInput, itemSelection });

const {
	getLastInvoiceRate,
	scheduleLastInvoiceRateRefresh,
	clearLastInvoiceRateCache,
} = useLastInvoiceRate({
	pos_profile: () => pos_profile.value,
	customer: () => selectedCustomer.value,
	displayedItems: () => displayedItems.value,
	show_last_invoice_rate: () => show_last_invoice_rate.value,
	autoRefresh: true,
});

const {
	isOverflowing,
	cardColumns,
	cardRowHeight,
	cardSlotHeight,
	cardSlotWidth,
	cardColumnWidth,
	checkItemContainerOverflow,
	scheduleCardMetricsUpdate,
	onListScroll: handleListScroll,
} = useItemSelectorLayout({
	resizeDebounce: 100,
	loadVisibleItems: () => itemsLoader.loadVisibleItems(),
});

// 5. Core Methods
const add_item = async (item, options = {}) => {
	if (props.context === "pos") {
		let requestedQty = options.qty !== undefined ? options.qty : qty.value;
		requestedQty = (requestedQty === "" || requestedQty == null) ? 1 : Math.abs(parseFloat(requestedQty) || 1);

		item = { ...item };
		if (item.has_variants) {
			await useItemAddition().handleVariantItem(item, {
				pos_profile: pos_profile.value,
				itemDetailFetcher,
				add_item,
				items: items.value,
				invoiceStore,
				toastStore,
				uiStore,
				customer: selectedCustomer.value,
				active_price_list: itemsIntegration.active_price_list.value,
				customer_price_list: customer_price_list.value,
			});
			return;
		}

		const context = {
			pos_profile: pos_profile.value,
			stock_settings: stock_settings.value,
			customer: selectedCustomer.value,
			invoiceStore,
			itemDetailFetcher,
			items: invoiceStore.items,
			...options,
		};

		const isValid = await cartValidation.validateCartItem(
			item, requestedQty, pos_profile.value, stock_settings.value,
			null, blockSaleBeyondAvailableQty.value, !options.suppressNegativeWarning, true
		);

		if (isValid) {
			await useItemAddition().prepareItemForCart(item, requestedQty, context);
			await useItemAddition().addItem(item, context);
			qty.value = 1;
		}
	} else {
		emit("add-item", item);
	}
};

const scanProcessor = useScanProcessor({
	items, pos_profile, active_price_list,
	customer_price_list, itemDetailFetcher, itemAddition: { addItem: add_item },
	barcodeIndex: { lookupItemByBarcode, searchItemsByCode: searchItemsByCodeFn, ensureBarcodeIndex, replaceBarcodeIndex, indexItem, resetBarcodeIndex },
	scannerInput, searchCache: ref(new Map()), eventBus,
	format_number: itemDisplay.format_number, float_precision: computed(() => pos_profile.value?.float_precision || 2),
	hide_qty_decimals: computed(() => !!pos_profile.value?.posa_hide_qty_decimals),
	blockSaleBeyondAvailableQty, currency_precision: computed(() => pos_profile.value?.currency_precision || 2),
	exchange_rate: computed(() => 1), format_currency: itemDisplay.format_currency, ratePrecision: itemDisplay.ratePrecision,
	customer: selectedCustomer, onItemAdded: () => { clearSearch(); itemsSelectorFocus.focusItemSearch(); },
	onItemNotFound: (code) => { search_input.value = code; first_search.value = code; },
	stock_settings
});

// 6. Template Helpers
const clearSearch = () => {
	clearingSearch.value = true;
	search_input.value = "";
	first_search.value = "";
	clearingSearch.value = false;
};

const onDragStart = (event, item) => {
	isDragging.value = true;
	event.dataTransfer.setData("application/json", JSON.stringify({ type: "item-from-selector", item }));
	event.dataTransfer.effectAllowed = "copy";
	uiStore.setDraggedItem(item);
};

const onDragEnd = () => {
	isDragging.value = false;
	uiStore.setDraggedItem(null);
};

const formatBackgroundSyncTime = () => {
	const lastSync = itemSync.last_background_sync_time?.value;
	if (!lastSync) return __("Never");
	const parsed = new Date(lastSync);
	return Number.isNaN(parsed.getTime()) ? __("Never") : parsed.toLocaleTimeString();
};

const toggleItemSettings = () => { 
	temp_hide_qty_decimals.value = hide_qty_decimals.value;
	temp_hide_zero_rate_items.value = hide_zero_rate_items.value;
	temp_enable_custom_items_per_page.value = enable_custom_items_per_page.value;
	temp_items_per_page.value = items_per_page.value;
	temp_force_server_items.value = !!(pos_profile.value && pos_profile.value.posa_force_server_items);
	temp_show_last_invoice_rate.value = show_last_invoice_rate.value;
	temp_enable_background_sync.value = enable_background_sync.value;
	temp_background_sync_interval.value = background_sync_interval.value;
	show_item_settings.value = true;
};

const applyItemSettings = (settings) => {
	itemsSelectorSettings.applyItemSettings(settings);
};

// 7. Lifecycle Hooks
onMounted(() => {
	itemAvailability.registerCallbacks({
		getItems: () => items.value,
		getDisplayedItems: () => displayedItems.value,
		getFilteredItems: () => filteredItems.value,
		updateItemsDetails: (its, opts) => itemDetailFetcher.update_items_details(its, opts),
	});

	itemDisplay.registerContext({
		get context() { return props.context; },
		get pos_profile() { return pos_profile.value; },
		get float_precision() { return pos_profile.value?.float_precision || 2; },
		get currency_precision() { return pos_profile.value?.currency_precision || 2; },
		get exchange_rate() { return 1; },
	});

	itemsLoader.registerContext({
		get eventBus() { return eventBus; },
		get itemsStore() { return itemsIntegration.itemsStore; },
		get itemDetailFetcher() { return itemDetailFetcher; },
		get displayedItems() { return displayedItems.value; },
		get cardColumns() { return cardColumns.value; },
		get loading() { return loading.value; },
	});

	itemSelection.registerContext({
		addItem: add_item,
		clearSearch: () => clearSearch(),
		focusItemSearch: () => itemsSelectorFocus.focusItemSearch(),
		fly, get flyConfig() { return flyConfig; },
		get displayedItems() { return displayedItems.value; },
	});

	itemSync.registerContext({
		get pos_profile() { return pos_profile.value; },
		get enable_background_sync() { return enable_background_sync.value; },
		get background_sync_interval() { return background_sync_interval.value; },
		refreshModifiedItems: () => itemsIntegration.fetchModifiedItems(),
		backgroundSyncItems: (args) => itemsIntegration.backgroundSyncItems(args),
		get_items: (force) => itemsIntegration.refreshItems(force),
		itemDetailFetcher,
	});

	if (scannerInput.setScanHandler) {
		scannerInput.setScanHandler(scanProcessor.processScannedItem);
	}

	if (eventBus) {
		eventBus.on("update_currency", (data) => {
			if (data && data.currency) {
				selected_currency.value = data.currency;
			}
		});
	}

	// Watch UI Profile for initialization (Source of Truth)
	watch(uiPosProfile, async (newProfile) => {
		if (newProfile && newProfile.name && !isInitialized.value) {
			// Safety timeout to prevent infinite loading if memoryInit or store init hangs
			if (initTimeout.value) clearTimeout(initTimeout.value);
			initTimeout.value = setTimeout(() => {
				if (!isInitialized.value) {
					console.warn("ItemsSelector: Initialization taking too long, forcing isInitialized to true.");
					isInitialized.value = true;
				}
			}, 10000);

			try {
				await memoryInitPromise;
				
				// Set local currency ref
				selected_currency.value = newProfile.currency || "";

				await itemsIntegration.initializeStore(newProfile, selectedCustomer.value, customer_price_list.value);
				
				isInitialized.value = true;
				startItemWorker();
				itemDetailFetcher.update_cur_items_details();
				itemSync.startBackgroundSyncScheduler();
				itemsSelectorSettings.loadItemSettings();
			} catch (err) {
				console.error("ItemsSelector: Initialization failed", err);
				initError.value = err.message || err;
				// Unblock UI even on error
				isInitialized.value = true;
			} finally {
				if (initTimeout.value) {
					clearTimeout(initTimeout.value);
					initTimeout.value = null;
				}
			}
		}
	}, { immediate: true });

	window.addEventListener("resize", checkItemContainerOverflow);
	nextTick(() => {
		checkItemContainerOverflow();
		scheduleCardMetricsUpdate();
	});
});

onBeforeUnmount(() => {
	if (initTimeout.value) clearTimeout(initTimeout.value);
	itemSync.stopBackgroundSyncScheduler();
	if (itemWorker.value) itemWorker.value.terminate();
	if (eventBus) {
		eventBus.off("update_currency");
	}
	window.removeEventListener("resize", checkItemContainerOverflow);
});

// 8. Watchers
watch(search_input, (val) => {
	first_search.value = val;
	itemSelection.clearHighlightedItem();
});

watch(selectedCustomer, () => {
	clearLastInvoiceRateCache();
	scheduleLastInvoiceRateRefresh();
});

watch(displayedItems, () => {
	nextTick(() => {
		checkItemContainerOverflow();
		scheduleCardMetricsUpdate();
	});
	scheduleLastInvoiceRateRefresh();
	itemSelection.syncHighlightedItem();
});

// 9. Template Bindings & Direct Exports
const ratePrecision = itemDisplay.ratePrecision;
const format_currency = itemDisplay.format_currency;
const format_number = itemDisplay.format_number;
const currencySymbol = itemDisplay.currencySymbol;
const headers = computed(() => itemDisplay.headers.value);
const memoizedFormatCurrency = computed(() => itemDisplay.memoizedFormatCurrency.value);
const memoizedFormatNumber = computed(() => itemDisplay.memoizedFormatNumber.value);

const isItemHighlighted = (index) => itemSelection.highlightedIndex.value === index;
const isNegative = (val) => val < 0;

const { scannerLocked, scanErrorDialog, scanErrorMessage, scanErrorCode, scanErrorDetails, acknowledgeScanError, onBarcodeScanned } = scannerInput;
const { responsiveStyles } = responsive;
const { rtlClasses } = rtl;

// Proxy functions for template
const esc_event = () => clearSearch();
const onEnter = (e) => itemsSelectorSearch.onEnter(e);
const handleSearchKeydown = (e) => itemsSelectorFocus.handleSearchKeydown(e);
const handleSearchInput = (val) => { search_input.value = val; };
const handleSearchPaste = (e) => itemsSelectorFocus.handleSearchPaste(e);
const handleItemSearchFocus = () => itemsSelectorFocus.focusItemSearch();
const clearQty = () => { qty.value = 1; };
const startCameraScanning = () => { scannerInput.cameraScannerActive.value = true; };
const forceReloadItems = () => itemsIntegration.refreshItems(true);

const getItemRowClass = (item) => ({
    'pos-item-row': true,
    'highlighted': isItemHighlighted(items.value.indexOf(item))
});

const getItemRowProps = (item) => ({
    'data-item-code': item.item_code,
    'draggable': true
});

const handleItemCreated = (item) => {
    newItemDialog.value = false;
    itemsIntegration.refreshItems(true);
};

defineExpose({
	search_input, debounce_qty, qty, items_view, pos_profile, isLoadingOrSyncing, displayedItems,
	headers, active_price_list, memoizedFormatCurrency, memoizedFormatNumber,
	ratePrecision, format_currency, format_number, currencySymbol,
	openNewItemDialog: () => { newItemDialog.value = true; },
	clearSearch, onDragStart, onDragEnd,
	select_item: itemSelection.handleItemSelection,
	click_item_row: itemSelection.handleRowClick,
	onVirtualRangeUpdate: (s, e, vs, ve) => itemsLoader.onVirtualRangeUpdate(s, e, vs, ve),
	onListScroll: handleListScroll,
	responsiveStyles, rtlClasses, scanErrorDialog, scanErrorMessage, scanErrorCode, scanErrorDetails,
	acknowledgeScanError, formatBackgroundSyncTime, esc_event, onEnter, handleSearchKeydown,
	handleSearchInput, handleSearchPaste, handleItemSearchFocus, clearQty, startCameraScanning,
	toggleItemSettings, forceReloadItems, applyItemSettings, show_item_settings,
	items_group, item_group, offersCount, couponsCount, virtualScrollBuffer, selected_currency,
	getLastInvoiceRate, isItemHighlighted, isNegative, headerProps, getItemRowClass, getItemRowProps,
	handleItemCreated, onBarcodeScanned, onScannerOpened: () => console.log("Scanner opened"), onScannerClosed: () => { scannerInput.cameraScannerActive.value = false; }, new_line,
	hide_qty_decimals, hide_zero_rate_items, show_last_invoice_rate, enable_background_sync,
	background_sync_interval, enable_custom_items_per_page, items_per_page, scannerLocked,
	temp_hide_qty_decimals, temp_hide_zero_rate_items, temp_enable_custom_items_per_page,
	temp_items_per_page, temp_force_server_items, temp_show_last_invoice_rate,
	temp_enable_background_sync, temp_background_sync_interval, localStorageAvailable,
	clearLastInvoiceRateCache, scheduleLastInvoiceRateRefresh, itemSync
});
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
