// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
	createPosAppRouter,
	resolveRouteLoadingMessage,
} from "../src/posapp/router";

describe("route loading messaging", () => {
	afterEach(() => {
		window.history.replaceState({}, "", "/");
	});

	it("uses explicit route loading labels when provided", () => {
		expect(
			resolveRouteLoadingMessage({
				meta: { loadingMessage: "Loading payments..." },
			}),
		).toBe("Loading payments...");
	});

	it("falls back to route title or a generic label", () => {
		expect(
			resolveRouteLoadingMessage({
				meta: { title: "Reports" },
			}),
		).toBe("Loading Reports...");

		expect(resolveRouteLoadingMessage({ meta: {} })).toBe("Loading view...");
	});

	it("keeps route guards compatible with the loading router factory", async () => {
		const { router } = createPosAppRouter();

		expect(router).toBeTruthy();
	});
});
