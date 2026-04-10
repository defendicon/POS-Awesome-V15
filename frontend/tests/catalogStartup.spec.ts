import { describe, expect, it, vi } from "vitest";

import { runCatalogStartup } from "../src/posapp/domain/startup/catalogStartup";

describe("runCatalogStartup", () => {
	it("returns ready when both items and customers startup complete", async () => {
		const result = await runCatalogStartup({
			startCustomers: vi.fn(async () => ({
				started: true,
				ready: true,
			})),
			startItems: vi.fn(async () => ({
				started: true,
				ready: true,
			})),
		});

		expect(result.status).toBe("ready");
		expect(result.sources).toEqual({
			customers: "ready",
			items: "ready",
		});
		expect(result.blocker).toBeNull();
	});

	it("returns blocked with items_pending when customers finish first", async () => {
		const result = await runCatalogStartup({
			startCustomers: vi.fn(async () => ({
				started: true,
				ready: true,
			})),
			startItems: vi.fn(async () => ({
				started: true,
				ready: false,
			})),
		});

		expect(result.status).toBe("blocked");
		expect(result.sources).toEqual({
			customers: "ready",
			items: "pending",
		});
		expect(result.blocker).toEqual({
			code: "items_pending",
			summary: "Items startup is still in progress.",
		});
	});
});
