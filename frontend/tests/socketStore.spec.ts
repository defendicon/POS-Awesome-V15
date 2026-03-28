// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useSocketStore } from "../src/posapp/stores/socketStore";
import { useToastStore } from "../src/posapp/stores/toastStore";

describe("socketStore", () => {
	let handlers: Record<string, (payload: any) => void>;

	beforeEach(() => {
		setActivePinia(createPinia());
		handlers = {};
		vi.stubGlobal("__", (value: string, args?: any[]) => {
			if (!args?.length) return value;
			return value.replace(/\{(\d+)\}/g, (_match, index) => String(args[Number(index)] ?? ""));
		});
		vi.stubGlobal("frappe", {
			realtime: {
				on: vi.fn((event: string, handler: (payload: any) => void) => {
					handlers[event] = handler;
				}),
			},
			msgprint: vi.fn(),
		});
	});

	it("shows a spinner toast and resolves payment waiters on completion", async () => {
		const socketStore = useSocketStore();
		const toastStore = useToastStore();

		socketStore.init();

		const waitPromise = socketStore.waitForPostSubmitPayments("ACC-SINV-0001", 1000);

		handlers.pos_invoice_processed({
			invoice: "ACC-SINV-0001",
			doctype: "Sales Invoice",
			has_post_submit_payment_work: true,
		});

		expect(toastStore.text).toContain("Invoice Submitted");
		expect(toastStore.loading).toBe(true);
		expect(toastStore.timeout).toBe(-1);
		expect(toastStore.text).toContain("Processing payment entries");

		handlers.pos_post_submit_payments_started({
			invoice: "ACC-SINV-0001",
			doctype: "Sales Invoice",
		});

		handlers.pos_post_submit_payments_completed({
			invoice: "ACC-SINV-0001",
			doctype: "Sales Invoice",
		});

		await expect(waitPromise).resolves.toMatchObject({
			status: "completed",
			doctype: "Sales Invoice",
		});
		expect(toastStore.loading).toBe(false);
		expect(toastStore.text).toContain("Invoice Submitted");
		expect(toastStore.text).toContain("Payment entries processed");
	});
});
