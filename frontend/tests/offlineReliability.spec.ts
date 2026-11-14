// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	db,
	initPromise,
	memory,
	assertOfflineDataCanBeCleared,
	exportOfflineRecoveryData,
	pruneOfflineStorage,
} from "../src/offline/db";
import {
	saveOfflineInvoice,
	syncOfflineInvoices,
	getOfflineInvoices,
} from "../src/offline/invoices";
import {
	enqueueInvoiceOutboxEntry,
	getPendingInvoiceOutboxCount,
	setInvoiceOutboxMode,
	syncInvoiceOutboxResource,
	persistInvoiceIntentJournal,
} from "../src/offline/invoiceOutbox";
import {
	getInvoiceRecoveryRows,
	retryInvoiceRecovery,
	deleteUnsentRecoveryInvoice,
	reconcileRecoveryInvoice,
} from "../src/offline/invoiceRecovery";
import { updateLocalStockCache } from "../src/offline/stock";
import {
	getCashierHandoverSummary,
	recordCashierHandover,
} from "../src/offline/cashierHandover";

const scope = { profile: "Main POS", company: "Test Co" };
function sale(id: string, extra: any = {}) {
	return {
		invoice: {
			doctype: "Sales Invoice",
			posa_client_request_id: id,
			pos_profile: scope.profile,
			company: scope.company,
			posa_pos_opening_shift: "SHIFT-1",
			posa_cashier: "cashier-a",
			currency: "PKR",
			customer: "Walk In",
			update_stock: 0,
			grand_total: 100,
			items: [
				{ item_code: "A", qty: 2, conversion_factor: 3, stock_qty: 6 },
			],
			payments: [{ mode_of_payment: "Cash", type: "Cash", amount: 100 }],
			...extra,
		},
		data: {},
	};
}

