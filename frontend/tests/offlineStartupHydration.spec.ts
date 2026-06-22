// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

describe("offline startup hydration", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
		delete (globalThis as any).requestIdleCallback;
		window.localStorage.clear();
	});

	it("resolves startup readiness without waiting for idle full hydration", async () => {
		const idleCallbacks: Array<() => void> = [];
		(globalThis as any).requestIdleCallback = vi.fn((callback: () => void) => {
			idleCallbacks.push(callback);
			return idleCallbacks.length;
		});

		const { startupInitPromise, initPromise } = await import(
			"../src/offline/db"
		);
		expect(startupInitPromise).toBeInstanceOf(Promise);
		let fullReady = false;
		void initPromise.then(() => {
			fullReady = true;
		});

		await startupInitPromise;
		await Promise.resolve();

		expect(idleCallbacks).toHaveLength(1);
		expect(fullReady).toBe(false);

		idleCallbacks[0]?.();
		await initPromise;
		expect(fullReady).toBe(true);
	});

	it("completes registered post-hydration work before full readiness", async () => {
		const idleCallbacks: Array<() => void> = [];
		(globalThis as any).requestIdleCallback = vi.fn((callback: () => void) => {
			idleCallbacks.push(callback);
			return idleCallbacks.length;
		});
		const postHydrationTask = vi.fn(async () => undefined);
		const { initPromise, registerPostHydrationTask, startupInitPromise } =
			await import("../src/offline/db");

		registerPostHydrationTask(postHydrationTask);
		await startupInitPromise;
		idleCallbacks[0]?.();
		await initPromise;

		expect(postHydrationTask).toHaveBeenCalledTimes(1);
	});

	it("hydrates grouped tables with bulk reads and preserves fallback precedence", async () => {
		const { db, hydrateMemoryKeys, memory } = await import("../src/offline/db");
		await db.open();
		await Promise.all([
			db.table("settings").clear(),
			db.table("keyval").clear(),
		]);
		await db.table("settings").put({
			key: "manual_offline",
			value: true,
		});
		await db.table("keyval").put({
			key: "cache_ready",
			value: true,
		});
		window.localStorage.setItem("posa_tax_inclusive", "true");

		const settingsBulkGet = vi.spyOn(db.table("settings"), "bulkGet");
		const keyvalBulkGet = vi.spyOn(db.table("keyval"), "bulkGet");
		const settingsGet = vi.spyOn(db.table("settings"), "get");
		const keyvalGet = vi.spyOn(db.table("keyval"), "get");

		memory.manual_offline = false;
		memory.cache_ready = false;
		memory.tax_inclusive = false;

		await hydrateMemoryKeys([
			"manual_offline",
			"cache_ready",
			"tax_inclusive",
		]);

		expect(memory.manual_offline).toBe(true);
		expect(memory.cache_ready).toBe(true);
		expect(memory.tax_inclusive).toBe(true);
		expect(settingsBulkGet).toHaveBeenCalledTimes(1);
		expect(keyvalBulkGet).toHaveBeenCalledTimes(1);
		expect(settingsGet).not.toHaveBeenCalled();
		expect(keyvalGet).not.toHaveBeenCalled();
	});

	it("does not overwrite a newer memory write with stale hydration", async () => {
		const { db, hydrateMemoryKeys, memory, persist } = await import(
			"../src/offline/db"
		);
		await db.open();
		const settings = db.table("settings");
		const originalBulkGet = settings.bulkGet.bind(settings);
		let releaseRead: (() => void) | undefined;
		const readBlocked = new Promise<void>((resolve) => {
			releaseRead = resolve;
		});

		vi.spyOn(settings, "bulkGet").mockImplementation(async (keys: any[]) => {
			await readBlocked;
			return keys.map((key) =>
				key === "manual_offline"
					? { key, value: false }
					: undefined,
			);
		});

		const hydration = hydrateMemoryKeys(["manual_offline"]);
		memory.manual_offline = true;
		persist("manual_offline");
		releaseRead?.();
		await hydration;

		expect(memory.manual_offline).toBe(true);
		settings.bulkGet = originalBulkGet;
	});
});
