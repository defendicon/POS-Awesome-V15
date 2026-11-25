// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
	CART_GRID_DIRECT_EDIT_COLUMNS,
	activateCartGridCell,
	ensureCartGridRowRendered,
	focusCartGridCell,
	focusCartGridRow,
	focusCartItemField,
	getAdjacentCartGridColumnKey,
	getNavigableCartColumnKeys,
	resolveCounterGridKeyboardCommand,
	shouldDelegateCartGridKeyToEditor,
} from "../src/posapp/utils/cartFieldFocus";

const gridKey = (
	key: string,
	modifiers: Partial<
		Pick<KeyboardEvent, "shiftKey" | "ctrlKey" | "metaKey" | "altKey">
	> = {},
) => ({
	key,
	shiftKey: false,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	...modifiers,
});

const createContainer = () => {
	const container = document.createElement("div");
	container.innerHTML = `
		<table>
			<tbody>
				<tr class="posa-cart-item-row">
					<td data-column-key="qty">
						<div class="posa-cart-table__qty-input-shell" tabindex="0">
							<input type="number" />
						</div>
					</td>
					<td data-column-key="uom">
						<div class="posa-cart-table__editor-display" tabindex="0"></div>
					</td>
					<td data-column-key="rate">
						<div class="posa-cart-table__editor-display" tabindex="0"></div>
					</td>
					<td data-column-key="discount_percentage">
						<div class="posa-cart-table__editor-display" tabindex="0"></div>
					</td>
					<td data-column-key="discount_amount">
						<div class="posa-cart-table__editor-display" tabindex="0"></div>
					</td>
					<td data-column-key="amount">
						<div class="currency-display"></div>
					</td>
					<td data-column-key="actions">
						<button type="button" class="delete-action-btn"></button>
					</td>
					<td data-column-key="data-table-expand">
						<button type="button" class="posa-cart-table__expand-btn"></button>
					</td>
				</tr>
				<tr class="posa-cart-item-row" data-cart-row-index="3" tabindex="-1">
					<td data-column-key="qty">
						<div class="posa-cart-table__qty-input-shell" tabindex="0">
							<input type="number" />
						</div>
					</td>
					<td data-column-key="rate">
						<div class="posa-cart-table__editor-display" tabindex="0"></div>
					</td>
				</tr>
			</tbody>
		</table>
	`;
	document.body.appendChild(container);
	return container;
};

afterEach(() => document.body.replaceChildren());

