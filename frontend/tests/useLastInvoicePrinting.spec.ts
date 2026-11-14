// @vitest-environment jsdom

import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/offline/db", () => ({ isOffline: vi.fn(() => false) }));
vi.mock("../src/posapp/services/offlineReceiptPrint", () => ({
	reprintOfflineReceipt: vi.fn(async () => undefined),
}));

vi.mock("../src/posapp/plugins/print", () => ({
	appendDebugPrintParam: (url: string) => url,
	isDebugPrintEnabled: () => false,
	silentPrint: vi.fn(),
	watchPrintWindow: vi.fn(),
}));

vi.mock("../src/posapp/services/documentPrint", () => ({
	confirmDocumentPrintFallback: vi.fn(() => false),
	printDocumentViaConfiguredQz: vi.fn(),
	shouldUseConfiguredQzDocumentPrinting: () => false,
	shouldUseRawDocumentPrinting: () => false,
}));

vi.mock("../src/posapp/services/exchangeReceiptPrint", () => ({
	isExchangeReceiptDocument: (doc: Record<string, any> | null | undefined) =>
		Boolean(doc?.exchange_reference && doc?.return_invoice_doc),
	printExchangeReceipt: vi.fn(),
}));

import { useLastInvoicePrinting } from "../src/posapp/composables/core/useLastInvoicePrinting";
import { printExchangeReceipt } from "../src/posapp/services/exchangeReceiptPrint";
import { useUIStore } from "../src/posapp/stores/uiStore";
import { reprintOfflineReceipt } from "../src/posapp/services/offlineReceiptPrint";

describe("useLastInvoicePrinting", () => {
	it("keeps an offline request ID out of server print URLs after reconnect", async () => {
		const store = useUIStore(),
			profile = { name: "Main POS", company: "Co" } as any;
		store.setPosProfile(profile);
		store.setLastInvoice("client-request", {
			_posa_offline_request_id: "client-request",
		});
		await useLastInvoicePrinting().printLastInvoice();
		expect(reprintOfflineReceipt).toHaveBeenCalledWith(
			"client-request",
			profile,
		);
	});
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
	});

	it("reprints the combined receipt for the last completed exchange", async () => {
		const store = useUIStore();
		const profile = { name: "Main POS", print_format: "Standard" } as any;
		const exchange = {
			name: "SINV-NEW",
			exchange_reference: "POS-EXCH-00001",
			replacement_invoice: "SINV-NEW",
			return_invoice_doc: { name: "SINV-RETURN" },
			exchange_summary: { difference_amount: 50 },
		};
		store.setPosProfile(profile);
		store.setLastInvoice("SINV-NEW", exchange);

		await useLastInvoicePrinting().printLastInvoice();

		expect(printExchangeReceipt).toHaveBeenCalledWith(exchange, profile);
	});
});
