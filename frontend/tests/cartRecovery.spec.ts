// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { reactive, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearCartRecovery,
	readCartRecovery,
	saveCartRecovery,
} from "../src/posapp/utils/cartRecovery";
import { startCartRecovery } from "../src/posapp/composables/pos/invoice/useCartRecovery";
import { db, initPromise } from "../src/offline/db";

const scope = {
	user: "terminal",
	cashier: "cashier-a",
	profile: "Main",
	company: "Co",
	warehouse: "WH",
	opening: "OPEN-1",
};
const invoice = {
	company: "Co",
	pos_profile: "Main",
	customer: "Alice",
	items: [{ item_code: "A", qty: 2, rate: 30, conversion_factor: 3 }],
	payments: [{ mode_of_payment: "Cash", amount: 60 }],
	posa_client_request_id: "cart-id",
};
const controllers: ReturnType<typeof startCartRecovery>[] = [];
function context() {
	const ctx: any = reactive({
		currentCashier: { user: scope.cashier },
		pos_profile: {
			name: scope.profile,
			company: scope.company,
			warehouse: scope.warehouse,
		},
		pos_opening_shift: { name: scope.opening },
		items: [] as any[],
		invoice_doc: null as any,
		customer: "",
		exchangeSession: null,
		cartRecoveryError: "",
		uiStore: { closePaymentDialog: vi.fn(), setActiveView: vi.fn() },
	});
	ctx.invoiceStore = {
		mergeInvoiceDoc: (patch: any) => {
			ctx.invoice_doc = { ...ctx.invoice_doc, ...patch };
		},
	};
	ctx.get_invoice_doc = () => ({
		...ctx.invoice_doc,
		company: "Co",
		pos_profile: "Main",
		customer: ctx.customer,
		items: ctx.items,
	});
	ctx.clear_invoice = () => {
		ctx.items = [];
		ctx.customer = "";
		ctx.invoice_doc = null;
	};
	ctx.load_invoice = vi.fn(async (doc: any) => {
		ctx.invoice_doc = doc;
		ctx.items = doc.items;
		ctx.customer = doc.customer;
	});
	return ctx;
}
describe("cashier cart crash recovery", () => {
	beforeEach(async () => {
		await initPromise;
		await db.table("write_queue").clear();
		await db.table("invoice_outbox").clear();
		localStorage.clear();
		sessionStorage.clear();
		vi.stubGlobal("frappe", { session: { user: "terminal" } });
	});
	afterEach(() => {
		controllers.splice(0).forEach((controller) => controller.stop());
		vi.restoreAllMocks();
	});
	it("preserves customer, UOM rows and payment amounts without persisting credentials/approvals", () => {
		saveCartRecovery(scope, {
			...invoice,
			_posa_offline_cashier_token: "secret",
			posa_below_cost_override: 1,
		});
		expect(readCartRecovery(scope)?.invoice).toEqual(invoice);
		expect(readCartRecovery({ ...scope, cashier: "cashier-b" })).toBeNull();
		expect(readCartRecovery({ ...scope, warehouse: "OTHER" })).toBeNull();
	});
	it("restores the same-tab cart after reload through the existing loader", async () => {
		saveCartRecovery(scope, invoice);
		const ctx = context();
		const controller = startCartRecovery(ctx);
		controllers.push(controller);
		await vi.waitFor(() => expect(ctx.load_invoice).toHaveBeenCalledOnce());
		expect(ctx.customer).toBe("Alice");
		expect(ctx.items[0].conversion_factor).toBe(3);
		expect(ctx.invoice_doc.payments[0].amount).toBe(60);
	});
	it("saves an outgoing cart and restores the incoming cashier's own cart", async () => {
		saveCartRecovery(
			{ ...scope, cashier: "cashier-b" },
			{ ...invoice, customer: "Bob", posa_client_request_id: "cart-b" },
		);
		const ctx = context();
		const controller = startCartRecovery(ctx);
		controllers.push(controller);
		await nextTick();
		ctx.items = invoice.items;
		ctx.customer = "Alice";
		controller.flush();
		ctx.currentCashier = { user: "cashier-b" };
		await vi.waitFor(() => expect(ctx.customer).toBe("Bob"));
		expect(readCartRecovery(scope)?.invoice.customer).toBe("Alice");
	});
	it("does not resurrect a cart already queued or submitted by the durable outbox", async () => {
		saveCartRecovery(scope, invoice);
		await db
			.table("invoice_outbox")
			.add({
				client_request_id: "cart-id",
				status: "acknowledged",
				created_at: new Date().toISOString(),
			});
		const ctx = context();
		controllers.push(startCartRecovery(ctx));
		await vi.waitFor(() => expect(readCartRecovery(scope)).toBeNull());
		expect(ctx.load_invoice).not.toHaveBeenCalled();
	});
	it("flushes on page hide and cancels a cashier switch when storage cannot save", async () => {
		const ctx = context();
		controllers.push(startCartRecovery(ctx));
		await nextTick();
		ctx.items = invoice.items;
		ctx.customer = "Alice";
		window.dispatchEvent(new Event("pagehide"));
		expect(readCartRecovery(scope)?.invoice.customer).toBe("Alice");
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Storage full");
		});
		expect(
			window.dispatchEvent(
				new Event("posa:before-cashier-switch", { cancelable: true }),
			),
		).toBe(false);
		expect(ctx.cartRecoveryError).toBe("Storage full");
	});
	it("keeps a malformed snapshot available for review instead of silently deleting it", () => {
		saveCartRecovery(scope, invoice);
		const key = Object.keys(localStorage)[0]!;
		localStorage.setItem(key, "broken");
		expect(() => readCartRecovery(scope)).toThrow();
		expect(localStorage.getItem(key)).toBe("broken");
		clearCartRecovery(scope);
		expect(readCartRecovery(scope)).toBeNull();
	});
});
