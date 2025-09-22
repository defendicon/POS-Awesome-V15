const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

function onlyDigits(value) {
	return typeof value === "string" && /^\d+$/.test(value);
}

export function computeGtinCheckDigit(body) {
	if (!onlyDigits(body)) {
		return null;
	}
	const digits = body.split("").map((d) => Number(d));
	let sum = 0;
	for (let i = digits.length - 1, pos = 0; i >= 0; i -= 1, pos += 1) {
		const factor = pos % 2 === 0 ? 3 : 1;
		sum += digits[i] * factor;
	}
	const mod = sum % 10;
	return mod === 0 ? 0 : 10 - mod;
}

export function validateGtin(value) {
	if (!onlyDigits(value) || !GTIN_LENGTHS.has(value.length)) {
		return false;
	}
	const checkDigit = Number(value.slice(-1));
	const body = value.slice(0, -1);
	const expected = computeGtinCheckDigit(body);
	return expected === checkDigit;
}

export function normalizeUpcToEan13(value) {
	if (!onlyDigits(value) || value.length !== 12) {
		return value;
	}
	return `0${value}`;
}

export function guessSymbology(raw) {
	if (typeof raw !== "string" || !raw) {
		return "unknown";
	}
	const trimmed = raw.trim();
	if (onlyDigits(trimmed)) {
		if (trimmed.length === 8) return "EAN-8";
		if (trimmed.length === 12) return "UPC-A";
		if (trimmed.length === 13) return "EAN-13";
		if (trimmed.length === 14) return "ITF-14";
	}
	if (/^\(\d{2}\)/.test(trimmed)) {
		return "GS1-128";
	}
	if (/^[A-Z0-9\-\.\$/\+%]+$/.test(trimmed)) {
		return "Code-39";
	}
	return "Code-128";
}
