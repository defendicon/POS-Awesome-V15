import { describe, expect, it } from "vitest";

import { classifyClipboardScanText } from "../src/posapp/composables/pos/items/scannerInput/clipboardScan";

describe("classifyClipboardScanText", () => {
	it("blocks and scans sanitized numeric clipboard text that meets the scan length", () => {
		expect(classifyClipboardScanText(" 123 456\n789012 ", 12)).toEqual({
			sanitizedText: "123456789012",
			shouldPreventDefault: true,
			shouldScan: true,
		});
	});

	it("blocks whitespace-only clipboard text without scanning", () => {
		expect(classifyClipboardScanText(" \n\t ", 12)).toEqual({
			sanitizedText: "",
			shouldPreventDefault: true,
			shouldScan: false,
		});
	});

	it("leaves non-scan clipboard text for normal paste handling", () => {
		expect(classifyClipboardScanText("12345", 12)).toEqual({
			sanitizedText: "12345",
			shouldPreventDefault: false,
			shouldScan: false,
		});
		expect(classifyClipboardScanText("ABC123456789012", 12)).toEqual({
			sanitizedText: "ABC123456789012",
			shouldPreventDefault: false,
			shouldScan: false,
		});
	});
});
