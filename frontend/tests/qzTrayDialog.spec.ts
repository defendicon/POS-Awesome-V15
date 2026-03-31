// @vitest-environment jsdom

import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import QzTrayDialog from "../src/posapp/components/navbar/QzTrayDialog.vue";
import * as qzTrayService from "../src/posapp/services/qzTray";

const toastShow = vi.hoisted(() => vi.fn());

vi.mock("../src/posapp/stores/toastStore", () => ({
	useToastStore: () => ({
		show: toastShow,
	}),
}));

vi.mock("../src/posapp/services/qzTray", async () => {
	const { ref } = await import("vue");
	const selectedQzPrinter = ref("Counter Printer");

	return {
		checkQzCertificateOnce: vi.fn(async () => undefined),
		connectQzTray: vi.fn(async () => true),
		disconnectQzTray: vi.fn(async () => undefined),
		findQzPrinters: vi.fn(async () => ["Counter Printer"]),
		getQzCertificateDownload: vi.fn(async () => ({ pem: "", company: "" })),
		getQzCertificateFilename: vi.fn(() => "qz.pem"),
		setupQzCertificate: vi.fn(async () => ({ status: "created" })),
		qzCertReady: ref(false),
		qzCertStatus: ref("missing"),
		qzConnected: ref(true),
		qzConnecting: ref(false),
		qzPrinters: ref(["Counter Printer"]),
		qzReconnectPaused: ref(false),
		selectedQzPrinter,
		setSelectedQzPrinter: vi.fn((value: string) => {
			selectedQzPrinter.value = value;
		}),
	};
});

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VDialogStub = defineComponent({
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

const VSelectStub = defineComponent({
	name: "VSelectStub",
	props: {
		modelValue: {
			type: String,
			default: "",
		},
	},
	emits: ["update:modelValue"],
	setup(props, { emit, attrs }) {
		return () =>
			h("input", {
				"data-test": attrs["data-test"],
				value: props.modelValue ?? "",
				onInput: (event: Event) =>
					emit("update:modelValue", (event.target as HTMLInputElement).value),
			});
	},
});

const VBtnStub = defineComponent({
	name: "VBtnStub",
	props: {
		disabled: {
			type: Boolean,
			default: false,
		},
	},
	emits: ["click"],
	setup(props, { slots, attrs, emit }) {
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

const globalComponents = {
	VDialog: VDialogStub,
	VCard: BoxStub,
	VCardTitle: BoxStub,
	VCardText: BoxStub,
	VCardActions: BoxStub,
	VSpacer: BoxStub,
	VAlert: BoxStub,
	VDivider: BoxStub,
	VIcon: BoxStub,
	VBtn: VBtnStub,
	VSelect: VSelectStub,
};

const mountDialog = () =>
	mount(QzTrayDialog, {
		props: {
			modelValue: true,
		},
		global: {
			components: globalComponents,
		},
	});

describe("QzTrayDialog", () => {
	beforeEach(() => {
		(globalThis as any).__ = (value: string) => value;
		toastShow.mockReset();
		qzTrayService.qzConnected.value = true;
		qzTrayService.qzConnecting.value = false;
		qzTrayService.qzReconnectPaused.value = false;
		qzTrayService.qzPrinters.value = ["Counter Printer"];
		qzTrayService.selectedQzPrinter.value = "Counter Printer";
		vi.mocked(qzTrayService.setSelectedQzPrinter).mockClear();
		Object.assign(globalThis.navigator, {
			clipboard: {
				writeText: vi.fn(async () => undefined),
			},
		});
	});

	it("copies the selected printer name so it can be pasted into the POS Profile default field", async () => {
		const wrapper = mountDialog();
		await flushPromises();

		await wrapper.get('[data-test="qz-copy-printer-name"]').trigger("click");

		expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledWith("Counter Printer");
		expect(toastShow).toHaveBeenCalledWith(
			expect.objectContaining({
				color: "success",
			}),
		);
	});
});
