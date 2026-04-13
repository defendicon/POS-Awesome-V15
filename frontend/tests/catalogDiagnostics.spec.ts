import { describe, expect, it } from "vitest";

import {
	createPosCatalogBlocker,
	createPosCatalogTimelineEvent,
	pushPosCatalogTimelineEvent,
} from "../src/features/catalog/domain/catalogDiagnostics";

describe("catalogDiagnostics", () => {
	it("creates a catalog blocker with a code and summary", () => {
		expect(
			createPosCatalogBlocker(
				"items_load_failed",
				"Catalog items did not finish loading.",
			),
		).toEqual({
			code: "items_load_failed",
			summary: "Catalog items did not finish loading.",
		});
	});

	it("records timeline events with blocker metadata when catalog becomes blocked", () => {
		const blocker = createPosCatalogBlocker(
			"item_details_failed",
			"Catalog item details did not become ready.",
		);
		const started = createPosCatalogTimelineEvent("starting");
		const blockedTimeline = pushPosCatalogTimelineEvent(
			[started],
			"blocked",
			blocker,
		);

		expect(started.stage).toBe("starting");
		expect(started.blockerCode).toBeNull();
		expect(blockedTimeline).toHaveLength(2);
		expect(blockedTimeline[1]).toMatchObject({
			stage: "blocked",
			blockerCode: "item_details_failed",
		});
	});
});
