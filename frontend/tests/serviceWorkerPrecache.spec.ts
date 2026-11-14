import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

function readServiceWorkerSource() {
	const thisFile = fileURLToPath(import.meta.url);
	const testsDir = path.dirname(thisFile);
	return readFileSync(path.resolve(testsDir, "../../posawesome/www/sw.js"), "utf8");
}

class FakeResponse {
	body: string;
	ok: boolean;
	status: number;
	type: string;

	constructor(
		body = "",
		options: { ok?: boolean; status?: number; type?: string } = {},
	) {
		this.body = body;
		this.ok = options.ok ?? true;
		this.status = options.status ?? (this.ok ? 200 : 500);
		this.type = options.type || "basic";
	}

	async json() {
		return JSON.parse(this.body || "null");
	}

	async text() {
		return this.body;
	}

	clone() {
		return new FakeResponse(this.body, {
			ok: this.ok,
			status: this.status,
			type: this.type,
		});
	}

	static error() {
		return new FakeResponse("", { ok: false, status: 0, type: "error" });
	}
}

function createServiceWorkerHarness() {
	const origin = "https://pos.example.test";
	const listeners = new Map<string, (event: any) => void>();
	const stores = new Map<string, Map<string, FakeResponse>>();
	const normalizeKey = (input: string | { url: string }) =>
		new URL(typeof input === "string" ? input : input.url, origin).href;

	const cacheFor = (name: string) => {
		if (!stores.has(name)) {
			stores.set(name, new Map());
		}
		const entries = stores.get(name)!;
		return {
			async put(input: string | { url: string }, response: FakeResponse) {
				entries.set(normalizeKey(input), response.clone());
			},
			async match(input: string | { url: string }) {
				return entries.get(normalizeKey(input));
			},
			async keys() {
				return Array.from(entries.keys()).map((url) => ({ url }));
			},
			async delete(input: string | { url: string }) {
				return entries.delete(normalizeKey(input));
			},
		};
	};

	const caches = {
		async open(name: string) {
			return cacheFor(name);
		},
		async keys() {
			return Array.from(stores.keys());
		},
		async delete(name: string) {
			return stores.delete(name);
		},
		async match(input: string | { url: string }) {
			for (const name of stores.keys()) {
				const response = await cacheFor(name).match(input);
				if (response) return response;
			}
			return undefined;
		},
	};

	const self = {
		location: { origin },
		addEventListener(type: string, callback: (event: any) => void) {
			listeners.set(type, callback);
		},
		skipWaiting: vi.fn(),
		registration: { unregister: vi.fn().mockResolvedValue(true) },
		clients: {
			claim: vi.fn().mockResolvedValue(undefined),
			matchAll: vi.fn().mockResolvedValue([]),
		},
	};

	let failedUrl: string | null = null;
	const versionPayload = {
		version: "build-2000",
		assets: {
			loader: "/assets/loader-build-2000.js",
			css: "/assets/style-build-2000.css",
			posawesome: "/assets/posawesome-build-2000.js",
			offlineIndex: "/assets/offline-build-2000.js",
		},
	};
	const fetch = vi.fn(async (input: string | { url: string }) => {
		const url = typeof input === "string" ? input : input.url;
		if (url.includes("version.json")) {
			return new FakeResponse(JSON.stringify(versionPayload));
		}
		if (url === "/app/posapp") {
			return new FakeResponse('<body><script>frappe.boot = {};</script><script src="/assets/frappe/desk.js"></script></body>');
		}
		if (url.startsWith("/api/method/")) {
			const name = url.includes("getpage") ? "posapp" : "Page";
			const doctype = name === "posapp" ? "Page" : "DocType";
			return new FakeResponse(JSON.stringify({ docs: [{ name, doctype }] }));
		}
		return new FakeResponse(url, { ok: url !== failedUrl });
	});

	const factory = new Function(
		"self",
		"caches",
		"fetch",
		"Response",
		"URL",
		"Headers",
		`${readServiceWorkerSource()}; return {
			CACHE_PREFIX,
			CACHE_COMPLETE_KEY,
			acknowledgeActiveCache,
			cleanupObsoleteCaches,
			forceUnregisterServiceWorker,
			isCompleteVersionCache,
			matchActiveCache,
			prepareAndActivateCache,
			prepareVersionCache,
			refreshCacheVersion,
			getActiveCacheName: () => cachedCacheName
		};`,
	);
	const api = factory(self, caches, fetch, FakeResponse, URL, Headers);

	return {
		api,
		caches,
		fetch,
		listeners,
		self,
		stores,
		versionPayload,
		setVersion(version: string) {
			versionPayload.version = version;
			versionPayload.assets = {
				loader: `/assets/loader-${version}.js`,
				css: `/assets/style-${version}.css`,
				posawesome: `/assets/posawesome-${version}.js`,
				offlineIndex: `/assets/offline-${version}.js`,
			};
		},
		fail(url: string | null) {
			failedUrl = url;
		},
	};
}

