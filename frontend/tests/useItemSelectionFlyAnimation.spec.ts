// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { useItemSelection } from "../src/posapp/composables/pos/items/useItemSelection";

describe("useItemSelection fly animation", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("creates a visible row-click placeholder for the fly animation", async () => {
		const target = document.createElement("div");
		target.className = "items-table-container";
		document.body.appendChild(target);
		const fly = vi.fn();
		const addItem = vi.fn();
		const itemSelection = useItemSelection();
		itemSelection.registerContext({
			addItem,
			fly,
			flyConfig: { speed: 0.6 },
		});

		await itemSelection.handleRowClick(
			new MouseEvent("click", {
				clientX: 120,
				clientY: 160,
			}),
			{ item: { item_code: "ITEM-001" } },
		);

		const source = fly.mock.calls[0]?.[0] as HTMLElement | undefined;

		expect(source?.className).toBe("item-fly-placeholder");
		expect(source?.style.backgroundColor).toBeTruthy();
		expect(fly).toHaveBeenCalledWith(source, target, { speed: 0.6 });
		expect(document.body.contains(source as Node)).toBe(false);
		expect(addItem).toHaveBeenCalledWith({ item_code: "ITEM-001" });
	});
});
