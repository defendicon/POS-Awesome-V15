const CACHE_PREFIX = "posawesome-cache-";
const VERSION_URL = "/assets/posawesome/dist/js/version.json";
const DEFAULT_CACHE_VERSION = "default";
const MAX_CACHE_ITEMS = 1000;

const STATIC_PRECACHE_URLS = [
	"/app/posapp",
	"/assets/posawesome/dist/js/posapp/workers/itemWorker.js",
	"/assets/posawesome/dist/js/libs/dexie.min.js",
	"/manifest.json",
	"/offline.html",
];

function buildVersionedAssetUrl(url, version) {
	return `${url}?v=${encodeURIComponent(version || DEFAULT_CACHE_VERSION)}`;
}

function getPrecacheUrls(version, assets = {}) {
	const offlineIndexUrl =
		typeof assets.offlineIndex === "string" && assets.offlineIndex
			? assets.offlineIndex
			: buildVersionedAssetUrl("/assets/posawesome/dist/js/offline/index.js", version);
	return [
		buildVersionedAssetUrl("/assets/posawesome/dist/js/loader.js", version),
		buildVersionedAssetUrl("/assets/posawesome/dist/js/posawesome.css", version),
		buildVersionedAssetUrl("/assets/posawesome/dist/js/posawesome.js", version),
		offlineIndexUrl,
		...STATIC_PRECACHE_URLS,
	];
}

let cachedCacheName = null;
let cacheNameInFlight = null;
let currentVersion = null;
let currentAssets = {};

async function precacheUrls(cacheName, version, assets = {}) {
	const cache = await caches.open(cacheName);
	await Promise.all(
		getPrecacheUrls(version, assets).map(async (url) => {
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
	return cache;
}

async function cleanupObsoleteCaches(activeCacheName) {
	const keys = await caches.keys();
	await Promise.all(
		keys
			.filter((key) => key.startsWith(CACHE_PREFIX) && key !== activeCacheName)
			.map((key) => caches.delete(key)),
	);
}

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

function extractBuildVersion(payload) {
	const version = payload?.version || payload?.buildVersion;
	return typeof version === "string" && version.trim().length ? version.trim() : DEFAULT_CACHE_VERSION;
}

function extractBuildAssets(payload) {
	return payload?.assets && typeof payload.assets === "object" ? payload.assets : {};
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
		return;
	}
	if (payload.type === "REFRESH_CACHE_VERSION") {
		const target = (event.ports && event.ports[0]) || event.source || null;
		const task = refreshCacheVersion(target);
		if (typeof event.waitUntil === "function") {
			event.waitUntil(task);
		}
		return;
	}
	if (payload.type === "CLIENT_FORCE_UNREGISTER") {
		const task = forceUnregisterServiceWorker();
		if (typeof event.waitUntil === "function") {
			event.waitUntil(task);
		}
	}
});

async function resolveBuildMetadata(forceRefresh = false) {
	if (forceRefresh) {
		currentVersion = null;
		currentAssets = {};
	}
	try {
		const response = await fetch(VERSION_URL, { cache: "no-store" });
		if (response && response.ok) {
			const payload = await response.json();
			currentVersion = extractBuildVersion(payload);
			currentAssets = extractBuildAssets(payload);
			return {
				version: currentVersion,
				assets: currentAssets,
			};
		}
	} catch (err) {
		console.warn("SW: failed to fetch build version", err);
	}
	return {
		version: DEFAULT_CACHE_VERSION,
		assets: currentAssets || {},
	};
}

async function getCacheName(forceRefresh = false, resolvedMetadata = null) {
	if (forceRefresh) {
		cachedCacheName = null;
		cacheNameInFlight = null;
	}
	if (cachedCacheName) {
		return cachedCacheName;
	}
	if (cacheNameInFlight) {
		return cacheNameInFlight;
	}
	cacheNameInFlight = (async () => {
		const metadata = resolvedMetadata || (await resolveBuildMetadata(forceRefresh));
		const version = metadata?.version || DEFAULT_CACHE_VERSION;
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

async function refreshCacheVersion(target) {
	const metadata = await resolveBuildMetadata(true);
	const activeCacheName = await getCacheName(true, metadata);
	await precacheUrls(activeCacheName, metadata.version, metadata.assets);
	await cleanupObsoleteCaches(activeCacheName);
	postVersionMessage(target);
	const clients = await self.clients.matchAll({
		type: "window",
		includeUncontrolled: true,
	});
	clients.forEach(postVersionMessage);
	return activeCacheName;
}

async function forceUnregisterServiceWorker() {
	cachedCacheName = null;
	cacheNameInFlight = null;
	currentVersion = null;
	currentAssets = {};
	const keys = await caches.keys();
	await Promise.all(
		keys
			.filter((key) => key.startsWith(CACHE_PREFIX))
			.map((key) => caches.delete(key)),
	);
	await self.registration.unregister();
}

self.addEventListener("install", (event) => {
	self.skipWaiting();
	event.waitUntil(
		(async () => {
			const metadata = await resolveBuildMetadata();
			const cacheName = await getCacheName(false, metadata);
			await precacheUrls(cacheName, metadata.version, metadata.assets);
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const metadata = await resolveBuildMetadata();
			const activeCacheName = await getCacheName(false, metadata);
			await precacheUrls(activeCacheName, metadata.version, metadata.assets);
			await cleanupObsoleteCaches(activeCacheName);
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
			const hasVersionQuery = url.searchParams.has("v");
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

				if (!hasVersionQuery) {
					const fallback = await caches.match(event.request, {
						ignoreSearch: true,
					});
					if (fallback) {
						return fallback;
					}
				}
				return Response.error();
			}
		})(),
	);
});
