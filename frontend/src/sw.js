if (!self.define) {
	try {
		importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js");
	} catch (e) {
		importScripts("/assets/posawesome/dist/js/libs/workbox-sw.js");
	}
}

self.addEventListener("message", (event) => {
	const payload = event.data || {};
	if (payload.type === "SKIP_WAITING") {
		self.skipWaiting();
		return;
	}
	if (payload.type === "CHECK_VERSION") {
		const message = {
			type: "SW_VERSION_INFO",
			version: SW_REVISION,
			timestamp: Number(SW_REVISION),
		};
		if (event.ports && event.ports[0]) {
			event.ports[0].postMessage(message);
		} else if (event.source && event.source.postMessage) {
			event.source.postMessage(message);
		}
	}
});

// Force immediate activation and claim clients
self.addEventListener("install", (event) => {
	console.log(`SW installing with version: ${SW_REVISION}`);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	console.log(`SW activating with version: ${SW_REVISION}`);
	event.waitUntil(
		(async () => {
			await self.clients.claim();
			const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			const message = {
				type: "SW_VERSION_INFO",
				version: SW_REVISION,
				timestamp: Number(SW_REVISION),
			};
			clients.forEach((client) => {
				client.postMessage(message);
			});
		})(),
	);
});

workbox.core.clientsClaim();

const SW_REVISION = __BUILD_VERSION__;
workbox.precaching.precacheAndRoute([
	{ url: "/assets/posawesome/dist/js/posawesome.umd.js", revision: SW_REVISION },
	{ url: "/assets/posawesome/dist/js/offline/index.js", revision: SW_REVISION },
	{ url: "/manifest.json", revision: SW_REVISION },
	{ url: "/offline.html", revision: SW_REVISION },
]);

workbox.routing.registerRoute(
	({ url }) => url.pathname.startsWith("/api/"),
	new workbox.strategies.NetworkFirst({ cacheName: "api-cache", networkTimeoutSeconds: 3 }),
);

workbox.routing.registerRoute(
	({ request }) => ["script", "style"].includes(request.destination),
	new workbox.strategies.NetworkFirst({
		cacheName: "assets-cache",
		networkTimeoutSeconds: 3,
		cacheKeyWillBeUsed: async ({ request }) => {
			// Include version parameter in cache key for proper invalidation
			return request.url;
		},
	}),
);

workbox.routing.registerRoute(
	({ request }) => request.destination === "document",
	new workbox.strategies.StaleWhileRevalidate(),
);
