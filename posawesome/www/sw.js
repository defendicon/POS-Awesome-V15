const CACHE_NAME = "posawesome-cache-v1";
const MAX_CACHE_ITEMS = 1000;

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
			const cache = await caches.open(CACHE_NAME);
			const resources = [
				"/app/posapp",
                                "/assets/posawesome/dist/js/posawesome.umd.js",

                                "/assets/posawesome/dist/js/offline/index.js",

                                "/assets/posawesome/dist/js/posapp/workers/itemWorker.js",
                                "/assets/posawesome/dist/js/libs/dexie.min.js",

				"/manifest.json",
				"/offline.html",
			];
			await Promise.all(
				resources.map(async (url) => {
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
			const keys = await caches.keys();
			await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
			const cache = await caches.open(CACHE_NAME);
			await enforceCacheLimit(cache);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;

	const url = new URL(event.request.url);
	if (url.protocol !== "http:" && url.protocol !== "https:") return;

	if (event.request.url.includes("socket.io")) return;

	if (event.request.mode === "navigate") {
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
			try {
				const cached = await caches.match(event.request);
				if (cached) {
					return cached;
				}
				const resp = await fetch(event.request);
				if (resp && resp.ok && resp.status === 200) {
					try {
						const clone = resp.clone();
						const cache = await caches.open(CACHE_NAME);
						await cache.put(event.request, clone);
						await enforceCacheLimit(cache);
					} catch (e) {
						console.warn("SW cache put failed", e);
					}
				}
				return resp;
			} catch (err) {
				try {
					const fallback = await caches.match(event.request);
					return fallback || Response.error();
				} catch (e) {
					return Response.error();
				}
			}
		})(),
	);
});
