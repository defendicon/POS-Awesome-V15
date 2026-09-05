import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/offline/index", () => ({
	isOffline: vi.fn(() => false),
}));

vi.mock("../src/posapp/components/pos/invoice_utils/currency", () => ({
	_logPriceListDebug: vi.fn(),
	_buildPriceListSnapshot: vi.fn(() => []),
}));

import { process_invoice } from "../src/posapp/components/pos/invoice_utils/server";

const terminalLockedError = {
	responseJSON: {
		_server_messages: JSON.stringify([
			JSON.stringify({
				message:
					"This POS terminal is locked. Verify a cashier PIN to continue.",
			}),
		]),
	},
};

const createContext = () => ({
	invoiceType: "Invoice",
	pos_profile: { name: "Main POS", currency: "PKR" },
	customer: "CUST-001",
	customer_info: {},
	selected_price_list: "Retail Selling",
	get_price_list: () => "Retail Selling",
	get_invoice_doc: () => ({
		doctype: "Sales Invoice",
		customer: "CUST-001",
		items: [{ item_code: "ITEM-001", qty: 1 }],
	}),
	formatDateForBackend: (value: string) => value,
	posting_date_display: "2026-09-02",
	toastStore: { show: vi.fn() },
	employeeStore: {
		requestTerminalUnlock: vi.fn<() => Promise<boolean>>(),
	},
	invoice_doc: {},
});

describe("process_invoice terminal unlock recovery", () => {
	beforeEach(() => {
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("frappe", {
			call: vi.fn(),
			utils: { strip_html: (value: string) => value },
		});
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("opens the cashier PIN flow and retries payment preparation after unlock", async () => {
		const context = createContext();
		context.employeeStore.requestTerminalUnlock.mockResolvedValue(true);
		(globalThis as any).frappe.call
			.mockRejectedValueOnce(terminalLockedError)
			.mockResolvedValueOnce({
				message: {
					doctype: "Sales Invoice",
					name: "ACC-SINV-0001",
					posting_date: "2026-09-02",
				},
			});

		const result = await process_invoice(context);

		expect(
			context.employeeStore.requestTerminalUnlock,
		).toHaveBeenCalledOnce();
		expect((globalThis as any).frappe.call).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({ name: "ACC-SINV-0001" });
		expect(context.toastStore.show).not.toHaveBeenCalled();
	});

	it("stops cleanly when the cashier cancels the PIN dialog", async () => {
		const context = createContext();
		context.employeeStore.requestTerminalUnlock.mockResolvedValue(false);
		(globalThis as any).frappe.call.mockRejectedValueOnce(
			terminalLockedError,
		);

		await expect(process_invoice(context)).resolves.toBe(false);

		expect(
			context.employeeStore.requestTerminalUnlock,
		).toHaveBeenCalledOnce();
		expect((globalThis as any).frappe.call).toHaveBeenCalledOnce();
		expect(context.toastStore.show).not.toHaveBeenCalled();
	});
});
