// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	buildChunkRecoveryLocation,
	clearChunkRecoveryState,
	isDynamicImportFailure,
	recoverFromChunkLoadError,
	scheduleAfterStableBoot,
	scheduleChunkRecoveryStateReset,
} from "../src/posapp/utils/chunkLoadRecovery";

describe("chunk load recovery helpers", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
		window.localStorage.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("detects dynamic import failures", () => {
		expect(
			isDynamicImportFailure(
				new TypeError(
					"Failed to fetch dynamically imported module: /assets/x.js",
				),
			),
		).toBe(true);
		expect(
			isDynamicImportFailure("ChunkLoadError: Loading chunk 12 failed."),
		).toBe(true);
		expect(
			isDynamicImportFailure(
				"SyntaxError: The requested module './offline/index.js' does not provide an export named 'ag'",
			),
		).toBe(true);
	});

	it("ignores non-chunk errors", () => {
		expect(isDynamicImportFailure(new Error("Network timeout"))).toBe(
			false,
		);
	});

	it("preserves retry history when clearing transient progress between reloads", async () => {
		const chunkError = new TypeError(
			"Failed to fetch dynamically imported module: /assets/chunk.js",
		);

		await recoverFromChunkLoadError(chunkError, "first-load");
		expect(
			window.sessionStorage.getItem("posa_chunk_reload_once"),
		).toBe("1");

		clearChunkRecoveryState();

		await recoverFromChunkLoadError(chunkError, "after-reload");

		expect(
			window.sessionStorage.getItem("posa_chunk_cache_recovery_once"),
		).toBe("1");
	});

	it("keeps retry decisions bounded after the cache recovery path is used", async () => {
		const chunkError = new TypeError(
			"Failed to fetch dynamically imported module: /assets/chunk.js",
		);

		await recoverFromChunkLoadError(chunkError, "first-load");
		clearChunkRecoveryState();
		await recoverFromChunkLoadError(chunkError, "after-reload");
		clearChunkRecoveryState();

		const recovered = await recoverFromChunkLoadError(
			chunkError,
			"after-cache-recovery",
		);
		clearChunkRecoveryState();
		const repeated = await recoverFromChunkLoadError(
			chunkError,
			"after-terminal",
		);

		expect(recovered).toBe(false);
		expect(repeated).toBe(false);
		expect(
			window.sessionStorage.getItem("posa_chunk_recovery_terminal"),
		).toBe("1");
		expect(
			window.sessionStorage.getItem("posa_chunk_reload_once"),
		).toBe("1");
		expect(
			window.sessionStorage.getItem("posa_chunk_cache_recovery_once"),
		).toBe("1");
	});

	it("uses recovery URL params as durable retry history when storage was cleared", async () => {
		const chunkError = new TypeError(
			"Failed to fetch dynamically imported module: /assets/chunk.js",
		);

		window.history.replaceState(
			null,
			"",
			"/app/posapp?_posa_chunk_reload=1&_posa_chunk_cache_recovery=2",
		);

		const recovered = await recoverFromChunkLoadError(
			chunkError,
			"storage-cleared-after-cache-recovery",
		);

		expect(recovered).toBe(false);
		expect(
			window.sessionStorage.getItem("posa_chunk_recovery_terminal"),
		).toBe("1");
		expect(window.location.search).toContain("_posa_chunk_reload=1");
		expect(window.location.search).toContain(
			"_posa_chunk_cache_recovery=2",
		);
	});

	it("uses the URL reload marker to go directly to cache recovery after storage is cleared", async () => {
		const chunkError = new TypeError(
			"Failed to fetch dynamically imported module: /assets/chunk.js",
		);

		window.history.replaceState(
			null,
			"",
			"/app/posapp?_posa_chunk_reload=1",
		);

		await recoverFromChunkLoadError(
			chunkError,
			"storage-cleared-after-reload",
		);

		expect(
			window.sessionStorage.getItem("posa_chunk_cache_recovery_once"),
		).toBe("1");
	});

	it("only deletes POSAwesome-owned caches during cache recovery", async () => {
		const chunkError = new TypeError(
			"Failed to fetch dynamically imported module: /assets/chunk.js",
		);
		const deletedCaches: string[] = [];
		const originalCaches = (globalThis as any).caches;
		(globalThis as any).caches = {
			keys: vi.fn(async () => [
				"posawesome-cache-build-1",
				"frappe-runtime-cache",
				"workbox-precache-v2",
			]),
			delete: vi.fn(async (key: string) => {
				deletedCaches.push(key);
				return true;
			}),
		};
		const originalServiceWorker = navigator.serviceWorker;
		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: {
				getRegistrations: vi.fn(async () => []),
			},
		});

		window.sessionStorage.setItem("posa_chunk_reload_once", "1");

		await recoverFromChunkLoadError(chunkError, "cache-scope-test");

		expect(deletedCaches).toEqual(["posawesome-cache-build-1"]);

		(globalThis as any).caches = originalCaches;
		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: originalServiceWorker,
		});
	});

	it("does not clear retry decisions after stable boot", async () => {
		vi.useFakeTimers();
		window.sessionStorage.setItem("posa_chunk_reload_once", "1");
		window.sessionStorage.setItem("posa_chunk_cache_recovery_once", "1");
		window.sessionStorage.setItem("posa_chunk_recovery_in_progress", "1");

		scheduleChunkRecoveryStateReset();
		await vi.runAllTimersAsync();

		expect(
			window.sessionStorage.getItem("posa_chunk_reload_once"),
		).toBe("1");
		expect(
			window.sessionStorage.getItem("posa_chunk_cache_recovery_once"),
		).toBe("1");
		expect(
			window.sessionStorage.getItem("posa_chunk_recovery_in_progress"),
		).toBeNull();
	});

	it("builds chunk recovery URLs against the current POS sub-route", () => {
		expect(
			buildChunkRecoveryLocation(
				{
					pathname: "/app/posapp/payments",
					search: "?draft=1",
					hash: "#totals",
				},
				"_posa_chunk_reload",
				55,
			),
		).toBe(
			"/app/posapp/payments?draft=1&_posa_chunk_reload=55#totals",
		);
	});

	it("swallows rejected stable-boot tasks to avoid unhandled rejections", async () => {
		vi.useFakeTimers();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		scheduleAfterStableBoot(() => Promise.reject(new Error("boom")));

		await vi.runAllTimersAsync();

		expect(warnSpy).toHaveBeenCalledWith(
			"Chunk recovery: stable boot task failed",
			expect.any(Error),
		);
	});
});

