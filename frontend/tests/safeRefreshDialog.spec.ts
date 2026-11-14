// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
vi.mock("../src/posapp/services/safeRefresh", async (original) => ({
	...(await original<any>()),
	prepareSafeRefresh: vi.fn(),
}));
import SafeRefreshDialog from "../src/posapp/components/ui/SafeRefreshDialog.vue";
import {
	requestSafeRefresh,
	prepareSafeRefresh,
} from "../src/posapp/services/safeRefresh";
const Box = defineComponent({
	setup(_, { slots }) {
		return () => h("div", slots.default?.());
	},
});
const Dialog = defineComponent({
	props: ["modelValue"],
	setup(props, { slots }) {
		return () =>
			props.modelValue ? h("section", slots.default?.()) : null;
	},
});
const Button = defineComponent({
	props: ["disabled"],
	setup(props, { slots, attrs }) {
		return () =>
			h(
				"button",
				{ ...attrs, disabled: props.disabled },
				slots.default?.(),
			);
	},
});
const wrappers: any[] = [];
const mountDialog = () => {
	const wrapper = mount(SafeRefreshDialog, {
		global: {
			components: {
				VDialog: Dialog,
				VCard: Box,
				VCardTitle: Box,
				VCardText: Box,
				VCardActions: Box,
				VBtn: Button,
				VAlert: Box,
			},
		},
	});
	wrappers.push(wrapper);
	return wrapper;
};
describe("ERP safe refresh confirmation", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.mocked(prepareSafeRefresh).mockReset().mockResolvedValue({
			hasCart: true,
			pendingInvoices: 2,
			pendingOtherWrites: 1,
		});
	});
	afterEach(() => {
		wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
		vi.useRealTimers();
	});
	it("shows saved work and requires explicit confirmation with a fresh check", async () => {
		const wrapper = mountDialog(),
			reload = vi.fn();
		expect(requestSafeRefresh({ action: reload })).toBe(true);
		await flushPromises();
		expect(wrapper.text()).toContain("current cart has been saved");
		expect(wrapper.text()).toContain("Pending invoices: 2");
		expect(reload).not.toHaveBeenCalled();
		await wrapper.findAll("button")[1]!.trigger("click");
		await flushPromises();
		expect(prepareSafeRefresh).toHaveBeenCalledTimes(2);
		expect(reload).toHaveBeenCalledOnce();
	});
	it("keeps the app open after a failed save and allows checks to be retried", async () => {
		vi.mocked(prepareSafeRefresh).mockRejectedValueOnce(
			new Error("Storage full"),
		);
		const wrapper = mountDialog(),
			reload = vi.fn();
		requestSafeRefresh({ action: reload });
		await flushPromises();
		expect(wrapper.text()).toContain("Storage full");
		await wrapper.findAll("button")[1]!.trigger("click");
		await flushPromises();
		expect(reload).not.toHaveBeenCalled();
		await wrapper.findAll("button")[1]!.trigger("click");
		await flushPromises();
		expect(reload).toHaveBeenCalledOnce();
	});
	it("intercepts the page-focused hard-refresh key and can be cancelled", async () => {
		const wrapper = mountDialog();
		const event = new KeyboardEvent("keydown", {
			key: "R",
			ctrlKey: true,
			shiftKey: true,
			cancelable: true,
		});
		expect(window.dispatchEvent(event)).toBe(false);
		await flushPromises();
		expect(wrapper.text()).toContain("Safe Refresh");
		await wrapper.findAll("button")[0]!.trigger("click");
		expect(wrapper.text()).toBe("");
	});
	it("unlocks the dialog if the browser cancels navigation after confirmation", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const wrapper = mountDialog();
		requestSafeRefresh({ action: vi.fn() });
		await flushPromises();
		await wrapper.findAll("button")[1]!.trigger("click");
		await flushPromises();
		expect(
			wrapper.findAll("button")[0]!.attributes("disabled"),
		).toBeDefined();
		await vi.advanceTimersByTimeAsync(5000);
		expect(wrapper.text()).toContain("browser did not finish reloading");
		expect(
			wrapper.findAll("button")[0]!.attributes("disabled"),
		).toBeUndefined();
	});
});
