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
						:get-last-invoice-rate="getLastRateForContext"
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
						:get-last-invoice-rate="getLastRateForContext"
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
	nextTick,
	reactive,
	inject,
	type Ref,
	type CSSProperties,
} from "vue";
import { storeToRefs } from "pinia";
import * as _ from "lodash";
import { memoryInitPromise } from "../../../offline/index";

import CameraScanner from "./CameraScanner.vue";
import ItemActionToolbar from "./ItemActionToolbar.vue";
import ItemSettingsDialog from "./ItemSettingsDialog.vue";
import ItemHeader from "./ItemHeader.vue";
import ItemsSelectorCards from "./ItemsSelectorCards.vue";
import ItemsSelectorTable from "./ItemsSelectorTable.vue";
import NewItemDialog from "./NewItemDialog.vue";
import ScanErrorDialog from "./ScanErrorDialog.vue";
import { resetNewItemDialogState } from "./newItemDialogState";

import { useResponsive } from "../../../posapp/composables/core/useResponsive";
import { useRtl } from "../../../posapp/composables/core/useRtl";
import { useFlyAnimation } from "../../../posapp/composables/core/useFlyAnimation";
import { useCartValidation } from "../composables/useCartValidation";
import { useItemsIntegration } from "../composables/useItemsIntegration";
import { useItemSearch } from "../composables/useItemSearch";
import { useScannerInput } from "../composables/useScannerInput";
import { useItemAvailability } from "../composables/useItemAvailability";
import { useItemDetailFetcher } from "../composables/useItemDetailFetcher";
import { useItemAddition } from "../composables/useItemAddition";
import { useItemSelection } from "../composables/useItemSelection";
import { useItemSelectorLayout } from "../composables/useItemSelectorLayout";
import { useLastInvoiceRate } from "../composables/useLastInvoiceRate";
import { useLastBuyingRate } from "../composables/useLastBuyingRate";
import { useItemSync } from "../composables/useItemSync";
import { useItemStorageSafety } from "../composables/useItemStorageSafety";
import { useItemsSelectorSearch } from "../composables/useItemsSelectorSearch";
import { useItemsSelectorSettings } from "../composables/useItemsSelectorSettings";
import { useItemsSelectorFocus } from "../composables/useItemsSelectorFocus";
import { useItemDisplay } from "../composables/useItemDisplay";
import { useItemsLoader } from "../composables/useItemsLoader";
import { useBarcodeIndexing } from "../composables/useBarcodeIndexing";
import { useScanProcessor } from "../composables/useScanProcessor";
import { useItemCurrency } from "../composables/useItemCurrency";
import { addCatalogItemToCart } from "../domain/addCatalogItemToCart";
import {
	initializeCatalogSelector,
	resolveProfileCatalogView,
	resolveAdaptiveCatalogView,
	syncCatalogSelectorDisplay,
} from "../domain/catalogSelectorBridge";
import { usePosCatalogStore } from "../domain/posCatalogStore";

import { useCustomersStore } from "../../../posapp/stores/customersStore";
import { useToastStore } from "../../../posapp/stores/toastStore";
import { useUIStore } from "../../../posapp/stores/uiStore";
import { useInvoiceStore } from "../../../posapp/stores/invoiceStore";

import { parseBooleanSetting } from "../../../posapp/utils/stock";
import {
	buildSelectorRowProps,
	createItemHighlightMatcher,
} from "../../../posapp/utils/itemSelectorHighlightBindings";
import { createItemSearchFocusClearGuard } from "../../../posapp/utils/itemSearchFocusClearGuard";

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
const {
	posProfile: uiPosProfile,
	searchFocusTrigger,
	triggerTopItemSelection,
	activeView,
} = storeToRefs(uiStore);
const { deferStockValidationToPayment: invoiceTypeDefersStockValidation } =
	storeToRefs(invoiceStore);

const __ = (window as any).__;

const eventBus = inject("eventBus") as any;
const selected_currency = ref("");
const selected_exchange_rate = ref(1);
const selected_conversion_rate = ref(1);
const isInitialized = ref(false);
const initTimeout = ref(null);
const initError = ref(null);

const responsive = useResponsive();
const rtl = useRtl();
const { fly } = useFlyAnimation();
const cartValidation = useCartValidation();
const catalogStore = usePosCatalogStore();
const itemAdditionApi = useItemAddition();

const itemsIntegration = useItemsIntegration({
	enableDebounce: false,
	debounceDelay: 300,
});

