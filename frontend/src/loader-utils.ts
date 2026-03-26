const DEFAULT_POSAPP_BASE_PATH = "/app/posapp";
const POS_CACHE_PREFIX = "posawesome-cache-";
const POS_SERVICE_WORKER_PATH = "/sw.js";
const CLASSIC_BOOT_OVERLAY_ATTR = "data-posa-classic-boot-overlay";

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

export interface ClassicBootOverlayHandle {
	update: (payload: {
		title: string;
		detail?: string;
		progress?: number | null;
	}) => void;
	hide: () => void;
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

export function isPosAppPath(
	pathname: string,
	basePath = DEFAULT_POSAPP_BASE_PATH,
): boolean {
	if (!pathname || !basePath) {
		return false;
	}

	const normalizedBasePath =
		basePath.length > 1 ? basePath.replace(/\/+$/, "") : basePath;
	const normalizedPath = pathname.toLowerCase();
	const normalizedBase = normalizedBasePath.toLowerCase();

	return (
		normalizedPath === normalizedBase ||
		normalizedPath.startsWith(`${normalizedBase}/`)
	);
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

function getClassicBootOverlayRoot(): HTMLElement | null {
	if (typeof document === "undefined") {
		return null;
	}
	return document.querySelector(`[${CLASSIC_BOOT_OVERLAY_ATTR}]`);
}

function ensureTextNode(root: HTMLElement, selector: string): HTMLElement {
	const node = root.querySelector(selector);
	if (!node || !(node instanceof HTMLElement)) {
		throw new Error(`Missing boot overlay node: ${selector}`);
	}
	return node;
}

function createClassicBootOverlay(): HTMLElement | null {
	if (typeof document === "undefined") {
		return null;
	}

	const root = document.createElement("div");
	root.setAttribute(CLASSIC_BOOT_OVERLAY_ATTR, "true");
	root.setAttribute("role", "status");
	root.setAttribute("aria-live", "polite");
	root.innerHTML = `
		<div style="position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at top, rgba(245,158,11,0.14), transparent 32%),linear-gradient(180deg, rgba(15,23,42,0.76), rgba(15,23,42,0.9));backdrop-filter:blur(8px);">
			<div style="width:min(100%,460px);padding:24px;border-radius:20px;background:rgba(255,255,255,0.96);box-shadow:0 24px 60px rgba(15,23,42,0.28);border:1px solid rgba(148,163,184,0.24);font-family:Roboto,'Segoe UI',sans-serif;">
				<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#92400e;">
					<span>POS Startup</span>
					<span class="posa-classic-boot-percent" style="font-size:18px;color:#0f172a;">0%</span>
				</div>
				<h2 class="posa-classic-boot-title" style="margin:0;font-size:24px;line-height:1.2;color:#0f172a;">Loading POS</h2>
				<p class="posa-classic-boot-detail" style="margin:10px 0 18px;font-size:15px;line-height:1.5;color:#475569;">Preparing startup</p>
				<div style="overflow:hidden;height:12px;border-radius:999px;background:linear-gradient(90deg, rgba(148,163,184,0.18), rgba(148,163,184,0.28));">
					<div class="posa-classic-boot-bar" style="height:100%;width:0%;border-radius:inherit;background:linear-gradient(90deg, #f59e0b, #f97316 48%, #ea580c);box-shadow:0 0 18px rgba(249,115,22,0.34);transition:width 0.24s ease;"></div>
				</div>
			</div>
		</div>
	`;
	document.body.appendChild(root);
	return root;
}

export function ensureClassicBootOverlay(): ClassicBootOverlayHandle {
	const root = getClassicBootOverlayRoot() || createClassicBootOverlay();

	if (!root) {
		return {
			update: () => {},
			hide: () => {},
		};
	}

	const handle: ClassicBootOverlayHandle = {
		update: ({ title, detail = "", progress = null }) => {
			const titleNode = ensureTextNode(root, ".posa-classic-boot-title");
			const detailNode = ensureTextNode(root, ".posa-classic-boot-detail");
			const percentNode = ensureTextNode(root, ".posa-classic-boot-percent");
			const barNode = ensureTextNode(root, ".posa-classic-boot-bar");

			titleNode.textContent = title;
			detailNode.textContent = detail;

			if (typeof progress === "number" && Number.isFinite(progress)) {
				const normalized = Math.max(0, Math.min(100, Math.round(progress)));
				percentNode.textContent = `${normalized}%`;
				barNode.style.width = `${normalized}%`;
			}
		},
		hide: () => {
			root.remove();
			if (typeof window !== "undefined") {
				delete (window as any).__posaClassicBootOverlay;
			}
		},
	};

	if (typeof window !== "undefined") {
		(window as any).__posaClassicBootOverlay = handle;
	}

	return handle;
}
