import type { Ref } from "vue";

type EventBusLike = {
	on?: (_event: string, _handler: (..._args: any[]) => void) => void;
	off?: (_event: string, _handler?: (..._args: any[]) => void) => void;
};

type CurrencyPayload =
	| string
	| {
			currency?: string | null;
			exchange_rate?: number | string | null;
			conversion_rate?: number | string | null;
	  }
	| null
	| undefined;

type BuyingPriceListPayload =
	| string
	| {
			price_list?: string | null;
			supplier?: string | null;
	  }
	| null
	| undefined;

type UseItemsSelectorEventsArgs = {
	eventBus: EventBusLike | null | undefined;
	selectedCurrency: Ref<string>;
	selectedExchangeRate: Ref<number>;
	selectedConversionRate: Ref<number>;
	selectedSupplier: Ref<string | null>;
	syncSelectorPriceList: (_priceList: unknown) => Promise<void> | void;
	scheduleLastBuyingRateRefresh: () => void;
	requestItemSearchFocus: () => void;
	handleCartQuantitiesUpdated: (..._args: any[]) => void;
	handleRemoteStockAdjustment: (_payload: unknown) => void;
};

type ItemsSelectorEventsCleanup = () => void;

function isObjectPayload(value: unknown): value is Record<string, any> {
	return Boolean(value && typeof value === "object");
}

export function registerItemsSelectorEvents({
	eventBus,
	selectedCurrency,
	selectedExchangeRate,
	selectedConversionRate,
	selectedSupplier,
	syncSelectorPriceList,
	scheduleLastBuyingRateRefresh,
	requestItemSearchFocus,
	handleCartQuantitiesUpdated,
	handleRemoteStockAdjustment,
}: UseItemsSelectorEventsArgs): ItemsSelectorEventsCleanup {
	if (!eventBus?.on) {
		return () => {};
	}

	const handleCurrencyUpdate = (data: CurrencyPayload) => {
		if (typeof data === "string" && data) {
			selectedCurrency.value = data;
			return;
		}

		if (isObjectPayload(data) && data.currency) {
			selectedCurrency.value = data.currency;
			if (data.exchange_rate) {
				selectedExchangeRate.value = Number(data.exchange_rate) || 1;
			}
			if (data.conversion_rate) {
				selectedConversionRate.value = Number(data.conversion_rate) || 1;
			}
		}
	};

	const handleCustomerPriceListUpdate = (priceList: unknown) => {
		void syncSelectorPriceList(priceList);
	};

	const handleBuyingPriceListUpdate = (data: BuyingPriceListPayload) => {
		if (isObjectPayload(data)) {
			if (data.price_list) void syncSelectorPriceList(data.price_list);
			selectedSupplier.value = data.supplier || null;
			scheduleLastBuyingRateRefresh();
		} else if (typeof data === "string") {
			void syncSelectorPriceList(data);
			selectedSupplier.value = null;
			scheduleLastBuyingRateRefresh();
		} else {
			selectedSupplier.value = null;
		}
	};

	eventBus.on("update_currency", handleCurrencyUpdate);
	eventBus.on("update_customer_price_list", handleCustomerPriceListUpdate);
	eventBus.on("update_buying_price_list", handleBuyingPriceListUpdate);
	eventBus.on("focus_item_search", requestItemSearchFocus);
	eventBus.on("cart_quantities_updated", handleCartQuantitiesUpdated);
	eventBus.on("remote_stock_adjustment", handleRemoteStockAdjustment);

	return () => {
		eventBus.off?.("update_currency", handleCurrencyUpdate);
		eventBus.off?.("update_customer_price_list", handleCustomerPriceListUpdate);
		eventBus.off?.("update_buying_price_list", handleBuyingPriceListUpdate);
		eventBus.off?.("focus_item_search", requestItemSearchFocus);
		eventBus.off?.("cart_quantities_updated", handleCartQuantitiesUpdated);
		eventBus.off?.("remote_stock_adjustment", handleRemoteStockAdjustment);
	};
}
