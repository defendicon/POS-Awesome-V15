import { describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KEY_TABLE_MAP } from "../src/offline/db";

function extractWorkerKeyTableMapKeys(source: string): string[] {
	const match = source.match(/const\s+KEY_TABLE_MAP\s*=\s*\{([\s\S]*?)\n\};/);
	if (!match || !match[1]) {
		throw new Error("Unable to locate KEY_TABLE_MAP in worker source");
	}
	const block = match[1];
	return Array.from(block.matchAll(/^\s*([A-Za-z0-9_]+)\s*:/gm))
		.map((entry) => entry[1] || "")
		.filter(Boolean);
}

function extractLatestDexieVersion(source: string): number {
	const versions = Array.from(source.matchAll(/db\.version\((\d+)\)/g))
		.map((entry) => Number(entry[1]))
		.filter(Number.isFinite);
	return Math.max(...versions);
}

describe("offline key map parity", () => {
	it("maps bootstrap snapshot state into settings storage", () => {
		expect(KEY_TABLE_MAP.bootstrap_snapshot).toBe("settings");
		expect(KEY_TABLE_MAP.bootstrap_snapshot_status).toBe("settings");
		expect(KEY_TABLE_MAP.bootstrap_limited_mode).toBe("settings");
	});

	it("maps new prerequisite caches into cache storage", () => {
		expect(KEY_TABLE_MAP.delivery_charges_cache).toBe("cache");
		expect(KEY_TABLE_MAP.currency_options_cache).toBe("cache");
		expect(KEY_TABLE_MAP.exchange_rate_cache).toBe("cache");
		expect(KEY_TABLE_MAP.price_list_meta_cache).toBe("cache");
		expect(KEY_TABLE_MAP.customer_addresses_cache).toBe("cache");
		expect(KEY_TABLE_MAP.payment_method_currency_cache).toBe("cache");
	});

	it("does not route the customer read model through legacy cache keys", () => {
		expect(KEY_TABLE_MAP.customer_storage).toBeUndefined();
	});

	it("keeps app db KEY_TABLE_MAP and worker KEY_TABLE_MAP in sync", () => {
		const thisFile = fileURLToPath(import.meta.url);
		const testsDir = path.dirname(thisFile);
		const workerFile = path.resolve(
			testsDir,
			"../src/posapp/workers/itemWorker.js",
		);
		const workerSource = readFileSync(workerFile, "utf8");

		const dbKeys = Object.keys(KEY_TABLE_MAP).sort();
		const workerKeys = extractWorkerKeyTableMapKeys(workerSource).sort();

		expect(workerKeys).toEqual(dbKeys);
	});

	it("keeps the persistence worker on the latest app Dexie schema version", () => {
		const thisFile = fileURLToPath(import.meta.url);
		const testsDir = path.dirname(thisFile);
		const appDbSource = readFileSync(
			path.resolve(testsDir, "../src/offline/db.ts"),
			"utf8",
		);
		const workerSource = readFileSync(
			path.resolve(testsDir, "../src/posapp/workers/itemWorker.js"),
			"utf8",
		);

		expect(extractLatestDexieVersion(workerSource)).toBe(
			extractLatestDexieVersion(appDbSource),
		);
		expect(workerSource).toContain("item_price_records");
		expect(workerSource).toContain("pricing_rule_records");
		expect(workerSource).toContain("currency_rate_records");
	});

	it("keeps worker persistence table-grouped and bulk-written", () => {
		const thisFile = fileURLToPath(import.meta.url);
		const testsDir = path.dirname(thisFile);
		const workerSource = readFileSync(
			path.resolve(testsDir, "../src/posapp/workers/itemWorker.js"),
			"utf8",
		);

		expect(workerSource).toContain('data.type === "persist_batch"');
		expect(workerSource).toContain("bulkPut(rows)");
		expect(workerSource).toContain("persistBatchChain");
		expect(workerSource).not.toContain('data.type === "persist"');
	});
});
