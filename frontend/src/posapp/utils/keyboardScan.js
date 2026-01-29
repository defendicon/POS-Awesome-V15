export const getScanTimestamp = () => {
	return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
};

export const sanitizeClipboardText = (text) => {
	return String(text || "")
		.replace(/\s+/g, "")
		.trim();
};

export const isNumericString = (value) => /^\d+$/.test(value);

export const isScanCandidate = (value, minLength) => {
	return isNumericString(value) && value.length >= minLength;
};

export const shouldResetScanOnInput = (value, buffer) => {
	if (!value) {
		return true;
	}
	if (!isNumericString(value)) {
		return true;
	}
	return Boolean(buffer && value.length < buffer.length);
};

export const isLikelyKeyboardScan = ({ code, duration, minLength, maxDuration, maxInterval }) => {
	if (!code || !isNumericString(code)) {
		return false;
	}

	if (code.length < minLength) {
		return false;
	}

	if (!duration || duration <= 0) {
		return true;
	}

	if (maxDuration && typeof maxDuration === "number" && duration > maxDuration) {
		return false;
	}

	const averageInterval = duration / code.length;
	return averageInterval <= maxInterval;
};

export const isSearchFieldPrimedForScan = (value) => {
	if (!value) {
		return true;
	}
	return /^\d*$/.test(value);
};
