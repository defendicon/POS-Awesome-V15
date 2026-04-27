<template>
	<div class="items-selector-shell" :style="responsiveStyles">
		<ScanErrorDialog
			v-model="scanErrorDialog"
			:message="scanErrorMessage"
			:code="scanErrorCode"
			:details="scanErrorDetails"
			@acknowledge="acknowledgeScanError"
		/>
		<v-card
			:class="[
				'selection selection-card mx-auto my-0 py-0 mt-3 pos-card dynamic-card resizable pos-themed-card',
				{ 'selection-card--phone': isPhone },
				rtlClasses,
			]"
			:style="selectorCardStyle"
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
				<v-card flat class="selector-section-card selector-header-card pos-themed-card">
					<ItemHeader
						v-model:search-input="search_input"
						v-model:qty-input="debounce_qty"
						:pos-profile="pos_profile"
						:scanner-locked="scannerLocked"
						:enable-background-sync="enable_background_sync"
						:last-sync-time="lastSyncTimeLabel"
						:sync-status="syncStatus"
						:show-sync-progress="showSearchSyncProgress"
						:sync-progress="syncProgressValue"
						:sync-items-count="syncItemsCount"
						:context="context"
						@esc="esc_event"
						@enter="onEnter"
						@search-keydown="handleSearchKeydown"
						@clear-search="clearSearch"
						@clear-search-and-qty="clearSearchAndQty"
						@search-input="handleSearchInput"
						@search-paste="handleSearchPaste"
						@focus="handleItemSearchFocus"
						@clear-qty="clearQty"
						@blur-qty="onQtyBlur"
						@start-camera="startCameraScanning"
						@open-new-item="openNewItemDialog"
						@toggle-settings="toggleItemSettings"
						@reload-items="forceReloadItems"
						ref="itemHeader"
					/>
				</v-card>

				<ItemSettingsDialog
					v-model="show_item_settings"
					:allow-new-line-setting="!!pos_profile?.posa_new_line"
					:initial-settings="{
						new_line,
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

				<v-card flat class="selector-section-card selector-results-card pos-themed-card">
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
								:show-rate-info="show_last_invoice_rate"
								:get-item-rate-info="getItemRateInfo"
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
						:show-rate-info="show_last_invoice_rate"
						:currency-symbol="currencySymbol"
						:format-currency="memoizedFormatCurrency"
						:format-number="memoizedFormatNumber"
						:rate-precision="ratePrecision"
						:get-item-rate-info="getItemRateInfo"
								:is-negative="isNegative"
								:item-class="getItemRowClass"
								:row-props="getItemRowProps"
								:no-data-text="__('No items found')"
								@row-click="click_item_row"
								@list-scroll="onListScroll"
							/>
						</v-col>
					</v-row>
				</v-card>
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
			:reserve-bottom-dock-space="context === 'pos' && responsive.windowWidth.value < 1100"
			@open-offers="uiStore.setActiveView('offers')"
			@open-coupons="uiStore.setActiveView('coupons')"
		/>

		<!-- New Item Dialog -->
		<NewItemDialog
			v-model="newItemDialog"
			:items-group="items_group"
			:camera-enabled="!!pos_profile.posa_enable_camera_scanning"
			:scanned-barcode="newItemDialogScannedBarcode"
			@request-camera-scan="startNewItemBarcodeScan"
			@item-created="handleItemCreated"
		/>

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

<script setup lang="ts">
import {
	getCurrentInstance,
	onMounted,
	onBeforeUnmount,
	ref,
	computed,
	watch,
	reactive,
	inject,
	type Ref,
} from "vue";
import { storeToRefs } from "pinia";
import * as _ from "lodash";

import CameraScanner from "./CameraScanner.vue";
import ItemActionToolbar from "./ItemActionToolbar.vue";
import ItemSettingsDialog from "./ItemSettingsDialog.vue";
import ItemHeader from "./ItemHeader.vue";
import ItemsSelectorCards from "./ItemsSelectorCards.vue";
import ItemsSelectorTable from "./ItemsSelectorTable.vue";
import NewItemDialog from "./NewItemDialog.vue";
import ScanErrorDialog from "./ScanErrorDialog.vue";

