// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { resolveActiveVersionTransition } from "../src/sw-updater";

describe("sw updater version transitions", () => {
	it("keeps routine controller changes passive when the runtime bundle is still older", () => {
		expect(
			resolveActiveVersionTransition({
				version: "build-2000",
				runtimeVersion: "build-1000",
				lastKnownActiveVersion: "build-1000",
				reloadScheduled: false,
			}),
		).toEqual({
			nextLastKnownActiveVersion: "build-2000",
			syncCurrentVersion: false,
			syncAvailableVersion: true,
			markUpdateApplied: false,
			reloadWindow: false,
			clearReloadState: false,
		});
	});

	it("still hard-reloads when an explicit apply happens after a passive controller switch", () => {
		expect(
			resolveActiveVersionTransition({
				version: "build-2000",
				runtimeVersion: "build-1000",
				lastKnownActiveVersion: "build-2000",
				reloadScheduled: true,
			}),
		).toEqual({
			nextLastKnownActiveVersion: "build-2000",
			syncCurrentVersion: false,
			syncAvailableVersion: false,
			markUpdateApplied: true,
			reloadWindow: true,
			clearReloadState: false,
		});
	});

	it("clears reload state instead of looping when the controller version matches the runtime", () => {
		expect(
			resolveActiveVersionTransition({
				version: "build-2000",
				runtimeVersion: "build-2000",
				lastKnownActiveVersion: "build-2000",
				reloadScheduled: true,
			}),
		).toEqual({
			nextLastKnownActiveVersion: "build-2000",
			syncCurrentVersion: true,
			syncAvailableVersion: false,
			markUpdateApplied: false,
			reloadWindow: false,
			clearReloadState: true,
		});
	});
});
