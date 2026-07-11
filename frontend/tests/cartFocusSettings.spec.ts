import { describe, expect, it } from "vitest";

import { shouldFocusCartQtyAfterItemAdd } from "../src/posapp/utils/cartFocusSettings";

describe("shouldFocusCartQtyAfterItemAdd", () => {
	it("keeps existing behavior enabled when the POS Profile setting is absent", () => {
		expect(shouldFocusCartQtyAfterItemAdd({})).toBe(true);
		expect(shouldFocusCartQtyAfterItemAdd(null)).toBe(true);
	});

	it("allows POS Profile to disable cart quantity focus after item add", () => {
		expect(shouldFocusCartQtyAfterItemAdd({ posa_focus_cart_qty_after_item_add: 0 })).toBe(false);
		expect(shouldFocusCartQtyAfterItemAdd({ posa_focus_cart_qty_after_item_add: "0" })).toBe(false);
		expect(shouldFocusCartQtyAfterItemAdd({ posa_focus_cart_qty_after_item_add: false })).toBe(false);
	});

	it("accepts checked Frappe values as enabled", () => {
		expect(shouldFocusCartQtyAfterItemAdd({ posa_focus_cart_qty_after_item_add: 1 })).toBe(true);
		expect(shouldFocusCartQtyAfterItemAdd({ posa_focus_cart_qty_after_item_add: "1" })).toBe(true);
		expect(shouldFocusCartQtyAfterItemAdd({ posa_focus_cart_qty_after_item_add: true })).toBe(true);
	});
});
