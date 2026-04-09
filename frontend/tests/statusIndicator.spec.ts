// @vitest-environment jsdom

import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import StatusIndicator from "../src/posapp/components/navbar/StatusIndicator.vue";

const VBtnStub = defineComponent({
	setup(_, { attrs, slots }) {
		return () =>
			h(
				"button",
				{
					...attrs,
					onClick: attrs.onClick as (() => void) | undefined,
				},
				slots.default?.(),
			);
	},
});

const VIconStub = defineComponent({
	setup(_, { slots }) {
		return () => h("i", {}, slots.default?.());
	},
});

const VTooltipStub = defineComponent({
	setup(_, { slots }) {
		return () =>
			h("div", {}, [
				slots.activator?.({
					props: {},
				}),
				h("div", { class: "tooltip-content" }, slots.default?.()),
			]);
	},
});

describe("StatusIndicator", () => {
	it("opens the offline status panel when clicked", async () => {
		const Parent = defineComponent({
			components: { StatusIndicator },
			setup() {
				const panels = ref(0);
				return { panels };
			},
			template: `
				<StatusIndicator
					:network-online="false"
					:server-online="false"
					:server-connecting="false"
					:is-ip-host="false"
					@toggle-panel="panels += 1"
				/>
			`,
		});

		const wrapper = mount(Parent, {
			global: {
				components: {
					VBtn: VBtnStub,
					VIcon: VIconStub,
					VTooltip: VTooltipStub,
				},
			},
		});

		const button = wrapper.getComponent(VBtnStub);
		const onClick = button.vm.$attrs.onClick as (() => void) | undefined;
		expect(typeof onClick).toBe("function");
		onClick?.();
		await wrapper.vm.$nextTick();

		expect((wrapper.vm as any).panels).toBe(1);
	});

	it("shows a visible checking state while connectivity is being revalidated", () => {
		const wrapper = mount(StatusIndicator, {
			props: {
				networkOnline: true,
				serverOnline: false,
				serverConnecting: true,
				isIpHost: false,
			},
			global: {
				components: {
					VBtn: VBtnStub,
					VIcon: VIconStub,
					VTooltip: VTooltipStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Checking");
		expect(wrapper.find('[data-test="status-checking-indicator"]').exists()).toBe(true);
	});

	it("shows a separate bootstrap warning marker and hover warning details", () => {
		const warningMessage =
			"Cached offline data belongs to a different app build.";
		const wrapper = mount(StatusIndicator, {
			props: {
				networkOnline: true,
				serverOnline: true,
				serverConnecting: false,
				isIpHost: false,
				bootstrapWarningActive: true,
				bootstrapWarningTooltip: warningMessage,
			},
			global: {
				components: {
					VBtn: VBtnStub,
					VIcon: VIconStub,
					VTooltip: VTooltipStub,
				},
			},
		});

		expect(
			wrapper.find('[data-test="status-bootstrap-warning-indicator"]').exists(),
		).toBe(true);
		expect(wrapper.text()).toContain("Online");
		expect(wrapper.text()).toContain(warningMessage);
		expect(wrapper.get("button").attributes("aria-label")).toContain(
			warningMessage,
		);
	});
});
