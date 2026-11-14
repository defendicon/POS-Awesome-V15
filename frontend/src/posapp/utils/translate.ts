/** Frappe expects a replacement array as its second translation argument. */
export function translate(text: string, args: unknown[] | unknown = []) {
	const replacements = Array.isArray(args) ? args : [args];
	const translated =
		typeof window.__ === "function" ? window.__(text, replacements) : text;
	// Standalone/offline translation fallbacks may leave placeholders untouched.
	return translated.replace(/\{(\d+)\}/g, (match, index) =>
		Number(index) < replacements.length
			? String(replacements[Number(index)] ?? "")
			: match,
	);
}
