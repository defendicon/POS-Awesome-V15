import { describe, expect, it, vi } from "vitest";

import { createDefaultLayoutStartup } from "../src/posapp/domain/startup/defaultLayoutStartup";

describe("createDefaultLayoutStartup", () => {
	it("marks init ready when startup reaches a ready state", async () => {
		const markInitLoaded = vi.fn();
		const startup = createDefaultLayoutStartup({
			runRegisterStartup: vi.fn(() => ({
				status: "ready",
				data: {
					profileName: "Main POS",
					profileModified: "2026-04-08 10:00:00",
					openingShiftName: "POS-OPEN-1",
					openingShiftUser: "test@example.com",
				},
				warningCodes: [],
			})),
			startCustomers: vi.fn(async () => ({
				started: true,
				ready: true,
			})),
			startItems: vi.fn(async () => ({
				started: true,
				ready: true,
			})),
			markInitLoaded,
		});

		await startup.start();

		expect(startup.state.value.stage).toBe("ready");
		expect(markInitLoaded).toHaveBeenCalledTimes(1);
	});

	it("keeps init blocked and exposes blocker metadata when catalog startup fails", async () => {
		const markInitLoaded = vi.fn();
		const startup = createDefaultLayoutStartup({
			runRegisterStartup: vi.fn(() => ({
				status: "ready",
				data: {
					profileName: "Main POS",
					profileModified: "2026-04-08 10:00:00",
					openingShiftName: "POS-OPEN-1",
					openingShiftUser: "test@example.com",
				},
				warningCodes: [],
			})),
			startCustomers: vi.fn(async () => ({
				started: true,
				ready: true,
			})),
			startItems: vi.fn(async () => ({
				started: true,
				ready: false,
			})),
			markInitLoaded,
		});

		await startup.start();

		expect(startup.state.value.stage).toBe("blocked");
		expect(startup.state.value.blocker).toEqual({
			code: "items_pending",
			summary: "Items startup is still in progress.",
		});
		expect(markInitLoaded).not.toHaveBeenCalled();
	});
});
