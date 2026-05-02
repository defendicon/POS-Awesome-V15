declare const __BUILD_VERSION__: string;
import {
	type BootAssetResult,
	type BootFailure,
	type BuildMetadata,
	startPosBoot,
} from "./bootstrap/bootController";
import {
	buildPosAppRecoveryLocation,
	resolvePosAppNormalizedPath,
} from "./loader-utils";

const POSAPP_BASE_PATH = "/app/posapp";
const VERSION_ENDPOINT = "/assets/posawesome/dist/js/version.json";
const CSS_URL = "/assets/posawesome/dist/js/posawesome.css";
const CSS_LINK_ID = "posa-posapp-css";
const OFFLINE_INDEX_URL = "/assets/posawesome/dist/js/offline/index.js";

const getBundlePath = (version: string) =>
	`/assets/posawesome/dist/js/posawesome.js?v=${encodeURIComponent(version)}`;

function recordPendingBundleActivation(version: string) {
	if (typeof window === "undefined" || !version) {
		return;
	}
	try {
		window.sessionStorage.setItem(
			"posa_pending_bundle_activation",
			version,
		);
	} catch {
		// Session storage can be unavailable in restricted browser contexts.
	}
}

declare global {
	interface Window {
		__posawesomeBundlePromise?: Promise<BootAssetResult>;
		__posawesomeBundleVersion?: string;
		startPosBoot?: (options?: { pageRef?: any }) => Promise<unknown>;
	}
}

function normalizePosAppPath(): boolean {
	if (typeof window === "undefined" || !window.location) {
		return false;
	}

	const { pathname, search, hash } = window.location;
	const normalizedPath = resolvePosAppNormalizedPath(
		pathname,
		POSAPP_BASE_PATH,
	);
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
		normalized.includes("importing a module script failed") ||
		(normalized.includes("requested module") &&
			normalized.includes("does not provide an export named"))
	);
}

async function fetchLatestBuildVersion(): Promise<string | null> {
	const payload = await fetchBuildMetadata(true);
	return extractBuildVersion(payload);
}

async function fetchBuildMetadata(
	forceRefresh = false,
): Promise<BuildMetadata | null> {
	try {
		const response = await fetch(`${VERSION_ENDPOINT}?t=${Date.now()}`, {
			cache: "no-store",
		});
		if (!response.ok) {
			return null;
		}
		return await response.json();
	} catch {
		return null;
	}
}

function extractBuildVersion(payload: BuildMetadata | null): string | null {
	const version = payload?.version || payload?.buildVersion;
	return typeof version === "string" && version.trim().length
		? version.trim()
		: null;
}

function bootFailure(
	code: BootFailure["code"],
	phase: BootFailure["phase"],
	error: unknown,
): BootFailure {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: String(error || "POS asset load failed");
	return { code, phase, message, error };
}

function buildVersionedAssetUrl(assetPath: string, version?: string | null) {
	return version
		? `${assetPath}?v=${encodeURIComponent(version)}`
		: assetPath;
}

function resolveBuildAssetUrl(
	payload: BuildMetadata | null,
	assetKey: string,
	fallbackPath: string,
	version: string | null = null,
) {
	const resolvedPath = payload?.assets?.[assetKey];
	if (typeof resolvedPath === "string" && resolvedPath.trim().length) {
		return resolvedPath.trim();
	}
	return buildVersionedAssetUrl(fallbackPath, version);
}

function ensureStylesheetLoaded(
	metadata: BuildMetadata | null,
	version: string | null,
) {
	if (typeof document === "undefined") {
		return;
	}

	const requestedVersion = version || "";
	const href = resolveBuildAssetUrl(metadata, "css", CSS_URL, version);
	const existingLink = document.getElementById(CSS_LINK_ID);
	if (
		existingLink &&
		existingLink.getAttribute("data-build-version") === requestedVersion
	) {
		return;
	}

	existingLink?.remove();
	const link = document.createElement("link");
	link.id = CSS_LINK_ID;
	link.rel = "stylesheet";
	link.href = href;
	link.setAttribute("data-build-version", requestedVersion);
	document.head.appendChild(link);
}

