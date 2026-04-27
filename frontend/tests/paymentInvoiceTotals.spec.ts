// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import InvoiceTotals from "../src/posapp/components/pos/payments/InvoiceTotals.vue";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VIconStub = defineComponent({
	props: {
		icon: {
			type: String,
			default: "",
		},
	},
	setup(props) {
		return () => h("span", { class: "v-icon-stub" }, props.icon);
	},
});

const VTooltipStub = defineComponent({
	props: {
		text: {
			type: String,
			default: "",
		},
	},
	setup(props, { slots }) {
		return () =>
			h("div", { class: "v-tooltip-stub", "data-tooltip": props.text }, [
				slots.activator?.({ props: { "aria-label": props.text } }),
				slots.default?.(),
			]);
	},
});

const VTextFieldStub = defineComponent({
	name: "VTextFieldStub",
	props: {
		modelValue: {
			type: [String, Number],
			default: "",
		},
		label: {
			type: String,
			default: "",
		},
	},
	setup(props, { slots }) {
		return () =>
			h("div", { "data-label": props.label }, [
				h("span", String(props.modelValue ?? "")),
				slots["append-inner"]?.(),
			]);
	},
});

describe("InvoiceTotals", () => {
	beforeEach(() => {
		(window as any).frappe = { _: (value: string) => value };
	});

	it("separates item/rate discounts from additional discount", () => {
		const wrapper = mount(InvoiceTotals, {
			props: {
				invoice_doc: {
					currency: "PKR",
					net_total: 900,
					total_taxes_and_charges: 0,
					total: 900,
					discount_amount: 50,
					grand_total: 850,
				},
				itemDiscountTotal: 120,
				displayCurrency: "PKR",
				diff_payment: 0,
				diff_label: "Remaining",
				currencySymbol: () => "Rs",
				formatCurrency: (value: number) => String(value),
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VIcon: VIconStub,
					VTooltip: VTooltipStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		expect(wrapper.find('[data-label="Item / Rate Discounts"]').text()).toContain("120");
		expect(wrapper.find('[data-label="Additional Discount"]').text()).toContain("50");
		expect(wrapper.find('[data-label="Total Discount"]').text()).toContain("170");
		expect(wrapper.find('[data-label="Discount Amount"]').exists()).toBe(false);
		expect(wrapper.find(".discount-context-card").exists()).toBe(false);
		const itemDiscountField = wrapper.find('[data-label="Item / Rate Discounts"]');
		expect(itemDiscountField.find(".discount-help-trigger").exists()).toBe(true);
		expect(itemDiscountField.find(".v-icon-stub").text()).toContain(
			"mdi-information-outline",
		);
		expect(wrapper.find(".v-tooltip-stub").attributes("data-tooltip")).toContain(
			"Item and rate discounts are already included in item rates and Net Total.",
		);
		expect(wrapper.find(".v-tooltip-stub").attributes("data-tooltip")).toContain(
			"Additional Discount is the separate invoice-level discount.",
		);
	});
});
