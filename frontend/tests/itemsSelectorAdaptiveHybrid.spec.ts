import { describe, expect, it } from "vitest";

import { resolveAdaptiveCatalogView } from "../src/features/catalog/domain/catalogSelectorBridge";

describe("resolveAdaptiveCatalogView", () => {
	it("keeps the preferred table view on wide screens", () => {
		expect(
			resolveAdaptiveCatalogView({
				preferredView: "table",
				isPhone: false,
				windowWidth: 1440,
			}),
		).toBe("table");
	});

	it("forces cards on narrower screens", () => {
		expect(
			resolveAdaptiveCatalogView({
				preferredView: "table",
				isPhone: true,
				windowWidth: 390,
			}),
		).toBe("cards");
	});
});
