// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";

import StatusIndicator from "../src/posapp/components/navbar/StatusIndicator.vue";

const VBtnStub = defineComponent({
	emits: ["click"],
	setup(_, { attrs, slots, emit }) {
		return () =>
			h(
				"button",
				{
					...attrs,
					onClick: () => emit("click"),
				},
				slots.default?.(),
			);
	},
});

const VIconStub = defineComponent({
	setup(_, { slots }) {
		return () => h("span", { class: "v-icon-stub" }, slots.default?.());
	},
});

const VTooltipStub = defineComponent({
	setup(_, { slots }) {
		return () =>
			h("div", { class: "v-tooltip-stub" }, [
				slots.activator?.({
					props: {},
				}),
				h("div", { class: "v-tooltip-stub__content" }, slots.default?.()),
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

		await wrapper.get("button").trigger("click");

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

	it("shows global offline data sync progress in the navbar", () => {
		vi.stubGlobal("__", (value: string) => value);

		const wrapper = mount(StatusIndicator, {
			props: {
				networkOnline: true,
				serverOnline: true,
				offlineSyncLabel: "Offline Data 7/10",
				offlineSyncDetail: "Refreshing 2 offline resources.",
				offlineSyncTone: "info",
				offlineSyncProgress: 70,
			},
			global: {
				components: {
					VTooltip: VTooltipStub,
					VBtn: VBtnStub,
					VIcon: VIconStub,
				},
			},
		});

		const indicator = wrapper.get('[data-test="global-sync-indicator"]');
		expect(indicator.text()).toContain("Offline Data 7/10");
		expect(wrapper.text()).toContain("Refreshing 2 offline resources.");
		expect(wrapper.get(".status-sync-inline__bar").attributes("style")).toContain(
			"width: 70%",
		);
	});
});
