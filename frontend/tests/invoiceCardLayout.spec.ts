// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import InvoiceCardLayout from "../src/posapp/components/pos/invoice/InvoiceCardLayout.vue";
import {
	invoiceCardLayoutKey,
	normalizeInvoiceCardLayout,
} from "../src/posapp/utils/invoiceCardLayout";

const Button = defineComponent({
	inheritAttrs: false,
	setup(_, { attrs, slots }) {
		return () => h("button", attrs, slots.default?.());
	},
});

function render(enabled = ["customer", "posting", "items"]) {
	return mount(InvoiceCardLayout, {
		props: { user: "cashier", profile: "counter", enabled: enabled as any },
		global: {
			components: {
				VBtn: Button,
				VAlert: defineComponent({
					setup(_, { slots }) {
						return () => h("div", slots.default?.());
					},
				}),
			},
		},
		slots: {
			customer: defineComponent({
				setup() {
					const value = ref("Walk-In");
					return () =>
						h("input", {
							value: value.value,
							onInput: (event: any) =>
								(value.value = event.target.value),
						});
				},
			}),
			posting: "Posting controls",
			items: "Cart items",
			delivery: "Delivery controls",
		},
	});
}
const order = (wrapper: ReturnType<typeof render>) =>
	wrapper
		.findAll("[data-invoice-card]")
		.map((card) => card.attributes("data-invoice-card"));

beforeEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe("Invoice card layout", () => {
	it("repairs old/invalid preferences without losing supported cards", () => {
		const result = normalizeInvoiceCardLayout([
			{ id: "posting", width: "bad" },
			{ id: "posting" },
			null,
			{ id: "removed" },
		]);
		expect(result.map((card) => card.id)).toEqual([
			"posting",
			"customer",
			"delivery",
			"currency",
			"items",
		]);
		expect(result[0].width).toBe("auto");
		expect(result.at(-1)?.width).toBe("full");
	});

	it("reorders actual DOM without resetting customer state and persists width/order", async () => {
		const wrapper = render();
		await wrapper.find("input").setValue("Customer A");
		await wrapper.find("button").trigger("click");
		await wrapper
			.find('[aria-label="Move up: Posting and Price List"]')
			.trigger("click");
		expect(order(wrapper)).toEqual(["posting", "customer", "items"]);
		expect(wrapper.find("input").element.value).toBe("Customer A");
		await wrapper
			.find('[aria-label="Card width: Customer Details"]')
			.setValue("full");
		expect(
			wrapper.find('[data-invoice-card="customer"]').classes(),
		).toContain("invoice-card-layout__card--full");
		wrapper.unmount();
		const restored = render();
		expect(order(restored)).toEqual(["posting", "customer", "items"]);
		expect(
			restored.find('[data-invoice-card="customer"]').classes(),
		).toContain("invoice-card-layout__card--full");
		restored.unmount();
	});

	it("keeps disabled profile cards out of the layout and restores them when enabled", async () => {
		const wrapper = render();
		expect(order(wrapper)).toEqual(["customer", "posting", "items"]);
		await wrapper.setProps({
			enabled: ["customer", "delivery", "posting", "items"],
		});
		expect(order(wrapper)).toEqual([
			"customer",
			"delivery",
			"posting",
			"items",
		]);
		wrapper.unmount();
	});

	it("isolates user/profile preferences and resets to the default layout", async () => {
		const wrapper = render();
		await wrapper.find("button").trigger("click");
		await wrapper
			.find('[aria-label="Move up: Invoice Items"]')
			.trigger("click");
		await wrapper.setProps({ profile: "other" });
		expect(order(wrapper)).toEqual(["customer", "posting", "items"]);
		await wrapper.setProps({ profile: "counter" });
		expect(order(wrapper)).toEqual(["customer", "items", "posting"]);
		await wrapper.setProps({ user: "another-cashier" });
		expect(order(wrapper)).toEqual(["customer", "posting", "items"]);
		await wrapper.setProps({ user: "cashier" });
		await wrapper
			.findAll("button")
			.find((button) => button.text() === "Reset layout")!
			.trigger("click");
		expect(order(wrapper)).toEqual(["customer", "posting", "items"]);
		wrapper.unmount();
	});

	it("falls back on corrupt storage and reports failed persistence", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem(
			invoiceCardLayoutKey("cashier", "counter"),
			"{broken",
		);
		const wrapper = render();
		expect(order(wrapper)).toEqual(["customer", "posting", "items"]);
		expect(wrapper.text()).toContain("could not be loaded");
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Storage denied");
		});
		await wrapper.find("button").trigger("click");
		await wrapper
			.find('[aria-label="Move up: Posting and Price List"]')
			.trigger("click");
		expect(order(wrapper)[0]).toBe("posting");
		expect(wrapper.text()).toContain("session only");
		wrapper.unmount();
	});
});
