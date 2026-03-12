export function isDebugFlagEnabled(flag: string): boolean {
	if (typeof window === "undefined") return false;

	try {
		const params = new URLSearchParams(window.location.search || "");
		if (params.get(flag) === "1") {
			return true;
		}
	} catch (_error) {
		// Ignore malformed URL state and fall back to storage.
	}

	try {
		return window.localStorage?.getItem(flag) === "1";
	} catch (_error) {
		return false;
	}
}
