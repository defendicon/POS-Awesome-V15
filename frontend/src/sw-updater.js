import { setActivePinia } from "pinia";
import { pinia, useUpdateStore } from "./posapp/stores/index.js";

const VERSION_ENDPOINT = "/assets/posawesome/dist/js/version.json";
const SERVICE_WORKER_SCOPE = "/assets/posawesome/dist/www/sw.js";
const VERSION_CACHE_TTL = 30 * 1000;

let cachedVersionInfo = null;
let cachedVersionTimestamp = 0;
let pendingVersionRequest = null;

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
	setActivePinia(pinia);
	const updateStore = useUpdateStore();
	updateStore.initializeFromStorage();
	updateStore.setReloadAction(triggerServiceWorkerUpdate);

	let lastKnownActiveVersion = updateStore.currentVersion || null;
	let hasRequestedInitialVersion = false;
	let reloadScheduled = false;

	navigator.serviceWorker.addEventListener("message", (event) => {
		const data = event.data || {};
		if (data.type === "SW_VERSION_INFO") {
			handleActiveVersion(data.version, data.timestamp);
		}
	});

	navigator.serviceWorker.ready
		.then(async (registration) => {
			monitorRegistration(registration);
			await ensureActiveVersion();
			await checkWaitingWorker(registration);
			registration.update().catch(() => {});
		})
		.catch((err) => {
			console.warn("SW ready rejected", err);
		});

	navigator.serviceWorker.addEventListener("controllerchange", () => {
		reloadScheduled = true;
		updateStore.reloading = true;
		updateStore.resetSnooze();
		requestVersionFromController();
	});

	async function ensureActiveVersion() {
		if (!navigator.serviceWorker.controller) {
			return;
		}

		if (!hasRequestedInitialVersion) {
			hasRequestedInitialVersion = true;
			requestVersionFromController();
		}
	}

	function requestVersionFromController() {
		const controller = navigator.serviceWorker.controller;
		if (!controller) return;

		const channel = new MessageChannel();
		channel.port1.onmessage = (event) => {
			const payload = event.data || {};
			if (payload.type === "SW_VERSION_INFO") {
				handleActiveVersion(payload.version, payload.timestamp);
			}
		};
		try {
			controller.postMessage({ type: "CHECK_VERSION" }, [channel.port2]);
		} catch (err) {
			console.warn("Failed to request SW version", err);
		}
	}

	async function checkWaitingWorker(registration) {
		if (registration.waiting) {
			await announceAvailableUpdate(true);
		}
	}

	function monitorRegistration(registration) {
		registration.addEventListener("updatefound", () => {
			const newWorker = registration.installing;
			if (!newWorker) return;
			newWorker.addEventListener("statechange", async () => {
				if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
					await announceAvailableUpdate(true);
				}
			});
		});
	}

	async function announceAvailableUpdate(force = false) {
		const info = await fetchBuildInfo(force);
		if (!info || !info.version) {
			return;
		}
		updateStore.setAvailableVersion(info.version, info.timestamp || null);
		lastKnownActiveVersion = lastKnownActiveVersion || info.version;
	}

	async function fetchBuildInfo(force = false) {
		if (pendingVersionRequest) {
			return pendingVersionRequest;
		}
		const now = Date.now();
		if (!force && cachedVersionInfo && now - cachedVersionTimestamp < VERSION_CACHE_TTL) {
			return cachedVersionInfo;
		}
		pendingVersionRequest = (async () => {
			try {
				const response = await fetch(VERSION_ENDPOINT, {
					cache: "no-store",
					headers: {
						"Cache-Control": "no-cache",
						Pragma: "no-cache",
						Expires: "0",
					},
				});

				if (!response.ok) {
					return null;
				}
				const data = await response.json();
				const version = data.version || data.buildVersion || null;
				const timestamp = Number(data.timestamp || data.buildTimestamp);
				const parsed = {
					version,
					timestamp: Number.isNaN(timestamp) ? null : timestamp,
				};
				cachedVersionInfo = parsed;
				cachedVersionTimestamp = Date.now();
				return parsed;
			} catch (err) {
				console.warn("Failed to fetch build info", err);
				return null;
			} finally {
				pendingVersionRequest = null;
			}
		})();
		return pendingVersionRequest;
	}

	function handleActiveVersion(version, timestamp) {
		if (!version) return;
		if (timestamp) {
			cachedVersionInfo = {
				version,
				timestamp,
			};
			cachedVersionTimestamp = Date.now();
		}
		if (!lastKnownActiveVersion) {
			lastKnownActiveVersion = version;
			updateStore.setCurrentVersion(version, timestamp || null);
			return;
		}

		if (version !== lastKnownActiveVersion) {
			lastKnownActiveVersion = version;
			updateStore.markUpdateApplied(version, timestamp || null);
			if (reloadScheduled) {
				reloadScheduled = false;
				setTimeout(() => window.location.reload(), 50);
			}
		} else {
			updateStore.setCurrentVersion(version, timestamp || null);
			if (reloadScheduled) {
				reloadScheduled = false;
				updateStore.reloading = false;
			}
		}
	}

	async function triggerServiceWorkerUpdate() {
		try {
			const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
			if (!registration) {
				updateStore.reloading = false;
				return;
			}
			if (registration.waiting) {
				registration.waiting.postMessage({ type: "SKIP_WAITING" });
				return;
			}
			if (registration.installing) {
				registration.installing.addEventListener("statechange", () => {
					if (registration.installing?.state === "installed") {
						registration.waiting?.postMessage({ type: "SKIP_WAITING" });
					}
				});
				return;
			}
			await registration.update();
			if (!registration.waiting) {
				updateStore.reloading = false;
			}
		} catch (err) {
			console.warn("Failed to trigger service worker update", err);
			updateStore.reloading = false;
		}
	}
}
