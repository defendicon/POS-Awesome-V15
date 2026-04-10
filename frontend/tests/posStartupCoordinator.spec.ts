// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createPosStartupCoordinator } from "../src/posapp/domain/startup/posStartupCoordinator";

describe("createPosStartupCoordinator", () => {
	it("moves to ready when register and catalog startup both succeed", async () => {
		const coordinator = createPosStartupCoordinator({
			runRegisterStartup: vi.fn(async () => ({
				status: "ready",
				data: {
					profileName: "Main POS",
				},
			})),
			runCatalogStartup: vi.fn(async () => ({
				status: "ready",
				sources: {
					items: "ready",
					customers: "ready",
				},
			})),
		});

		await coordinator.start();

		expect(coordinator.state.value.stage).toBe("ready");
		expect(coordinator.state.value.blocker).toBeNull();
		expect(coordinator.state.value.timeline.map((event) => event.stage)).toEqual([
			"register",
			"catalog",
			"ready",
		]);
	});

	it("captures a blocked state when catalog startup reports a blocker", async () => {
		const coordinator = createPosStartupCoordinator({
			runRegisterStartup: vi.fn(async () => ({
				status: "ready",
				data: {
					profileName: "Main POS",
				},
			})),
			runCatalogStartup: vi.fn(async () => ({
				status: "blocked",
				blocker: {
					code: "catalog_not_started",
					summary: "Catalog startup did not begin.",
				},
				sources: {
					items: "idle",
					customers: "idle",
				},
			})),
		});

		await coordinator.start();

		expect(coordinator.state.value.stage).toBe("blocked");
		expect(coordinator.state.value.blocker).toEqual({
			code: "catalog_not_started",
			summary: "Catalog startup did not begin.",
		});
		expect(coordinator.state.value.timeline.at(-1)?.stage).toBe("blocked");
	});
});
