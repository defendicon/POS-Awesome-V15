// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

vi.mock("../src/posapp/composables/core/useRtl", () => ({
	useRtl: () => ({
		isRtl: false,
		rtlStyles: {},
		rtlClasses: [],
	}),
}));

import NavbarAppBar from "../src/posapp/components/navbar/NavbarAppBar.vue";
import { POS_BRAND_NAME } from "../src/posapp/config/branding";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const ButtonStub = defineComponent({
	props: {
		disabled: {
			type: Boolean,
			default: false,
		},
	},
	emits: ["click"],
	setup(props, { attrs, slots, emit }) {
		return () =>
			h(
				"button",
				{
					type: "button",
					disabled: props.disabled,
					"data-test": attrs["data-test"],
					onClick: () => emit("click"),
				},
				slots.default?.(),
			);
	},
});

describe("NavbarAppBar", () => {
	beforeEach(() => {
		vi.stubGlobal("frappe", {
			session: {
				user: "cashier@example.com",
				user_fullname: "Main Cashier",
			},
		});
		vi.stubGlobal("__", (value: string) => value);
		Object.defineProperty(window, "innerWidth", {
			writable: true,
			configurable: true,
			value: 1280,
		});
	});

	it("shows one actionable cashier chip instead of duplicate user chips", async () => {
		const wrapper = mount(NavbarAppBar, {
			props: {
				posProfile: { name: "Main POS" },
				cashierName: "Backup Cashier",
				pendingInvoices: 0,
				loadingProgress: 0,
				loadingActive: false,
				loadingMessage: "",
			},
			global: {
				mocks: {
					__: (value: string) => value,
					$theme: { isDark: { value: false } },
				},
				components: {
					VAppBar: BoxStub,
					VAppBarNavIcon: ButtonStub,
					VImg: BoxStub,
					VToolbarTitle: BoxStub,
					VSpacer: BoxStub,
					VBtn: ButtonStub,
					VBadge: BoxStub,
					VTooltip: BoxStub,
					VChip: ButtonStub,
					VIcon: BoxStub,
					VProgressLinear: BoxStub,
					NavbarInfoGadgets: BoxStub,
				},
			},
		});

		expect(wrapper.findAll('[data-test="cashier-chip"]')).toHaveLength(1);
		expect(
			wrapper.find('[data-test="profile-chip-secondary"]').exists(),
		).toBe(false);
		// Default branding renders the Nornux wordmark image (named via alt text).
		expect(wrapper.find(".pos-navbar-wordmark img").attributes("alt")).toBe(POS_BRAND_NAME);
		expect(wrapper.text()).not.toContain("POSAwesome");
		expect(wrapper.text()).toContain("Backup Cashier");
		expect(wrapper.text()).toContain("Main POS");
		expect(
			wrapper.get('[data-test="cashier-chip"]').attributes("role"),
		).toBe("button");
	});

	it("renders POS Profile branding only when it is explicitly enabled", () => {
		const wrapper = mount(NavbarAppBar, {
			props: {
				posProfile: {
					name: "Main POS",
					posa_enable_custom_branding: 1,
					posa_brand_name: "My Store POS",
					posa_brand_short_name: "MSP",
				},
			},
			global: {
				mocks: {
					__: (value: string) => value,
					$theme: { isDark: { value: false } },
				},
				components: {
					VAppBar: BoxStub,
					VAppBarNavIcon: ButtonStub,
					VImg: BoxStub,
					VToolbarTitle: BoxStub,
					VSpacer: BoxStub,
					VBtn: ButtonStub,
					VBadge: BoxStub,
					VTooltip: BoxStub,
					VChip: ButtonStub,
					VIcon: BoxStub,
					VProgressLinear: BoxStub,
					NavbarInfoGadgets: BoxStub,
				},
			},
		});

		expect(wrapper.text()).toContain("My Store POS");
		expect(wrapper.text()).not.toContain(POS_BRAND_NAME);
		expect(document.title).toBe("My Store POS");
	});
});
