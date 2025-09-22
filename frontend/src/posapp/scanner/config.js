export const DEFAULT_SCANNER_CONFIG = Object.freeze({
	enabled: true,
	prefix: "",
	suffix: "Enter",
	timeGapScannerMs: 25,
	timeGapHumanMs: 80,
	idleCloseMs: 80,
	enableChecksumValidation: true,
	normalizeUpcToEan13: true,
	dedupCooldownMs: 200,
	bulkMode: false,
	feedbackToasts: true,
});

function toNumber(value, fallback) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function trimVisible(value) {
	if (typeof value !== "string") {
		return value;
	}
	return value.replace(/^[\u0020\u00a0]+|[\u0020\u00a0]+$/g, "");
}

export function resolveScannerConfig(profileSettings = {}, overrides = {}) {
	const profileScanner = profileSettings?.scanner || {};
	const merged = {
		...DEFAULT_SCANNER_CONFIG,
		...(typeof profileScanner === "object" ? profileScanner : {}),
		...(typeof overrides === "object" ? overrides : {}),
	};

	merged.timeGapScannerMs = toNumber(merged.timeGapScannerMs, DEFAULT_SCANNER_CONFIG.timeGapScannerMs);
	merged.timeGapHumanMs = toNumber(merged.timeGapHumanMs, DEFAULT_SCANNER_CONFIG.timeGapHumanMs);
	merged.idleCloseMs = toNumber(merged.idleCloseMs, DEFAULT_SCANNER_CONFIG.idleCloseMs);
	merged.dedupCooldownMs = toNumber(merged.dedupCooldownMs, DEFAULT_SCANNER_CONFIG.dedupCooldownMs);

	if (typeof merged.prefix !== "string") {
		merged.prefix = merged.prefix == null ? "" : String(merged.prefix);
	}

	if (typeof merged.suffix !== "string") {
		merged.suffix = merged.suffix == null ? "" : String(merged.suffix);
	}

	merged.prefix = trimVisible(merged.prefix);
	merged.suffix = trimVisible(merged.suffix);

	merged.enabled = merged.enabled !== false;
	merged.enableChecksumValidation = merged.enableChecksumValidation !== false;
	merged.normalizeUpcToEan13 = merged.normalizeUpcToEan13 !== false;
	merged.bulkMode = merged.bulkMode === true;
	merged.feedbackToasts = merged.feedbackToasts !== false;

	return merged;
}
