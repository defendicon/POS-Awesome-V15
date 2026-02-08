import { useDiscounts } from "../../../composables/pos/shared/useDiscounts";

const { updateDiscountAmount, calcPrices, calcItemPrice } = useDiscounts();

export function update_discount_umount(context: any) {
	return updateDiscountAmount(context);
}

export function calc_prices(context: any, item: any, value: any, $event: any) {
	const outcome = calcPrices(item, value, $event, context);
	if (context.schedulePricingRuleApplication) {
		context.schedulePricingRuleApplication();
	}
	return outcome;
}

export function calc_item_price(context: any, item: any) {
	const outcome = calcItemPrice(item, context);
	if (context.schedulePricingRuleApplication) {
		context.schedulePricingRuleApplication();
	}
	return outcome;
}