import { useResponsive } from "../../../composables/core/useResponsive";
import { useRtl } from "../../../composables/core/useRtl";
import { useFlyAnimation } from "../../../composables/core/useFlyAnimation";
import { useCartValidation } from "../../../composables/pos/items/useCartValidation";
import { useItemsIntegration } from "../../../composables/pos/items/useItemsIntegration";
import { useItemSearch } from "../../../composables/pos/items/useItemSearch";
import { useScannerInput } from "../../../composables/pos/items/useScannerInput";
import { useItemAvailability } from "../../../composables/pos/items/useItemAvailability";
import { useItemDetailFetcher } from "../../../composables/pos/items/useItemDetailFetcher";
import { useItemAddition } from "../../../composables/pos/items/useItemAddition";
import { useItemSelection } from "../../../composables/pos/items/useItemSelection";
import { useItemSelectorLayout } from "../../../composables/pos/items/useItemSelectorLayout";
import { useLastInvoiceRate } from "../../../composables/pos/items/useLastInvoiceRate";
import { useLastBuyingRate } from "../../../composables/pos/items/useLastBuyingRate";
import { useItemRateInfo } from "../../../composables/pos/items/useItemRateInfo";
import { useItemSync } from "../../../composables/pos/items/useItemSync";
import { useItemStorageSafety } from "../../../composables/pos/items/useItemStorageSafety";
import { useItemsSelectorSearch } from "../../../composables/pos/items/useItemsSelectorSearch";
import { useItemsSelectorSettings } from "../../../composables/pos/items/useItemsSelectorSettings";
import { useItemsSelectorFocus } from "../../../composables/pos/items/useItemsSelectorFocus";
import { useItemDisplay } from "../../../composables/pos/items/useItemDisplay";
import { useItemsLoader } from "../../../composables/pos/items/useItemsLoader";
import { useBarcodeIndexing } from "../../../composables/pos/items/useBarcodeIndexing";
import { useScanProcessor } from "../../../composables/pos/items/useScanProcessor";
import { useItemCurrency } from "../../../composables/pos/items/useItemCurrency";
import { startItemsSelectorInitialization } from "../../../composables/pos/items/useItemsSelectorInitialization";
import { registerItemsSelectorEvents } from "../../../composables/pos/items/useItemsSelectorEvents";
import { registerItemsSelectorTypeToSearch } from "../../../composables/pos/items/useItemsSelectorTypeToSearch";
import { useItemsSelectorLayoutLifecycle } from "../../../composables/pos/items/useItemsSelectorLayoutLifecycle";
import { useItemsSelectorSearchInput } from "../../../composables/pos/items/useItemsSelectorSearchInput";
import { useItemsSelectorScannerBridge } from "../../../composables/pos/items/useItemsSelectorScannerBridge";
import { useItemsSelectorPriceListSync } from "../../../composables/pos/items/useItemsSelectorPriceListSync";
import { useItemsSelectorPanelSizing } from "../../../composables/pos/items/useItemsSelectorPanelSizing";
import { useItemsSelectorQuantity } from "../../../composables/pos/items/useItemsSelectorQuantity";
import { useItemsSelectorDisplayBindings } from "../../../composables/pos/items/useItemsSelectorDisplayBindings";

import { useCustomersStore } from "../../../stores/customersStore";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { useEmployeeStore } from "../../../stores/employeeStore";

import { parseBooleanSetting } from "../../../utils/stock";
import { createItemSearchFocusClearGuard } from "../../../utils/itemSearchFocusClearGuard";

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
const employeeStore = useEmployeeStore();
const { selectedCustomer } = storeToRefs(customersStore);
const {
	posProfile: uiPosProfile,
	searchFocusTrigger,
	triggerTopItemSelection,
	activeView,
} = storeToRefs(uiStore);
const { currentCashier } = storeToRefs(employeeStore);
const { deferStockValidationToPayment: invoiceTypeDefersStockValidation } =
	storeToRefs(invoiceStore);

const __ = (window as any).__;

const eventBus = inject("eventBus") as any;
const selected_currency = ref("");
const selected_exchange_rate = ref(1);
const selected_conversion_rate = ref(1);
const isInitialized = ref(false);
const initTimeout = ref<ReturnType<typeof setTimeout> | null>(null);
const initError = ref<unknown>(null);
let stopItemInitializationWatcher: (() => void) | null = null;
let cleanupItemsSelectorEvents: (() => void) | null = null;
let cleanupTypeToSearch: (() => void) | null = null;
let cleanupLayoutLifecycle: (() => void) | null = null;
let cleanupSearchInput: (() => void) | null = null;

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
	fetchServerItemsTimestamp,
} = useItemSearch();

