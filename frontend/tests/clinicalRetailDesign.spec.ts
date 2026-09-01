import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(testsDir, "..");
const source = (...segments: string[]) =>
	readFileSync(path.join(frontendDir, "src", "posapp", ...segments), "utf8");

const relativeLuminance = (hex: string) => {
	const channels = hex
		.replace("#", "")
		.match(/.{2}/g)!
		.map((channel) => Number.parseInt(channel, 16) / 255)
		.map((channel) =>
			channel <= 0.04045
				? channel / 12.92
				: Math.pow((channel + 0.055) / 1.055, 2.4),
		);
	return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastWithWhite = (hex: string) =>
	1.05 / (relativeLuminance(hex) + 0.05);

describe("Clinical-retail UI foundation", () => {
	it("keeps primary and semantic action colors at WCAG AA text contrast", () => {
		for (const color of [
			"#006d72",
			"#0b7a75",
			"#c4511b",
			"#16784a",
			"#a94f08",
			"#b3261e",
			"#0b67a3",
		]) {
			expect(contrastWithWhite(color), color).toBeGreaterThanOrEqual(4.5);
		}
	});

	it("defines shared control, focus, elevation, motion, and touch contracts", () => {
		const theme = source("styles", "theme.css");

		expect(theme).toContain("--pos-control-height: 44px");
		expect(theme).toContain("--pos-focus-ring: #0b7a75");
		expect(theme).toContain("--pos-elevation-3:");
		expect(theme).toContain("@media (pointer: coarse)");
		expect(theme).toContain("--pos-control-height: 48px");
		expect(theme).toContain("@media (prefers-reduced-motion: reduce)");
	});

	it("uses restrained cashier action hierarchy outside rugged counter grid", () => {
		const actions = source(
			"components",
			"pos",
			"invoice",
			"InvoiceActionButtons.vue",
		);

		expect(actions).toContain("summary-btn--utility");
		expect(actions).toContain("summary-btn--danger");
		expect(actions).toContain("background: var(--pos-success) !important");
		expect(actions).not.toContain(
			"linear-gradient(135deg, #4caf50, #45a049)",
		);
	});
});
