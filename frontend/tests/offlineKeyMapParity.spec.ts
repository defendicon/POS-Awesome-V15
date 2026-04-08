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

describe("offline key map parity", () => {
	it("maps bootstrap snapshot state into settings storage", () => {
		expect(KEY_TABLE_MAP.bootstrap_snapshot).toBe("settings");
		expect(KEY_TABLE_MAP.bootstrap_snapshot_status).toBe("settings");
		expect(KEY_TABLE_MAP.bootstrap_limited_mode).toBe("settings");
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
});
