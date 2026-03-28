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

describe("StatusIndicator", () => {
	it("invokes the parent retry handler when clicked", async () => {
		const Parent = defineComponent({
			components: { StatusIndicator },
			setup() {
				const retries = ref(0);
				return { retries };
			},
			template: `
				<StatusIndicator
					:network-online="false"
					:server-online="false"
					:server-connecting="false"
					:is-ip-host="false"
					@retry-status="retries += 1"
				/>
			`,
		});

		const wrapper = mount(Parent, {
			global: {
				components: {
					VBtn: VBtnStub,
					VIcon: VIconStub,
				},
			},
		});

		const button = wrapper.getComponent(VBtnStub);
		const onClick = button.vm.$attrs.onClick as (() => void) | undefined;
		expect(typeof onClick).toBe("function");
		onClick?.();
		await wrapper.vm.$nextTick();

		expect((wrapper.vm as any).retries).toBe(1);
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
				},
			},
		});

		expect(wrapper.text()).toContain("Checking");
		expect(wrapper.find('[data-test="status-checking-indicator"]').exists()).toBe(true);
	});
});
