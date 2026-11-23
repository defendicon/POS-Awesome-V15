// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

import NornuxCartList from "../src/posapp/components/pos/invoice/NornuxCartList.vue";

const mountList = (items: any[], extra: Record<string, unknown> = {}) => {
	const fns = {
		addOne: vi.fn(),
		subtractOne: vi.fn(),
		removeItem: vi.fn(),
		eventBus: { emit: vi.fn() },
	};
	const wrapper = mount(NornuxCartList, {
		props: {
			items,
			formatCurrency: (v: number) => Number(v || 0).toFixed(2),
			formatFloat: (v: number, p?: number) => Number(v || 0).toFixed(p ?? 2),
			...fns,
			...extra,
		},
		global: { stubs: { VIcon: true } },
	});
	return { wrapper, ...fns };
};

describe("Nornux cart list", () => {
	it("removes a line when minus is pressed at quantity 1 (same as the classic table)", async () => {
		const item = { item_code: "A", item_name: "A", qty: 1, rate: 10, amount: 10 };
		const { wrapper, removeItem, subtractOne, eventBus } = mountList([item]);
		await wrapper.get('[data-testid="nornux-minus-A"]').trigger("click");
		expect(removeItem).toHaveBeenCalledWith(item);
		expect(subtractOne).not.toHaveBeenCalled();
		expect(eventBus.emit).toHaveBeenCalledWith("recalculate_return_discount", { defer: true });
	});

	it("subtracts one when quantity is above 1", async () => {
		const item = { item_code: "B", item_name: "B", qty: 3, rate: 5, amount: 15 };
		const { wrapper, removeItem, subtractOne } = mountList([item]);
		await wrapper.get('[data-testid="nornux-minus-B"]').trigger("click");
		expect(subtractOne).toHaveBeenCalledWith(item);
		expect(removeItem).not.toHaveBeenCalled();
	});

	it("uses magnitude for return lines (-1 is removed, -3 is reduced)", async () => {
		const one = { item_code: "R1", item_name: "R1", qty: -1, rate: 5, amount: -5 };
		const three = { item_code: "R3", item_name: "R3", qty: -3, rate: 5, amount: -15 };
		const { wrapper, removeItem, subtractOne } = mountList([one, three], { isReturnInvoice: true });
		await wrapper.get('[data-testid="nornux-minus-R1"]').trigger("click");
		await wrapper.get('[data-testid="nornux-minus-R3"]').trigger("click");
		expect(removeItem).toHaveBeenCalledWith(one);
		expect(subtractOne).toHaveBeenCalledWith(three);
	});

	it("adds one with plus and emits no extra recalculation (same as the classic table)", async () => {
		const item = { item_code: "C", item_name: "C", qty: 2, rate: 5, amount: 10 };
		const { wrapper, addOne, eventBus } = mountList([item]);
		await wrapper.get('[data-testid="nornux-plus-C"]').trigger("click");
		expect(addOne).toHaveBeenCalledWith(item);
		expect(eventBus.emit).not.toHaveBeenCalled();
	});

	it("locks free/offer lines on return invoices, like the classic quantity editor", async () => {
		const item = { item_code: "F", item_name: "F", qty: -1, rate: 0, amount: 0, is_free_item: 1 };
		const { wrapper, addOne, removeItem } = mountList([item], { isReturnInvoice: true });
		expect(wrapper.get('[data-testid="nornux-plus-F"]').attributes("disabled")).toBeDefined();
		await wrapper.get('[data-testid="nornux-plus-F"]').trigger("click");
		await wrapper.get('[data-testid="nornux-minus-F"]').trigger("click");
		expect(addOne).not.toHaveBeenCalled();
		expect(removeItem).not.toHaveBeenCalled();
	});

	it("emits edit-item when a line is clicked (opens the existing quick-edit dialog)", async () => {
		const item = { item_code: "E", item_name: "E", qty: 1, rate: 1, amount: 1 };
		const onEditItem = vi.fn();
		const { wrapper } = mountList([item], { onEditItem });
		await wrapper.get('[data-testid="nornux-line-E"] .nornux-line__main').trigger("click");
		expect(onEditItem).toHaveBeenCalledWith(item);
	});
});
