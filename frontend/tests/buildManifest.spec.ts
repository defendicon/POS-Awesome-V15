import { describe, expect, it } from "vitest";

import { buildVersionPayload, getEntryFileName } from "../build-manifest.js";

describe("build manifest helpers", () => {
	it("hashes every entry filename so deploys cannot reuse stale URLs", () => {
		expect(getEntryFileName({ name: "posawesome" })).toBe("[name]-[hash].js");
		expect(getEntryFileName({ name: "loader" })).toBe("[name]-[hash].js");
		expect(getEntryFileName({ name: "offline/index" })).toBe(
			"[name]-[hash].js",
		);
	});

	it("publishes the actual hashed entry filenames from the rollup bundle", () => {
		const payload = buildVersionPayload("build-2000", {
			"loader-XYZ123.js": {
				type: "chunk",
				name: "loader",
				fileName: "loader-XYZ123.js",
			},
			"posawesome-AAA999.js": {
				type: "chunk",
				name: "posawesome",
				fileName: "posawesome-AAA999.js",
			},
			"offline/index-AbCd1234.js": {
				type: "chunk",
				name: "offline/index",
				fileName: "offline/index-AbCd1234.js",
			},
			"style-Z9Z9.css": {
				type: "asset",
				name: "style.css",
				fileName: "style-Z9Z9.css",
				source: "body{}",
			},
		});

		expect(payload).toEqual({
			version: "build-2000",
			assets: {
				loader: "/assets/posawesome/dist/js/loader-XYZ123.js?v=build-2000",
				posawesome:
					"/assets/posawesome/dist/js/posawesome-AAA999.js?v=build-2000",
				css: "/assets/posawesome/dist/js/style-Z9Z9.css?v=build-2000",
				offlineIndex:
					"/assets/posawesome/dist/js/offline/index-AbCd1234.js",
			},
		});
	});

	it("falls back to legacy shell paths + cache-busts when bundle lookup fails", () => {
		const payload = buildVersionPayload("build with spaces", {});

		expect(payload.assets.loader).toBe(
			"/assets/posawesome/dist/js/loader.js?v=build%20with%20spaces",
		);
		expect(payload.assets.posawesome).toBe(
			"/assets/posawesome/dist/js/posawesome.js?v=build%20with%20spaces",
		);
		expect(payload.assets.css).toBe(
			"/assets/posawesome/dist/js/posawesome.css?v=build%20with%20spaces",
		);
	});
});
