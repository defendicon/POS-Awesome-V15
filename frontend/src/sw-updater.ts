import { setActivePinia } from "pinia";
import { pinia, useUpdateStore } from "./posapp/stores/index.js";

const VERSION_ENDPOINT = "/assets/posawesome/dist/js/version.json";
const SERVICE_WORKER_SCOPE = "/sw.js";
const VERSION_CACHE_TTL = 30 * 1000;

let cachedVersionInfo: {
	version: string | null;
	timestamp: number | null;
} | null = null;
let cachedVersionTimestamp = 0;
let pendingVersionRequest: Promise<any> | null = null;

export interface ActiveVersionTransitionInput {
	version: string;
	runtimeVersion: string | null;
	lastKnownActiveVersion: string | null;
	reloadScheduled: boolean;
}

export interface ActiveVersionTransition {
	nextLastKnownActiveVersion: string;
	syncCurrentVersion: boolean;
	syncAvailableVersion: boolean;
	markUpdateApplied: boolean;
	reloadWindow: boolean;
	clearReloadState: boolean;
}

export function resolveActiveVersionTransition({
	version,
	runtimeVersion,
	lastKnownActiveVersion,
	reloadScheduled,
}: ActiveVersionTransitionInput): ActiveVersionTransition {
	const controllerVersionChanged = version !== lastKnownActiveVersion;

	if (!lastKnownActiveVersion) {
		return {
			nextLastKnownActiveVersion: version,
			syncCurrentVersion: !runtimeVersion || runtimeVersion === version,
			syncAvailableVersion: Boolean(runtimeVersion && runtimeVersion !== version),
			markUpdateApplied: false,
			reloadWindow: false,
			clearReloadState: false,
		};
	}

	if (reloadScheduled) {
		return {
			nextLastKnownActiveVersion: version,
			syncCurrentVersion: runtimeVersion === version,
			syncAvailableVersion: false,
			markUpdateApplied: runtimeVersion !== version,
			reloadWindow: runtimeVersion !== version,
			clearReloadState: runtimeVersion === version,
		};
	}

	if (!runtimeVersion || runtimeVersion === version) {
		return {
			nextLastKnownActiveVersion: version,
			syncCurrentVersion: true,
			syncAvailableVersion: false,
			markUpdateApplied: false,
			reloadWindow: false,
			clearReloadState: false,
		};
	}

	return {
		nextLastKnownActiveVersion: version,
		syncCurrentVersion: false,
		syncAvailableVersion: controllerVersionChanged,
		markUpdateApplied: false,
		reloadWindow: false,
		clearReloadState: false,
	};
}

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
	setActivePinia(pinia);
	const updateStore = useUpdateStore();
	updateStore.initializeFromStorage();
	updateStore.setReloadAction(triggerServiceWorkerUpdate);

	let lastKnownActiveVersion = updateStore.currentVersion || null;
	let hasRequestedInitialVersion = false;
	let reloadScheduled = false;

	function clearReloadState() {
		reloadScheduled = false;
		updateStore.reloading = false;
	}

	function warnVersionFailure(message: string, err: unknown) {
		console.warn(message, err);
	}

	function fallbackAfterVersionFailure(
		message: string,
		err: unknown,
		options: { forceReload?: boolean } = {},
	) {
		warnVersionFailure(message, err);
		clearReloadState();

		if (!options.forceReload) {
			return;
		}

		try {
			window.location.reload();
		} catch (reloadErr) {
			console.warn(
				"Failed to reload after service worker updater fallback",
				reloadErr,
			);
		}
	}

	function parseVersionInfoPayload(payload: any) {
		if (!payload) {
			throw new Error("Service worker version request timed out");
		}

		if (payload.type !== "SW_VERSION_INFO") {
			throw new Error("Service worker returned an unexpected version response");
		}

		const version =
			typeof payload.version === "string" ? payload.version.trim() : "";
		if (!version) {
			throw new Error("Service worker returned an invalid version payload");
		}

		const numericTimestamp = Number(payload.timestamp);

		return {
			version,
			timestamp: Number.isFinite(numericTimestamp) ? numericTimestamp : null,
		};
	}

	navigator.serviceWorker.addEventListener("message", (event) => {
		const data: any = event.data || {};
		if (data.type === "SW_VERSION_INFO") {
			try {
				const parsed = parseVersionInfoPayload(data);
				handleActiveVersion(parsed.version, parsed.timestamp);
			} catch (err) {
				warnVersionFailure(
					"Ignoring malformed service worker version message",
					err,
				);
			}
		}
	});

	navigator.serviceWorker.ready
		.then(async (registration) => {
			monitorRegistration(registration);
			try {
				await ensureActiveVersion();
			} catch (err) {
				warnVersionFailure(
					"Failed to ensure active service worker version during startup",
					err,
				);
			}
			await checkWaitingWorker(registration);
			registration.update().catch(() => {});
		})
		.catch((err) => {
			console.warn("SW ready rejected", err);
		});

	navigator.serviceWorker.addEventListener("controllerchange", () => {
		handleControllerChange().catch((err) => {
			fallbackAfterVersionFailure(
				"Unhandled service worker controllerchange failure",
				err,
				{ forceReload: reloadScheduled },
			);
		});
	});

	async function ensureActiveVersion() {
		if (!navigator.serviceWorker.controller) {
			return;
		}

		if (!hasRequestedInitialVersion) {
			hasRequestedInitialVersion = true;
			await requestVersionFromController();
		}
	}

	async function postMessageToController(
		message: Record<string, unknown>,
		timeoutMs = 4000,
	) {
		const controller = navigator.serviceWorker.controller;
		if (!controller) return null;

		return new Promise((resolve) => {
			const channel = new MessageChannel();
			const timeout = window.setTimeout(() => resolve(null), timeoutMs);
			channel.port1.onmessage = (event) => {
				window.clearTimeout(timeout);
				resolve(event.data || null);
			};
			try {
				controller.postMessage(message, [channel.port2]);
			} catch (err) {
				window.clearTimeout(timeout);
				console.warn("Failed to post message to service worker", err);
				resolve(null);
			}
		});
	}

	async function requestVersionFromController() {
		const payload: any = await postMessageToController({
			type: "CHECK_VERSION",
		});
		const parsed = parseVersionInfoPayload(payload);
		handleActiveVersion(parsed.version, parsed.timestamp);
		return parsed;
	}

	async function handleControllerChange() {
		try {
			if (!reloadScheduled) {
				await requestVersionFromController();
				return;
			}

			updateStore.reloading = true;
			await requestVersionFromController();
		} catch (err) {
			fallbackAfterVersionFailure(
				"Failed to process service worker controllerchange",
				err,
				{ forceReload: reloadScheduled },
			);
		}
	}

	async function refreshControllerCacheVersion() {
		const payload: any = await postMessageToController({
			type: "REFRESH_CACHE_VERSION",
		});
		const parsed = parseVersionInfoPayload(payload);
		handleActiveVersion(parsed.version, parsed.timestamp);
		return parsed;
	}

	async function checkWaitingWorker(registration: ServiceWorkerRegistration) {
		if (registration.waiting) {
			await announceAvailableUpdate(true);
		}
	}

	function monitorRegistration(registration: ServiceWorkerRegistration) {
		registration.addEventListener("updatefound", () => {
			const newWorker = registration.installing;
			if (!newWorker) return;
			newWorker.addEventListener("statechange", async () => {
				if (
					newWorker.state === "installed" &&
					navigator.serviceWorker.controller
				) {
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
		if (
			!force &&
			cachedVersionInfo &&
			now - cachedVersionTimestamp < VERSION_CACHE_TTL
		) {
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
				const data: any = await response.json();
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

	function handleActiveVersion(version: string, timestamp: number | null) {
		if (!version) return;
		if (timestamp) {
			cachedVersionInfo = {
				version,
				timestamp,
			};
			cachedVersionTimestamp = Date.now();
		}
		const decision = resolveActiveVersionTransition({
			version,
			runtimeVersion: updateStore.currentVersion || null,
			lastKnownActiveVersion,
			reloadScheduled,
		});

		lastKnownActiveVersion = decision.nextLastKnownActiveVersion;

		if (decision.markUpdateApplied) {
			updateStore.markUpdateApplied(version, timestamp || null);
		}

		if (decision.clearReloadState) {
			clearReloadState();
		}

		if (decision.syncCurrentVersion) {
			updateStore.setCurrentVersion(version, timestamp || null);
		}

		if (decision.syncAvailableVersion) {
			updateStore.setAvailableVersion(version, timestamp || null);
		}

		if (decision.reloadWindow) {
			reloadScheduled = false;
			setTimeout(() => window.location.reload(), 50);
		}
	}

	async function triggerServiceWorkerUpdate() {
		try {
			reloadScheduled = true;
			updateStore.reloading = true;
			updateStore.resetSnooze();
			const registration =
				await navigator.serviceWorker.getRegistration(
					SERVICE_WORKER_SCOPE,
				);
			if (!registration) {
				updateStore.reloading = false;
				return;
			}
			if (registration.waiting) {
				registration.waiting.postMessage({ type: "SKIP_WAITING" });
				return;
			}
			if (registration.installing) {
				const installingWorker = registration.installing;
				installingWorker.addEventListener("statechange", () => {
					if (installingWorker.state === "installed") {
						registration.waiting?.postMessage({
							type: "SKIP_WAITING",
						});
					}
				});
				return;
			}
			await registration.update();
			const waitingWorker = registration.waiting as ServiceWorker | null;
			if (waitingWorker) {
				waitingWorker.postMessage({ type: "SKIP_WAITING" });
				return;
			}

			try {
				await refreshControllerCacheVersion();
				return;
			} catch (err) {
				warnVersionFailure(
					"Failed to refresh controller cache version after update",
					err,
				);
			}

			try {
				await requestVersionFromController();
				return;
			} catch (err) {
				fallbackAfterVersionFailure(
					"Failed to confirm active service worker version after update",
					err,
					{ forceReload: true },
				);
			}
		} catch (err) {
			console.warn("Failed to trigger service worker update", err);
			clearReloadState();
		}
	}
}
