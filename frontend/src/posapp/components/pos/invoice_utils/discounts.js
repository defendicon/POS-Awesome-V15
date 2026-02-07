import { useDiscounts } from "../../../composables/useDiscounts.js";

const { updateDiscountAmount, calcPrices, calcItemPrice } = useDiscounts();

export function update_discount_umount(context) {
	return updateDiscountAmount(context);
}

export function calc_prices(context, item, value, $event) {
	const outcome = calcPrices(item, value, $event, context);
	if (context.schedulePricingRuleApplication) {
		context.schedulePricingRuleApplication();
	}
	return outcome;
}

export function calc_item_price(context, item) {
	const outcome = calcItemPrice(item, context);
	if (context.schedulePricingRuleApplication) {
		context.schedulePricingRuleApplication();
	}
	return outcome;
}
