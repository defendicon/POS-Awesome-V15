// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

vi.mock("../src/posapp/composables/core/useResponsive", () => ({
	useResponsive: () => ({
		windowWidth: { value: 1400 },
		isDesktop: { value: true },
		isTablet: { value: false },
		isPhone: { value: false },
		isCompact: { value: false },
	}),
}));

import InvoiceSummary from "../src/posapp/components/pos/invoice/InvoiceSummary.vue";
import ParkedOrdersRail from "../src/posapp/components/pos/invoice/ParkedOrdersRail.vue";
import { useUIStore } from "../src/posapp/stores/uiStore";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const baseProps = {
	pos_profile: {
		currency: "PKR",
		posa_use_percentage_discount: 0,
		posa_allow_user_to_edit_additional_discount: 1,
	},
	total_qty: 3,
	additional_discount: 0,
	additional_discount_percentage: 0,
	total_items_discount_amount: 0,
	subtotal: 1200,
	displayCurrency: "PKR",
	formatFloat: (value: number) => String(value),
	formatCurrency: (value: number) => String(value),
	currencySymbol: () => "Rs ",
	discount_percentage_offer_name: "",
	isNumber: () => true,
	return_discount_meta: null,
};

const draftRows = [
	{
		name: "ACC-SINV-0001",
		customer_name: "Walk-in Customer",
		posting_date: "2026-04-04",
		posting_time: "10:15:00.000000",
		grand_total: 450,
		currency: "PKR",
	},
	{
		name: "ACC-SINV-0002",
		customer_name: "Ali Traders",
		posting_date: "2026-04-04",
		posting_time: "10:45:00.000000",
		grand_total: 820,
		currency: "PKR",
	},
];

describe("InvoiceSummary drafts placement", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.stubGlobal("frappe", { _: (value: string) => value });
		vi.stubGlobal("__", (value: string) => value);
	});

	it("uses a desktop drawer trigger instead of rendering the full drafts list inline", async () => {
		const uiStore = useUIStore();
		uiStore.setParkedOrders(draftRows);

		const wrapper = mount(InvoiceSummary, {
			props: baseProps,
			global: {
				stubs: {
					VCard: BoxStub,
					VRow: BoxStub,
					VCol: BoxStub,
					VAlert: BoxStub,
					VTextField: BoxStub,
					VBtn: BoxStub,
					VNavigationDrawer: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VChip: BoxStub,
					VIcon: BoxStub,
					InvoiceActionButtons: true,
					ParkedOrdersList: true,
					VDialog: BoxStub,
				},
			},
		});

		const setupState = (wrapper.vm as any).$?.setupState || {};

		expect(Boolean(setupState.showDesktopDrafts?.value ?? setupState.showDesktopDrafts)).toBe(true);
		expect((setupState.allDrafts?.value ?? setupState.allDrafts)?.length).toBe(2);
		expect(wrapper.findComponent(ParkedOrdersRail).exists()).toBe(false);
		expect(wrapper.find('[data-test="parked-orders-view-all"]').exists()).toBe(false);
		expect(wrapper.find('[data-test="mobile-drafts-dialog"]').exists()).toBe(false);
	});

	it("shows the return prorated additional discount as a positive field value", () => {
		const wrapper = mount(InvoiceSummary, {
			props: {
				...baseProps,
				additional_discount: -250,
				return_discount_meta: {
					ratio: 0.5,
					original_discount: 250,
					prorated_discount: 125,
				},
			},
			global: {
				stubs: {
					VCard: BoxStub,
					VRow: BoxStub,
					VCol: BoxStub,
					VAlert: BoxStub,
					VTextField: BoxStub,
					VBtn: BoxStub,
					VNavigationDrawer: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VChip: BoxStub,
					VIcon: BoxStub,
					InvoiceActionButtons: true,
					ParkedOrdersList: true,
					VDialog: BoxStub,
				},
			},
		});

		const setupState = (wrapper.vm as any).$?.setupState || {};
		const displayValue =
			setupState.additionalDiscountDisplay?.value ??
			setupState.additionalDiscountDisplay;

		expect(displayValue).toBe(125);
	});
});