export async function importPosAwesomeBundle(
	metadata: BuildMetadata | null = null,
): Promise<BootAssetResult> {
	const initialVersion = __BUILD_VERSION__;
	const metadataVersion = extractBuildVersion(metadata);
	const preferredVersion = metadataVersion || initialVersion;
	const preferredUrl = resolveBuildAssetUrl(
		metadata,
		"posawesome",
		"/assets/posawesome/dist/js/posawesome.js",
		preferredVersion,
	);
	try {
		const module = await import(
			/* @vite-ignore */ preferredUrl
		);
		if (preferredVersion && preferredVersion !== initialVersion) {
			recordPendingBundleActivation(preferredVersion);
		}
		return { ok: true, module, version: preferredVersion };
	} catch (firstError) {
		const latestVersion = await fetchLatestBuildVersion();
		if (latestVersion && latestVersion !== preferredVersion) {
			try {
				const reloadedBundle = await import(
					/* @vite-ignore */
					getBundlePath(latestVersion)
				);
				recordPendingBundleActivation(latestVersion);
				return {
					ok: true,
					module: reloadedBundle,
					version: latestVersion,
				};
			} catch (retryError) {
				return {
					ok: false,
					failure: bootFailure(
						isDynamicImportFailure(retryError)
							? "CHUNK_LOAD_FAILED"
							: "LOAD_ASSETS_FAILED",
						"LOAD_ASSETS",
						retryError,
					),
				};
			}
		}

		return {
			ok: false,
			failure: bootFailure(
				isDynamicImportFailure(firstError)
					? "CHUNK_LOAD_FAILED"
					: "LOAD_ASSETS_FAILED",
				"LOAD_ASSETS",
				firstError,
			),
		};
	}
}

async function loadPosAssets(
	metadata: BuildMetadata | null,
): Promise<BootAssetResult> {
	const buildVersion = extractBuildVersion(metadata);
	ensureStylesheetLoaded(metadata, buildVersion);
	if (
		window.__posawesomeBundlePromise &&
		typeof window.__posawesomeBundlePromise.then === "function" &&
		window.__posawesomeBundleVersion === (buildVersion || "")
	) {
		return window.__posawesomeBundlePromise;
	}
	window.__posawesomeBundleVersion = buildVersion || "";
	window.__posawesomeBundlePromise = importPosAwesomeBundle(metadata);
	return window.__posawesomeBundlePromise;
}

async function performAssetRecovery() {
	try {
		if (
			typeof navigator !== "undefined" &&
			navigator.serviceWorker &&
			typeof navigator.serviceWorker.getRegistrations === "function"
		) {
			const registrations =
				await navigator.serviceWorker.getRegistrations();
			await Promise.all(
				registrations.map(async (registration) => {
					registration.active?.postMessage({
						type: "CLIENT_FORCE_UNREGISTER",
					});
					registration.waiting?.postMessage({
						type: "CLIENT_FORCE_UNREGISTER",
					});
					registration.installing?.postMessage({
						type: "CLIENT_FORCE_UNREGISTER",
					});
					await registration.unregister();
				}),
			);
		}
	} catch (err) {
		console.warn(
			"POS App recovery failed during service worker cleanup",
			err,
		);
	}

	try {
		if (typeof caches !== "undefined") {
			const cacheKeys = await caches.keys();
			await Promise.all(cacheKeys.map((key) => caches.delete(key)));
		}
	} catch (err) {
		console.warn("POS App recovery failed during Cache API cleanup", err);
	}

	try {
		window.localStorage.removeItem("posawesome_version");
		window.localStorage.removeItem("posawesome_update_dismissed");
		window.localStorage.removeItem("posawesome_update_last_check");
		window.sessionStorage.removeItem("posawesome_update_snooze_until");
	} catch (err) {
		console.warn("POS App recovery failed during storage cleanup", err);
	}
}

function redirectToBootRecovery(param: string) {
	if (typeof window === "undefined") {
		return;
	}

	window.location.replace(
		buildPosAppRecoveryLocation(
			window.location,
			param,
			Date.now(),
			POSAPP_BASE_PATH,
		),
	);
}

