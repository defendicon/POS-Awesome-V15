import {
	isScanCandidate,
	sanitizeClipboardText,
} from "../../../../utils/keyboardScan.js";

export interface ClipboardScanClassification {
	sanitizedText: string;
	shouldPreventDefault: boolean;
	shouldScan: boolean;
}

export const classifyClipboardScanText = (
	text: string,
	minLength: number,
): ClipboardScanClassification => {
	const sanitizedText = sanitizeClipboardText(text);

	if (!sanitizedText) {
		return {
			sanitizedText,
			shouldPreventDefault: true,
			shouldScan: false,
		};
	}

	const shouldScan = isScanCandidate(sanitizedText, minLength);
	return {
		sanitizedText,
		shouldPreventDefault: shouldScan,
		shouldScan,
	};
};