const isItemsStoreReadyForProfile = (profile: any) => {
	const currentProfile = itemsIntegration.posProfile.value;
	return !!(
		itemsIntegration.itemsLoaded.value &&
		currentProfile?.name === profile?.name &&
		currentProfile?.warehouse === profile?.warehouse
	);
};

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
const newItemDialog = ref(false);
const newItemDialogScannedBarcode = ref("");
const newItemDialogAwaitingScan = ref(false);
const qty = ref(1);
const search_input = ref("");
const first_search = ref("");
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
const items_view = computed({
	get: () =>
		resolveAdaptiveCatalogView({
			preferredView: catalogStore.state.value.preferredView,
			isPhone: responsive.isPhone.value,
			windowWidth: responsive.windowWidth.value,
		}) === "cards"
			? "card"
			: "list",
	set: (value: string) => {
		catalogStore.setPreferredView(value === "card" ? "cards" : "table");
	},
});

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

const flyConfig = reactive({ speed: 0.6, easing: "ease-in-out" });
const headerProps = reactive({
	"sort-icon": "mdi-arrow-up",
	class: "pos-table-header",
});

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

const { items, filteredItems, customer_price_list, loading, isBackgroundLoading } = itemsIntegration;

const displayedItems = computed(() => catalogStore.state.value.displayedItems);

const syncCatalogDisplayState = () => {
	const baseItems = Array.isArray(filteredItems.value) ? filteredItems.value : [];
	const rawTerm = first_search.value;
	const term = (typeof rawTerm === "string" ? rawTerm : "").trim().toLowerCase();

	return syncCatalogSelectorDisplay({
		catalog: catalogStore,
		items: baseItems,
		searchTerm: term,
		activeGroup: item_group.value,
		filterAndPaginate: (sourceItems) =>
			filterAndPaginate(sourceItems, {
				searchTerm: term,
				hideZeroRate: hide_zero_rate_items.value,
				hideVariants: pos_profile.value?.posa_hide_variants_items,
				onlyBarcode: showOnlyBarcodeItemsRef.value,
				limit: enable_custom_items_per_page.value
					? items_per_page.value
					: itemsPerPage.value,
			}),
	});
};

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

