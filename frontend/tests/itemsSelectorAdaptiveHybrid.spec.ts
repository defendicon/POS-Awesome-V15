import { describe, expect, it } from "vitest";

import {
	resolveAdaptiveCatalogView,
	resolveProfileCatalogView,
} from "../src/features/catalog/domain/catalogSelectorBridge";

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

	it("defaults to table view when POS Profile card view is disabled", () => {
		expect(resolveProfileCatalogView(0)).toBe("table");
		expect(resolveProfileCatalogView(false)).toBe("table");
	});

	it("defaults to cards view when POS Profile card view is enabled", () => {
		expect(resolveProfileCatalogView(1)).toBe("cards");
		expect(resolveProfileCatalogView(true)).toBe("cards");
	});
});