async function mountShell({
	pageRef,
	assets,
}: {
	pageRef?: any;
	assets: Extract<BootAssetResult, { ok: true }>;
}) {
	const module = assets.module;
	if (module && typeof module.mountPosApp === "function") {
		return module.mountPosApp(pageRef);
	}

	if (frappe.PosApp && frappe.PosApp.posapp) {
		if (!pageRef?.$PosApp) {
			pageRef.$PosApp = new frappe.PosApp.posapp(pageRef);
		}
		return pageRef?.$PosApp;
	}

	throw new Error("Timed out waiting for frappe.PosApp.posapp");
}

function setupDeskPageChrome(pageRef?: any) {
	$("div.navbar-fixed-top").find(".container").css("padding", "0");
	if (!document.getElementById("posa-vuetify-css")) {
		$("head").append(
			"<link id='posa-vuetify-css' href='/assets/posawesome/node_modules/vuetify/dist/vuetify.min.css' rel='stylesheet'>",
		);
	}

	if (
		!pageRef ||
		!frappe.realtime ||
		typeof frappe.realtime.on !== "function"
	) {
		return;
	}

	if (
		pageRef?._posaTaxInclusiveHandler &&
		frappe.realtime &&
		typeof frappe.realtime.off === "function"
	) {
		frappe.realtime.off(
			"pos_profile_registered",
			pageRef._posaTaxInclusiveHandler,
		);
	}

	pageRef._posaTaxInclusiveHandler = () => {
		const posProfile = pageRef.$PosApp && pageRef.$PosApp.pos_profile;
		if (!posProfile) {
			console.error("POS Profile is not set.");
			return;
		}

		const cacheKey = "posa_tax_inclusive";
		const applySetting = (taxInclusive: unknown) => {
			const totalAmountField = document.getElementById(
				"input-v-25",
			) as HTMLInputElement | null;
			const grandTotalField = document.getElementById(
				"input-v-29",
			) as HTMLInputElement | null;
			if (totalAmountField && grandTotalField) {
				totalAmountField.value = taxInclusive
					? grandTotalField.value
					: "";
			}
		};
		const updateOfflineSetting = (value: unknown) => {
			void fetchBuildMetadata()
				.then(
					(payload) =>
						import(
							/* @vite-ignore */ resolveBuildAssetUrl(
								payload,
								"offlineIndex",
								OFFLINE_INDEX_URL,
							)
						),
				)
				.then((m) => m?.setTaxInclusiveSetting?.(value))
				.catch(() => {});
		};
		const fetchAndCache = () => {
			frappe.call({
				method: "posawesome.posawesome.api.utilities.get_pos_profile_tax_inclusive",
				args: { pos_profile: posProfile },
				callback(response: any) {
					if (response.message === undefined) {
						console.error(
							"Error fetching POS Profile or POS Profile not found.",
						);
						return;
					}
					try {
						localStorage.setItem(
							cacheKey,
							JSON.stringify(response.message),
						);
					} catch (err) {
						console.warn(
							"Failed to cache tax inclusive setting",
							err,
						);
					}
					applySetting(response.message);
					updateOfflineSetting(response.message);
				},
			});
		};

		if (navigator.onLine) {
			fetchAndCache();
			return;
		}

		const cachedValue = localStorage.getItem(cacheKey);
		if (cachedValue !== null) {
			try {
				const parsed = JSON.parse(cachedValue);
				applySetting(parsed);
				updateOfflineSetting(parsed);
				return;
			} catch (error) {
				console.warn(
					"Failed to parse cached tax inclusive value",
					error,
				);
			}
		}
		fetchAndCache();
	};
	frappe.realtime.on(
		"pos_profile_registered",
		pageRef._posaTaxInclusiveHandler,
	);
}

if (typeof window !== "undefined" && !normalizePosAppPath()) {
	window.startPosBoot = (options = {}) =>
		startPosBoot({
			pageRef: options.pageRef,
			loadVersion: fetchBuildMetadata,
			loadAssets: loadPosAssets,
			mountShell,
			initStorage: async ({ assets }) => {
				await assets.module?.initPosStorage?.();
			},
			runBootSync: async ({ assets }) => {
				await assets.module?.runPosBootSync?.();
				setupDeskPageChrome(options.pageRef);
			},
			performAssetRecovery,
			redirect: redirectToBootRecovery,
		});
}
