const DEFAULT_POSAPP_BASE_PATH = "/app/posapp";
const POS_CACHE_PREFIX = "posawesome-cache-";
const POS_SERVICE_WORKER_PATH = "/sw.js";

type BuildVersionFetcher = () => Promise<string | null>;
type CacheStorageLike = {
	keys?: () => Promise<string[]>;
	delete?: (key: string) => Promise<boolean>;
};
type StorageLike = {
	removeItem?: (key: string) => void;
};
type ServiceWorkerRegistrationLike = {
	scope?: string;
	active?: { scriptURL?: string };
	waiting?: { scriptURL?: string };
	installing?: { scriptURL?: string };
	unregister?: () => Promise<boolean>;
};
type NavigatorLike = {
	serviceWorker?: {
		getRegistrations?: () => Promise<ServiceWorkerRegistrationLike[]>;
	};
};

export interface PreferredBundleTarget {
	version: string;
	shouldRefreshAssets: boolean;
}

export function resolvePosAppNormalizedPath(
	pathname: string,
	basePath = DEFAULT_POSAPP_BASE_PATH,
): string | null {
	if (!pathname || !basePath) {
		return null;
	}

	const normalizedBasePath =
		basePath.length > 1 ? basePath.replace(/\/+$/, "") : basePath;

	if (!pathname.toLowerCase().startsWith(`${normalizedBasePath.toLowerCase()}/`)) {
		return null;
	}

	if (pathname === normalizedBasePath) {
		return null;
	}

	return normalizedBasePath;
}

export async function pickPreferredBundleVersion(
	embeddedBuildVersion: string,
	fetchLatestBuildVersion: BuildVersionFetcher,
): Promise<string> {
	const target = await resolvePreferredBundleTarget(
		embeddedBuildVersion,
		fetchLatestBuildVersion,
	);
	return target.version;
}

export async function resolvePreferredBundleTarget(
	embeddedBuildVersion: string,
	fetchLatestBuildVersion: BuildVersionFetcher,
): Promise<PreferredBundleTarget> {
	try {
		const latestBuildVersion = await fetchLatestBuildVersion();
		const normalizedLatestVersion = latestBuildVersion?.trim();
		if (
			normalizedLatestVersion &&
			normalizedLatestVersion !== embeddedBuildVersion
		) {
			return {
				version: normalizedLatestVersion,
				shouldRefreshAssets: true,
			};
		}
	} catch {}

	return {
		version: embeddedBuildVersion,
		shouldRefreshAssets: false,
	};
}

function isPosServiceWorkerRegistration(
	registration: ServiceWorkerRegistrationLike,
): boolean {
	const scriptUrl =
		registration.active?.scriptURL ||
		registration.waiting?.scriptURL ||
		registration.installing?.scriptURL ||
		"";
	return scriptUrl.includes(POS_SERVICE_WORKER_PATH);
}

export async function clearPosAssetRecoveryTargets({
	cacheStorage,
	navigatorLike,
	localStorageLike,
	sessionStorageLike,
}: {
	cacheStorage?: CacheStorageLike;
	navigatorLike?: NavigatorLike;
	localStorageLike?: StorageLike;
	sessionStorageLike?: StorageLike;
} = {}): Promise<void> {
	try {
		const serviceWorkerApi = navigatorLike?.serviceWorker;
		if (typeof serviceWorkerApi?.getRegistrations === "function") {
			const registrations = await serviceWorkerApi.getRegistrations();
			await Promise.all(
				registrations
					.filter(isPosServiceWorkerRegistration)
					.map(async (registration) => {
						if (typeof registration.unregister === "function") {
							await registration.unregister();
						}
					}),
			);
		}
	} catch {}

	try {
		if (
			typeof cacheStorage?.keys === "function" &&
			typeof cacheStorage?.delete === "function"
		) {
			const keys = await cacheStorage.keys();
			await Promise.all(
				keys
					.filter((key) => key.startsWith(POS_CACHE_PREFIX))
					.map((key) => cacheStorage.delete?.(key)),
			);
		}
	} catch {}

	try {
		localStorageLike?.removeItem?.("posawesome_version");
		localStorageLike?.removeItem?.("posawesome_update_dismissed");
		localStorageLike?.removeItem?.("posawesome_update_last_check");
		sessionStorageLike?.removeItem?.("posawesome_update_snooze_until");
	} catch {}
}
