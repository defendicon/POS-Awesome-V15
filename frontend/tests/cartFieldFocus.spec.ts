// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { focusCartItemField } from "../src/posapp/utils/cartFieldFocus";

const createContainer = () => {
	const container = document.createElement("div");
	container.innerHTML = `
		<table>
			<tbody>
				<tr class="posa-cart-item-row">
					<td data-column-key="qty">
						<div class="posa-cart-table__qty-display" tabindex="0"></div>
					</td>
					<td data-column-key="uom">
						<div class="posa-cart-table__editor-display" tabindex="0"></div>
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

describe("focusCartItemField", () => {
	it("focuses and clicks the quantity activator for the requested row", () => {
		const container = createContainer();
		const activator = container.querySelector(
			'[data-column-key="qty"] .posa-cart-table__qty-display',
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
});
