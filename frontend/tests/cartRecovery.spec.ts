// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { reactive, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearCartRecovery,
	readCartRecovery,
	saveCartRecovery,
	getCartRecoveryKey,
	listRestartCartRecoveries,
	lockCartRecovery,
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
	doctype: "Sales Invoice",
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
		vi.unstubAllGlobals();
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
		await vi.waitFor(
			() => expect(ctx.load_invoice).toHaveBeenCalledOnce(),
			{ timeout: 5000 },
		);
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
		await db.table("invoice_outbox").add({
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

function enableBrowserLocks() {
	const held = new Set<string>();
	const nav = Object.create(navigator);
	Object.defineProperty(nav, "locks", {
		value: {
			request: async (name: string, _options: any, callback: any) => {
				if (held.has(name)) return callback(null);
				held.add(name);
				try {
					return await callback({ name });
				} finally {
					held.delete(name);
				}
			},
			query: async () => ({ held: [...held].map((name) => ({ name })) }),
		},
	});
	vi.stubGlobal("navigator", nav);
}

describe("browser restart recovery ownership", () => {
	beforeEach(async () => {
		await initPromise;
		await db.table("write_queue").clear();
		await db.table("invoice_outbox").clear();
		localStorage.clear();
		sessionStorage.clear();
		vi.stubGlobal("frappe", { session: { user: scope.user } });
		enableBrowserLocks();
	});
	afterEach(() => {
		controllers.splice(0).forEach((controller) => controller.stop());
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("offers and transfers a closed session's cart after sessionStorage is lost", async () => {
		const oldContext = context();
		const old = startCartRecovery(oldContext);
		controllers.push(old);
		await vi.waitFor(() =>
			expect(oldContext.cartRecoveryCandidates).toEqual([]),
		);
		oldContext.items = invoice.items;
		oldContext.customer = invoice.customer;
		oldContext.invoice_doc = invoice;
		expect(old.flush()).toBe(true);
		const sourceKey = getCartRecoveryKey(scope);
		expect(readCartRecovery(scope)?.restart_recoverable).toBe(true);
		old.stop();
		sessionStorage.clear();
		const ctx = context();
		const controller = startCartRecovery(ctx);
		controllers.push(controller);
		await vi.waitFor(async () => {
			await controller.refreshCandidates();
			expect(ctx.cartRecoveryCandidates).toHaveLength(1);
		});
		expect(await controller.recoverSavedCart(sourceKey)).toBe(true);
		expect(ctx.customer).toBe("Alice");
		expect(ctx.invoice_doc.posa_client_request_id).toBe("cart-id");
		expect(ctx.invoice_doc.items[0].conversion_factor).toBe(3);
		expect(ctx.invoice_doc.payments[0].amount).toBe(60);
		expect(localStorage.getItem(sourceKey)).toBeNull();
		expect(readCartRecovery(scope)?.invoice.posa_client_request_id).toBe(
			"cart-id",
		);
	});

	it("does not offer a live tab's cart and grants only one simultaneous claim", async () => {
		saveCartRecovery(scope, invoice, localStorage, sessionStorage, true);
		const key = getCartRecoveryKey(scope);
		const [first, second] = await Promise.all([
			lockCartRecovery(key),
			lockCartRecovery(key),
		]);
		expect(first).toBeTypeOf("function");
		expect(second).toBeNull();
		expect((await listRestartCartRecoveries(scope)).candidates).toEqual([]);
		first?.();
		await Promise.resolve();
		await vi.waitFor(async () =>
			expect(
				(await listRestartCartRecoveries(scope)).candidates,
			).toHaveLength(1),
		);
	});

	it("does not overwrite the original cart when sessionStorage was cloned by a duplicated tab", async () => {
		saveCartRecovery(scope, invoice, localStorage, sessionStorage, true);
		const sourceKey = getCartRecoveryKey(scope);
		const release = await lockCartRecovery(sourceKey);
		const ctx = context();
		const controller = startCartRecovery(ctx);
		controllers.push(controller);
		await vi.waitFor(() => expect(ctx.cartRecoveryCandidates).toEqual([]));
		expect(getCartRecoveryKey(scope)).not.toBe(sourceKey);
		expect(ctx.load_invoice).not.toHaveBeenCalled();
		expect(
			JSON.parse(localStorage.getItem(sourceKey)!).invoice.customer,
		).toBe("Alice");
		release?.();
	});

	it("filters other cashiers, profiles, warehouses, openings and older unsafe snapshots", async () => {
		saveCartRecovery(scope, invoice); // Legacy ownership protocol: retain, do not adopt.
		for (const patch of [
			{ cashier: "other" },
			{ profile: "other" },
			{ warehouse: "other" },
			{ opening: "other" },
			{ user: "other" },
			{ company: "other" },
		])
			saveCartRecovery(
				{ ...scope, ...patch },
				invoice,
				localStorage,
				sessionStorage,
				true,
			);
		expect((await listRestartCartRecoveries(scope)).candidates).toEqual([]);
	});

	it.each(["pending", "acknowledged"])(
		"rechecks the %s outbox entry before recovery even if a stale candidate was visible",
		async (status) => {
			saveCartRecovery(
				scope,
				invoice,
				localStorage,
				sessionStorage,
				true,
			);
			const sourceKey = getCartRecoveryKey(scope);
			sessionStorage.clear();
			const ctx = context();
			const controller = startCartRecovery(ctx);
			controllers.push(controller);
			await vi.waitFor(() =>
				expect(ctx.cartRecoveryCandidates).toHaveLength(1),
			);
			await db
				.table("invoice_outbox")
				.add({ client_request_id: "cart-id", status });
			expect(await controller.recoverSavedCart(sourceKey)).toBe(false);
			expect(ctx.cartRecoveryError).toContain(
				"already queued or submitted",
			);
			expect(ctx.load_invoice).not.toHaveBeenCalled();
			expect(localStorage.getItem(sourceKey)).not.toBeNull();
		},
	);

	it("does not replace an active sale and blocks carts from another cashier", async () => {
		saveCartRecovery(scope, invoice, localStorage, sessionStorage, true);
		const sourceKey = getCartRecoveryKey(scope);
		const foreign = { ...scope, cashier: "cashier-b" };
		saveCartRecovery(foreign, invoice, localStorage, sessionStorage, true);
		const foreignKey = getCartRecoveryKey(foreign);
		sessionStorage.clear();
		const ctx = context();
		const controller = startCartRecovery(ctx);
		controllers.push(controller);
		await vi.waitFor(() =>
			expect(ctx.cartRecoveryCandidates).toHaveLength(1),
		);
		ctx.items = [{ item_code: "CURRENT", qty: 1 }];
		expect(await controller.recoverSavedCart(sourceKey)).toBe(false);
		expect(ctx.items[0].item_code).toBe("CURRENT");
		ctx.items = [];
		expect(await controller.recoverSavedCart(foreignKey)).toBe(false);
		expect(ctx.cartRecoveryError).toContain("another cashier or POS scope");
		expect(ctx.load_invoice).not.toHaveBeenCalled();
	});

	it("does not offer orders or returns as restart sales and strips credentials on read", async () => {
		saveCartRecovery(
			scope,
			{ ...invoice, doctype: "Sales Order" },
			localStorage,
			sessionStorage,
			true,
		);
		expect((await listRestartCartRecoveries(scope)).candidates).toEqual([]);
		saveCartRecovery(
			scope,
			{ ...invoice, is_return: 1 },
			localStorage,
			sessionStorage,
			true,
		);
		expect((await listRestartCartRecoveries(scope)).candidates).toEqual([]);
		saveCartRecovery(scope, invoice, localStorage, sessionStorage, true);
		const key = getCartRecoveryKey(scope),
			raw = JSON.parse(localStorage.getItem(key)!);
		raw.invoice._posa_offline_cashier_token = "old-token";
		raw.invoice.posa_below_cost_override = 1;
		localStorage.setItem(key, JSON.stringify(raw));
		expect(readCartRecovery(scope)?.invoice).toEqual(invoice);
	});

	it("retains and locks the source when destination persistence fails after loading", async () => {
		saveCartRecovery(scope, invoice, localStorage, sessionStorage, true);
		const sourceKey = getCartRecoveryKey(scope);
		sessionStorage.clear();
		const ctx = context();
		const controller = startCartRecovery(ctx);
		controllers.push(controller);
		await vi.waitFor(() =>
			expect(ctx.cartRecoveryCandidates).toHaveLength(1),
		);
		const write = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new Error("Storage full");
			});
		expect(await controller.recoverSavedCart(sourceKey)).toBe(false);
		expect(ctx.cartRecoveryError).toBe("Storage full");
		expect(localStorage.getItem(sourceKey)).not.toBeNull();
		expect(await lockCartRecovery(sourceKey)).toBeNull();
		write.mockRestore();
	});

	it("retains malformed records and fails closed when browser ownership locks are unavailable", async () => {
		saveCartRecovery(scope, invoice, localStorage, sessionStorage, true);
		const key = getCartRecoveryKey(scope);
		localStorage.setItem(key, "broken");
		expect((await listRestartCartRecoveries(scope)).issues).toHaveLength(1);
		expect(localStorage.getItem(key)).toBe("broken");
		vi.stubGlobal("navigator", {});
		expect((await listRestartCartRecoveries(scope)).candidates).toEqual([]);
	});
});
