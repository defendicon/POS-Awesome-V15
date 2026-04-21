import { describe, expect, it } from "vitest";

import {
	getAvailableDocumentSources,
	getDefaultDocumentSource,
	shouldShowDocumentSourceSelector,
} from "../src/posapp/utils/documentSources";

describe("document sources", () => {
	it("always exposes invoice and hides the selector when no optional sources are enabled", () => {
		const sources = getAvailableDocumentSources({});

		expect(sources.map((source) => source.key)).toEqual(["invoice"]);
		expect(getDefaultDocumentSource({})).toBe("invoice");
		expect(shouldShowDocumentSourceSelector(sources)).toBe(false);
	});

	it("enables order and quote sources from POS profile booleans", () => {
		const profile = {
			custom_allow_select_sales_order: "1",
			custom_allow_select_quotation: true,
		};

		const sources = getAvailableDocumentSources(profile);

		expect(sources.map((source) => source.key)).toEqual([
			"invoice",
			"order",
			"quote",
		]);
		expect(getDefaultDocumentSource(profile)).toBe("invoice");
		expect(shouldShowDocumentSourceSelector(sources)).toBe(true);
	});
});
