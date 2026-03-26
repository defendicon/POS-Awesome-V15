const PENDING_BUNDLE_ACTIVATION_KEY = "posa_pending_bundle_activation";

function getStorage(): Storage | null {
	if (typeof window === "undefined" || !window.sessionStorage) {
		return null;
	}
	return window.sessionStorage;
}

function getPendingBundleActivationVersion(): string | null {
	const storage = getStorage();
	if (!storage) {
		return null;
	}
	return storage.getItem(PENDING_BUNDLE_ACTIVATION_KEY);
}

async function postMessageToActiveServiceWorker(
	message: Record<string, unknown>,
	timeoutMs: number,
) {
	if (
		typeof navigator === "undefined" ||
		!("serviceWorker" in navigator) ||
		!navigator.serviceWorker?.controller
	) {
		return null;
	}
	const controller = navigator.serviceWorker.controller;
	if (!controller) {
		return null;
	}

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
			console.warn("Failed to finalize bundle activation with service worker", err);
			resolve(null);
		}
	});
}

export function recordPendingBundleActivation(version: string) {
	const storage = getStorage();
	if (!storage || !version) {
		return;
	}
	storage.setItem(PENDING_BUNDLE_ACTIVATION_KEY, version);
}

export function clearPendingBundleActivation() {
	const storage = getStorage();
	if (!storage) {
		return;
	}
	storage.removeItem(PENDING_BUNDLE_ACTIVATION_KEY);
}

export async function finalizePendingBundleActivation(
	timeoutMs = 4000,
): Promise<boolean> {
	const pendingVersion = getPendingBundleActivationVersion();
	if (!pendingVersion) {
		return false;
	}

	const payload: any = await postMessageToActiveServiceWorker(
		{
			type: "REFRESH_CACHE_VERSION",
		},
		timeoutMs,
	);

	if (payload?.type === "SW_VERSION_INFO" && payload.version === pendingVersion) {
		clearPendingBundleActivation();
		return true;
	}

	return false;
}