const debounce_qty = computed({
	get() {
		if (qty.value === null) return "";
		return hide_qty_decimals.value ? Math.round(qty.value) : qty.value;
	},
	set(value) {
		let parsed: number | null = parseFloat(String(value).replace(/,/g, ""));
		if (isNaN(parsed)) parsed = null;
		if (hide_qty_decimals.value && parsed != null) parsed = Math.round(parsed);
		qty.value = parsed as any;
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
	show_last_buying_rate: () => true,
});

const getLastRateForContext = (item: any) => {
	if (props.context === "purchase") {
		return getLastBuyingRate(item);
	}
	return getLastInvoiceRate(item);
};

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
const add_item = async (item, optionsOrQty: any = {}) => {
	if (props.context === "pos") {
		let options: any = typeof optionsOrQty === "object" ? optionsOrQty : { qty: optionsOrQty };
		let requestedQty = options.qty !== undefined ? options.qty : qty.value || 0;
		requestedQty =
			requestedQty === "" || requestedQty == null ? 1 : Math.abs(parseFloat(requestedQty) || 1);

		item = { ...item };
		if (item.has_variants) {
			await itemAdditionApi.handleVariantItem(item, {
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
			await addCatalogItemToCart({
				catalog: catalogStore,
				item,
				requestedQty,
				itemContext: context,
				prepareItemForCart: itemAdditionApi.prepareItemForCart,
				addItem: itemAdditionApi.addItem,
			});
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

// 6. Template Helpers
const clearSearch = () => {
	clearingSearch.value = true;
	search_input.value = "";
	first_search.value = "";
	clearingSearch.value = false;
};

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

const resolveIncomingPriceList = (incomingPriceList: unknown) => {
	const normalized = typeof incomingPriceList === "string" ? incomingPriceList.trim() : "";
	if (normalized) {
		return normalized;
	}
	return pos_profile.value?.selling_price_list || "";
};

const syncSelectorPriceList = async (incomingPriceList: unknown) => {
	const nextPriceList = resolveIncomingPriceList(incomingPriceList);
	if (!nextPriceList) {
		return;
	}

	if (itemsIntegration.active_price_list.value !== nextPriceList) {
		await itemsIntegration.updatePriceList(nextPriceList);
	}

	await itemsIntegration.get_items(true);
	itemDetailFetcher.update_cur_items_details();
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

const handleCartQuantitiesUpdated = (totals: Record<string, unknown>) => {
	itemAvailability.handleCartQuantitiesUpdated(totals);
};

// 7. Lifecycle Hooks
const openNewItemDialog = () => {
	resetNewItemDialogState(newItemDialogScannedBarcode, newItemDialogAwaitingScan);
	newItemDialog.value = true;
};

onMounted(async () => {
	itemAvailability.registerCallbacks({
		getItems: () => items.value,
		getDisplayedItems: () => displayedItems.value,
		getFilteredItems: () => filteredItems.value,
		updateItemsDetails: (its, opts) => itemDetailFetcher.update_items_details(its, opts),
	});
	itemAvailability.initAvailability();

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

	if (eventBus) {
		eventBus.on("update_currency", (data) => {
			if (typeof data === "string" && data) {
				selected_currency.value = data;
				return;
			}
			if (data && data.currency) {
				selected_currency.value = data.currency;
				if (data.exchange_rate) {
					selected_exchange_rate.value = Number(data.exchange_rate) || 1;
				}
				if (data.conversion_rate) {
					selected_conversion_rate.value = Number(data.conversion_rate) || 1;
				}
			}
		});
		eventBus.on("update_customer_price_list", (priceList) => {
			syncSelectorPriceList(priceList);
		});
		eventBus.on("update_buying_price_list", (data) => {
			if (data && typeof data === "object") {
				if (data.price_list) syncSelectorPriceList(data.price_list);
				selectedSupplier.value = data.supplier || null;
				scheduleLastBuyingRateRefresh();
			} else if (typeof data === "string") {
				syncSelectorPriceList(data);
				selectedSupplier.value = null;
				scheduleLastBuyingRateRefresh();
			} else {
				selectedSupplier.value = null;
			}
		});
		eventBus.on("focus_item_search", requestItemSearchFocus);
		eventBus.on("cart_quantities_updated", handleCartQuantitiesUpdated);
		eventBus.on("remote_stock_adjustment", handleRemoteStockAdjustment);
	}

	// Watch UI Profile for initialization (Source of Truth)
	watch(
		uiPosProfile,
		async (newProfile) => {
			if (newProfile && newProfile.name && !isInitialized.value) {
				// Safety timeout to prevent infinite loading if memoryInit or store init hangs
				if (initTimeout.value) clearTimeout(initTimeout.value);
				// @ts-ignore
				initTimeout.value = setTimeout(() => {
					if (!isInitialized.value) {
						console.warn(
							"ItemsSelector: Initialization taking too long, forcing isInitialized to true.",
						);
						isInitialized.value = true;
					}
				}, 10000);

				try {
					await memoryInitPromise;

					// Set local currency ref
					selected_currency.value = newProfile.currency || "";
					selected_exchange_rate.value = 1;
					selected_conversion_rate.value = 1;

					const needsStoreBootstrap =
						!isItemsStoreReadyForProfile(newProfile);
					if (needsStoreBootstrap) {
						await itemsIntegration.initializeStore(
							newProfile as any,
							selectedCustomer.value as any,
							customer_price_list.value as any,
						);
					}

					catalogStore.setPreferredView(
						resolveProfileCatalogView(
							newProfile.posa_default_card_view,
						),
					);

					await initializeCatalogSelector({
						catalog: catalogStore,
						profileName: newProfile.name || null,
						warehouse: newProfile.warehouse || null,
						loadItems: async () =>
							Array.isArray(items.value) ? [...items.value] : [],
						appendCachedItemsPage: async () =>
							(await itemsIntegration.appendCachedItemsPage()) || [],
					});
					syncCatalogDisplayState();

					isInitialized.value = true;
					startItemWorker();
					itemsSelectorSettings.loadItemSettings();
					itemDetailFetcher.update_cur_items_details();
					itemSync.startBackgroundSyncScheduler();
				} catch (err: any) {
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
		},
		{ immediate: true },
	);

	window.addEventListener("resize", checkItemContainerOverflow);
	if (props.context === "pos") {
		document.addEventListener("keydown", handleGlobalTypeToSearchKeydown, true);
	}
	nextTick(() => {
		checkItemContainerOverflow();
		scheduleCardMetricsUpdate();
	});
});

onBeforeUnmount(() => {
	if (initTimeout.value) clearTimeout(initTimeout.value);
	itemSync.stopBackgroundSyncScheduler();
	// @ts-ignore
	if (itemWorker.value) itemWorker.value.terminate();
	if (eventBus) {
		eventBus.off("update_currency");
		eventBus.off("update_customer_price_list");
		eventBus.off("update_buying_price_list");
		eventBus.off("focus_item_search", requestItemSearchFocus);
		eventBus.off("cart_quantities_updated", handleCartQuantitiesUpdated);
		eventBus.off("remote_stock_adjustment", handleRemoteStockAdjustment);
	}
	if (props.context === "pos") {
		document.removeEventListener("keydown", handleGlobalTypeToSearchKeydown, true);
	}
	itemSearchFocusClearGuard.dispose();
	window.removeEventListener("resize", checkItemContainerOverflow);
});

// 8. Watchers
watch(search_input, (val) => {
	first_search.value = val;
	itemSelection.clearHighlightedItem();
});

watch(
	[
		filteredItems,
		first_search,
		item_group,
		hide_zero_rate_items,
		enable_custom_items_per_page,
		items_per_page,
		itemsPerPage,
		showOnlyBarcodeItemsRef,
	],
	() => {
		syncCatalogDisplayState();
	},
	{ immediate: true },
);

watch(
	() => itemSelection.highlightedItemCode.value,
	(value) => {
		catalogStore.setHighlightedItemCode(value || null);
	},
);

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

const isItemHighlighted = createItemHighlightMatcher(itemSelection);
const isNegative = (val) => val < 0;

const {
	scannerLocked,
	scanErrorDialog,
	scanErrorMessage,
	scanErrorCode,
	scanErrorDetails,
	acknowledgeScanError,
	onBarcodeScanned: onBarcodeScannedFromScannerInput,
} = scannerInput;
const { responsiveStyles } = responsive;
const { rtlClasses } = rtl;
const isPhone = computed(() => responsive.isPhone.value);
const canResizeSelectorPanel = computed(
	() => responsive.windowWidth.value >= 1280 && responsive.windowHeight.value >= 860,
);
const phoneSelectorHeight = "calc(var(--viewport-height) - var(--bottom-safe-space) - 24px)";
const selectorCardStyle = computed<CSSProperties>(() => ({
	height: isPhone.value ? phoneSelectorHeight : responsiveStyles.value["--container-height"],
	maxHeight: isPhone.value ? phoneSelectorHeight : responsiveStyles.value["--container-height"],
	minHeight: isPhone.value
		? "calc(var(--viewport-height) * 0.46)"
		: responsiveStyles.value["--container-height"],
	resize: canResizeSelectorPanel.value ? "vertical" : "none",
	overflow: "auto",
	position: "relative",
}));
const itemSearchFocusClearGuard = createItemSearchFocusClearGuard();

const SEARCH_TRIGGER_KEY_PATTERN = /^[A-Za-z0-9\-._/\\]$/;

const isEditableElement = (element: Element | null | undefined) => {
	if (!(element instanceof HTMLElement)) {
		return false;
	}
	const contentEditable = element.getAttribute("contenteditable");
	if (
		element.isContentEditable ||
		(typeof element.contentEditable === "string" &&
			element.contentEditable.toLowerCase() !== "inherit") ||
		(contentEditable !== null && contentEditable.toLowerCase() !== "false")
	) {
		return true;
	}
	const tagName = element.tagName;
	if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
		return true;
	}
	return Boolean(
		element.closest(
			"input, textarea, select, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']",
		),
	);
};

const isTypeToSearchKey = (event: KeyboardEvent) => {
	if (!event || event.defaultPrevented || event.repeat) {
		return false;
	}
	if (event.ctrlKey || event.metaKey || event.altKey) {
		return false;
	}
	return SEARCH_TRIGGER_KEY_PATTERN.test(event.key || "");
};

const hasVisibleDialog = () => {
	if (typeof document === "undefined") {
		return false;
	}
	const dialogs = document.querySelectorAll("[role='dialog']");
	return Array.from(dialogs).some((dialog) => {
		if (!(dialog instanceof HTMLElement)) {
			return false;
		}
		return Boolean(dialog.offsetWidth || dialog.offsetHeight || dialog.getClientRects().length);
	});
};

// Proxy functions for template
const esc_event = () => clearSearch();
const onEnter = (e) => itemsSelectorSearch.onEnter(e);
const handleSearchKeydown = (e) => itemsSelectorFocus.handleSearchKeydown(e);
const handleSearchInput = (val) => {
	search_input.value = val;
	first_search.value = String(val ?? "");
	if (scannerInput.handleSearchInput) {
		scannerInput.handleSearchInput(first_search.value);
	}
};
const handleSearchPaste = (e) => itemsSelectorFocus.handleSearchPaste(e);
const searchItems = (term) => itemsIntegration.searchItems(term);
const get_items = (force = false) => itemsIntegration.get_items(force);
const loadVisibleItems = (reset = false) => itemsLoader.loadVisibleItems(reset);
const verifyServerItemCount = () => {};
const prepareSearchInjection = () => {
	clearSearch();
	itemSearchFocusClearGuard.armPreserveNextFocusClear();
};
const appendSearchCharacter = (character: string) => {
	const nextValue = `${String(search_input.value || "")}${character}`;
	handleSearchInput(nextValue);
};
const revealItemSearchView = () => {
	eventBus?.emit?.("set_compact_panel", "selector");
	if (activeView.value !== "items") {
		uiStore.setActiveView("items");
	}
};
const requestItemSearchFocus = () => {
	if (activeView.value !== "items") {
		return;
	}
	nextTick(() => {
		itemsSelectorFocus.focusItemSearch();
	});
};
const requestForegroundItemSearchFocus = () => {
	revealItemSearchView();
	uiStore.triggerItemSearchFocus();
	eventBus?.emit?.("focus_item_search");
};
scannerInput.setInputHandlers?.({
	get: () => String(search_input.value || ""),
	set: (value: string) => {
		prepareSearchInjection();
		handleSearchInput(String(value ?? ""));
	},
	clear: clearSearch,
	focus: requestForegroundItemSearchFocus,
});
const handleGlobalTypeToSearchKeydown = (event: KeyboardEvent) => {
	if (!isTypeToSearchKey(event)) {
		return;
	}
	if (
		props.context !== "pos" ||
		activeView.value === "payment" ||
		scannerInput.cameraScannerActive.value ||
		hasVisibleDialog() ||
		isEditableElement(document.activeElement)
	) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	prepareSearchInjection();
	revealItemSearchView();
	requestForegroundItemSearchFocus();
	appendSearchCharacter(event.key);
};
const handleItemSearchFocus = () => {
	if (!itemSearchFocusClearGuard.shouldClearSearchOnFocus()) {
		requestItemSearchFocus();
		return;
	}
	clearSearch();
	requestItemSearchFocus();
};
const clearQty = () => {
	qty.value = null as any;
};
const onQtyBlur = () => {
	if (!qty.value || qty.value <= 0) {
		qty.value = 1;
	}
};
const startCameraScanning = () => {
	itemsSelectorFocus.startCameraScanning();
};
const startNewItemBarcodeScan = () => {
	newItemDialogScannedBarcode.value = "";
	newItemDialogAwaitingScan.value = true;
	startCameraScanning();
};
const forceReloadItems = () => itemsIntegration.get_items(true);
const cancelItemDetailsRequest = () => itemDetailFetcher.cancelItemDetailsRequest();

const onBarcodeScanned = async (code: string) => {
	if (newItemDialog.value && newItemDialogAwaitingScan.value) {
		newItemDialogScannedBarcode.value = code;
		newItemDialogAwaitingScan.value = false;
		return;
	}

	requestForegroundItemSearchFocus();
	if (onBarcodeScannedFromScannerInput) {
		onBarcodeScannedFromScannerInput(code);
	}
};

const select_item = (e, item) => itemSelection.handleItemSelection(e, item);
const click_item_row = (e, data) => itemSelection.handleRowClick(e, data);
const onVirtualRangeUpdate = (s, e, vs, ve) => itemsLoader.onVirtualRangeUpdate(s, e, vs, ve);
const onListScroll = (e) => handleListScroll(e);
const onScannerOpened = () => {
	scannerInput.cameraScannerActive.value = true;
};
const onScannerClosed = () => {
	scannerInput.cameraScannerActive.value = false;
	newItemDialogAwaitingScan.value = false;
};

const getItemRowClass = (item) => itemSelection.getItemRowClass(item);

const getItemRowProps = (item) => buildSelectorRowProps(itemSelection, item);

const handleItemCreated = (_item) => {
	newItemDialog.value = false;
	resetNewItemDialogState(newItemDialogScannedBarcode, newItemDialogAwaitingScan);
	itemsIntegration.get_items(true);
};

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
