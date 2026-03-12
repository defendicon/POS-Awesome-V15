// @vitest-environment jsdom

import { defineComponent, h, nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewItemDialog from "../src/posapp/components/pos/items/NewItemDialog.vue";
import itemService from "../src/posapp/services/itemService";

vi.mock("../src/posapp/services/itemService", () => ({
	default: {
		getUOMs: vi.fn(),
		createItem: vi.fn(),
	},
}));

const VDialogStub = defineComponent({
	name: "VDialogStub",
	props: {
		modelValue: {
			type: Boolean,
			default: false,
		},
	},
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VFormStub = defineComponent({
	name: "VFormStub",
	setup(_, { slots, expose }) {
		expose({
			validate: () => Promise.resolve({ valid: true }),
		});
		return () => h("form", {}, slots.default?.());
	},
});

const createInputStub = (name: string) =>
	defineComponent({
		name,
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
		emits: ["update:modelValue"],
		setup(props, { attrs, emit }) {
			return () =>
				h("input", {
					value: props.modelValue ?? "",
					"data-test": attrs["data-test"],
					"aria-label": props.label,
					onInput: (event: Event) =>
						emit("update:modelValue", (event.target as HTMLInputElement).value),
				});
		},
	});

const VButtonStub = defineComponent({
	name: "VButtonStub",
	emits: ["click"],
	setup(_, { slots, attrs, emit }) {
		return () =>
			h(
				"button",
				{
					type: "button",
					"data-test": attrs["data-test"],
					onClick: () => emit("click"),
				},
				slots.default?.(),
			);
	},
});

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const globalComponents = {
	VDialog: VDialogStub,
	VCard: BoxStub,
	VCardTitle: BoxStub,
	VCardText: BoxStub,
	VCardActions: BoxStub,
	VRow: BoxStub,
	VCol: BoxStub,
	VSpacer: defineComponent({ setup: () => () => h("div") }),
	VForm: VFormStub,
	VTextField: createInputStub("VTextFieldStub"),
	VSelect: createInputStub("VSelectStub"),
	VAutocomplete: createInputStub("VAutocompleteStub"),
	VBtn: VButtonStub,
};

const mountDialog = (props: Record<string, unknown> = {}) =>
	mount(NewItemDialog, {
		props: {
			modelValue: true,
			itemsGroup: ["ALL", "Products"],
			cameraEnabled: false,
			scannedBarcode: "",
			...props,
		},
		global: {
			components: globalComponents,
			config: {
				globalProperties: {
					__: (value: string) => value,
					frappe: {
						_: (value: string) => value,
					},
				},
			},
		},
	});

describe("NewItemDialog", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		(globalThis as any).frappe = {
			_: (value: string) => value,
			msgprint: vi.fn(),
			show_alert: vi.fn(),
		};
		vi.mocked(itemService.getUOMs).mockResolvedValue([{ name: "Nos" }]);
		vi.mocked(itemService.createItem).mockResolvedValue({
			item_code: "ITEM-001",
			item_name: "Item 001",
		} as any);
	});

	it("renders a barcode field", async () => {
		const wrapper = mountDialog();
		await flushPromises();

		expect(wrapper.find('[data-test="new-item-barcode"]').exists()).toBe(true);
	});

	it("shows the camera button only when camera scanning is enabled", async () => {
		const disabledWrapper = mountDialog({ cameraEnabled: false });
		const enabledWrapper = mountDialog({ cameraEnabled: true });
		await flushPromises();

		expect(disabledWrapper.find('[data-test="new-item-camera-scan"]').exists()).toBe(false);
		expect(enabledWrapper.find('[data-test="new-item-camera-scan"]').exists()).toBe(true);
	});

	it("updates the barcode field from scanned barcode props", async () => {
		const wrapper = mountDialog({ cameraEnabled: true, scannedBarcode: "" });
		await flushPromises();

		await wrapper.setProps({ scannedBarcode: "99887766" });
		await nextTick();

		expect(
			(wrapper.get('[data-test="new-item-barcode"]').element as HTMLInputElement).value,
		).toBe("99887766");
	});

	it("submits the entered barcode through item creation", async () => {
		const wrapper = mountDialog();
		await flushPromises();

		await wrapper.get('[data-test="new-item-code"]').setValue("ITEM-001");
		await wrapper.get('[data-test="new-item-name"]').setValue("Item 001");
		await wrapper.get('[data-test="new-item-group"]').setValue("Products");
		await wrapper.get('[data-test="new-item-stock-uom"]').setValue("Nos");
		await wrapper.get('[data-test="new-item-standard-rate"]').setValue("10");
		await wrapper.get('[data-test="new-item-barcode"]').setValue("123456789");

		await wrapper.get('[data-test="new-item-submit"]').trigger("click");
		await flushPromises();

		expect(itemService.createItem).toHaveBeenCalledWith(
			expect.objectContaining({
				item_code: "ITEM-001",
				item_name: "Item 001",
				barcode: "123456789",
			}),
		);
	});
});