const scannerInput = useScannerInput();
const itemAvailability = useItemAvailability();
const itemDetailFetcher = useItemDetailFetcher();
const itemSelection = useItemSelection();
const itemSync = useItemSync();
const itemDisplay = useItemDisplay();
const itemsLoader = useItemsLoader();
const itemCurrencyUtils = useItemCurrency();
const { startItemWorker, itemWorker, storageAvailable, markStorageUnavailable } =
	useItemStorageSafety();
const {
	ensureBarcodeIndex,
	resetBarcodeIndex,
	indexItem,
	replaceBarcodeIndex,
	lookupItemByBarcode,
	searchItemsByCode: searchItemsByCodeFn,
} = useBarcodeIndexing();

// 2. Local State & Settings
const search_input = ref("");
const first_search = ref("");
const items_view = ref("list");
const itemsPerPage = ref(50);
const clearingSearch = ref(false);
const isDragging = ref(false);
const new_line = ref(false);
const item_group = computed({
	get: () => {
		const selectedGroup = itemsIntegration.item_group.value;
		return typeof selectedGroup === "string" && selectedGroup.length > 0
			? selectedGroup
			: "ALL";
	},
	set: (value: string) => {
		const normalized =
			typeof value === "string" && value.length > 0 ? value : "ALL";
		itemsIntegration.item_group.value = normalized;
	},
});
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
const temp_new_line = ref(false);
const temp_hide_qty_decimals = ref(false);
const temp_hide_zero_rate_items = ref(false);
const temp_enable_custom_items_per_page = ref(false);
const temp_items_per_page = ref(50);
const temp_force_server_items = ref(false);
const temp_show_last_invoice_rate = ref(true);
const temp_enable_background_sync = ref(true);
const temp_background_sync_interval = ref(30);

const {
	qty,
	debounceQty: debounce_qty,
	clearQty,
	onQtyBlur,
} = useItemsSelectorQuantity({
	hideQtyDecimals: hide_qty_decimals,
	initialQty: 1,
});

const flyConfig = reactive({ speed: 0.6, easing: "ease-in-out" });

// 3. Computed Properties
const pos_profile = computed(() => (itemsIntegration.posProfile.value || {}) as any);
const usesLimitSearch = computed(() =>
	parseBooleanSetting(
		pos_profile.value?.posa_use_limit_search ?? pos_profile.value?.pose_use_limit_search,
	),
);
const { stockSettings: stock_settings_ref } = storeToRefs(uiStore);
const stock_settings = computed(() => stock_settings_ref.value || {});
const items_group = computed(() => itemsIntegration.items_group.value || []);
const offersCount = computed(() => uiStore.offersCount || 0);
const couponsCount = computed(() => uiStore.couponsCount || 0);
// selected_currency is now a local ref synced via eventBus
const active_price_list = computed(
	() => itemsIntegration.active_price_list.value || pos_profile.value?.selling_price_list,
);
const { syncSelectorPriceList } = useItemsSelectorPriceListSync({
	activePriceList: itemsIntegration.active_price_list,
	getDefaultPriceList: () => pos_profile.value?.selling_price_list || "",
	updatePriceList: (priceList) => itemsIntegration.updatePriceList(priceList),
	getItems: (force) => itemsIntegration.get_items(force),
});
const isPosSupervisor = computed(() =>
	parseBooleanSetting(currentCashier.value?.is_supervisor),
);

const isReturnInvoice = computed(() => {
	return !!invoiceStore.invoiceDoc?.is_return;
});

const blockSaleBeyondAvailableQty = computed(() => {
	if (props.context === "purchase" || invoiceTypeDefersStockValidation.value) {
		return false;
	}
	return parseBooleanSetting(
		pos_profile.value?.posa_block_sale_beyond_available_qty,
	);
});

const deferStockValidationToPayment = computed(() =>
	props.context === "purchase" || invoiceTypeDefersStockValidation.value,
);
const forceCustomerPriceList = computed(() =>
	parseBooleanSetting(pos_profile.value?.posa_force_price_from_customer_price_list),
);

const {
	items,
	filteredItems,
	customer_price_list,
	loading,
	isBackgroundLoading,
	loadProgress,
	syncedItemsCount,
} = itemsIntegration;

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

watch(
	() => props.showOnlyBarcodeItems,
	(value) => {
		showOnlyBarcodeItemsRef.value = !!value;
	},
	{ immediate: true },
);

watch(
	new_line,
	(value) => {
		if (eventBus && typeof eventBus.emit === "function") {
			eventBus.emit("set_new_line", !!value);
		}
	},
	{ immediate: true },
);

