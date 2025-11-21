const DEFAULT_INDEXED_DB_NAMES = ["posawesome_offline"];

async function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function clearLocalStorage(keys = []) {
	if (typeof localStorage === "undefined") return;
	try {
		if (keys.length) {
			keys.forEach((k) => localStorage.removeItem(k));
		} else {
			Object.keys(localStorage).forEach((key) => localStorage.removeItem(key));
		}
		console.log("[ClearAllCaches] localStorage cleared", keys.length ? keys : "all");
	} catch (e) {
		console.error("[ClearAllCaches] Failed to clear localStorage", e);
		throw e;
	}
}

export async function clearSessionStorage(keys = []) {
	if (typeof sessionStorage === "undefined") return;
	try {
		if (keys.length) {
			keys.forEach((k) => sessionStorage.removeItem(k));
		} else {
			sessionStorage.clear();
		}
		console.log("[ClearAllCaches] sessionStorage cleared", keys.length ? keys : "all");
	} catch (e) {
		console.error("[ClearAllCaches] Failed to clear sessionStorage", e);
		throw e;
	}
}

export async function clearIndexedDB(databases = []) {
	if (typeof indexedDB === "undefined") return;
	try {
		let targets = Array.isArray(databases) ? [...databases] : [];

		if (!targets.length && indexedDB.databases) {
			try {
				const infos = await indexedDB.databases();
				targets = infos.map((d) => d && d.name).filter(Boolean);
			} catch (enumerationError) {
				console.warn("[ClearAllCaches] Failed to enumerate IndexedDB databases", enumerationError);
			}
		}
		if (!targets.length) {
			targets = [...DEFAULT_INDEXED_DB_NAMES];
		}

		targets = Array.from(new Set(targets.filter(Boolean)));

		await Promise.all(
			targets.map(
				(dbName) =>
					new Promise((resolve, reject) => {
						const req = indexedDB.deleteDatabase(dbName);
						req.onsuccess = () => resolve();
						req.onblocked = () => resolve();
						req.onerror = () => reject(req.error);
					}),
			),
		);
		if (targets.length) {
			console.log("[ClearAllCaches] IndexedDB cleared", targets);
		}
	} catch (e) {
		console.error("[ClearAllCaches] Failed to clear IndexedDB", e);
		throw e;
	}
}

export async function clearCacheAPI(cacheNames = []) {
	if (typeof caches === "undefined") return;
	try {
		if (!cacheNames.length) {
			cacheNames = await caches.keys();
		}
		await Promise.all(cacheNames.map((name) => caches.delete(name)));
		console.log("[ClearAllCaches] Cache API cleared", cacheNames.length ? cacheNames : "all");
	} catch (e) {
		console.error("[ClearAllCaches] Failed to clear Cache API", e);
		throw e;
	}
}

