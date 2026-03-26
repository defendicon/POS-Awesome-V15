// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	BOOT_STAGE_WEIGHTS,
	initLoadingSources,
	loadingState,
	markSourceLoaded,
	resetLoadingState,
	setBootStageProgress,
	setSourceProgress,
} from "../src/posapp/utils/loading";

describe("boot loading state", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
			callback(300);
			return 1;
		};
		resetLoadingState();
	});

	it("calculates weighted progress from boot stages", () => {
		setBootStageProgress("check_version", 100);
		setBootStageProgress("refresh_assets", 100);
		setBootStageProgress("load_profile", 50);

		expect(BOOT_STAGE_WEIGHTS).toEqual({
			check_version: 10,
			refresh_assets: 15,
			load_profile: 20,
			load_items: 35,
			load_customers: 15,
			finalize: 5,
		});
		expect(loadingState.progress).toBe(35);
		expect(loadingState.message).toBe("Loading POS profile");
		expect(loadingState.detail).toBe("Fetching register and profile data");
	});

	it("maps legacy loading sources into boot stages", () => {
		initLoadingSources(["init", "items", "customers"]);

		setSourceProgress("items", 40);
		expect(loadingState.currentStage).toBe("load_items");
		expect(loadingState.message).toBe("Loading product catalog");

		markSourceLoaded("customers");
		expect(loadingState.stages.load_customers).toBe(100);
	});
});
