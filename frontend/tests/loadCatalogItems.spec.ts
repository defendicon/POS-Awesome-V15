import { describe, expect, it, vi } from "vitest";

import { createPosCatalogStore } from "../src/posapp/domain/catalog/posCatalogStore";
import { loadCatalogItems } from "../src/posapp/domain/catalog/loadCatalogItems";

describe("loadCatalogItems", () => {
	it("marks catalog ready when initial item load and cached append succeed", async () => {
		const catalog = createPosCatalogStore();
		const loadItems = vi.fn(async () => [{ item_code: "ITEM-001" }]);
		const appendCachedItemsPage = vi.fn(async () => []);

		await loadCatalogItems({
			catalog,
			loadItems,
			appendCachedItemsPage,
		});

		expect(loadItems).toHaveBeenCalledTimes(1);
		expect(appendCachedItemsPage).toHaveBeenCalledTimes(1);
		expect(catalog.state.value.stage).toBe("ready");
		expect(catalog.state.value.status).toBe("ready");
		expect(catalog.state.value.timeline.map((event) => event.stage)).toEqual([
			"starting",
			"loading-items",
			"ready",
		]);
	});

	it("marks catalog degraded when cached append fails after items load", async () => {
		const catalog = createPosCatalogStore();

		await loadCatalogItems({
			catalog,
			loadItems: vi.fn(async () => [{ item_code: "ITEM-001" }]),
			appendCachedItemsPage: vi.fn(async () => {
				throw new Error("append failed");
			}),
		});

		expect(catalog.state.value.stage).toBe("ready");
		expect(catalog.state.value.status).toBe("degraded");
		expect(catalog.state.value.blocker).toEqual({
			code: "catalog_append_failed",
			summary: "Catalog cached items could not be appended.",
		});
		expect(catalog.state.value.timeline.at(-1)?.stage).toBe("degraded");
	});

	it("blocks catalog when the initial item load fails", async () => {
		const catalog = createPosCatalogStore();

		await loadCatalogItems({
			catalog,
			loadItems: vi.fn(async () => {
				throw new Error("load failed");
			}),
			appendCachedItemsPage: vi.fn(async () => []),
		});

		expect(catalog.state.value.stage).toBe("blocked");
		expect(catalog.state.value.status).toBe("blocked");
		expect(catalog.state.value.blocker).toEqual({
			code: "catalog_load_failed",
			summary: "Catalog items did not finish loading.",
		});
	});
});
