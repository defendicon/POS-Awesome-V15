// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

import NavbarCashierPinForm from "../src/posapp/components/navbar/NavbarCashierPinForm.vue";

const flushPromises = async () => {
	await Promise.resolve();
	await Promise.resolve();
	await nextTick();
	await Promise.resolve();
};

describe("NavbarCashierPinForm", () => {
	const frappeCall = vi.fn();

	const mountForm = (props: Record<string, unknown> = {}) =>
		mount(NavbarCashierPinForm, {
			props: {
				posProfile: null,
				currentCashier: null,
				currentCashierDisplay: "",
				...props,
			},
			global: {
				mocks: {
					__: (value: string, ...args: string[]) =>
						value.replace(/\{(\d+)\}/g, (_, index) => `${args[Number(index)] ?? ""}`),
				},
				stubs: {
					"v-alert": {
						template: '<div class="v-alert"><slot /></div>',
					},
					"v-text-field": {
						props: ["modelValue", "label", "type", "appendInnerIcon", "disabled"],
						emits: ["update:modelValue", "click:append-inner"],
						template:
							'<label><span>{{ label }}</span><input :value="modelValue" :type="type || \'text\'" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" /></label>',
					},
					"v-btn": {
						props: ["disabled", "loading", "color", "variant"],
						emits: ["click"],
						template:
							'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
					},
					"v-progress-circular": true,
				},
			},
		});

	beforeEach(() => {
		frappeCall.mockReset();
		vi.stubGlobal("__", (value: string, ...args: string[]) =>
			value.replace(/\{(\d+)\}/g, (_, index) => `${args[Number(index)] ?? ""}`),
		);
		vi.stubGlobal("frappe", {
			call: frappeCall,
		});
	});

	it("shows a warning when cashier or profile context is missing", () => {
		const wrapper = mountForm();

		expect(wrapper.get('[data-test="cashier-pin-empty-state"]').text()).toContain(
			"Load a POS profile and cashier first.",
		);
		expect(frappeCall).not.toHaveBeenCalled();
	});

	it("loads cashier pin status when profile and cashier context are present", async () => {
		frappeCall.mockResolvedValue({
			message: {
				has_pin: true,
			},
		});

		const wrapper = mountForm({
			posProfile: { name: "Main POS" },
			currentCashier: { user: "cashier@example.com" },
			currentCashierDisplay: "Main Cashier",
		});

		await flushPromises();

		expect(frappeCall).toHaveBeenCalledWith(
			expect.objectContaining({
				method: "posawesome.posawesome.api.employees.get_cashier_pin_status",
			}),
		);
		expect(wrapper.get('[data-test="cashier-pin-message"]').text()).toContain(
			"Enter the current PIN, then choose a new one.",
		);
	});

	it("shows validation error when the new pin is invalid", async () => {
		frappeCall.mockResolvedValue({
			message: {
				has_pin: false,
			},
		});

		const wrapper = mountForm({
			posProfile: { name: "Main POS" },
			currentCashier: { user: "cashier@example.com" },
			currentCashierDisplay: "Main Cashier",
		});

		await flushPromises();
		await wrapper.get('[data-test="cashier-pin-new-input"] input').setValue("12");
		await wrapper.get('[data-test="cashier-pin-confirm-input"] input').setValue("12");
		await wrapper.get('[data-test="cashier-pin-save"]').trigger("click");

		expect(wrapper.get('[data-test="cashier-pin-message"]').text()).toContain(
			"PIN must be 4 to 8 digits.",
		);
	});

	it("saves the cashier pin and shows success state", async () => {
		frappeCall
			.mockResolvedValueOnce({
				message: {
					has_pin: false,
				},
			})
			.mockResolvedValueOnce({
				message: {
					has_pin: true,
				},
			});

		const wrapper = mountForm({
			posProfile: { name: "Main POS" },
			currentCashier: { user: "cashier@example.com" },
			currentCashierDisplay: "Main Cashier",
		});

		await flushPromises();
		await wrapper.get('[data-test="cashier-pin-new-input"] input').setValue("1234");
		await wrapper.get('[data-test="cashier-pin-confirm-input"] input').setValue("1234");
		await wrapper.get('[data-test="cashier-pin-save"]').trigger("click");

		await flushPromises();

		expect(frappeCall).toHaveBeenLastCalledWith(
			expect.objectContaining({
				method: "posawesome.posawesome.api.employees.save_cashier_pin",
			}),
		);
		expect(wrapper.get('[data-test="cashier-pin-message"]').text()).toContain(
			"Cashier PIN saved successfully.",
		);
	});
});
