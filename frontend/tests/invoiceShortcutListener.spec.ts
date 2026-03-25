// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
	INVOICE_SHORTCUT_LISTENER_OPTIONS,
	createInvoiceShortcutListeners,
	registerInvoiceShortcutListener,
	unregisterInvoiceShortcutListener,
} from "../src/posapp/utils/invoiceShortcutListener";

describe("invoiceShortcutListener", () => {
	it("registers and unregisters the global shortcut listeners in capture phase", () => {
		const target = {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		};
		const listeners = createInvoiceShortcutListeners(vi.fn());

		registerInvoiceShortcutListener(target as unknown as Document, listeners);
		unregisterInvoiceShortcutListener(target as unknown as Document, listeners);

		expect(target.addEventListener).toHaveBeenCalledWith(
			"keydown",
			listeners.onKeydown,
			INVOICE_SHORTCUT_LISTENER_OPTIONS,
		);
		expect(target.addEventListener).toHaveBeenCalledWith(
			"keyup",
			listeners.onKeyup,
			INVOICE_SHORTCUT_LISTENER_OPTIONS,
		);
		expect(target.removeEventListener).toHaveBeenCalledWith(
			"keydown",
			listeners.onKeydown,
			INVOICE_SHORTCUT_LISTENER_OPTIONS,
		);
		expect(target.removeEventListener).toHaveBeenCalledWith(
			"keyup",
			listeners.onKeyup,
			INVOICE_SHORTCUT_LISTENER_OPTIONS,
		);
		expect(INVOICE_SHORTCUT_LISTENER_OPTIONS).toBe(true);
	});

	it("falls back to keyup for alt shortcuts when keydown never arrives", () => {
		const handler = vi.fn();
		const listeners = createInvoiceShortcutListeners(handler);
		const event = new KeyboardEvent("keyup", {
			key: "3",
			code: "Digit3",
			altKey: true,
		});

		listeners.onKeyup(event);

		expect(handler).toHaveBeenCalledWith(event);
	});

	it("does not re-run a shortcut on keyup when keydown already handled it", () => {
		const handler = vi.fn((event: KeyboardEvent) => {
			if (event.type === "keydown") {
				event.preventDefault();
			}
		});
		const listeners = createInvoiceShortcutListeners(handler);
		const keydownEvent = new KeyboardEvent("keydown", {
			key: "3",
			code: "Digit3",
			altKey: true,
			cancelable: true,
		});
		const keyupEvent = new KeyboardEvent("keyup", {
			key: "3",
			code: "Digit3",
			altKey: true,
		});

		listeners.onKeydown(keydownEvent);
		listeners.onKeyup(keyupEvent);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(keydownEvent);
	});
});
