// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const ButtonStub = defineComponent({
	props: ["prependIcon"],
	setup(_, { slots }) {
		return () => h("button", {}, slots.default?.());
	},
});

describe("InvoiceActionButtons", () => {
	it("does not render share last invoice in the invoice summary actions", async () => {
		vi.stubGlobal("__", (value: string) => value);
		const { default: InvoiceActionButtons } = await import(
			"../src/posapp/components/pos/invoice/InvoiceActionButtons.vue"
		);

		const wrapper = mount(InvoiceActionButtons, {
			props: {
				pos_profile: {
					custom_allow_select_sales_order: 0,
					posa_allow_return: 1,
					posa_allow_print_draft_invoices: 1,
				},
			},
			global: {
				stubs: {
					VRow: { template: "<div><slot /></div>" },
					VCol: { template: "<div><slot /></div>" },
					VBtn: {
						props: ["prependIcon"],
						template: "<button><slot /></button>",
					},
				},
			},
		});

		expect(wrapper.text()).not.toContain("Share Last Invoice");
		expect((InvoiceActionButtons as any).emits).not.toContain("share-last");
	});

	it("keeps primary and profile-enabled actions reachable in Counter Grid", async () => {
		vi.stubGlobal("__", (value: string) => value);
		const { default: InvoiceActionButtons } = await import(
			"../src/posapp/components/pos/invoice/InvoiceActionButtons.vue"
		);

		const wrapper = mount(InvoiceActionButtons, {
			props: {
				presentation: "counter-grid",
				pos_profile: {
					custom_allow_select_sales_order: 1,
					posa_allow_return: 1,
					posa_allow_print_draft_invoices: 1,
					posa_enable_customer_display: 1,
				},
			},
			global: {
				components: {
					VBtn: {
						template: '<button v-bind="$attrs"><slot /></button>',
					},
					VMenu: {
						template:
							'<div><slot name="activator" :props="{}" /><slot /></div>',
					},
					VList: { template: "<div><slot /></div>" },
					VListItem: {
						emits: ["click"],
						template:
							'<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
					},
					VListItemTitle: { template: "<span><slot /></span>" },
				},
			},
		});

		const setupState = (wrapper.vm as any).$?.setupState || {};
		expect(
			setupState.isCounterGrid?.value ?? setupState.isCounterGrid,
		).toBe(true);
		expect(
			setupState.showMoreActions?.value ?? setupState.showMoreActions,
		).toBe(true);
		expect(
			wrapper.get('[data-testid="counter-grid-actions"]').exists(),
		).toBe(true);
		expect(
			wrapper.get('[data-testid="invoice-action-offers"]').text(),
		).toContain("Offers");
		expect(
			wrapper.get('[data-testid="invoice-action-coupons"]').text(),
		).toContain("Coupons");

		expect((InvoiceActionButtons as any).emits).toEqual(
			expect.arrayContaining(["open-offers", "open-coupons"]),
		);
	});

	it("labels the primary action as Complete Exchange only during replacement sale", async () => {
		vi.stubGlobal("__", (value: string) => value);
		const { default: InvoiceActionButtons } = await import(
			"../src/posapp/components/pos/invoice/InvoiceActionButtons.vue"
		);
		const mountButtons = (exchangeActive: boolean) =>
			mount(InvoiceActionButtons, {
				props: {
					exchangeActive,
					pos_profile: {
						custom_allow_select_sales_order: 0,
						posa_allow_return: 1,
					},
				},
				global: {
					components: {
						VRow: BoxStub,
						VCol: BoxStub,
						VBtn: ButtonStub,
					},
				},
			});

		const exchangeButtons = mountButtons(true);
		expect(exchangeButtons.text()).toContain("Complete Exchange");
		expect(exchangeButtons.text()).not.toContain("PAY");

		const saleButtons = mountButtons(false);
		expect(saleButtons.text()).toContain("PAY");
		expect(saleButtons.text()).not.toContain("Complete Exchange");
	});
});
