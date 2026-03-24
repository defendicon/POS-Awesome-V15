// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import invoiceShortcuts from "../src/posapp/components/pos/invoice/invoiceShortcuts";

const createAltEvent = (key: string, code?: string) =>
	new KeyboardEvent("keydown", {
		key,
		code: code || key,
		altKey: true,
		bubbles: true,
		cancelable: true,
	});

const createVm = () => ({
	toastStore: { show: vi.fn() },
	eventBus: { emit: vi.fn() },
	uiStore: {
		setActiveView: vi.fn(),
		triggerItemSearchFocus: vi.fn(),
		selectTopItem: vi.fn(),
		toggleItemSettings: vi.fn(),
	},
	$refs: {
		itemsTable: { focusItemField: vi.fn() },
	},
	items: [{ name: "Test Item" }],
	focusItemTableField: vi.fn(),
	confirmPaymentSubmission: vi.fn(async () => true),
});

describe("invoiceShortcuts", () => {
	beforeEach(() => {
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("frappe", { set_route: vi.fn() });
	});

	it("switches compact layout to the selector before focusing item search", async () => {
		const vm = createVm();
		const event = createAltEvent("3", "Digit3");

		await (invoiceShortcuts as any).handleInvoiceShortcut.call(vm, event);

		expect(vm.eventBus.emit).toHaveBeenCalledWith("set_compact_panel", "selector");
		expect(vm.uiStore.triggerItemSearchFocus).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
	});

	it("switches compact layout to the invoice before focusing cart quantity fields", async () => {
		const vm = createVm();
		const event = createAltEvent("q", "KeyQ");

		await (invoiceShortcuts as any).handleInvoiceShortcut.call(vm, event);

		expect(vm.eventBus.emit).toHaveBeenCalledWith("set_compact_panel", "invoice");
		expect(vm.focusItemTableField).toHaveBeenCalledWith("qty");
		expect(event.defaultPrevented).toBe(true);
	});

	it.each([
		["u", "KeyU", "uom"],
		["r", "KeyR", "rate"],
	])(
		"switches compact layout to the invoice before focusing %s cart fields",
		async (key, code, field) => {
			const vm = createVm();
			const event = createAltEvent(key, code);

			await (invoiceShortcuts as any).handleInvoiceShortcut.call(vm, event);

			expect(vm.eventBus.emit).toHaveBeenCalledWith("set_compact_panel", "invoice");
			expect(vm.focusItemTableField).toHaveBeenCalledWith(field);
			expect(event.defaultPrevented).toBe(true);
		},
	);

	it("switches compact layout to payments before queueing submit and print", async () => {
		const vm = {
			...createVm(),
			show_payment: vi.fn(async () => {}),
			flushBackgroundUpdates: vi.fn(async () => {}),
			triggerBackgroundFlush: { flush: vi.fn() },
			schedulePricingRuleApplication: { flush: vi.fn() },
		};
		const event = createAltEvent("p", "KeyP");

		await (invoiceShortcuts as any).handleInvoiceShortcut.call(vm, event);

		expect(vm.eventBus.emit).toHaveBeenCalledWith("set_compact_panel", "selector");
		expect(vm.eventBus.emit).toHaveBeenCalledWith("queue_submit_payment_shortcut", {
			print: true,
		});
		expect(vm.show_payment).toHaveBeenCalledTimes(1);
		expect(vm.show_payment.mock.invocationCallOrder[0]).toBeLessThan(
			vm.eventBus.emit.mock.invocationCallOrder.find(
				(_: number, index: number) =>
					vm.eventBus.emit.mock.calls[index]?.[0] === "queue_submit_payment_shortcut",
			) ?? Number.MAX_SAFE_INTEGER,
		);
		expect(event.defaultPrevented).toBe(true);
	});
});
