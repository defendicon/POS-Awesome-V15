import { beforeEach, describe, expect, it, vi } from "vitest";

const consoleWarn = vi
	.spyOn(console, "warn")
	.mockImplementation(() => undefined);
const consoleError = vi
	.spyOn(console, "error")
	.mockImplementation(() => undefined);

describe("useBundles", () => {
	beforeEach(() => {
		consoleWarn.mockClear();
		consoleError.mockClear();
		delete (globalThis as any).frappe;
		vi.resetModules();
	});

	it("returns an empty bundle list without throwing when frappe.call is unavailable", async () => {
		const { useBundles } = await import(
			"../src/posapp/composables/pos/items/useBundles"
		);

		const bundles = useBundles();
		const result = await bundles.getBundleComponents("BUNDLE-001");

		expect(result).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		expect(consoleWarn).toHaveBeenCalledTimes(1);
	});

	it("fetches bundle components when frappe.call exists", async () => {
		const call = vi.fn().mockResolvedValue({
			message: {
				"BUNDLE-001": [{ item_code: "ITEM-1" }],
			},
		});
		(globalThis as any).frappe = { call };

		const { useBundles } = await import(
			"../src/posapp/composables/pos/items/useBundles"
		);

		const bundles = useBundles();
		const result = await bundles.getBundleComponents("BUNDLE-001");

		expect(result).toEqual([{ item_code: "ITEM-1" }]);
		expect(call).toHaveBeenCalledTimes(1);
	});
});
