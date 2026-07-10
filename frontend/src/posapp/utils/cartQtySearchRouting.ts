const SEARCH_TRIGGER_KEY_PATTERN = /^[\p{L}/\\]$/u;

function isPlainKeyEvent(event: KeyboardEvent) {
	return Boolean(
		event &&
			!event.defaultPrevented &&
			!event.repeat &&
			!event.isComposing &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.altKey,
	);
}

export function shouldRouteCartQtyKeyToItemSearch(event: KeyboardEvent) {
	if (!isPlainKeyEvent(event)) {
		return false;
	}

	return SEARCH_TRIGGER_KEY_PATTERN.test(event.key || "");
}
