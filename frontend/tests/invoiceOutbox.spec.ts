// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	db,
	getInvoiceOutboxRows,
	getPendingInvoiceOutboxCount,
	getPendingOfflineInvoiceCount,
	initPromise,
	memory,
	saveOfflineInvoice,
	setInvoiceOutboxMode,
} from "../src/offline/index";
import { runSupportedOfflineSyncResource } from "../src/offline/sync/resourceRunner";
import {
	getSyncResourceDefinitions,
	getSyncResourcesForTrigger,
} from "../src/offline/sync/resourceRegistry";

describe("invoice outbox sync resource", () => {
	beforeEach(async () => {
		await initPromise;
		await db.table("write_queue").clear();
		await db.table("queue").clear();
		await db.table("keyval").clear();
		await db.table("invoice_outbox").clear();
		localStorage.clear();
		memory.offline_invoices = [];
		setInvoiceOutboxMode("off");
	});

	it("dual-writes offline invoices and keeps legacy/coordinator counts aligned", async () => {
		setInvoiceOutboxMode("dual_write");

		await saveOfflineInvoice({
			invoice: {
				name: "OFFLINE-SINV-OUTBOX-1",
				customer: "CUST-001",
				pos_profile: "Main POS",
				company: "Test Company",
				posa_client_request_id: "outbox-fixed-001",
				items: [{ item_code: "ITEM-1", item_name: "Item 1", qty: 1 }],
			},
			data: { idempotency_key: "outbox-fixed-001" },
		});

		expect(getPendingOfflineInvoiceCount()).toBe(1);
		expect(await getPendingInvoiceOutboxCount()).toBe(1);
		expect(await getInvoiceOutboxRows()).toEqual([
			expect.objectContaining({
				client_request_id: "outbox-fixed-001",
				status: "pending",
			}),
		]);
	});

	it("submits an outbox row once across repeated reconnect triggers", async () => {
		setInvoiceOutboxMode("dual_write");
		await saveOfflineInvoice({
			invoice: {
				name: "OFFLINE-SINV-OUTBOX-2",
				customer: "CUST-001",
				pos_profile: "Main POS",
				company: "Test Company",
				posa_client_request_id: "outbox-fixed-002",
				items: [{ item_code: "ITEM-1", item_name: "Item 1", qty: 1 }],
			},
			data: { idempotency_key: "outbox-fixed-002" },
		});

		const callOfflineSyncMethod = vi.fn(async () => ({
			acknowledged: true,
			client_request_id: "outbox-fixed-002",
			invoice: {
				name: "ACC-SINV-OUTBOX-0001",
				doctype: "Sales Invoice",
				docstatus: 1,
			},
		}));
		const resource = getSyncResourceDefinitions().find(
			(entry) => entry.id === "invoice_outbox",
		);

		await runSupportedOfflineSyncResource({
			resource: resource as any,
			posProfile: {
				name: "Main POS",
				company: "Test Company",
			},
			schemaVersion: "2026-04-09",
			getPersistedState: vi.fn(async () => null),
			callOfflineSyncMethod,
		});
		await runSupportedOfflineSyncResource({
			resource: resource as any,
			posProfile: {
				name: "Main POS",
				company: "Test Company",
			},
			schemaVersion: "2026-04-09",
			getPersistedState: vi.fn(async () => null),
			callOfflineSyncMethod,
		});

		expect(callOfflineSyncMethod).toHaveBeenCalledTimes(1);
		expect(await getPendingInvoiceOutboxCount()).toBe(0);
		expect(await getInvoiceOutboxRows({ includeTerminal: true })).toEqual([
			expect.objectContaining({
				status: "acknowledged",
				invoice_name: "ACC-SINV-OUTBOX-0001",
			}),
		]);
	});

	it("registers invoice_outbox as a warm reconnect resource", () => {
		expect(
			getSyncResourcesForTrigger("online_resume").map(
				(entry) => entry.id,
			),
		).toContain("invoice_outbox");
		expect(
			getSyncResourceDefinitions().find(
				(entry) => entry.id === "invoice_outbox",
			),
		).toEqual(
			expect.objectContaining({
				priority: "warm",
				storageKey: "invoice_outbox",
			}),
		);
	});
});