describe("focusCartItemField", () => {
	it("focuses and clicks the quantity input for the requested row", () => {
		const container = createContainer();
		const activator = container.querySelector(
			'[data-column-key="qty"] input',
		) as HTMLElement;
		const clickSpy = vi.spyOn(activator, "click");

		expect(focusCartItemField(container, 0, "qty")).toBe(true);
		expect(document.activeElement).toBe(activator);
		expect(clickSpy).toHaveBeenCalledTimes(1);
	});

	it("focuses and clicks the uom activator for the requested row", () => {
		const container = createContainer();
		const activator = container.querySelector(
			'[data-column-key="uom"] .posa-cart-table__editor-display',
		) as HTMLElement;
		const clickSpy = vi.spyOn(activator, "click");

		expect(focusCartItemField(container, 0, "uom")).toBe(true);
		expect(document.activeElement).toBe(activator);
		expect(clickSpy).toHaveBeenCalledTimes(1);
	});

	it("focuses discount percentage without opening the editor when activation is disabled", () => {
		const container = createContainer();
		const activator = container.querySelector(
			'[data-column-key="discount_percentage"] .posa-cart-table__editor-display',
		) as HTMLElement;
		const clickSpy = vi.spyOn(activator, "click");

		expect(
			focusCartItemField(container, 0, "discount_percentage", {
				activate: false,
			}),
		).toBe(true);
		expect(document.activeElement).toBe(activator);
		expect(clickSpy).not.toHaveBeenCalled();
	});

	it("focuses rows by explicit rendered row index when available", () => {
		const container = createContainer();
		const row = container.querySelector(
			'[data-cart-row-index="3"]',
		) as HTMLElement;
		const focusSpy = vi.spyOn(row, "focus");

		expect(focusCartGridRow(container, 3)).toBe(true);
		expect(focusSpy).toHaveBeenCalledTimes(1);
	});

	it("focuses grid cells without activating unless requested", () => {
		const container = createContainer();
		const target = container.querySelector(
			'[data-column-key="discount_amount"] .posa-cart-table__editor-display',
		) as HTMLElement;
		const clickSpy = vi.spyOn(target, "click");

		expect(focusCartGridCell(container, 0, "discount_amount")).toBe(true);
		expect(document.activeElement).toBe(target);
		expect(clickSpy).not.toHaveBeenCalled();

		expect(activateCartGridCell(container, 0, "discount_amount")).toBe(
			true,
		);
		expect(clickSpy).toHaveBeenCalledTimes(1);
	});

	it("derives navigable columns from visible table columns only", () => {
		expect(
			getNavigableCartColumnKeys([
				{ key: "item_name" },
				{ key: "qty" },
				{ key: "amount" },
				{ key: "actions" },
				{ key: "data-table-expand" },
			]),
		).toEqual([
			"item_name",
			"qty",
			"amount",
			"actions",
			"data-table-expand",
		]);
	});

	it("traverses displayed totals and both action cells without adding them to fast Enter progression", () => {
		const keys = getNavigableCartColumnKeys([
			{ key: "item_name" },
			{ key: "qty" },
			{ key: "rate" },
			{ key: "amount" },
			{ key: "actions" },
			{ key: "data-table-expand" },
		]);

		expect(getAdjacentCartGridColumnKey(keys, "rate", 1)).toBe("amount");
		expect(getAdjacentCartGridColumnKey(keys, "amount", 1)).toBe("actions");
		expect(getAdjacentCartGridColumnKey(keys, "actions", 1)).toBe(
			"data-table-expand",
		);
		expect(
			getAdjacentCartGridColumnKey(keys, "data-table-expand", -1),
		).toBe("actions");
		expect(CART_GRID_DIRECT_EDIT_COLUMNS).not.toContain("amount");
		expect(CART_GRID_DIRECT_EDIT_COLUMNS).not.toContain("actions");
		expect(CART_GRID_DIRECT_EDIT_COLUMNS).not.toContain(
			"data-table-expand",
		);
	});

	it("leaves UOM menu keys to the active select editor", () => {
		const target = document.createElement("input");
		const editor = document.createElement("div");
		editor.className = "uom-select";
		editor.appendChild(target);

		expect(shouldDelegateCartGridKeyToEditor(target, "ArrowDown")).toBe(
			true,
		);
		expect(shouldDelegateCartGridKeyToEditor(target, "Enter")).toBe(true);
		expect(
			shouldDelegateCartGridKeyToEditor(target, "Enter", {
				shiftKey: true,
			}),
		).toBe(false);
		expect(shouldDelegateCartGridKeyToEditor(target, "ArrowRight")).toBe(
			false,
		);
	});

	it("scrolls a virtualized offscreen row before resolving its focus target", async () => {
		const container = document.createElement("div");
		const scrollToIndex = vi.fn((rowIndex: number) => {
			const row = document.createElement("div");
			row.className = "posa-cart-item-row";
			row.dataset.cartRowIndex = String(rowIndex);
			container.appendChild(row);
		});

		await expect(
			ensureCartGridRowRendered(container, 24, scrollToIndex, async () =>
				Promise.resolve(),
			),
		).resolves.toBe(true);
		expect(scrollToIndex).toHaveBeenCalledWith(24);
	});

	it("maps Home and End to the current row boundaries", () => {
		expect(
			resolveCounterGridKeyboardCommand(gridKey("Home"), {
				mode: "cell",
			}),
		).toEqual({
			type: "move-boundary",
			row: "current",
			column: "first",
		});
		expect(
			resolveCounterGridKeyboardCommand(gridKey("End"), {
				mode: "row",
			}),
		).toEqual({
			type: "move-boundary",
			row: "current",
			column: "last",
		});
	});

	it("maps Ctrl or Meta Home and End to cart corners", () => {
		expect(
			resolveCounterGridKeyboardCommand(
				gridKey("Home", { ctrlKey: true }),
				{
					mode: "cell",
				},
			),
		).toEqual({
			type: "move-boundary",
			row: "first",
			column: "first",
		});
		expect(
			resolveCounterGridKeyboardCommand(
				gridKey("End", { metaKey: true }),
				{
					mode: "cell",
				},
			),
		).toEqual({
			type: "move-boundary",
			row: "last",
			column: "last",
		});
	});

	it("maps Shift+Enter to reverse editable progression only in a direct-edit cell", () => {
		expect(
			resolveCounterGridKeyboardCommand(
				gridKey("Enter", { shiftKey: true }),
				{
					mode: "cell",
					directEditCell: true,
				},
			),
		).toEqual({ type: "move-entry", delta: -1 });
		expect(
			resolveCounterGridKeyboardCommand(
				gridKey("Enter", { shiftKey: true }),
				{
					mode: "cell",
					directEditCell: false,
				},
			),
		).toBeNull();
		expect(
			resolveCounterGridKeyboardCommand(gridKey("Home"), {
				mode: "inactive",
			}),
		).toBeNull();
	});
});
