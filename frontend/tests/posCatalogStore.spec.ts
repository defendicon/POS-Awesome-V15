import { describe, expect, it } from "vitest";

import { createPosCatalogStore } from "../src/posapp/domain/catalog/posCatalogStore";

describe("createPosCatalogStore", () => {
	it("tracks catalog loading stages and preferred adaptive view mode", () => {
		const catalog = createPosCatalogStore();

		catalog.markStarting();
		catalog.markStage("loading-items");
		catalog.setPreferredView("cards");
		catalog.markReady();

		expect(catalog.state.value.stage).toBe("ready");
		expect(catalog.state.value.status).toBe("ready");
		expect(catalog.state.value.preferredView).toBe("cards");
		expect(catalog.state.value.blocker).toBeNull();
		expect(catalog.state.value.timeline.map((entry) => entry.stage)).toEqual([
			"starting",
			"loading-items",
			"ready",
		]);
	});

	it("captures degraded state details without losing the last ready stage", () => {
		const catalog = createPosCatalogStore();

		catalog.markStarting();
		catalog.markStage("loading-items");
		catalog.markReady();
		catalog.markDegraded({
			code: "item_details_failed",
			summary: "Background item detail hydration did not finish.",
		});

		expect(catalog.state.value.stage).toBe("ready");
		expect(catalog.state.value.status).toBe("degraded");
		expect(catalog.state.value.blocker).toEqual({
			code: "item_details_failed",
			summary: "Background item detail hydration did not finish.",
		});
		expect(catalog.state.value.timeline.at(-1)?.stage).toBe("degraded");
	});
});