describe("service worker precache", () => {
	it("preloads build-manifest font assets for offline icon rendering", () => {
		const source = readServiceWorkerSource();

		expect(source).toContain("assets.fonts");
		expect(source).toContain("...fontAssets");
		expect(source).toContain('"font"');
	});

	it("does not silently skip waiting during installation", async () => {
		const harness = createServiceWorkerHarness();
		const tasks: Promise<unknown>[] = [];

		harness.listeners.get("install")?.({
			waitUntil(task: Promise<unknown>) {
				tasks.push(task);
			},
		});
		await Promise.all(tasks);

		expect(harness.self.skipWaiting).not.toHaveBeenCalled();
		const [candidate] = (await harness.caches.keys()).filter((key) =>
			key.startsWith("posawesome-cache-build-2000-candidate-"),
		);
		expect(candidate).toBeTruthy();
		expect(
			await harness.api.isCompleteVersionCache(
				candidate,
				"build-2000",
			),
		).toBe(true);
	});

	it("never deletes the active cache when a same-version refresh candidate fails", async () => {
		const harness = createServiceWorkerHarness();
		const activeCacheName = await harness.api.prepareAndActivateCache(
			harness.versionPayload,
			{ forceNew: true },
		);
		const activeEntries = Array.from(
			harness.stores.get(activeCacheName)?.keys() || [],
		);

		harness.fail("/assets/style-build-2000.css");
		await expect(
			harness.api.refreshCacheVersion(null),
		).rejects.toThrow("Required POS asset failed to cache");

		expect(harness.api.getActiveCacheName()).toBe(activeCacheName);
		expect(await harness.caches.keys()).toContain(activeCacheName);
		expect(
			Array.from(harness.stores.get(activeCacheName)?.keys() || []),
		).toEqual(activeEntries);
		expect(
			(await harness.caches.keys()).filter((key) =>
				key.startsWith("posawesome-cache-"),
			),
		).toEqual([activeCacheName]);
		expect(
			await harness.api.isCompleteVersionCache(
				activeCacheName,
				"build-2000",
			),
		).toBe(true);
	});

	it("retains a healthy rollback generation until the promoted cache is acknowledged", async () => {
		const harness = createServiceWorkerHarness();
		await harness.caches.open("frappe-assets");
		harness.setVersion("build-1000");
		const rollbackCacheName = await harness.api.refreshCacheVersion(null);
		await harness.api.acknowledgeActiveCache("build-1000", null);

		harness.setVersion("build-2000");
		const activeCacheName = await harness.api.refreshCacheVersion(null);

		expect(activeCacheName).not.toBe(rollbackCacheName);
		expect(await harness.caches.keys()).toEqual(
			expect.arrayContaining([
				activeCacheName,
				rollbackCacheName,
				"frappe-assets",
			]),
		);
		const target = { postMessage: vi.fn() };
		await harness.api.acknowledgeActiveCache("build-2000", target);

		expect(await harness.caches.keys()).toContain(activeCacheName);
		expect(await harness.caches.keys()).not.toContain(rollbackCacheName);
		expect(await harness.caches.keys()).toContain("frappe-assets");
		expect(target.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "SW_CACHE_HEALTH_ACK",
				version: "build-2000",
				cacheName: activeCacheName,
			}),
		);
		expect(
			await harness.api.isCompleteVersionCache(
				activeCacheName,
				"build-2000",
			),
		).toBe(true);
	});

	it("serves the selected generation before an older retained rollback cache", async () => {
		const harness = createServiceWorkerHarness();
		harness.setVersion("build-1000");
		const rollbackCacheName = await harness.api.refreshCacheVersion(null);
		await harness.api.acknowledgeActiveCache("build-1000", null);
		await (await harness.caches.open(rollbackCacheName)).put(
			"/app/posapp",
			new FakeResponse("rollback-shell"),
		);

		harness.setVersion("build-2000");
		const activeCacheName = await harness.api.refreshCacheVersion(null);
		await (await harness.caches.open(activeCacheName)).put(
			"/app/posapp",
			new FakeResponse("active-shell"),
		);

		const response = await harness.api.matchActiveCache("/app/posapp");

		expect(response.body).toBe("active-shell");
		expect(await harness.caches.keys()).toContain(rollbackCacheName);
	});

	it("cleans only obsolete caches owned by the exact POS cache prefix", async () => {
		const harness = createServiceWorkerHarness();
		await harness.caches.open("posawesome-cache-active");
		await harness.caches.open("posawesome-cache-old");
		await harness.caches.open("frappe-assets");
		await harness.caches.open("posawesome-runtime-without-version-prefix");

		await harness.api.cleanupObsoleteCaches("posawesome-cache-active");

		expect(await harness.caches.keys()).toEqual(
			expect.arrayContaining([
				"posawesome-cache-active",
				"frappe-assets",
				"posawesome-runtime-without-version-prefix",
			]),
		);
		expect(await harness.caches.keys()).not.toContain("posawesome-cache-old");
	});

	it("force-unregister removes POS shell caches without deleting other app caches", async () => {
		const harness = createServiceWorkerHarness();
		await harness.caches.open("posawesome-cache-build-1000");
		await harness.caches.open("frappe-assets");

		await harness.api.forceUnregisterServiceWorker();

		expect(await harness.caches.keys()).toEqual(["frappe-assets"]);
		expect(harness.self.registration.unregister).toHaveBeenCalledTimes(1);
	});
});
