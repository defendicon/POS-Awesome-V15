import { useDiscounts } from "../../../composables/pos/shared/useDiscounts";

let discountsApi: ReturnType<typeof useDiscounts> | null = null;

function getDiscountsApi() {
	if (!discountsApi) {
		discountsApi = useDiscounts();
	}
	return discountsApi;
}

export function update_discount_umount(context: any) {
	const { updateDiscountAmount } = getDiscountsApi();
	return updateDiscountAmount(context);
}

export function calc_prices(context: any, item: any, value: any, $event: any) {
	const { calcPrices } = getDiscountsApi();
	const outcome = calcPrices(item, value, $event, context);
	if (context.schedulePricingRuleApplication) {
		context.schedulePricingRuleApplication();
	}
	return outcome;
}

export function calc_item_price(context: any, item: any) {
	const { calcItemPrice } = getDiscountsApi();
	const outcome = calcItemPrice(item, context);
	if (context.schedulePricingRuleApplication) {
		context.schedulePricingRuleApplication();
	}
	return outcome;
}
