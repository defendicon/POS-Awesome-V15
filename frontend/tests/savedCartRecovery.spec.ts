// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import SavedCartRecovery from "../src/posapp/components/pos/invoice/SavedCartRecovery.vue";

describe("saved cart selection", () => {
	it("shows the saved sale, emits its key and disables adoption over an active cart", async () => {
		const recover = vi.fn(),
			refresh = vi.fn();
		const wrapper = mount(SavedCartRecovery, {
			props: {
				candidates: [
					{
						key: "internal-key",
						snapshot: {
							version: 1,
							scope: {} as any,
							saved_at: "2026-11-10T08:00:00Z",
							invoice: {
								customer_name: "Alice",
								currency: "PKR",
								grand_total: 60,
								items: [{}],
							},
						},
					},
				],
				warning: "",
				busy: false,
				hasItems: false,
				onRecover: recover,
				onRefresh: refresh,
			},
			global: {
				components: {
					VAlert: defineComponent({
						setup(_, { slots }) {
							return () => h("section", slots.default?.());
						},
					}),
					VBtn: defineComponent({
						props: ["disabled"],
						setup(props, { slots, attrs }) {
							return () =>
								h(
									"button",
									{ ...attrs, disabled: props.disabled },
									slots.default?.(),
								);
						},
					}),
				},
			},
		});
		expect(wrapper.text()).toContain("Alice");
		expect(wrapper.text()).toContain("PKR 60");
		expect(wrapper.text()).not.toContain("internal-key");
		expect(
			wrapper.findAll("button")[0]!.attributes("disabled"),
			wrapper.html(),
		).toBeUndefined();
		await wrapper.findAll("button")[0]!.trigger("click");
		expect(recover).toHaveBeenCalledWith("internal-key");
		await wrapper.setProps({ hasItems: true });
		expect(
			wrapper.findAll("button")[0]!.attributes("disabled"),
		).toBeDefined();
		await wrapper.findAll("button")[1]!.trigger("click");
		expect(refresh).toHaveBeenCalledOnce();
		await wrapper.setProps({ busy: true });
		expect(
			wrapper
				.findAll("button")
				.every((button) => button.attributes("disabled") !== undefined),
		).toBe(true);
	});
});
