import { buildPosAppRecoveryLocation } from "../../loader-utils";

const POSAPP_ROUTE = "/app/posapp";
const CHUNK_RELOAD_KEY = "posa_chunk_reload_once";
const CHUNK_CACHE_RECOVERY_KEY = "posa_chunk_cache_recovery_once";
const CHUNK_RECOVERY_IN_PROGRESS_KEY = "posa_chunk_recovery_in_progress";
const LOADER_RECOVERY_KEY = "posa_loader_chunk_recovery_once";
const CHUNK_RECOVERY_STABLE_DELAY_MS = 3000;

function normalizeErrorText(error: unknown): string {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: String(error || "");
	return message.trim().toLowerCase();
}

export function isDynamicImportFailure(error: unknown): boolean {
	const message = normalizeErrorText(error);
	return (
		message.includes("failed to fetch dynamically imported module") ||
		message.includes("loading chunk") ||
		message.includes("chunkloaderror") ||
		message.includes("importing a module script failed") ||
		(message.includes("requested module") &&
			message.includes("does not provide an export named"))
	);
}

function resetRecoveryState() {
	if (typeof window === "undefined" || !window.sessionStorage) {
		return;
	}
	window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
	window.sessionStorage.removeItem(CHUNK_CACHE_RECOVERY_KEY);
	window.sessionStorage.removeItem(CHUNK_RECOVERY_IN_PROGRESS_KEY);
	window.sessionStorage.removeItem(LOADER_RECOVERY_KEY);
}

export function clearChunkRecoveryState() {
	if (typeof window === "undefined" || !window.sessionStorage) {
		return;
	}
	window.sessionStorage.removeItem(CHUNK_RECOVERY_IN_PROGRESS_KEY);
}

export function scheduleChunkRecoveryStateReset() {
	scheduleAfterStableBoot(() => {
		resetRecoveryState();
	});
}

export function scheduleAfterStableBoot(task: () => void | Promise<void>) {
	if (typeof window === "undefined") {
		return;
	}

	window.setTimeout(() => {
		void Promise.resolve(task()).catch((error) => {
			console.warn("Chunk recovery: stable boot task failed", error);
		});
	}, CHUNK_RECOVERY_STABLE_DELAY_MS);
}

export function buildChunkRecoveryLocation(
	locationLike: { pathname?: string; search?: string; hash?: string } | null | undefined,
	param: string,
	token: string | number = Date.now(),
) {
	return buildPosAppRecoveryLocation(locationLike, param, token, POSAPP_ROUTE);
}

function redirectToPosApp(param: string) {
	if (typeof window === "undefined" || !window.location) {
		return false;
	}
	window.location.replace(
		buildChunkRecoveryLocation(window.location, param, Date.now()),
	);
	return true;
}

async function clearServiceWorkersAndCaches() {
	if (typeof window === "undefined") {
		return;
	}

	try {
		if (
			typeof navigator !== "undefined" &&
			"serviceWorker" in navigator &&
			typeof navigator.serviceWorker.getRegistrations === "function"
		) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(
				registrations.map(async (registration) => {
					try {
						registration.active?.postMessage({
							type: "CLIENT_FORCE_UNREGISTER",
						});
					} catch {
						// Service worker messaging is best-effort before unregister.
					}
					try {
						registration.waiting?.postMessage({
							type: "CLIENT_FORCE_UNREGISTER",
						});
					} catch {
						// Service worker messaging is best-effort before unregister.
					}
					try {
						registration.installing?.postMessage({
							type: "CLIENT_FORCE_UNREGISTER",
						});
					} catch {
						// Service worker messaging is best-effort before unregister.
					}
					await registration.unregister();
				}),
			);
		}
	} catch (err) {
		console.warn("Chunk recovery: failed to cleanup service workers", err);
	}

	try {
		if (typeof caches !== "undefined") {
			const cacheKeys = await caches.keys();
			await Promise.all(cacheKeys.map((key) => caches.delete(key)));
		}
	} catch (err) {
		console.warn("Chunk recovery: failed to cleanup Cache API", err);
	}

	try {
		window.localStorage?.removeItem("posawesome_version");
		window.localStorage?.removeItem("posawesome_update_dismissed");
		window.localStorage?.removeItem("posawesome_update_last_check");
		window.sessionStorage?.removeItem("posawesome_update_snooze_until");
	} catch (err) {
		console.warn("Chunk recovery: failed to cleanup update keys", err);
	}
}

export async function recoverFromChunkLoadError(
	error: unknown,
	source = "runtime",
): Promise<boolean> {
	if (!isDynamicImportFailure(error)) {
		return false;
	}

	if (typeof window === "undefined" || !window.sessionStorage) {
		return false;
	}

	if (
		window.sessionStorage.getItem(CHUNK_RECOVERY_IN_PROGRESS_KEY) === "1"
	) {
		return true;
	}

	window.sessionStorage.setItem(CHUNK_RECOVERY_IN_PROGRESS_KEY, "1");

	const alreadyRetried =
		window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
	if (!alreadyRetried) {
		window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
		console.warn("Chunk recovery: reloading POS app after chunk failure", {
			source,
			error,
		});
		return redirectToPosApp("_posa_chunk_reload");
	}

	const alreadyRecovered =
		window.sessionStorage.getItem(CHUNK_CACHE_RECOVERY_KEY) === "1";
	if (!alreadyRecovered) {
		window.sessionStorage.setItem(CHUNK_CACHE_RECOVERY_KEY, "1");
		console.warn(
			"Chunk recovery: clearing SW/cache after repeated chunk failure",
			{ source, error },
		);
		await clearServiceWorkersAndCaches();
		return redirectToPosApp("_posa_chunk_cache_recovery");
	}

	resetRecoveryState();
	return false;
}
