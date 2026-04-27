import { describe, expect, it } from "vitest";

import {
	getAvailableCommercialDocumentSources,
	getDocumentFlowActionsForRecord,
	getAvailableDocumentSources,
	getDefaultDocumentSource,
	getDefaultCommercialDocumentSource,
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
			custom_allow_create_quotation: true,
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

	it("exposes delivery in the commercial flow selector when order selection is enabled", () => {
		const profile = {
			custom_allow_select_sales_order: 1,
			custom_allow_create_quotation: 1,
		};

		const sources = getAvailableCommercialDocumentSources(profile);

		expect(sources.map((source) => source.key)).toEqual([
			"invoice",
			"order",
			"quote",
			"delivery",
		]);
		expect(getDefaultCommercialDocumentSource(profile, "delivery")).toBe("delivery");
	});

	it("derives source actions from source type and docstatus", () => {
		expect(
			getDocumentFlowActionsForRecord({ source: "quote", source_docstatus: 0 }),
		).toEqual(["quote_edit_draft", "quote_submit"]);
		expect(
			getDocumentFlowActionsForRecord({ source: "quote", source_docstatus: 1 }),
		).toEqual(["quote_to_order", "quote_to_invoice"]);
		expect(
			getDocumentFlowActionsForRecord({ source: "order", source_docstatus: 1 }),
		).toEqual(["order_load", "order_to_delivery_note", "order_to_invoice"]);
		expect(
			getDocumentFlowActionsForRecord({ source: "delivery", source_docstatus: 1 }),
		).toEqual(["delivery_to_invoice"]);
	});
});