const isLoadingOrSyncing = computed(() => {
	if (loading.value) return true;
	if (isBackgroundLoading.value && items.value.length === 0) return true;
	return false;
});

const syncStatus = computed(() => {
	if (loading.value) return __("Loading items...");
	if (isBackgroundLoading.value && syncProgressValue.value > 0) {
		return __("Syncing items in background");
	}
	if (isBackgroundLoading.value) return __("Preparing background sync");
	return "";
});

const syncProgressValue = computed(() => {
	const progress = Number(loadProgress.value || 0);
	if (!Number.isFinite(progress) || progress <= 0) {
		return 0;
	}
	return Math.min(100, Math.round(progress));
});

const syncItemsCount = computed(() => {
	const count = Number(syncedItemsCount.value || 0);
	if (!Number.isFinite(count) || count <= 0) {
		return 0;
	}
	return Math.round(count);
});

const showSearchSyncProgress = computed(
	() => isBackgroundLoading.value && items.value.length > 0,
);

const lastSyncTimeLabel = computed(() => {
	const lastSync = itemSync.last_background_sync_time?.value;
	if (!lastSync) return __("Never");
	const parsed = new Date(lastSync);
	return Number.isNaN(parsed.getTime()) ? __("Never") : parsed.toLocaleTimeString();
});

// 4. Initialization logic for Composables needing Context

