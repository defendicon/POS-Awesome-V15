if (!self.define) {
	try {
		importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js");
	} catch (e) {
                importScripts("/assets/posawesome/dist/js/libs/workbox-sw.js");
	}
}

self.addEventListener("message", (event) => {
	if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

workbox.core.clientsClaim();

const SW_REVISION = "1";
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
	({ request }) => ["script", "style", "document"].includes(request.destination),
	new workbox.strategies.StaleWhileRevalidate(),
);
