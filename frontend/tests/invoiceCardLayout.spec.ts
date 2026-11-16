// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import InvoiceCardLayout from "../src/posapp/components/pos/invoice/InvoiceCardLayout.vue";
import {
	invoiceCardLayoutKey,
	normalizeInvoiceCardLayout,
	repositionInvoiceCard,
	resizedCardSpan,
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
	it("supports shared rows, separate rows and safe resize bounds", () => {
		const original = normalizeInvoiceCardLayout(null);
		const shared = repositionInvoiceCard(
			original,
			"posting",
			"customer",
			"before",
		);
		expect(shared.slice(0, 2).map((card) => [card.id, card.width])).toEqual(
			[
				["posting", 6],
				["customer", 6],
			],
		);
		const separate = repositionInvoiceCard(
			shared,
			"customer",
			"items",
			"below",
		);
		expect(separate.at(-1)).toMatchObject({
			id: "customer",
			width: "full",
			startRow: true,
		});
		expect(original[0]?.width).toBe("auto");
		expect(new Set(separate.map((card) => card.id)).size).toBe(5);
		expect(normalizeInvoiceCardLayout(separate)).toEqual(separate);
		expect(resizedCardSpan(6, 250, 990, 10)).toBe(9);
		expect(resizedCardSpan(6, -2000, 990, 10)).toBe(3);
		expect(resizedCardSpan(6, 2000, 990, 10)).toBe(12);
		expect(resizedCardSpan(6, 100, 0, 10)).toBe(6);
	});

	it("drags real cards beside or below another card without resetting field state", async () => {
		const wrapper = render();
		await wrapper.find("input").setValue("Customer A");
		await wrapper.find('[aria-label="Customize cards"]').trigger("click");
		const target = wrapper.find('[data-invoice-card="posting"]').element;
		vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
			left: 500,
			top: 100,
			width: 500,
			height: 120,
			right: 1000,
			bottom: 220,
		} as DOMRect);
		Object.defineProperty(document, "elementFromPoint", {
			configurable: true,
			value: vi.fn(() => target),
		});
		wrapper
			.find('[aria-label="Drag card: Customer Details"]')
			.element.dispatchEvent(
				new MouseEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 100,
					clientY: 100,
				}),
			);
		await nextTick();
		window.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX: 900,
				clientY: 160,
				cancelable: true,
			}),
		);
		await nextTick();
		expect(
			wrapper.find('[data-invoice-card="posting"]').classes(),
		).toContain("invoice-card-layout__card--drop-after");
		window.dispatchEvent(
			new MouseEvent("pointerup", { clientX: 900, clientY: 160 }),
		);
		await nextTick();
		expect(order(wrapper)).toEqual(["posting", "customer", "items"]);
		expect(wrapper.find("input").element.value).toBe("Customer A");
		expect(
			JSON.parse(
				localStorage.getItem(
					invoiceCardLayoutKey("cashier", "counter"),
				)!,
			).find((card: any) => card.id === "customer").width,
		).toBe(6);
		wrapper
			.find('[aria-label="Drag card: Customer Details"]')
			.element.dispatchEvent(
				new MouseEvent("pointerdown", {
					bubbles: true,
					button: 0,
					clientX: 100,
					clientY: 100,
				}),
			);
		await nextTick();
		window.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX: 750,
				clientY: 215,
				cancelable: true,
			}),
		);
		window.dispatchEvent(
			new MouseEvent("pointerup", { clientX: 750, clientY: 215 }),
		);
		await nextTick();
		expect(
			wrapper.find('[data-invoice-card="customer"]').classes(),
		).toContain("invoice-card-layout__card--full");
		wrapper.unmount();
	});

	it("previews mouse resizing, cancels with Escape and saves only on release", async () => {
		const wrapper = render();
		await wrapper.find('[aria-label="Customize cards"]').trigger("click");
		vi.spyOn(
			wrapper.find(".invoice-card-layout__cards").element,
			"getBoundingClientRect",
		).mockReturnValue({ width: 1000 } as DOMRect);
		const resize = wrapper.find(
			'[aria-label="Resize card: Customer Details"]',
		);
		resize.element.dispatchEvent(
			new MouseEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: 500,
				clientY: 100,
			}),
		);
		await nextTick();
		window.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX: 750,
				clientY: 100,
				cancelable: true,
			}),
		);
		await nextTick();
		expect(resize.attributes("aria-valuenow")).toBe("9");
		expect(
			wrapper
				.find('[aria-label="Resize card: Posting and Price List"]')
				.attributes("aria-valuenow"),
		).toBe("6");
		expect(
			localStorage.getItem(invoiceCardLayoutKey("cashier", "counter")),
		).toBeNull();
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await nextTick();
		expect(resize.attributes("aria-valuenow")).toBe("6");
		resize.element.dispatchEvent(
			new MouseEvent("pointerdown", {
				bubbles: true,
				button: 0,
				clientX: 500,
				clientY: 100,
			}),
		);
		await nextTick();
		window.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX: 750,
				clientY: 100,
				cancelable: true,
			}),
		);
		window.dispatchEvent(
			new MouseEvent("pointerup", { clientX: 750, clientY: 100 }),
		);
		await nextTick();
		expect(
			JSON.parse(
				localStorage.getItem(
					invoiceCardLayoutKey("cashier", "counter"),
				)!,
			).find((card: any) => card.id === "customer").width,
		).toBe(9);
		wrapper.unmount();
	});

	it("offers row presets and keyboard resizing while preserving profile-disabled cards", async () => {
		const wrapper = render();
		await wrapper.find('[aria-label="Customize cards"]').trigger("click");
		await wrapper
			.findAll("button")
			.find((button) => button.text() === "Separate rows")!
			.trigger("click");
		expect(
			wrapper.findAll(".invoice-card-layout__card--full"),
		).toHaveLength(3);
		await wrapper
			.findAll("button")
			.find((button) => button.text() === "Single row")!
			.trigger("click");
		expect(
			wrapper
				.find('[aria-label="Resize card: Customer Details"]')
				.attributes("aria-valuenow"),
		).toBe("6");
		await wrapper
			.find('[aria-label="Resize card: Customer Details"]')
			.trigger("keydown", { key: "ArrowLeft" });
		expect(
			wrapper
				.find('[aria-label="Resize card: Customer Details"]')
				.attributes("aria-valuenow"),
		).toBe("5");
		expect(order(wrapper)).not.toContain("delivery");
		wrapper.unmount();
	});

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
