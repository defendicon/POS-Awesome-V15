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
		if (!databases.length && indexedDB.databases) {
			const infos = await indexedDB.databases();
			databases = infos.map((d) => d.name).filter(Boolean);
		}
		await Promise.all(
			databases.map(
				(dbName) =>
					new Promise((resolve, reject) => {
						const req = indexedDB.deleteDatabase(dbName);
						req.onsuccess = () => resolve();
						req.onblocked = () => resolve();
						req.onerror = () => reject(req.error);
					}),
			),
		);
		console.log("[ClearAllCaches] IndexedDB cleared", databases.length ? databases : "all");
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

export async function clearAllCaches(
	options = {
		confirmBeforeClear: true,
		onSuccess: () => {},
		onError: () => {},
		specificKeys: [],
		specificDatabases: [],
		specificCaches: [],
		skipStorage: [],
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
