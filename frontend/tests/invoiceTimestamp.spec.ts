import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureOfflineInvoiceTime } from "../src/offline/invoiceTimestamp";

describe("offline sale timestamp", () => {
	beforeEach(() =>
		vi.stubGlobal("frappe", {
			boot: { time_zone: { system: "Asia/Karachi" } },
		}),
	);
	it("uses the site timezone across midnight and keeps timestamps stable on replay", () => {
		const invoice: any = {
			posting_date: "2026-11-03",
			posting_time: "01:00:00",
		};
		captureOfflineInvoiceTime(invoice, new Date("2026-11-03T20:30:45Z"));
		expect(invoice).toEqual({
			posting_date: "2026-11-04",
			posting_time: "01:30:45",
			set_posting_time: 1,
			_posa_offline_created_at: "2026-11-03T20:30:45.000Z",
		});
		captureOfflineInvoiceTime(invoice, new Date("2026-11-05T09:00:00Z"));
		expect(invoice.posting_time).toBe("01:30:45");
		expect(invoice.posting_date).toBe("2026-11-04");
	});
	it("keeps explicitly chosen accounting date and time", () => {
		const invoice: any = {
			posting_date: "2026-11-01",
			posting_time: "10:15:00",
			set_posting_time: 1,
		};
		captureOfflineInvoiceTime(invoice, new Date("2026-11-04T09:00:00Z"));
		expect(invoice.posting_date).toBe("2026-11-01");
		expect(invoice.posting_time).toBe("10:15:00");
	});
	it("fills a missing manual time and supports old boot data", () => {
		vi.stubGlobal("frappe", {});
		const invoice: any = {
			posting_date: "2026-11-01",
			set_posting_time: 1,
		};
		captureOfflineInvoiceTime(invoice);
		expect(invoice.posting_date).toBe("2026-11-01");
		expect(invoice.posting_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
	});
});
