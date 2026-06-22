// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/posapp/composables/core/useTheme", () => ({
	useTheme: () => ({ isDark: { value: false } }),
}));
vi.mock("../src/posapp/composables/core/useResponsive", () => ({
	useResponsive: () => ({ windowWidth: { value: 1400 } }),
}));
vi.mock("../src/offline/index", () => ({ isOffline: () => false }));
vi.mock("../src/posapp/plugins/print", () => ({
	appendDebugPrintParam: (url: string) => url,
	isDebugPrintEnabled: () => false,
	silentPrint: vi.fn(),
	watchPrintWindow: vi.fn(),
}));
vi.mock("../src/posapp/services/qzTray", () => ({ printDocumentViaQz: vi.fn() }));

import InvoiceManagement from "../src/posapp/components/pos/flows/InvoiceManagement.vue";
import {
	buildInvoicePdfUrl,
	resolveInvoiceDoctype,
	shouldDownloadPdfForShareError,
} from "../src/posapp/utils/invoiceSharing";

const pdfResponse = () => ({
	ok: true,
	blob: vi.fn(async () => new Blob(["pdf"], { type: "application/pdf" })),
});

describe("invoice sharing helpers", () => {
	it("resolves POS Invoice doctype from POS Profile configuration", () => {
		expect(resolveInvoiceDoctype({ create_pos_invoice_instead_of_sales_invoice: 1 })).toBe(
			"POS Invoice",
		);
		expect(resolveInvoiceDoctype({ create_pos_invoice_instead_of_sales_invoice: 0 })).toBe(
			"Sales Invoice",
		);
		expect(resolveInvoiceDoctype(null)).toBe("Sales Invoice");
	});

	it("builds an encoded PDF URL for the selected invoice doctype", () => {
		expect(
			buildInvoicePdfUrl({
				doctype: "POS Invoice",
				name: "POS-INV-0001",
				format: "POS Receipt",
			}),
		).toBe(
			"/api/method/frappe.utils.print_format.download_pdf?doctype=POS%20Invoice&name=POS-INV-0001&format=POS%20Receipt&no_letterhead=0",
		);
	});

	it("downloads the PDF only when native sharing is dismissed", () => {
		expect(shouldDownloadPdfForShareError(new DOMException("Share canceled", "AbortError"))).toBe(
			true,
		);
		expect(shouldDownloadPdfForShareError(new Error("Permission denied"))).toBe(false);
	});
});

describe("invoice management sharing", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.stubGlobal("__", (value: string, args?: unknown[]) =>
			args ? `${value} ${args.join(",")}` : value,
		);
		vi.stubGlobal("frappe", {
			csrf_token: "csrf-token",
			datetime: {
				get_today: () => "2026-06-17",
			},
		});
	});

	it("ignores overlapping share requests until the active share finishes", async () => {
		let resolveFetch: (_value: unknown) => void = () => {};
		const fetchMock = vi.fn(
			() =>
				new Promise((resolve) => {
					resolveFetch = resolve;
				}),
		);
		vi.stubGlobal("fetch", fetchMock);
		Object.assign(navigator, {
			canShare: vi.fn(() => false),
			share: vi.fn(),
		});
		const context = {
			isSharingInvoice: false,
			posProfile: { print_format_for_online: "POS Receipt" },
			currentInvoiceDoctype: "POS Invoice",
			downloadInvoicePdf: vi.fn(),
			eventBus: { emit: vi.fn() },
		};

		const firstShare = (InvoiceManagement as any).methods.shareInvoice.call(context, {
			name: "POS-INV-0001",
		});
		const secondShare = (InvoiceManagement as any).methods.shareInvoice.call(context, {
			name: "POS-INV-0001",
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);

		resolveFetch(pdfResponse());
		await Promise.all([firstShare, secondShare]);

		expect(context.isSharingInvoice).toBe(false);
	});
});
