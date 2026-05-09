const DEBUG_STORAGE_KEY = "posa_debug";

export function isPosDebugEnabled() {
	if (typeof window === "undefined") {
		return false;
	}
	return (
		window.localStorage?.getItem(DEBUG_STORAGE_KEY) === "1" ||
		(window as any).POSA_DEBUG === true
	);
}

export function debugLog(...args: any[]) {
	if (isPosDebugEnabled()) {
		console.log(...args);
	}
}
