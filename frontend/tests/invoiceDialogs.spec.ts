// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { close_payments, show_payment } from "../src/posapp/components/pos/invoice_utils/dialogs";

const createPaymentContext = () => ({
	_suppressClosePaymentsTimer: null,
	_suppressClosePayments: false,
	customer: "CUST-001",
	items: [{ item_code: "ITEM-001" }],
	validate: vi.fn(async () => true),
	ensure_auto_batch_selection: vi.fn(async () => {}),
	invoiceType: "Invoice",
	pos_profile: { currency: "USD" },
	invoice_doc: {},
	process_invoice: vi.fn(async () => ({
		doctype: "Sales Invoice",
		grand_total: 10,
		rounded_total: 10,
		total: 10,
		payments: [],
	})),
	process_invoice_from_order: vi.fn(),
	reload_current_invoice_from_backend: vi.fn(),
	selected_currency: "USD",
	conversion_rate: 1,
	_getPlcConversionRate: () => 1,
	flt: (value: unknown) => Number(value || 0),
	currency_precision: 2,
	float_precision: 2,
	isReturnInvoice: false,
	get_payments: () => [],
	$nextTick: async () => {},
	uiStore: {
		openPaymentDialog: vi.fn(),
		closePaymentDialog: vi.fn(),
		setActiveView: vi.fn(),
	},
	eventBus: { emit: vi.fn() },
	toastStore: { show: vi.fn() },
});

describe("invoice payment dialogs", () => {
	beforeEach(() => {
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("frappe", { call: vi.fn() });
		Object.defineProperty(window, "innerWidth", {
			value: 500,
			writable: true,
			configurable: true,
		});
	});

	it("switches compact layout to the selector when opening payments", async () => {
		const context = createPaymentContext();

		await show_payment(context);

		expect(context.uiStore.setActiveView).toHaveBeenCalledWith("payment");
		expect(context.eventBus.emit).toHaveBeenCalledWith("set_compact_panel", "selector");
		expect(context.eventBus.emit).toHaveBeenCalledWith("show_payment", "true");
	});

	it("ignores repeat Pay requests while the first one is still saving", async () => {
		const context = createPaymentContext();
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		context.validate = vi.fn(async () => {
			await gate;
			return true;
		});

		const first = show_payment(context);
		const second = show_payment(context);
		const third = show_payment(context);
		release();
		await Promise.all([first, second, third]);

		// Only one save/validation runs for overlapping Pay presses.
		expect(context.validate).toHaveBeenCalledTimes(1);
		expect(context.process_invoice).toHaveBeenCalledTimes(1);

		// The guard is released afterwards, so a later Pay works normally.
		await show_payment(context);
		expect(context.process_invoice).toHaveBeenCalledTimes(2);
	});

	it("releases the Pay guard after an early return", async () => {
		const context = createPaymentContext();
		context.items = [];
		await show_payment(context);
		expect(context.toastStore.show).toHaveBeenCalled();

		context.items = [{ item_code: "ITEM-001" }];
		await show_payment(context);
		expect(context.process_invoice).toHaveBeenCalledTimes(1);
	});

	it("completes automatic batch assignment before validating payment", async () => {
		const context = createPaymentContext();
		const sequence: string[] = [];
		context.ensure_auto_batch_selection = vi.fn(async () => {
			sequence.push("assign");
		});
		context.validate = vi.fn(async () => {
			sequence.push("validate");
			return true;
		});

		await show_payment(context);

		expect(sequence).toEqual(["assign", "validate"]);
	});

	it("switches compact layout back to the invoice when closing payments", () => {
		const context = {
			_suppressClosePayments: false,
			paymentVisible: true,
			uiStore: {
				paymentDialogOpen: false,
				closePaymentDialog: vi.fn(),
				setActiveView: vi.fn(),
			},
			eventBus: { emit: vi.fn() },
		};

		close_payments(context);

		expect(context.uiStore.setActiveView).toHaveBeenCalledWith("items");
		expect(context.eventBus.emit).toHaveBeenCalledWith("set_compact_panel", "invoice");
		expect(context.eventBus.emit).toHaveBeenCalledWith("show_payment", "false");
	});
});
