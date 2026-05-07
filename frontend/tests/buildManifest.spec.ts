import { describe, expect, it } from "vitest";

import { buildVersionPayload, getEntryFileName } from "../build-manifest.js";

describe("build manifest helpers", () => {
	it("keeps primary shell entries stable while hashing auxiliary entries", () => {
		expect(getEntryFileName({ name: "posawesome" })).toBe("[name].js");
		expect(getEntryFileName({ name: "loader" })).toBe("[name].js");
		expect(getEntryFileName({ name: "offline/index" })).toBe(
			"[name]-[hash].js",
		);
	});

	it("publishes the hashed offline entry path in version metadata", () => {
		const payload = buildVersionPayload("build-2000", {
			"offline/index-AbCd1234.js": {
				type: "chunk",
				name: "offline/index",
				fileName: "offline/index-AbCd1234.js",
			},
		});

		expect(payload).toEqual({
			version: "build-2000",
			assets: {
				loader: "/assets/posawesome/dist/js/loader.js?v=build-2000",
				posawesome:
					"/assets/posawesome/dist/js/posawesome.js?v=build-2000",
				css: "/assets/posawesome/dist/js/posawesome.css?v=build-2000",
				offlineIndex:
					"/assets/posawesome/dist/js/offline/index-AbCd1234.js",
			},
		});
	});

	it("cache-busts stable shell asset URLs with the build version", () => {
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
