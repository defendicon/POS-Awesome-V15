const CACHE_PREFIX = "posawesome-cache-";
const VERSION_URL = "/assets/posawesome/dist/js/version.json";
const DEFAULT_CACHE_VERSION = "default";
const MAX_CACHE_ITEMS = 1000;

const PRECACHE_URLS = [
	"/app/posapp",
	"/assets/posawesome/dist/js/posawesome.umd.js",
	"/assets/posawesome/dist/js/offline/index.js",
	"/assets/posawesome/dist/js/posapp/workers/itemWorker.js",
	"/assets/posawesome/dist/js/libs/dexie.min.js",
	"/manifest.json",
	"/offline.html",
];

let cachedCacheName = null;
let cacheNameInFlight = null;
let currentVersion = null;

function postVersionMessage(target) {
	if (!currentVersion) return;
	const message = {
		type: "SW_VERSION_INFO",
		version: currentVersion,
		timestamp: Number(currentVersion),
	};
	if (target && typeof target.postMessage === "function") {
		target.postMessage(message);
	}
}

// Listen for version check messages
self.addEventListener("message", (event) => {
	const payload = event.data || {};
	if (payload.type === "CHECK_VERSION") {
		if (event.ports && event.ports[0]) {
			postVersionMessage(event.ports[0]);
		} else if (event.source) {
			postVersionMessage(event.source);
		}
		return;
	}
	if (payload.type === "SKIP_WAITING") {
		self.skipWaiting();
	}
});

async function resolveCacheVersion() {
	try {
		const response = await fetch(VERSION_URL, { cache: "no-store" });
		if (response && response.ok) {
			const payload = await response.json();
			const version = payload?.version || payload?.buildVersion;
			if (version) {
				currentVersion = String(version);
				return currentVersion;
			}
		}
	} catch (err) {
		console.warn("SW: failed to fetch build version", err);
	}
	return DEFAULT_CACHE_VERSION;
}

async function getCacheName() {
	if (cachedCacheName) {
		return cachedCacheName;
	}
	if (cacheNameInFlight) {
		return cacheNameInFlight;
	}
	cacheNameInFlight = (async () => {
		const version = await resolveCacheVersion();
		const name = `${CACHE_PREFIX}${version}`;
		if (version !== DEFAULT_CACHE_VERSION) {
			cachedCacheName = name;
		}
		cacheNameInFlight = null;
		return name;
	})();
	return cacheNameInFlight;
}

async function enforceCacheLimit(cache) {
	const keys = await cache.keys();
	if (keys.length > MAX_CACHE_ITEMS) {
		const excess = keys.length - MAX_CACHE_ITEMS;
		for (let i = 0; i < excess; i++) {
			await cache.delete(keys[i]);
		}
	}
}

self.addEventListener("install", (event) => {
	self.skipWaiting();
	event.waitUntil(
		(async () => {
			const cacheName = await getCacheName();
			const cache = await caches.open(cacheName);
			await Promise.all(
				PRECACHE_URLS.map(async (url) => {
					try {
						const resp = await fetch(url);
						if (resp && resp.ok) {
							await cache.put(url, resp.clone());
						}
					} catch (err) {
						console.warn("SW install failed to fetch", url, err);
					}
				}),
			);
			await enforceCacheLimit(cache);
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const activeCacheName = await getCacheName();
			const keys = await caches.keys();
			await Promise.all(keys.filter((key) => key !== activeCacheName).map((key) => caches.delete(key)));
			const cache = await caches.open(activeCacheName);
			await enforceCacheLimit(cache);
			await self.clients.claim();
			const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			clients.forEach(postVersionMessage);
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;

	const url = new URL(event.request.url);
	if (url.protocol !== "http:" && url.protocol !== "https:") return;

	if (event.request.url.includes("socket.io")) return;

	const assetDestinations = ["style", "script", "worker", "font", "image"];
	const isAssetRequest = assetDestinations.includes(event.request.destination);
	const isPosawesomeAsset = url.pathname.startsWith("/assets/posawesome/");
	const isNavigation = event.request.mode === "navigate";

	if (!isNavigation && !isAssetRequest && !isPosawesomeAsset) {
		return;
	}

	if (isNavigation) {
		event.respondWith(
			(async () => {
				try {
					return await fetch(event.request);
				} catch (err) {
					const cached = await caches.match(event.request, { ignoreSearch: true });
					if (cached) {
						return cached;
					}

					const appShell = await caches.match("/app/posapp");
					if (appShell) {
						return appShell;
					}

					const offlinePage = await caches.match("/offline.html");
					if (offlinePage) {
						return offlinePage;
					}

					return Response.error();
				}
			})(),
		);
		return;
	}

	event.respondWith(
		(async () => {
			const cacheName = await getCacheName();
			try {
				const response = await fetch(event.request);
				const cacheableTypes = ["basic", "default", "cors"];
				if (
					response &&
					response.ok &&
					response.status === 200 &&
					cacheableTypes.includes(response.type)
				) {
					try {
						const cache = await caches.open(cacheName);
						await cache.put(event.request, response.clone());
						await enforceCacheLimit(cache);
					} catch (cacheError) {
						console.warn("SW cache put failed", cacheError);
					}
				}
				return response;
			} catch (networkError) {
				const cached = await caches.match(event.request);
				if (cached) {
					return cached;
				}
				const fallback = await caches.match(event.request, { ignoreSearch: true });
				if (fallback) {
					return fallback;
				}
				return Response.error();
			}
		})(),
	);
});