// Settings context object for useItemsSelectorSettings
const settingsContext = reactive({
	new_line,
	hide_qty_decimals,
	hide_zero_rate_items,
	show_last_invoice_rate,
	enable_background_sync,
	background_sync_interval,
	enable_custom_items_per_page,
	items_per_page,
	temp_new_line,
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

const itemsSelectorSearch = useItemsSelectorSearch({
	getVM: () => vmInstance?.proxy,
	scannerInput,
	itemSelection,
	getSearchInput: () => String(search_input.value || first_search.value || ""),
	setSearchInput: (value) => {
		search_input.value = value;
		first_search.value = value;
	},
	isLimitSearchEnabled: () => usesLimitSearch.value,
	runLimitSearch: (term) => itemsIntegration.searchItems(term),
	clearHighlightedItem: () => itemSelection.clearHighlightedItem(),
});
const itemsSelectorSettings = useItemsSelectorSettings({ getVM: () => settingsContext, itemSync });
const itemsSelectorFocus = useItemsSelectorFocus({
	getVM: () => vmInstance?.proxy,
	scannerInput,
	itemSelection,
});

const { getLastInvoiceRate, scheduleLastInvoiceRateRefresh, clearLastInvoiceRateCache } = useLastInvoiceRate({
	pos_profile: () => pos_profile.value,
	customer: () => selectedCustomer.value,
	displayedItems: () => displayedItems.value,
	show_last_invoice_rate: () => show_last_invoice_rate.value,
	autoRefresh: true,
});

const selectedSupplier = ref<string | null>(null);

const { getLastBuyingRate, scheduleLastBuyingRateRefresh, clearLastBuyingRateCache } = useLastBuyingRate({
	pos_profile: () => pos_profile.value,
	supplier: () => selectedSupplier.value,
	displayedItems: () => displayedItems.value,
	show_last_buying_rate: () =>
		show_last_invoice_rate.value
		&& parseBooleanSetting(currentCashier.value?.is_supervisor),
});

const getLastRateForContext = (item: any) => {
	if (props.context === "purchase") {
		return getLastBuyingRate(item);
	}
	return getLastInvoiceRate(item);
};

const { getItemRateInfo } = useItemRateInfo({
	context: () => props.context,
	pos_profile: () => pos_profile.value,
	is_pos_supervisor: () => isPosSupervisor.value,
	getLastInvoiceRate,
	getLastBuyingRate,
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

const itemSelectorLayoutLifecycle = useItemsSelectorLayoutLifecycle({
	displayedItems,
	checkItemContainerOverflow,
	scheduleCardMetricsUpdate,
	scheduleLastInvoiceRateRefresh,
	scheduleLastBuyingRateRefresh,
	syncHighlightedItem: () => itemSelection.syncHighlightedItem(),
});

// 5. Core Methods
const add_item = async (item, optionsOrQty: any = {}) => {
	if (props.context === "pos") {
		let options: any = typeof optionsOrQty === "object" ? optionsOrQty : { qty: optionsOrQty };
		let requestedQty = options.qty !== undefined ? options.qty : qty.value || 0;
		requestedQty =
			requestedQty === "" || requestedQty == null ? 1 : Math.abs(parseFloat(requestedQty) || 1);

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
			selected_currency: selected_currency.value,
			exchange_rate: selected_exchange_rate.value,
			conversion_rate: selected_conversion_rate.value,
			price_list_currency: item.original_currency || item.currency || pos_profile.value?.currency,
			itemCurrencyUtils,
			invoiceStore,
			itemDetailFetcher,
			items: invoiceStore.items,
			isReturnInvoice: isReturnInvoice.value,
			...options,
			new_line:
				typeof options?.new_line === "boolean"
					? options.new_line
					: !!new_line.value,
		};

		const isValid = await cartValidation.validateCartItem(
			item,
			requestedQty,
			pos_profile.value,
			stock_settings.value,
			null,
			blockSaleBeyondAvailableQty.value,
			!options.suppressNegativeWarning,
			true,
			isReturnInvoice.value,
			deferStockValidationToPayment.value,
		);

		if (isValid) {
			await useItemAddition().prepareItemForCart(item, requestedQty, context);
			await useItemAddition().addItem(item, context);
			if (eventBus && typeof eventBus.emit === "function") {
				eventBus.emit("apply_pricing_rules");
			}
			qty.value = 1;
		}
	} else {
		emit("add-item", item);
	}
};

const scanProcessor = useScanProcessor({
	items,
	pos_profile,
	isReturnInvoice,
	active_price_list,
	customer_price_list,
	itemDetailFetcher,
	itemAddition: { addItem: add_item },
	barcodeIndex: {
		lookupItemByBarcode,
		searchItemsByCode: searchItemsByCodeFn,
		ensureBarcodeIndex,
		replaceBarcodeIndex,
		indexItem,
		resetBarcodeIndex,
	},
	scannerInput,
	searchCache: ref(new Map()) as Ref<Map<any, any>>,
	eventBus,
	format_number: itemDisplay.format_number,
	float_precision: computed(() => pos_profile.value?.float_precision || 2),
	hide_qty_decimals: computed(() => !!hide_qty_decimals.value),
	blockSaleBeyondAvailableQty,
	deferStockValidationToPayment,
	currency_precision: computed(() => pos_profile.value?.currency_precision || 2),
	exchange_rate: computed(() => selected_exchange_rate.value),
	selected_currency,
	conversion_rate: selected_conversion_rate,
	format_currency: itemDisplay.format_currency,
	ratePrecision: itemDisplay.ratePrecision,
	customer: selectedCustomer,
	onItemAdded: () => {
		clearSearch();
		itemsSelectorFocus.focusItemSearch();
	},
	onItemNotFound: (code) => {
		search_input.value = code;
		first_search.value = code;
	},
	stock_settings,
	search_from_scanner_ref: scannerInput.searchFromScanner,
});

const clearSearchAndQty = () => {
	clearSearch();
	clearQty();
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

const toggleItemSettings = () => {
	temp_new_line.value = new_line.value;
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

const handleRemoteStockAdjustment = (payload: unknown) => {
	itemAvailability.handleInvoiceStockAdjusted(payload);
};

onMounted(async () => {
	itemAvailability.initAvailability();

	itemAvailability.registerCallbacks({
		getItems: () => items.value,
		getDisplayedItems: () => displayedItems.value,
		getFilteredItems: () => filteredItems.value,
		updateItemsDetails: (its, opts) => itemDetailFetcher.update_items_details(its, opts),
	});

	itemDetailFetcher.registerContext({
		get pos_profile() {
			return pos_profile.value;
		},
		get active_price_list() {
			return active_price_list.value;
		},
		get items() {
			return items.value;
		},
		get displayedItems() {
			return displayedItems.value;
		},
		itemAvailability,
		itemCurrencyUtils,
		get usesLimitSearch() {
			return parseBooleanSetting(
				pos_profile.value?.posa_use_limit_search ?? pos_profile.value?.pose_use_limit_search,
			);
		},
		get storageAvailable() {
			return storageAvailable.value;
		},
		markStorageUnavailable,
		applyCurrencyConversionToItem: (item) => {
			itemCurrencyUtils.applyCurrencyConversionToItem(item, {
				pos_profile: pos_profile.value,
				price_list_currency:
					item?.original_currency || item?.currency || pos_profile.value?.currency,
				selected_currency: selected_currency.value || pos_profile.value?.currency,
				exchange_rate: selected_exchange_rate.value,
				conversion_rate: selected_conversion_rate.value,
				currency_precision: pos_profile.value?.currency_precision || 2,
				flt: (window as any).frappe?.utils?.flt,
			});
		},
		forceUpdate: () => vmInstance?.proxy?.$forceUpdate?.(),
	});

	itemDisplay.registerContext({
		get context() {
			return props.context;
		},
		get pos_profile() {
			return pos_profile.value;
		},
		get float_precision() {
			return pos_profile.value?.float_precision || 2;
		},
		get currency_precision() {
			return pos_profile.value?.currency_precision || 2;
		},
		get exchange_rate() {
			return selected_exchange_rate.value;
		},
	});

	itemsLoader.registerContext({
		get eventBus() {
			return eventBus;
		},
		get itemsStore() {
			return itemsIntegration.itemsStore;
		},
		get itemDetailFetcher() {
			return itemDetailFetcher;
		},
		get displayedItems() {
			return displayedItems.value;
		},
		get cardColumns() {
			return cardColumns.value;
		},
		get loading() {
			return loading.value;
		},
	});

	itemSelection.registerContext({
		addItem: add_item,
		clearSearch: () => clearSearch(),
		focusItemSearch: () => itemsSelectorFocus.focusItemSearch(),
		fly,
		get flyConfig() {
			return flyConfig;
		},
		get displayedItems() {
			return displayedItems.value;
		},
	});

	itemSync.registerContext({
		get pos_profile() {
			return pos_profile.value;
		},
		get enable_background_sync() {
			return enable_background_sync.value;
		},
		get background_sync_interval() {
			return background_sync_interval.value;
		},
		get usesLimitSearch() {
			return usesLimitSearch.value;
		},
		get itemsPageLimit() {
			return enable_custom_items_per_page.value
				? items_per_page.value
				: itemsPerPage.value;
		},
		getBackgroundSyncPriceList: () => {
			const customerPriceList =
				typeof customer_price_list.value === "string"
					? customer_price_list.value.trim()
					: "";
			const profilePriceList =
				typeof pos_profile.value?.selling_price_list === "string"
					? pos_profile.value.selling_price_list.trim()
					: "";

			if (forceCustomerPriceList.value && customerPriceList) {
				return customerPriceList;
			}

			return profilePriceList || customerPriceList || null;
		},
		refreshModifiedItems: (priceListOverride) =>
			itemsIntegration.refreshModifiedItems(priceListOverride),
		backgroundSyncItems: (args) => itemsIntegration.backgroundSyncItems(args),
		get_items: (force) => itemsIntegration.get_items(force),
		search_onchange: (value, fromScanner) =>
			itemsIntegration.search_onchange(value, fromScanner),
		fetchServerItemsTimestamp,
		eventBus,
		getItems: () => items.value,
		getDisplayedItems: () => displayedItems.value,
		itemDetailFetcher,
	});

	if (scannerInput.setScanHandler) {
		scannerInput.setScanHandler(scanProcessor.processScannedItem);
	}

	cleanupItemsSelectorEvents = registerItemsSelectorEvents({
		eventBus,
		selectedCurrency: selected_currency,
		selectedExchangeRate: selected_exchange_rate,
		selectedConversionRate: selected_conversion_rate,
		selectedSupplier,
		syncSelectorPriceList,
		scheduleLastBuyingRateRefresh,
		requestItemSearchFocus,
		handleCartQuantitiesUpdated: itemAvailability.handleCartQuantitiesUpdated,
		handleRemoteStockAdjustment,
	});

	stopItemInitializationWatcher = startItemsSelectorInitialization({
		uiPosProfile,
		selectedCustomer,
		customerPriceList: customer_price_list,
		selectedCurrency: selected_currency,
		selectedExchangeRate: selected_exchange_rate,
		selectedConversionRate: selected_conversion_rate,
		isInitialized,
		initTimeout,
		initError,
		itemsIntegration,
		startItemWorker,
		loadItemSettings: () => itemsSelectorSettings.loadItemSettings(),
		startBackgroundSyncScheduler: () => itemSync.startBackgroundSyncScheduler(),
	});

	itemSelectorLayoutLifecycle.mount();
	cleanupLayoutLifecycle = itemSelectorLayoutLifecycle.cleanup;
	cleanupTypeToSearch = registerItemsSelectorTypeToSearch({
		getContext: () => props.context,
		activeView,
		cameraScannerActive: scannerInput.cameraScannerActive,
		prepareSearchInjection,
		revealItemSearchView,
		requestForegroundItemSearchFocus,
		appendSearchCharacter,
	});
});

onBeforeUnmount(() => {
	stopItemInitializationWatcher?.();
	stopItemInitializationWatcher = null;
	if (initTimeout.value) clearTimeout(initTimeout.value);
	itemSync.stopBackgroundSyncScheduler();
	// @ts-ignore
	if (itemWorker.value) itemWorker.value.terminate();
	cleanupItemsSelectorEvents?.();
	cleanupItemsSelectorEvents = null;
	cleanupTypeToSearch?.();
	cleanupTypeToSearch = null;
	cleanupLayoutLifecycle?.();
	cleanupLayoutLifecycle = null;
	cleanupSearchInput?.();
	cleanupSearchInput = null;
	itemSearchFocusClearGuard.dispose();
});

// 8. Watchers
watch(searchFocusTrigger, () => {
	requestItemSearchFocus();
});

watch(triggerTopItemSelection, () => {
	if (activeView.value !== "items") {
		uiStore.setActiveView("items");
	}
	itemSelection.selectTopItem();
});

watch(activeView, (view) => {
	if (view === "items") {
		requestItemSearchFocus();
	}
});

watch(selectedCustomer, () => {
	itemsIntegration.customer.value = selectedCustomer.value || null;
	clearLastInvoiceRateCache();
	scheduleLastInvoiceRateRefresh();
});

watch(isPosSupervisor, (isSupervisor) => {
	if (!isSupervisor) {
		clearLastBuyingRateCache();
		return;
	}
	scheduleLastBuyingRateRefresh();
});

// 9. Template Bindings & Direct Exports
const {
	ratePrecision,
	format_currency,
	format_number,
	currencySymbol,
	headers,
	memoizedFormatCurrency,
	memoizedFormatNumber,
	isItemHighlighted,
	isNegative,
	headerProps,
	getItemRowClass,
	getItemRowProps,
} = useItemsSelectorDisplayBindings({
	itemDisplay,
	itemSelection,
});

const {
	scannerLocked,
	scanErrorDialog,
	scanErrorMessage,
	scanErrorCode,
	scanErrorDetails,
	acknowledgeScanError,
	onBarcodeScanned: onBarcodeScannedFromScannerInput,
} = scannerInput;
const startCameraScanning = () => {
	itemsSelectorFocus.startCameraScanning();
};
const { responsiveStyles } = responsive;
const { rtlClasses } = rtl;
const isPhone = computed(() => responsive.isPhone.value);
const { selectorCardStyle } = useItemsSelectorPanelSizing({
	isPhone,
	windowWidth: responsive.windowWidth,
	windowHeight: responsive.windowHeight,
	responsiveStyles,
});
const itemSearchFocusClearGuard = createItemSearchFocusClearGuard();
const {
	clearSearch,
	handleSearchInput,
	prepareSearchInjection,
	appendSearchCharacter,
	revealItemSearchView,
	requestItemSearchFocus,
	requestForegroundItemSearchFocus,
	handleItemSearchFocus,
	cleanup: stopSearchInputWatcher,
} = useItemsSelectorSearchInput({
	searchInput: search_input,
	firstSearch: first_search,
	clearingSearch,
	activeView,
	eventBus,
	scannerInput,
	searchFocusGuard: itemSearchFocusClearGuard,
	clearHighlightedItem: () => itemSelection.clearHighlightedItem(),
	focusItemSearch: () => itemsSelectorFocus.focusItemSearch(),
	setActiveView: (view) => uiStore.setActiveView(view),
	triggerItemSearchFocus: () => uiStore.triggerItemSearchFocus(),
});
cleanupSearchInput = stopSearchInputWatcher;
const {
	newItemDialog,
	newItemDialogScannedBarcode,
	openNewItemDialog,
	startNewItemBarcodeScan,
	onBarcodeScanned,
	onScannerOpened,
	onScannerClosed,
	handleItemCreated,
} = useItemsSelectorScannerBridge({
	cameraScannerActive: scannerInput.cameraScannerActive,
	startCameraScanning,
	requestForegroundItemSearchFocus,
	onBarcodeScannedFromScannerInput,
	reloadItems: () => itemsIntegration.get_items(true),
});

// Proxy functions for template
const esc_event = () => clearSearch();
const onEnter = (e) => itemsSelectorSearch.onEnter(e);
const handleSearchKeydown = (e) => itemsSelectorFocus.handleSearchKeydown(e);
const handleSearchPaste = (e) => itemsSelectorFocus.handleSearchPaste(e);
const searchItems = (term) => itemsIntegration.searchItems(term);
const get_items = (force = false) => itemsIntegration.get_items(force);
const loadVisibleItems = (reset = false) => itemsLoader.loadVisibleItems(reset);
const verifyServerItemCount = () => {};
const forceReloadItems = () => itemsIntegration.get_items(true);
const cancelItemDetailsRequest = () => itemDetailFetcher.cancelItemDetailsRequest();

const select_item = (e, item) => itemSelection.handleItemSelection(e, item);
const click_item_row = (e, data) => itemSelection.handleRowClick(e, data);
const onVirtualRangeUpdate = (s, e, vs, ve) => itemsLoader.onVirtualRangeUpdate(s, e, vs, ve);
const onListScroll = (e) => handleListScroll(e);

defineExpose({
	search_input,
	debounce_qty,
	qty,
	items_view,
	pos_profile,
	isLoadingOrSyncing,
	displayedItems,
	headers,
	active_price_list,
	memoizedFormatCurrency,
	memoizedFormatNumber,
	ratePrecision,
	format_currency,
	format_number,
	currencySymbol,
	openNewItemDialog,
	clearSearch,
	onDragStart,
	onDragEnd,
	select_item,
	click_item_row,
	onVirtualRangeUpdate,
	onListScroll,
	responsiveStyles,
	rtlClasses,
	scanErrorDialog,
	scanErrorMessage,
	scanErrorCode,
	scanErrorDetails,
	acknowledgeScanError,
	lastSyncTimeLabel,
	esc_event,
	onEnter,
	handleSearchKeydown,
	handleSearchInput,
	handleSearchPaste,
	searchItems,
	get_items,
	loadVisibleItems,
	verifyServerItemCount,
	usesLimitSearch,
	storageAvailable,
	handleItemSearchFocus,
	clearQty,
	startCameraScanning,
	toggleItemSettings,
	forceReloadItems,
	cancelItemDetailsRequest,
	applyItemSettings,
	show_item_settings,
	items_group,
	item_group,
	offersCount,
	couponsCount,
	virtualScrollBuffer,
	selected_currency,
	getLastInvoiceRate,
	getLastRateForContext,
	getItemRateInfo,
	isItemHighlighted,
	isNegative,
	headerProps,
	getItemRowClass,
	getItemRowProps,
	handleItemCreated,
	onBarcodeScanned,
	onScannerOpened,
	onScannerClosed,
	new_line,
	temp_new_line,
	clearSearchAndQty,
	onQtyBlur,
	hide_qty_decimals,
	hide_zero_rate_items,
	show_last_invoice_rate,
	enable_background_sync,
	background_sync_interval,
	enable_custom_items_per_page,
	items_per_page,
	scannerLocked,
	temp_hide_qty_decimals,
	temp_hide_zero_rate_items,
	temp_enable_custom_items_per_page,
	temp_items_per_page,
	temp_force_server_items,
	temp_show_last_invoice_rate,
	temp_enable_background_sync,
	temp_background_sync_interval,
	localStorageAvailable,
	clearLastInvoiceRateCache,
	scheduleLastInvoiceRateRefresh,
	itemSync,
});
</script>

<style scoped>
/* "dynamic-card" no longer composes from pos-card; the pos-card class is added directly in the template */
.items-selector-shell {
	min-height: 0;
	min-width: 0;
}

.dynamic-padding {
	/* Equal spacing on all sides for consistent alignment */
	padding: var(--dynamic-sm);
	display: flex;
	flex-direction: column;
	gap: var(--dynamic-sm);
}

.selection-card {
	border-radius: 22px;
}

.selector-section-card {
	background: var(--pos-card-bg) !important;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
	border-radius: var(--pos-radius-md, 18px);
	box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
}

.section-card-heading {
	padding: 14px 16px 0;
}

.section-card-heading--with-padding {
	padding-bottom: 8px;
}

.section-card-heading__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	line-height: 1.25;
	color: var(--pos-text-primary);
}

.selector-header-card {
	padding: 0;
	overflow: hidden;
	position: sticky;
	top: 0;
	z-index: 8;
}

.selector-results-card {
	padding: var(--dynamic-xs);
	overflow: hidden;
	min-width: 0;
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
	background-color: var(--pos-surface-muted) !important;
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

	.selection-card {
		margin-top: var(--dynamic-xs) !important;
	}

	.selector-header-card {
		top: max(4px, env(safe-area-inset-top));
		z-index: 12;
		box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
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
