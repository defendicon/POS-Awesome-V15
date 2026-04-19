// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed, defineComponent, h, ref } from "vue";

const itemAvailabilitySpies = vi.hoisted(() => ({
	initAvailability: vi.fn(),
	registerCallbacks: vi.fn(),
	handleCartQuantitiesUpdated: vi.fn(),
	handleInvoiceStockAdjusted: vi.fn(),
}));

const lastBuyingRateSpies = vi.hoisted(() => ({
	contexts: [] as any[],
	getLastBuyingRate: vi.fn(() => null),
	scheduleLastBuyingRateRefresh: vi.fn(),
	clearLastBuyingRateCache: vi.fn(),
}));

vi.mock("../src/offline/index", () => ({
	memoryInitPromise: Promise.resolve(),
}));

vi.mock("../src/posapp/composables/core/useResponsive", () => ({
	useResponsive: () => ({
		windowWidth: ref(1440),
		windowHeight: ref(900),
		isPhone: ref(false),
		responsiveStyles: ref({ "--container-height": "640px" }),
	}),
}));

vi.mock("../src/posapp/composables/core/useRtl", () => ({
	useRtl: () => ({
		rtlClasses: ref([]),
	}),
}));

vi.mock("../src/posapp/composables/core/useFlyAnimation", () => ({
	useFlyAnimation: () => ({
		fly: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useCartValidation", () => ({
	useCartValidation: () => ({
		validateCartItem: vi.fn(async () => true),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsIntegration", () => {
	const items = ref([{ item_code: "ITEM-1", item_name: "Test Item", actual_qty: 10 }]);
	const filteredItems = ref(items.value);
	const posProfile = ref(null as any);
	return {
		useItemsIntegration: () => ({
			itemsStore: {},
			items,
			filteredItems,
			itemGroups: ref(["ALL"]),
			isLoading: ref(false),
			isBackgroundLoading: ref(false),
			loadProgress: ref(0),
			totalItemCount: ref(1),
			itemsLoaded: ref(true),
			searchTerm: ref(""),
			itemGroup: ref("ALL"),
			posProfile,
			customer: ref(null),
			customerPriceList: ref(null),
			cacheHealth: ref({}),
			performanceMetrics: ref({}),
			cachedPagination: ref({}),
			hasMoreCachedItems: ref(false),
			activePriceList: ref("Standard Selling"),
			itemStats: ref({}),
			cacheStats: ref({}),
			items_group: computed(() => ["ALL"]),
			loading: computed(() => false),
			items_loaded: computed(() => true),
			item_group: computed({
				get: () => "ALL",
				set: () => {},
			}),
			search: computed({
				get: () => "",
				set: () => {},
			}),
			filtered_items: computed(() => filteredItems.value),
			customer_price_list: computed(() => null),
			active_price_list: computed(() => "Standard Selling"),
			initializeStore: vi.fn(async (profile: any) => {
				posProfile.value = profile;
			}),
			get_items: vi.fn(async () => items.value),
			searchItems: vi.fn(async () => filteredItems.value),
			search_onchange: vi.fn(async () => filteredItems.value),
			updatePriceList: vi.fn(async () => {}),
			refreshModifiedItems: vi.fn(async () => ({ items: [] })),
			backgroundSyncItems: vi.fn(async () => []),
			clearLimitSearchResults: vi.fn(),
		}),
	};
});

vi.mock("../src/posapp/composables/pos/items/useItemSearch", () => ({
	useItemSearch: () => ({
		showOnlyBarcodeItems: ref(false),
		filterAndPaginate: (items: any[]) => items,
		fetchServerItemsTimestamp: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useScannerInput", () => ({
	useScannerInput: () => ({
		scannerLocked: ref(false),
		scanErrorDialog: ref(false),
		scanErrorMessage: ref(""),
		scanErrorCode: ref(""),
		scanErrorDetails: ref(""),
		acknowledgeScanError: vi.fn(),
		onBarcodeScanned: vi.fn(),
		cameraScannerActive: ref(false),
		searchFromScanner: ref(false),
		setScanHandler: vi.fn(),
		setInputHandlers: vi.fn(),
		handleSearchInput: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemAvailability", () => ({
	useItemAvailability: () => ({
		...itemAvailabilitySpies,
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemDetailFetcher", () => ({
	useItemDetailFetcher: () => ({
		registerContext: vi.fn(),
		update_cur_items_details: vi.fn(),
		update_items_details: vi.fn(async () => {}),
		cancelItemDetailsRequest: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemAddition", () => ({
	useItemAddition: () => ({
		handleVariantItem: vi.fn(),
		prepareItemForCart: vi.fn(async () => {}),
		addItem: vi.fn(async () => {}),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemSelection", () => ({
	useItemSelection: () => ({
		registerContext: vi.fn(),
		clearHighlightedItem: vi.fn(),
		syncHighlightedItem: vi.fn(),
		selectTopItem: vi.fn(),
		handleItemSelection: vi.fn(),
		handleRowClick: vi.fn(),
		getItemRowClass: vi.fn(() => ""),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemSelectorLayout", () => ({
	useItemSelectorLayout: () => ({
		isOverflowing: ref(false),
		cardColumns: ref(1),
		cardRowHeight: ref(220),
		cardSlotHeight: ref(220),
		cardSlotWidth: ref(280),
		cardColumnWidth: ref(280),
		checkItemContainerOverflow: vi.fn(),
		scheduleCardMetricsUpdate: vi.fn(),
		onListScroll: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useLastInvoiceRate", () => ({
	useLastInvoiceRate: () => ({
		getLastInvoiceRate: vi.fn(() => null),
		scheduleLastInvoiceRateRefresh: vi.fn(),
		clearLastInvoiceRateCache: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useLastBuyingRate", () => ({
	useLastBuyingRate: (context: any) => {
		lastBuyingRateSpies.contexts.push(context);
		return {
			getLastBuyingRate: lastBuyingRateSpies.getLastBuyingRate,
			scheduleLastBuyingRateRefresh:
				lastBuyingRateSpies.scheduleLastBuyingRateRefresh,
			clearLastBuyingRateCache:
				lastBuyingRateSpies.clearLastBuyingRateCache,
		};
	},
}));

vi.mock("../src/posapp/composables/pos/items/useItemRateInfo", () => ({
	useItemRateInfo: (context: any) => {
		const resolveSupervisorFlag = () => {
			const value = context?.is_pos_supervisor;
			if (typeof value === "function") {
				return Boolean(value());
			}
			if (value && typeof value === "object" && "value" in value) {
				return Boolean(value.value);
			}
			return Boolean(value);
		};

		return {
			getItemRateInfo: (_item: any) => ({
				entries: [
					{
						key: "sale",
						visible: true,
					},
					{
						key: "purchase",
						visible: resolveSupervisorFlag(),
					},
					{
						key: "cost",
						visible: resolveSupervisorFlag(),
					},
				].filter((entry) => entry.visible),
			}),
			resolveProfileCurrency: vi.fn(() => null),
		};
	},
}));

vi.mock("../src/posapp/composables/pos/items/useItemSync", () => ({
	useItemSync: () => ({
		registerContext: vi.fn(),
		startBackgroundSyncScheduler: vi.fn(),
		stopBackgroundSyncScheduler: vi.fn(),
		last_background_sync_time: ref(null),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemStorageSafety", () => ({
	useItemStorageSafety: () => ({
		startItemWorker: vi.fn(),
		itemWorker: ref(null),
		storageAvailable: ref(true),
		markStorageUnavailable: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsSelectorSearch", () => ({
	useItemsSelectorSearch: () => ({
		onEnter: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsSelectorSettings", () => ({
	useItemsSelectorSettings: () => ({
		loadItemSettings: vi.fn(),
		applyItemSettings: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsSelectorFocus", () => ({
	useItemsSelectorFocus: () => ({
		handleSearchKeydown: vi.fn(),
		handleSearchPaste: vi.fn(),
		focusItemSearch: vi.fn(),
		startCameraScanning: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemDisplay", () => ({
	useItemDisplay: () => ({
		registerContext: vi.fn(),
		ratePrecision: vi.fn(() => 2),
		format_currency: vi.fn((value: any) => String(value ?? "")),
		format_number: vi.fn((value: any) => String(value ?? "")),
		currencySymbol: vi.fn(() => "Rs"),
		headers: ref([]),
		memoizedFormatCurrency: ref((value: any) => String(value ?? "")),
		memoizedFormatNumber: ref((value: any) => String(value ?? "")),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsLoader", () => ({
	useItemsLoader: () => ({
		registerContext: vi.fn(),
		loadVisibleItems: vi.fn(async () => []),
		onVirtualRangeUpdate: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useBarcodeIndexing", () => ({
	useBarcodeIndexing: () => ({
		ensureBarcodeIndex: vi.fn(),
		resetBarcodeIndex: vi.fn(),
		indexItem: vi.fn(),
		replaceBarcodeIndex: vi.fn(),
		lookupItemByBarcode: vi.fn(() => null),
		searchItemsByCode: vi.fn(() => []),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useScanProcessor", () => ({
	useScanProcessor: () => ({
		processScannedItem: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemCurrency", () => ({
	useItemCurrency: () => ({
		applyCurrencyConversionToItem: vi.fn(),
	}),
}));

vi.mock("../src/posapp/utils/stock", () => ({
	parseBooleanSetting: (value: any) => {
		if (value === undefined || value === null) {
			return false;
		}
		if (typeof value === "string") {
			return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
		}
		if (typeof value === "number") {
			return value === 1;
		}
		return Boolean(value);
	},
}));

vi.mock("../src/posapp/utils/itemSelectorHighlightBindings", () => ({
	buildSelectorRowProps: vi.fn(() => ({})),
	createItemHighlightMatcher: vi.fn(() => false),
}));

vi.mock("../src/posapp/utils/itemSearchFocusClearGuard", () => ({
	createItemSearchFocusClearGuard: () => ({
		dispose: vi.fn(),
		armPreserveNextFocusClear: vi.fn(),
		shouldClearSearchOnFocus: vi.fn(() => true),
	}),
}));

vi.mock("../src/posapp/components/pos/items/newItemDialogState", () => ({
	resetNewItemDialogState: vi.fn(),
}));

const stubComponent = (name: string) =>
	defineComponent({
		name,
		setup(_props, { slots }) {
			return () => h("div", slots.default ? slots.default() : []);
		},
	});

vi.mock("../src/posapp/components/pos/items/CameraScanner.vue", () => ({
	default: stubComponent("CameraScanner"),
}));

vi.mock("../src/posapp/components/pos/items/ItemActionToolbar.vue", () => ({
	default: stubComponent("ItemActionToolbar"),
}));

vi.mock("../src/posapp/components/pos/items/ItemSettingsDialog.vue", () => ({
	default: stubComponent("ItemSettingsDialog"),
}));

vi.mock("../src/posapp/components/pos/items/ItemHeader.vue", () => ({
	default: stubComponent("ItemHeader"),
}));

vi.mock("../src/posapp/components/pos/items/ItemsSelectorCards.vue", () => ({
	default: stubComponent("ItemsSelectorCards"),
}));

vi.mock("../src/posapp/components/pos/items/ItemsSelectorTable.vue", () => ({
	default: stubComponent("ItemsSelectorTable"),
}));

vi.mock("../src/posapp/components/pos/items/NewItemDialog.vue", () => ({
	default: stubComponent("NewItemDialog"),
}));

vi.mock("../src/posapp/components/pos/items/ScanErrorDialog.vue", () => ({
	default: stubComponent("ScanErrorDialog"),
}));

describe("ItemsSelector stock wiring", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		lastBuyingRateSpies.contexts.length = 0;
		setActivePinia(createPinia());
		(window as any).__ = (value: string) => value;
		(window as any).frappe = {
			_: (value: string) => value,
			call: vi.fn(),
			datetime: {
				nowdate: () => "2026-04-12",
			},
		};
		(globalThis as any).frappe = (window as any).frappe;
	});

	it("initializes item availability and subscribes to cart and stock adjustment events", async () => {
		const { useUIStore } = await import("../src/posapp/stores/uiStore");
		const uiStore = useUIStore();
		uiStore.setPosProfile({
			name: "POS-1",
			currency: "PKR",
			selling_price_list: "Standard Selling",
		} as any);

		const eventHandlers = new Map<string, any>();
		const eventBus = {
			on: vi.fn((event: string, handler: any) => {
				eventHandlers.set(event, handler);
			}),
			off: vi.fn(),
			emit: vi.fn(),
		};

		const ItemsSelector = (await import(
			"../src/posapp/components/pos/items/ItemsSelector.vue"
		)).default;

		const wrapper = shallowMount(ItemsSelector, {
			global: {
				provide: {
					eventBus,
				},
			},
		});

		await Promise.resolve();
		await wrapper.vm.$nextTick();

		expect(itemAvailabilitySpies.initAvailability).toHaveBeenCalledTimes(1);
		expect(eventBus.on).toHaveBeenCalledWith(
			"cart_quantities_updated",
			expect.any(Function),
		);
		expect(eventBus.on).toHaveBeenCalledWith(
			"remote_stock_adjustment",
			expect.any(Function),
		);

		eventHandlers.get("cart_quantities_updated")?.({ "ITEM-1": 2 });
		expect(
			itemAvailabilitySpies.handleCartQuantitiesUpdated,
		).toHaveBeenCalledWith({ "ITEM-1": 2 });

		eventHandlers.get("remote_stock_adjustment")?.({
			items: [{ item_code: "ITEM-1", actual_qty: 8 }],
		});
		expect(
			itemAvailabilitySpies.handleInvoiceStockAdjusted,
		).toHaveBeenCalledWith({
			items: [{ item_code: "ITEM-1", actual_qty: 8 }],
		});
	});

	it('parses string supervisor flags before exposing supervisor-only rate info', async () => {
		const { useUIStore } = await import("../src/posapp/stores/uiStore");
		const { useEmployeeStore } = await import("../src/posapp/stores/employeeStore");
		const uiStore = useUIStore();
		const employeeStore = useEmployeeStore();

		uiStore.setPosProfile({
			name: "POS-1",
			currency: "PKR",
			selling_price_list: "Standard Selling",
		} as any);
		employeeStore.currentCashier = {
			user: "cashier@example.com",
			full_name: "Cashier",
			is_supervisor: "0",
		} as any;

		const eventBus = {
			on: vi.fn(),
			off: vi.fn(),
			emit: vi.fn(),
		};

		const ItemsSelector = (await import(
			"../src/posapp/components/pos/items/ItemsSelector.vue"
		)).default;

		const wrapper = shallowMount(ItemsSelector, {
			global: {
				provide: {
					eventBus,
				},
			},
		});

		await Promise.resolve();
		await wrapper.vm.$nextTick();

		const lastBuyingRateContext = lastBuyingRateSpies.contexts.at(-1);

		expect(lastBuyingRateContext.show_last_buying_rate()).toBe(false);
		expect(
			wrapper.vm.getItemRateInfo({
				item_code: "ITEM-1",
				standard_rate: 10,
			}).entries,
		).toEqual([{ key: "sale", visible: true }]);
	});

	it("exposes supervisor-only rate info when the cashier flag is a string one", async () => {
		const { useUIStore } = await import("../src/posapp/stores/uiStore");
		const { useEmployeeStore } = await import("../src/posapp/stores/employeeStore");
		const uiStore = useUIStore();
		const employeeStore = useEmployeeStore();

		uiStore.setPosProfile({
			name: "POS-1",
			currency: "PKR",
			selling_price_list: "Standard Selling",
		} as any);
		employeeStore.currentCashier = {
			user: "supervisor@example.com",
			full_name: "Supervisor",
			is_supervisor: "1",
		} as any;

		const eventBus = {
			on: vi.fn(),
			off: vi.fn(),
			emit: vi.fn(),
		};

		const ItemsSelector = (await import(
			"../src/posapp/components/pos/items/ItemsSelector.vue"
		)).default;

		const wrapper = shallowMount(ItemsSelector, {
			global: {
				provide: {
					eventBus,
				},
			},
		});

		await Promise.resolve();
		await wrapper.vm.$nextTick();

		const lastBuyingRateContext = lastBuyingRateSpies.contexts.at(-1);
		const entries = wrapper.vm.getItemRateInfo({
			item_code: "ITEM-1",
			standard_rate: 10,
		}).entries;

		expect(lastBuyingRateContext.show_last_buying_rate()).toBe(true);
		expect(entries.map((entry: any) => entry.key)).toEqual([
			"sale",
			"purchase",
			"cost",
		]);
	});
});
