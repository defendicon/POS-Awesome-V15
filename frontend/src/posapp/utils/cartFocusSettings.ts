import { parseBooleanSetting } from "./stock";

const AUTO_FOCUS_CART_QTY_FIELD = "posa_focus_cart_qty_after_item_add";

export function shouldFocusCartQtyAfterItemAdd(posProfile: any): boolean {
	const value = posProfile?.[AUTO_FOCUS_CART_QTY_FIELD];
	if (value === undefined || value === null || value === "") {
		return true;
	}
	return parseBooleanSetting(value);
}