export async function unregisterServiceWorkers(scopes = []) {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
		return;
	}

	const requestedScopes = Array.isArray(scopes) ? scopes.filter(Boolean) : [];

	const unregister = async (registration) => {
		if (!registration) return;
		try {
			const scope = registration.scope;
			await registration.unregister();
			if (registration.active) {
				try {
					registration.active.postMessage({ type: "CLIENT_FORCE_UNREGISTER" });
				} catch (postMessageError) {
					console.warn(
						`[ClearAllCaches] Failed to notify active service worker for scope ${scope}`,
						postMessageError,
					);
				}
			}
			if (registration.waiting) {
				try {
					registration.waiting.postMessage({ type: "CLIENT_FORCE_UNREGISTER" });
				} catch (postMessageError) {
					console.warn(
						`[ClearAllCaches] Failed to notify waiting service worker for scope ${scope}`,
						postMessageError,
					);
				}
			}
			if (registration.installing) {
				try {
					registration.installing.postMessage({ type: "CLIENT_FORCE_UNREGISTER" });
				} catch (postMessageError) {
					console.warn(
						`[ClearAllCaches] Failed to notify installing service worker for scope ${scope}`,
						postMessageError,
					);
				}
			}
			return scope;
		} catch (error) {
			console.error("[ClearAllCaches] Failed to unregister service worker", error);
			throw error;
		}
	};

	try {
		let registrations = [];
		if (navigator.serviceWorker.getRegistrations) {
			registrations = await navigator.serviceWorker.getRegistrations();
		} else if (navigator.serviceWorker.getRegistration) {
			const single = await navigator.serviceWorker.getRegistration();
			if (single) {
				registrations = [single];
			}
		}

		if (requestedScopes.length) {
			registrations = registrations.filter((registration) =>
				requestedScopes.some((scope) => registration.scope.includes(scope)),
			);
			// For scopes that did not have an eager registration fetch, try fetching directly
			const missingScopes = requestedScopes.filter(
				(scope) => !registrations.some((registration) => registration.scope.includes(scope)),
			);
			if (missingScopes.length && navigator.serviceWorker.getRegistration) {
				const fetched = await Promise.all(
					missingScopes.map((scope) =>
						navigator.serviceWorker.getRegistration(scope).catch(() => null),
					),
				);
				registrations.push(...fetched.filter(Boolean));
			}
		}

		if (!registrations.length) {
			return;
		}

		const scopesCleared = (
			await Promise.all(registrations.map((registration) => unregister(registration)))
		).filter(Boolean);

		if (scopesCleared.length) {
			console.log("[ClearAllCaches] Service workers unregistered", scopesCleared);
		}

		// Allow the browser a brief moment to detach controllers before subsequent cache removal
		await delay(100);
	} catch (error) {
		console.error("[ClearAllCaches] Failed during service worker cleanup", error);
		throw error;
	}
}

export async function clearAllCaches(
	options = {
		confirmBeforeClear: true,
		onSuccess: () => {},
		onError: () => {},
		specificKeys: [],
		specificDatabases: [],
		specificCaches: [],
		skipStorage: [],
		skipServiceWorkers: false,
		serviceWorkerScopes: [],
	},
) {
	const opts = Object.assign(
		{
			confirmBeforeClear: true,
			onSuccess: () => {},
			onError: () => {},
			specificKeys: [],
			specificDatabases: [],
			specificCaches: [],
			skipStorage: [],
			skipServiceWorkers: false,
			serviceWorkerScopes: [],
		},
		options || {},
	);

	try {
		if (opts.confirmBeforeClear && typeof window !== "undefined") {
			const confirmMsg = "Are you sure you want to clear application cache?";
			if (!window.confirm(confirmMsg)) {
				return;
			}
		}

		if (!opts.skipServiceWorkers) {
			await unregisterServiceWorkers(opts.serviceWorkerScopes);
		}

		const tasks = [];
		if (!opts.skipStorage.includes("localStorage")) {
			tasks.push(clearLocalStorage(opts.specificKeys));
		}
		if (!opts.skipStorage.includes("sessionStorage")) {
			tasks.push(clearSessionStorage(opts.specificKeys));
		}
		if (!opts.skipStorage.includes("indexedDB")) {
			tasks.push(clearIndexedDB(opts.specificDatabases));
		}
		if (!opts.skipStorage.includes("caches")) {
			tasks.push(clearCacheAPI(opts.specificCaches));
		}

		await Promise.all(tasks);
		opts.onSuccess();
	} catch (e) {
		opts.onError(e);
	}
}

// Attach default UI and keyboard integrations when running in browser
if (typeof window !== "undefined") {
	document.addEventListener("keydown", (e) => {
		if (e.ctrlKey && e.shiftKey && e.code === "KeyR") {
			e.preventDefault();
			clearAllCaches().catch(() => {});
		}
	});

	document.addEventListener("DOMContentLoaded", () => {
		const btn = document.getElementById("clear-cache-btn");
		if (btn) {
			btn.addEventListener("click", () => clearAllCaches().catch(() => {}));
		}
	});
}
