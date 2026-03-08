import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const themePath = path.resolve(__dirname, "../src/posapp/styles/theme.css");

function extractBlock(css, markerRegex) {
	const marker = css.match(markerRegex);
	if (!marker || marker.index === undefined) return "";
	const start = marker.index + marker[0].length;
	let depth = 1;
	let i = start;
	while (i < css.length && depth > 0) {
		if (css[i] === "{") depth += 1;
		if (css[i] === "}") depth -= 1;
		i += 1;
	}
	return css.slice(start, i - 1);
}

function parseVars(block) {
	const vars = new Map();
	const lines = block.split("\n");
	for (const line of lines) {
		const match = line.match(/(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/);
		if (match) {
			vars.set(match[1].trim(), match[2].trim());
		}
	}
	return vars;
}

function hexToRgb(hex) {
	const normalized = hex.replace("#", "").trim();
	if (![3, 6].includes(normalized.length)) return null;
	const full =
		normalized.length === 3
			? normalized
					.split("")
					.map((c) => c + c)
					.join("")
			: normalized;
	const int = Number.parseInt(full, 16);
	if (!Number.isFinite(int)) return null;
	return {
		r: (int >> 16) & 255,
		g: (int >> 8) & 255,
		b: int & 255,
	};
}

function luminance({ r, g, b }) {
	const linear = [r, g, b].map((v) => {
		const c = v / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(fgHex, bgHex) {
	const fg = hexToRgb(fgHex);
	const bg = hexToRgb(bgHex);
	if (!fg || !bg) return null;
	const l1 = luminance(fg);
	const l2 = luminance(bg);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

function auditTheme(name, vars) {
	const checks = [
		{ fg: "--pos-text-primary", bg: "--pos-bg-primary", min: 4.5, label: "Primary text on main bg" },
		{ fg: "--pos-text-secondary", bg: "--pos-bg-primary", min: 4.5, label: "Secondary text on main bg" },
		{ fg: "--pos-text-primary", bg: "--pos-surface", min: 4.5, label: "Primary text on surface" },
		{ fg: "--pos-primary", bg: "--pos-bg-primary", min: 3, label: "Primary accent on main bg" },
	];

	console.log(`\n[${name}]`);
	let passed = true;
	for (const check of checks) {
		const fg = vars.get(check.fg);
		const bg = vars.get(check.bg);
		const ratio = fg && bg ? contrastRatio(fg, bg) : null;
		if (ratio == null) {
			console.log(`- ${check.label}: SKIP (missing/unsupported color format)`);
			continue;
		}
		const ok = ratio >= check.min;
		if (!ok) passed = false;
		console.log(
			`- ${check.label}: ${ratio.toFixed(2)} (min ${check.min}) ${ok ? "PASS" : "FAIL"}`,
		);
	}
	return passed;
}

async function run() {
	const css = await readFile(themePath, "utf8");
	const rootBlock = extractBlock(css, /:root\s*\{/);
	const darkBlock = extractBlock(css, /\.v-theme--dark\s*\{/);

	const rootVars = parseVars(rootBlock);
	const darkVars = parseVars(darkBlock);

	const rootPass = auditTheme("Light Theme", rootVars);
	const darkPass = auditTheme("Dark Theme", darkVars);

	if (!rootPass || !darkPass) {
		process.exitCode = 1;
		console.log("\nContrast audit failed. Review the failing color pairs above.");
		return;
	}
	console.log("\nContrast audit passed.");
}

run().catch((error) => {
	console.error("Contrast audit error:", error);
	process.exitCode = 1;
});
