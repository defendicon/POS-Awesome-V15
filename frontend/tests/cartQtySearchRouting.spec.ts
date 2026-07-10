// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { shouldRouteCartQtyKeyToItemSearch } from "../src/posapp/utils/cartQtySearchRouting";

const keydown = (key: string, options: Partial<KeyboardEventInit> = {}) =>
	new KeyboardEvent("keydown", {
		key,
		cancelable: true,
		...options,
	});

describe("cart qty search routing", () => {
	it("routes typed item-search letters away from the cart quantity editor", () => {
		expect(shouldRouteCartQtyKeyToItemSearch(keydown("A"))).toBe(true);
		expect(shouldRouteCartQtyKeyToItemSearch(keydown("چ"))).toBe(true);
	});

	it("keeps quantity editing keys in the cart quantity editor", () => {
		expect(shouldRouteCartQtyKeyToItemSearch(keydown("1"))).toBe(false);
		expect(shouldRouteCartQtyKeyToItemSearch(keydown("."))).toBe(false);
		expect(shouldRouteCartQtyKeyToItemSearch(keydown("-"))).toBe(false);
		expect(shouldRouteCartQtyKeyToItemSearch(keydown("Backspace"))).toBe(false);
	});

	it("does not route shortcuts or repeated key presses", () => {
		expect(shouldRouteCartQtyKeyToItemSearch(keydown("A", { ctrlKey: true }))).toBe(false);
		expect(shouldRouteCartQtyKeyToItemSearch(keydown("A", { repeat: true }))).toBe(false);
	});
});
