import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readServiceWorkerSource() {
	const thisFile = fileURLToPath(import.meta.url);
	const testsDir = path.dirname(thisFile);
	return readFileSync(path.resolve(testsDir, "../../posawesome/www/sw.js"), "utf8");
}

describe("service worker precache", () => {
	it("preloads build-manifest font assets for offline icon rendering", () => {
		const source = readServiceWorkerSource();

		expect(source).toContain("assets.fonts");
		expect(source).toContain("...fontAssets");
		expect(source).toContain('"font"');
	});
});