describe("offline recovery integrity", () => {
	beforeEach(async () => {
		await initPromise;
		for (const table of [
			"write_queue",
			"queue",
			"invoice_outbox",
			"keyval",
			"customers",
		])
			await db.table(table).clear();
		localStorage.clear();
		memory.offline_invoices = [];
		memory.offline_customers = [];
		memory.customer_storage = [];
		memory.local_stock_cache = {};
		memory.pos_opening_storage = null;
		memory.manual_offline = false;
		setInvoiceOutboxMode("off");
		vi.stubGlobal("frappe", {
			session: { user: "terminal" },
			call: vi.fn(),
		});
	});

	it("resolves recovery customer labels from durable cache without changing invoice payloads", async () => {
		await db
			.table("customers")
			.put({ name: "zzz", customer_name: "Walk-In" });
		await saveOfflineInvoice(sale("display-1", { customer: "zzz" }));
		const [row] = await getInvoiceRecoveryRows(scope);
		expect(row.customer_label).toBe("Walk-In");
		expect(row.invoice.customer).toBe("zzz");
		expect(getOfflineInvoices()[0].invoice.customer_name).toBeUndefined();
		await saveOfflineInvoice(sale("display-2", { customer: "uncached" }));
		await saveOfflineInvoice(
			sale("display-3", {
				customer: "zzz",
				customer_name: "Original customer title",
			}),
		);
		const rows = await getInvoiceRecoveryRows(scope);
		expect(
			rows.find((entry) => entry.request_id === "display-2")
				?.customer_label,
		).toBe("uncached");
		expect(
			rows.find((entry) => entry.request_id === "display-3")
				?.customer_label,
		).toBe("Original customer title");
	});

	it("retains a server draft as pending and never guesses success after a lost response", async () => {
		await saveOfflineInvoice(sale("draft-1"));
		vi.mocked(frappe.call).mockResolvedValueOnce({
			message: { name: "SINV-DRAFT", docstatus: 0 },
		});
		expect(await syncOfflineInvoices()).toMatchObject({
			pending: 1,
			synced: 0,
			drafted: 1,
		});
		expect(getOfflineInvoices()[0]).toMatchObject({
			status: "draft",
			invoice: { name: "SINV-DRAFT", posa_client_request_id: "draft-1" },
		});
		vi.mocked(frappe.call).mockRejectedValueOnce(
			new Error("lost response"),
		);
		await syncOfflineInvoices();
		expect(frappe.call).toHaveBeenCalledTimes(2);
		expect(
			vi
				.mocked(frappe.call)
				.mock.calls.every(([args]) =>
					args.method.endsWith("submit_invoice_outbox_entry"),
				),
		).toBe(true);
		expect(getOfflineInvoices()).toHaveLength(1);
	});

	it("requires a submitted document and keeps exhausted records visible and retryable", async () => {
		await enqueueInvoiceOutboxEntry(sale("retry-1"));
		const call = vi.fn(async () => ({
			acknowledged: true,
			invoice: { name: "DRAFT", docstatus: 0 },
		}));
		await syncInvoiceOutboxResource(call);
		const first = await db.table("invoice_outbox").toCollection().first();
		await db
			.table("invoice_outbox")
			.put({ ...first, status: "dead_letter", retry_count: 5 });
		expect(await getPendingInvoiceOutboxCount()).toBe(1);
		expect(await getInvoiceRecoveryRows(scope)).toHaveLength(1);
		await expect(
			retryInvoiceRecovery("retry-1", { profile: "Other" }),
		).rejects.toThrow("another POS");
		await retryInvoiceRecovery("retry-1", scope);
		const [row] = await getInvoiceRecoveryRows(scope);
		expect(row).toMatchObject({
			status: "pending",
			request_id: "retry-1",
			retry_count: 0,
		});
		expect(getOfflineInvoices()[0]?.invoice.posa_client_request_id).toBe(
			"retry-1",
		);
	});

	it("serializes simultaneous outbox claims and recovers an expired lease", async () => {
		await enqueueInvoiceOutboxEntry(sale("claim-1"));
		let resolve!: (value: any) => void;
		const call = vi.fn(
			() =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		const first = syncInvoiceOutboxResource(call);
		await vi.waitFor(() => expect(call).toHaveBeenCalledTimes(1));
		await syncInvoiceOutboxResource(call);
		expect(call).toHaveBeenCalledTimes(1);
		resolve({
			acknowledged: true,
			invoice: { name: "SINV-1", docstatus: 1 },
		});
		await first;
		await enqueueInvoiceOutboxEntry(sale("claim-2"));
		const row = await db
			.table("invoice_outbox")
			.where("client_request_id")
			.equals("claim-2")
			.first();
		await db.table("invoice_outbox").put({
			...row,
			status: "syncing",
			updated_at: new Date(Date.now() - 360_000).toISOString(),
		});
		const replay = vi.fn(async () => ({
			invoice: { name: "SINV-2", docstatus: 1 },
			acknowledged: true,
		}));
		await syncInvoiceOutboxResource(replay);
		expect(replay).toHaveBeenCalledOnce();
	});

	it("adopts old legacy invoices into coordinator replay without replacing their identity", async () => {
		await saveOfflineInvoice(sale("old-cache"));
		setInvoiceOutboxMode("coordinator");
		const call = vi.fn(async () => ({
			invoice: { name: "SINV-OLD", docstatus: 1 },
			acknowledged: true,
		}));
		await syncInvoiceOutboxResource(call);
		expect(call.mock.calls[0]?.[1]?.client_request_id).toBe("old-cache");
		expect(getOfflineInvoices()).toHaveLength(0);
	});

	it("deducts UOM stock once and releases it when an unsent dual-written sale is deleted", async () => {
		setInvoiceOutboxMode("dual_write");
		memory.local_stock_cache = { A: { actual_qty: 10 } };
		const entry = sale("stock-1", { update_stock: 1 });
		await saveOfflineInvoice(entry);
		expect(memory.local_stock_cache.A.actual_qty).toBe(4);
		await saveOfflineInvoice(entry);
		expect(memory.local_stock_cache.A.actual_qty).toBe(4);
		await deleteUnsentRecoveryInvoice("stock-1", scope);
		expect(memory.local_stock_cache.A.actual_qty).toBe(10);
		expect(await getInvoiceRecoveryRows(scope)).toEqual([]);
		expect(await db.table("invoice_outbox").count()).toBe(0);
	});

	it("blocks removal after any send attempt and protects recovery data from cache clearing", async () => {
		await saveOfflineInvoice(sale("protected"));
		await expect(assertOfflineDataCanBeCleared()).rejects.toThrow(
			"unsynced",
		);
		vi.mocked(frappe.call).mockRejectedValueOnce(new Error("network"));
		await syncOfflineInvoices();
		await retryInvoiceRecovery("protected", scope);
		await expect(
			deleteUnsentRecoveryInvoice("protected", scope),
		).rejects.toThrow("may already exist");
		localStorage.setItem(
			"posa_cart_recovery_v1:saved",
			JSON.stringify({ customer: "Walk In" }),
		);
		const exported = await exportOfflineRecoveryData();
		expect(exported.cashierCarts).toHaveProperty(
			"posa_cart_recovery_v1:saved",
		);
	});

	it("keeps cashier/shift/currency summaries separate and journals the handover", async () => {
		await saveOfflineInvoice(
			sale("cash-a", { paid_change: 20, rounded_total: 0 }),
		);
		await saveOfflineInvoice(
			sale("cash-b", { posa_cashier: "cashier-b", currency: "USD" }),
		);
		const handoverScope = {
			...scope,
			opening: "SHIFT-1",
			cashier: "cashier-a",
		};
		const summary = await getCashierHandoverSummary(handoverScope, {
			currency: "PKR",
			payments: [{ mode_of_payment: "Cash", type: "Cash" }],
		});
		expect(summary).toEqual([
			{ currency: "PKR", sales: 100, cash: 80, invoices: 1, pending: 1 },
		]);
		await recordCashierHandover(handoverScope, "cashier-b", {
			currency: "PKR",
		});
		expect(
			(await exportOfflineRecoveryData()).cashierHandovers,
		).toHaveLength(1);
	});

	it("keeps pending stock reservations after fresh server data and isolates warehouses", async () => {
		const profile = {
			name: scope.profile,
			company: scope.company,
			warehouse: "WH",
		};
		await saveOfflineInvoice(
			sale("reserve-1", {
				update_stock: 1,
				items: [
					{
						item_code: "A",
						qty: 2,
						conversion_factor: 3,
						warehouse: "WH",
					},
				],
			}),
		);
		updateLocalStockCache([{ item_code: "A", actual_qty: 10 }], profile);
		expect(memory.local_stock_cache.A.actual_qty).toBe(4);
		updateLocalStockCache([{ item_code: "A", actual_qty: 10 }], {
			...profile,
			warehouse: "OTHER",
		});
		expect(memory.local_stock_cache.A.actual_qty).toBe(10);
	});

	it("reconciles a lost submitted response before clearing recovery state", async () => {
		await saveOfflineInvoice(sale("reconcile-1"));
		vi.mocked(frappe.call).mockResolvedValueOnce({
			message: {
				acknowledged: false,
				invoice: { name: "DRAFT", docstatus: 0 },
			},
		});
		await expect(
			reconcileRecoveryInvoice("reconcile-1", scope),
		).rejects.toThrow("not submitted");
		expect(getOfflineInvoices()).toHaveLength(1);
		vi.mocked(frappe.call).mockResolvedValueOnce({
			message: {
				acknowledged: true,
				invoice: { name: "SINV-FINAL", docstatus: 1 },
			},
		});
		await reconcileRecoveryInvoice("reconcile-1", scope);
		expect(getOfflineInvoices()).toHaveLength(0);
	});

	it("never prunes an old exhausted sale as disposable cache", async () => {
		const row = await enqueueInvoiceOutboxEntry(sale("old-dead"));
		await db.table("invoice_outbox").put({
			...row,
			status: "dead_letter",
			created_at: "2020-01-01T00:00:00Z",
			updated_at: "2020-01-01T00:00:00Z",
		});
		await pruneOfflineStorage();
		expect(await getPendingInvoiceOutboxCount()).toBe(1);
	});

	it("captures dispatch time for recovery without changing online defaults or losing completion evidence", async () => {
		const original = sale("online-time");
		persistInvoiceIntentJournal(original);
		const journal = JSON.parse(
			localStorage.getItem("posa_invoice_intent_online-time")!,
		);
		const queued = await enqueueInvoiceOutboxEntry(original);
		expect(original.invoice.set_posting_time).toBeUndefined();
		expect(queued.invoice._posa_offline_created_at).toBe(
			journal.invoice._posa_offline_created_at,
		);
		expect(queued.invoice.posting_time).toBe(journal.invoice.posting_time);
		await syncInvoiceOutboxResource(async () => ({
			invoice: { name: "SINV-TIME", docstatus: 1 },
			acknowledged: true,
		}));
		expect(await getPendingInvoiceOutboxCount()).toBe(0);
		const result = await enqueueInvoiceOutboxEntry(
			sale("online-time", { grand_total: 999 }),
		);
		expect(result.status).toBe("acknowledged");
		expect(result.invoice.grand_total).toBe(100);
	});
});
