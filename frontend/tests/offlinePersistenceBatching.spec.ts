// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

type WorkerMessage = {
	type: string;
	batchId?: number;
	entries?: Array<{ key: string; value: unknown }>;
};

class AcknowledgingWorker {
	static instances: AcknowledgingWorker[] = [];

	onmessage: ((_event: MessageEvent) => void) | null = null;
	onerror: ((_event: ErrorEvent) => void) | null = null;
	messages: WorkerMessage[] = [];

	constructor() {
		AcknowledgingWorker.instances.push(this);
	}

	postMessage(message: WorkerMessage) {
		this.messages.push(message);
		queueMicrotask(() => {
			this.onmessage?.({
				data: {
					type: "persisted_batch",
					batchId: message.batchId,
				},
			} as MessageEvent);
		});
	}

	terminate() {}
}

class RejectingWorker extends AcknowledgingWorker {
	override postMessage(message: WorkerMessage) {
		this.messages.push(message);
		queueMicrotask(() => {
			this.onmessage?.({
				data: {
					type: "persist_batch_failed",
					batchId: message.batchId,
					error: "worker write failed",
				},
			} as MessageEvent);
		});
	}
}

class ControlledWorker extends AcknowledgingWorker {
	override postMessage(message: WorkerMessage) {
		this.messages.push(message);
	}

	rejectBatch(message: WorkerMessage) {
		queueMicrotask(() => {
			this.onmessage?.({
				data: {
					type: "persist_batch_failed",
					batchId: message.batchId,
					error: "controlled worker failure",
				},
			} as MessageEvent);
		});
	}
}

describe("offline persistence batching", () => {
	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.resetModules();
		AcknowledgingWorker.instances = [];
		window.localStorage.clear();
	});

	it("coalesces repeated keys into one worker batch without JSON-normalizing values", async () => {
		vi.stubGlobal("Worker", AcknowledgingWorker);
		const { flushPersistQueue, persist } = await import("../src/offline/db");
		const persistedAt = new Date("2026-06-15T10:00:00.000Z");
		const stringify = vi.spyOn(JSON, "stringify");

		persist("item_details_cache", { version: 1 });
		persist("item_details_cache", { version: 2, persistedAt });
		persist("delivery_charges_cache", { standard: 100 });

		await flushPersistQueue();

		expect(stringify).not.toHaveBeenCalled();
		const worker = AcknowledgingWorker.instances[0];
		expect(worker?.messages).toHaveLength(1);
		expect(worker?.messages[0]).toEqual(
			expect.objectContaining({
				type: "persist_batch",
				entries: [
					{
						key: "item_details_cache",
						value: { version: 2, persistedAt },
					},
					{
						key: "delivery_charges_cache",
						value: { standard: 100 },
					},
				],
			}),
		);
		const dateValue = (
			worker?.messages[0]?.entries?.[0]?.value as {
				persistedAt?: unknown;
			}
		)?.persistedAt;
		expect(dateValue).toBeInstanceOf(Date);
	});

	it("keeps lightweight localStorage mirrors on the main thread", async () => {
		vi.stubGlobal("Worker", AcknowledgingWorker);
		const { flushPersistQueue, persist } = await import("../src/offline/db");

		persist("manual_offline", true);

		expect(window.localStorage.getItem("posa_manual_offline")).toBe("true");
		await flushPersistQueue();
		expect(AcknowledgingWorker.instances[0]?.messages).toHaveLength(1);
	});

	it("groups worker-less writes into one bulkPut per physical table", async () => {
		vi.stubGlobal("Worker", undefined);
		const { db, flushPersistQueue, persist } = await import("../src/offline/db");
		await db.open();
		await Promise.all([
			db.table("cache").clear(),
			db.table("settings").clear(),
		]);
		const cacheBulkPut = vi.spyOn(db.table("cache"), "bulkPut");
		const settingsBulkPut = vi.spyOn(db.table("settings"), "bulkPut");

		persist("item_details_cache", { item: 1 });
		persist("delivery_charges_cache", { list: 1 });
		persist("cache_ready", true);
		await flushPersistQueue();

		expect(cacheBulkPut).toHaveBeenCalledTimes(1);
		expect(cacheBulkPut).toHaveBeenCalledWith([
			{ key: "item_details_cache", value: { item: 1 } },
			{ key: "delivery_charges_cache", value: { list: 1 } },
		]);
		expect(settingsBulkPut).toHaveBeenCalledTimes(1);
		expect(await db.table("settings").get("cache_ready")).toEqual({
			key: "cache_ready",
			value: true,
		});
	});

	it("falls back to grouped main-thread writes when a worker rejects a batch", async () => {
		vi.stubGlobal("Worker", RejectingWorker);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { db, flushPersistQueue, persist } = await import("../src/offline/db");
		await db.open();
		await db.table("cache").clear();
		const cacheBulkPut = vi.spyOn(db.table("cache"), "bulkPut");

		persist("item_details_cache", { recovered: true });
		await flushPersistQueue();

		expect(RejectingWorker.instances[0]?.messages).toHaveLength(1);
		expect(cacheBulkPut).toHaveBeenCalledTimes(1);
		expect(await db.table("cache").get("item_details_cache")).toEqual({
			key: "item_details_cache",
			value: { recovered: true },
		});
	});

	it("serializes fallback batches so the latest write wins", async () => {
		vi.stubGlobal("Worker", undefined);
		const { db, flushPersistQueue, persist } = await import("../src/offline/db");
		await db.open();
		await db.table("cache").clear();
		const table = db.table("cache");
		const originalBulkPut = table.bulkPut.bind(table);
		let releaseFirstWrite: (() => void) | undefined;
		const firstWriteBlocked = new Promise<void>((resolve) => {
			releaseFirstWrite = resolve;
		});
		let calls = 0;

		vi.spyOn(table, "bulkPut").mockImplementation(async (rows: any[]) => {
			calls += 1;
			if (calls === 1) {
				await firstWriteBlocked;
			}
			return originalBulkPut(rows);
		});

		persist("item_details_cache", { version: 1 });
		const firstFlush = flushPersistQueue();
		await Promise.resolve();
		persist("item_details_cache", { version: 2 });
		const secondFlush = flushPersistQueue();
		releaseFirstWrite?.();
		await Promise.all([firstFlush, secondFlush]);

		expect(calls).toBe(2);
		expect(await table.get("item_details_cache")).toEqual({
			key: "item_details_cache",
			value: { version: 2 },
		});
	});

	it("replays all in-flight worker batches in order after a later batch fails", async () => {
		vi.stubGlobal("Worker", ControlledWorker);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { db, flushPersistQueue, persist } = await import("../src/offline/db");
		await db.open();
		await db.table("cache").clear();

		persist("item_details_cache", { version: 1 });
		const firstFlush = flushPersistQueue();
		await Promise.resolve();
		persist("item_details_cache", { version: 2 });
		const secondFlush = flushPersistQueue();
		await Promise.resolve();

		const worker = ControlledWorker.instances[0] as ControlledWorker;
		expect(worker.messages).toHaveLength(2);
		worker.rejectBatch(worker.messages[1] as WorkerMessage);
		await Promise.all([firstFlush, secondFlush]);

		expect(await db.table("cache").get("item_details_cache")).toEqual({
			key: "item_details_cache",
			value: { version: 2 },
		});
	});
});
