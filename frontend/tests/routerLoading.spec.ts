// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
	createPosAppRouter,
	resolveRouteLoadFailureAction,
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

	it("routes offline chunk failures to an explicit unavailable state", () => {
		expect(
			resolveRouteLoadFailureAction({
				error: new TypeError(
					"Failed to fetch dynamically imported module: /assets/payments.js",
				),
				isOnline: false,
				pendingRouteFullPath: "/payments?draft=1",
			}),
		).toEqual({
			type: "offline-fallback",
			target: "/payments?draft=1",
		});
	});

	it("keeps online chunk failures on the reload recovery path", () => {
		expect(
			resolveRouteLoadFailureAction({
				error: new TypeError(
					"Failed to fetch dynamically imported module: /assets/payments.js",
				),
				isOnline: true,
				pendingRouteFullPath: "/payments",
			}),
		).toEqual({
			type: "chunk-recovery",
		});
	});
});
