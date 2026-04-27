// @vitest-environment jsdom

import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import ItemHeader from "../src/posapp/components/pos/items/ItemHeader.vue";

const VRowStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", { class: "v-row-stub" }, slots.default?.());
	},
});

const VColStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", { class: "v-col-stub" }, slots.default?.());
	},
});

const VBtnStub = defineComponent({
	setup(_, { attrs, slots }) {
		return () =>
			h(
				"button",
				{
					...attrs,
					type: "button",
				},
				slots.default?.(),
			);
	},
});

const VExpandTransitionStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", { class: "expand-transition-stub" }, slots.default?.());
	},
});

const VProgressLinearStub = defineComponent({
	props: {
		modelValue: { type: Number, default: 0 },
	},
	setup(props, { attrs }) {
		return () =>
			h("div", {
				...attrs,
				class: ["v-progress-linear-stub", attrs.class],
				"data-model-value": String(props.modelValue),
			});
	},
});

const VTextFieldStub = defineComponent({
	props: {
		modelValue: { type: String, default: "" },
		label: { type: String, default: "" },
		disabled: { type: Boolean, default: false },
	},
	emits: ["update:modelValue"],
	setup(props, { attrs, emit, slots }) {
		return () =>
			h("label", { class: "v-text-field-stub" }, [
				h("span", { class: "field-label" }, props.label),
				h("input", {
					"data-test": attrs["data-test"] ?? "text-field-input",
					value: props.modelValue,
					disabled: props.disabled,
					onInput: (event: Event) =>
						emit(
							"update:modelValue",
							(event.target as HTMLInputElement).value,
						),
				}),
				slots["append-inner"]?.(),
			]);
	},
});

describe("ItemHeader", () => {
	it("shows a non-blocking sync progress bar while keeping search input enabled", () => {
		const wrapper = mount(ItemHeader, {
			props: {
				searchInput: "tea",
				qtyInput: 1,
				posProfile: {
					posa_input_qty: false,
					posa_enable_camera_scanning: false,
				},
				enableBackgroundSync: true,
				showSyncProgress: true,
				syncProgress: 42,
				syncItemsCount: 128,
				syncStatus: "Syncing offline catalog...",
			},
			global: {
				mocks: {
					frappe: { _: (value: string) => value },
					__: (value: string) => value,
				},
				components: {
					VRow: VRowStub,
					VCol: VColStub,
					VBtn: VBtnStub,
					VExpandTransition: VExpandTransitionStub,
					VProgressLinear: VProgressLinearStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		const input = wrapper.get('input[data-test="text-field-input"]');
		expect((input.element as HTMLInputElement).disabled).toBe(false);

		const progressBar = wrapper.get('[data-test="item-search-sync-bar"]');
		expect(progressBar.attributes("data-model-value")).toBe("42");
		expect(wrapper.text()).toContain("Syncing offline catalog...");
		expect(wrapper.text()).toContain("128 items synced");
	});
});
