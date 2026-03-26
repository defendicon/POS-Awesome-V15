declare const __BUILD_VERSION__: string;
import {
	clearPosAssetRecoveryTargets,
	ensureClassicBootOverlay,
	resolvePreferredBundleTarget,
	resolvePosAppNormalizedPath,
} from "./loader-utils";

const POSAPP_BASE_PATH = "/app/posapp";
const VERSION_ENDPOINT = "/assets/posawesome/dist/js/version.json";
const LOADER_RECOVERY_KEY = "posa_loader_chunk_recovery_once";

const getBundlePath = (version: string) =>
	`/assets/posawesome/dist/js/posawesome.js?v=${encodeURIComponent(version)}`;

declare global {
	interface Window {
		__posawesomeBundlePromise?: Promise<unknown>;
	}
}

function normalizePosAppPath(): boolean {
	if (typeof window === "undefined" || !window.location) {
		return false;
	}

	const { pathname, search, hash } = window.location;
	const normalizedPath = resolvePosAppNormalizedPath(pathname, POSAPP_BASE_PATH);
	if (!normalizedPath) {
		return false;
	}

	window.location.replace(`${normalizedPath}${search || ""}${hash || ""}`);
	return true;
}

function isDynamicImportFailure(error: unknown): boolean {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: String(error || "");
	const normalized = message.toLowerCase();
	return (
		normalized.includes("failed to fetch dynamically imported module") ||
		normalized.includes("loading chunk") ||
		normalized.includes("chunkloaderror") ||
		normalized.includes("importing a module script failed")
	);
}

async function fetchLatestBuildVersion(): Promise<string | null> {
	try {
		const response = await fetch(`${VERSION_ENDPOINT}?t=${Date.now()}`, {
			cache: "no-store",
		});
		if (!response.ok) {
			return null;
		}
		const payload: any = await response.json();
		const version = payload?.version || payload?.buildVersion;
		return typeof version === "string" && version.trim().length
			? version.trim()
			: null;
	} catch {
		return null;
	}
}

function recoverByReloadingPosApp() {
	if (typeof window === "undefined") {
		return;
	}

	const storage = window.sessionStorage;
	if (!storage) {
		window.location.replace(`/app/posapp?_posa_loader_recovery=${Date.now()}`);
		return;
	}

	if (storage.getItem(LOADER_RECOVERY_KEY) === "1") {
		return;
	}

	storage.setItem(LOADER_RECOVERY_KEY, "1");
	window.location.replace(`/app/posapp?_posa_loader_recovery=${Date.now()}`);
}

async function importPosAwesomeBundle() {
	const initialVersion = __BUILD_VERSION__;
	const classicBootOverlay = ensureClassicBootOverlay();
	classicBootOverlay.update({
		title: "Checking app version",
		detail: "Comparing cached assets with the latest build",
		progress: 12,
	});
	const preferredTarget = await resolvePreferredBundleTarget(
		initialVersion,
		fetchLatestBuildVersion,
	);
	classicBootOverlay.update({
		title: "Checking app version",
		detail: "Build version verified",
		progress: 24,
	});

	if (preferredTarget.shouldRefreshAssets) {
		classicBootOverlay.update({
			title: "Refreshing outdated assets",
			detail: "Removing stale files before startup",
			progress: 42,
		});
		await clearPosAssetRecoveryTargets({
			cacheStorage:
				typeof caches !== "undefined" ? (caches as unknown as any) : undefined,
			navigatorLike:
				typeof navigator !== "undefined" ? (navigator as unknown as any) : undefined,
			localStorageLike:
				typeof window !== "undefined" ? window.localStorage : undefined,
			sessionStorageLike:
				typeof window !== "undefined" ? window.sessionStorage : undefined,
		});
		classicBootOverlay.update({
			title: "Refreshing outdated assets",
			detail: "Latest assets prepared for startup",
			progress: 58,
		});
	} else {
		classicBootOverlay.update({
			title: "Preparing startup",
			detail: "Assets are already up to date",
			progress: 38,
		});
	}
	try {
		classicBootOverlay.update({
			title: "Loading POS bundle",
			detail: "Starting the latest POS application files",
			progress: 72,
		});
		return await import(
			/* @vite-ignore */
			getBundlePath(preferredTarget.version)
		);
	} catch (firstError) {
		classicBootOverlay.hide();
		if (preferredTarget.version !== initialVersion) {
			if (isDynamicImportFailure(firstError)) {
				recoverByReloadingPosApp();
			}
			throw firstError;
		}

		const latestVersion = await fetchLatestBuildVersion();
		if (latestVersion && latestVersion !== initialVersion) {
			try {
				classicBootOverlay.update({
					title: "Retrying with latest build",
					detail: "Loading updated POS bundle after version refresh",
					progress: 82,
				});
				return await import(
					/* @vite-ignore */
					getBundlePath(latestVersion)
				);
			} catch (retryError) {
				if (isDynamicImportFailure(retryError)) {
					recoverByReloadingPosApp();
				}
				throw retryError;
			}
		}

		if (isDynamicImportFailure(firstError)) {
			recoverByReloadingPosApp();
		}
		throw firstError;
	}
}

if (typeof window !== "undefined" && !normalizePosAppPath()) {
	window.__posawesomeBundlePromise = importPosAwesomeBundle().catch((error) => {
		ensureClassicBootOverlay().hide();
		console.error("POS Awesome bundle failed to load", error);
		throw error;
	});
}
