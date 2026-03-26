declare const __BUILD_VERSION__: string;
import {
	clearPosAssetRecoveryTargets,
	resolvePreferredBundleTarget,
	resolvePosAppNormalizedPath,
} from "./loader-utils";
import {
	markBootStageLoaded,
	setBootStageDetail,
	setBootStageProgress,
} from "./posapp/utils/loading";

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
	setBootStageProgress("check_version", 20);
	const preferredTarget = await resolvePreferredBundleTarget(
		initialVersion,
		fetchLatestBuildVersion,
	);
	markBootStageLoaded("check_version");

	if (preferredTarget.shouldRefreshAssets) {
		setBootStageProgress("refresh_assets", 25);
		setBootStageDetail(
			"refresh_assets",
			"Removing stale assets before loading the latest build",
		);
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
		markBootStageLoaded("refresh_assets");
	} else {
		markBootStageLoaded(
			"refresh_assets",
			"Assets are already up to date",
		);
	}
	try {
		return await import(
			/* @vite-ignore */
			getBundlePath(preferredTarget.version)
		);
	} catch (firstError) {
		if (preferredTarget.version !== initialVersion) {
			if (isDynamicImportFailure(firstError)) {
				recoverByReloadingPosApp();
			}
			throw firstError;
		}

		const latestVersion = await fetchLatestBuildVersion();
		if (latestVersion && latestVersion !== initialVersion) {
			try {
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
		console.error("POS Awesome bundle failed to load", error);
		throw error;
	});
}
