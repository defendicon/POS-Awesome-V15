// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "../src/posapp/utils/translate";

afterEach(() => vi.unstubAllGlobals());

describe("Frappe notification translation", () => {
	it("passes replacements as an array, including zero pending invoices", () => {
		const translator = vi.fn((text, args) =>
			text.replace(/\{(\d+)\}/g, (_, i) => args[i]),
		);
		vi.stubGlobal("__", translator);
		expect(translate("Pending: {0}", [0])).toBe("Pending: 0");
		expect(translator).toHaveBeenCalledWith("Pending: {0}", [0]);
	});

	it.each([undefined, (text: string) => text])(
		"formats offline fallbacks without raw placeholders",
		(translator) => {
			vi.stubGlobal("__", translator);
			expect(translate("{0} offline invoice{1} synced", [1, ""])).toBe(
				"1 offline invoice synced",
			);
			expect(translate("{0} offline invoice{1} synced", [2, "s"])).toBe(
				"2 offline invoices synced",
			);
			expect(
				translate("Pending: {0} | Synced: {1} | Draft: {2}", [0, 2, 0]),
			).toBe("Pending: 0 | Synced: 2 | Draft: 0");
		},
	);

	it("formats translated text and scalar arguments", () => {
		vi.stubGlobal("__", () => "Baqi: {0}");
		expect(translate("Pending: {0}", 3)).toBe("Baqi: 3");
	});
});
