// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

import EmployeeSwitchDialog from "../src/posapp/components/pos/employee/EmployeeSwitchDialog.vue";
import { useEmployeeStore } from "../src/posapp/stores/employeeStore";
import { useUIStore } from "../src/posapp/stores/uiStore";

const BoxStub = defineComponent({
	setup(_, { attrs, slots }) {
		return () => h("div", attrs, slots.default?.());
	},
});

const VDialogStub = defineComponent({
	name: "VDialogStub",
	props: {
		modelValue: {
			type: Boolean,
			default: false,
		},
	},
	emits: ["update:modelValue"],
	setup(props, { slots }) {
		return () =>
			props.modelValue ? h("div", {}, slots.default?.()) : null;
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
	setup(props, { attrs, slots }) {
		return () =>
			h(
				"button",
				{
					...attrs,
					type: "button",
					disabled: props.disabled,
					"data-test": attrs["data-test"],
				},
				slots.default?.(),
			);
	},
});

const VTextFieldStub = defineComponent({
	name: "VTextFieldStub",
	props: {
		modelValue: {
			type: [String, Number],
			default: "",
		},
		type: {
			type: String,
			default: "text",
		},
		appendInnerIcon: {
			type: String,
			default: "",
		},
	},
	emits: ["update:modelValue", "click:append-inner"],
	setup(props, { attrs, emit }) {
		return () =>
			h("div", {}, [
				h("input", {
					value: props.modelValue,
					type: props.type,
					name: attrs.name,
					autocomplete: attrs.autocomplete,
					autofocus: attrs.autofocus,
					inputmode: attrs.inputmode,
					pattern: attrs.pattern,
					"data-1p-ignore": attrs["data-1p-ignore"],
					"data-lpignore": attrs["data-lpignore"],
					"data-bwignore": attrs["data-bwignore"],
					"data-test": attrs["data-test"],
					onInput: (event: Event) =>
						emit(
							"update:modelValue",
							(event.target as HTMLInputElement).value,
						),
				}),
				props.appendInnerIcon
					? h(
							"button",
							{
								type: "button",
								"data-test": `${attrs["data-test"]}-toggle`,
								onClick: () => emit("click:append-inner"),
							},
							props.appendInnerIcon,
						)
					: null,
			]);
	},
});

describe("EmployeeSwitchDialog", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		(window as any).__ = (value: string) => value;
		(window as any).frappe = {
			session: {
				user: "cashier@example.com",
				user_fullname: "Main Cashier",
			},
			call: vi.fn(async () => ({
				message: {
					user: "backup@example.com",
					full_name: "Backup Cashier",
					is_supervisor: false,
					terminal_state: {
						pos_profile: "Main POS",
						active_cashier: "backup@example.com",
						locked: false,
					},
				},
			})),
		};
	});

	it("marks cashier PIN input as a numeric one-time credential", async () => {
		const store = useEmployeeStore();
		const uiStore = useUIStore();
		uiStore.setPosProfile({ name: "Main POS" } as any);
		store.setTerminalEmployees([
			{ user: "cashier@example.com", full_name: "Main Cashier" },
		]);
		store.applyTerminalState({
			active_cashier: "cashier@example.com",
			locked: false,
		});
		store.openEmployeeSwitch();

		const wrapper = mount(EmployeeSwitchDialog, {
			global: {
				components: {
					VDialog: VDialogStub,
					VCard: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VAlert: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		const input = wrapper.get('input[data-test="cashier-pin-input"]');
		expect(input.attributes()).toMatchObject({
			name: "pos-cashier-switch-pin",
			autocomplete: "one-time-code",
			inputmode: "numeric",
			pattern: "[0-9]*",
			"data-1p-ignore": "true",
			"data-lpignore": "true",
			"data-bwignore": "true",
		});
	});

	it("requires a cashier pin before switching terminal operator", async () => {
		const store = useEmployeeStore();
		const uiStore = useUIStore();
		uiStore.setPosProfile({ name: "Main POS" } as any);
		store.setTerminalEmployees([
			{ user: "cashier@example.com", full_name: "Main Cashier" },
			{ user: "backup@example.com", full_name: "Backup Cashier" },
		]);
		store.applyTerminalState({
			active_cashier: "cashier@example.com",
			locked: false,
		});
		store.openEmployeeSwitch();

		const wrapper = mount(EmployeeSwitchDialog, {
			global: {
				components: {
					VDialog: VDialogStub,
					VCard: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VAlert: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		await wrapper
			.get('[data-test="employee-option-backup@example.com"]')
			.trigger("click");
		await wrapper
			.get('input[data-test="cashier-pin-input"]')
			.setValue("1234");
		await wrapper.get('[data-test="cashier-pin-submit"]').trigger("click");
		await Promise.resolve();

		expect((window as any).frappe.call).toHaveBeenCalledWith({
			method: "posawesome.posawesome.api.employees.verify_terminal_employee_pin",
			args: {
				pos_profile: "Main POS",
				user: "backup@example.com",
				pin: "1234",
			},
		});
		expect(store.currentCashier?.user).toBe("backup@example.com");
		expect(store.switchDialogOpen).toBe(false);
	});

	it("shows an actionable error state and allows revealing the PIN", async () => {
		const store = useEmployeeStore();
		const uiStore = useUIStore();
		uiStore.setPosProfile({ name: "Main POS" } as any);
		store.setTerminalEmployees([
			{ user: "cashier@example.com", full_name: "Main Cashier" },
			{ user: "backup@example.com", full_name: "Backup Cashier" },
		]);
		store.applyTerminalState({
			active_cashier: "cashier@example.com",
			locked: false,
		});
		store.openEmployeeSwitch();

		(window as any).frappe.call = vi.fn(async () => {
			throw new Error("Invalid cashier PIN.");
		});

		const wrapper = mount(EmployeeSwitchDialog, {
			global: {
				components: {
					VDialog: VDialogStub,
					VCard: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VAlert: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		await wrapper
			.get('[data-test="employee-option-backup@example.com"]')
			.trigger("click");
		expect(
			wrapper
				.get('input[data-test="cashier-pin-input"]')
				.attributes("type"),
		).toBe("password");

		await wrapper
			.get('[data-test="cashier-pin-input-toggle"]')
			.trigger("click");
		expect(
			wrapper
				.get('input[data-test="cashier-pin-input"]')
				.attributes("type"),
		).toBe("text");

		await wrapper
			.get('input[data-test="cashier-pin-input"]')
			.setValue("9999");
		await wrapper.get('[data-test="cashier-pin-submit"]').trigger("click");
		await Promise.resolve();

		expect(wrapper.get('[data-test="cashier-pin-error"]').text()).toContain(
			"Invalid cashier PIN.",
		);
		expect(wrapper.text()).not.toContain("User form");
	});

	it("shows a locked loading state, then renders and selects asynchronously loaded cashiers", async () => {
		const store = useEmployeeStore();
		const uiStore = useUIStore();
		uiStore.setPosProfile({ name: "Main POS" } as any);
		store.beginTerminalEmployeesLoad("Main POS");

		const wrapper = mount(EmployeeSwitchDialog, {
			global: {
				components: {
					VDialog: VDialogStub,
					VCard: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VAlert: BoxStub,
					VTextField: VTextFieldStub,
					VProgressCircular: BoxStub,
				},
			},
		});

		expect(
			wrapper.get('[data-test="terminal-cashier-loading"]').text(),
		).toContain("Loading authorized cashiers");
		expect(wrapper.find('[data-test="terminal-unlock-pin"]').exists()).toBe(
			false,
		);

		store.completeTerminalEmployeesLoad("Main POS", [
			{ user: "cashier@example.com", full_name: "Main Cashier" },
			{ user: "backup@example.com", full_name: "Backup Cashier" },
		]);
		await wrapper.vm.$nextTick();

		const firstCashier = wrapper.get(
			'[data-test="terminal-unlock-cashier-cashier@example.com"]',
		);
		expect(firstCashier.text()).toContain("Main Cashier");
		expect(firstCashier.classes()).toContain(
			"employee-switch-dialog__option--active",
		);
		expect(wrapper.get('[data-test="terminal-unlock-pin"]').exists()).toBe(
			true,
		);
	});

	it("shows the cached cashier and focused PIN field immediately during refresh", async () => {
		const store = useEmployeeStore();
		const uiStore = useUIStore();
		uiStore.setPosProfile({ name: "Main POS" } as any);
		store.beginTerminalEmployeesLoad("Main POS");
		store.completeTerminalEmployeesLoad("Main POS", [
			{ user: "cashier@example.com", full_name: "Main Cashier" },
		]);
		store.beginTerminalEmployeesLoad("Main POS");

		const wrapper = mount(EmployeeSwitchDialog, {
			global: {
				components: {
					VDialog: VDialogStub,
					VCard: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VAlert: BoxStub,
					VTextField: VTextFieldStub,
					VProgressCircular: BoxStub,
				},
			},
		});

		expect(wrapper.find('[data-test="terminal-cashier-loading"]').exists()).toBe(false);
		expect(wrapper.get('[data-test="terminal-unlock-cashier-cashier@example.com"]').text()).toContain(
			"Main Cashier",
		);
		expect(wrapper.get('[data-test="terminal-unlock-pin"]').attributes("autofocus")).not.toBeUndefined();
	});

	it("shows a recoverable cashier load error without exposing stale options", async () => {
		const store = useEmployeeStore();
		store.beginTerminalEmployeesLoad("Main POS");
		store.failTerminalEmployeesLoad(
			"Main POS",
			"Unable to load cashiers for this POS profile.",
		);
		const retryLoad = vi.fn();

		const wrapper = mount(EmployeeSwitchDialog, {
			attrs: {
				onRetryLoad: retryLoad,
			},
			global: {
				components: {
					VDialog: VDialogStub,
					VCard: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VAlert: BoxStub,
					VTextField: VTextFieldStub,
					VProgressCircular: BoxStub,
				},
			},
		});

		expect(
			wrapper.get('[data-test="terminal-cashier-error"]').text(),
		).toContain("Unable to load cashiers");
		expect(wrapper.find(".employee-switch-dialog__option").exists()).toBe(
			false,
		);
		expect(wrapper.find('[data-test="terminal-unlock-pin"]').exists()).toBe(
			false,
		);

		await wrapper
			.get('[data-test="terminal-cashier-retry"]')
			.trigger("click");
		await wrapper.vm.$nextTick();
		expect(store.terminalEmployeesLoadStatus).toBe("loading");
		expect(
			wrapper.get('[data-test="terminal-cashier-loading"]').text(),
		).toContain("Loading authorized cashiers");
		expect(retryLoad).toHaveBeenCalledOnce();
	});

	it("distinguishes an authorized empty cashier list from loading and errors", async () => {
		const store = useEmployeeStore();
		store.beginTerminalEmployeesLoad("Main POS");
		store.completeTerminalEmployeesLoad("Main POS", []);

		const wrapper = mount(EmployeeSwitchDialog, {
			global: {
				components: {
					VDialog: VDialogStub,
					VCard: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VAlert: BoxStub,
					VTextField: VTextFieldStub,
					VProgressCircular: BoxStub,
				},
			},
		});

		expect(
			wrapper.get('[data-test="terminal-cashier-empty"]').text(),
		).toContain("No enabled cashiers");
		expect(
			wrapper.find('[data-test="terminal-cashier-loading"]').exists(),
		).toBe(false);
		expect(
			wrapper.find('[data-test="terminal-cashier-error"]').exists(),
		).toBe(false);
	});

	it("automatically unlocks when the selected cashier PIN reaches its configured length", async () => {
		const store = useEmployeeStore();
		const uiStore = useUIStore();
		uiStore.setPosProfile({ name: "Main POS" } as any);
		store.setTerminalEmployees([
			{
				user: "backup@example.com",
				full_name: "Backup Cashier",
				pin_length: 4,
			},
		]);
		void store.requestTerminalUnlock();

		const wrapper = mount(EmployeeSwitchDialog, {
			global: {
				components: {
					VDialog: VDialogStub,
					VCard: BoxStub,
					VCardTitle: BoxStub,
					VCardText: BoxStub,
					VCardActions: BoxStub,
					VBtn: VBtnStub,
					VIcon: BoxStub,
					VAlert: BoxStub,
					VTextField: VTextFieldStub,
				},
			},
		});

		await wrapper
			.get('input[data-test="terminal-unlock-pin"]')
			.setValue("1234");

		await vi.waitFor(() => {
			expect((window as any).frappe.call).toHaveBeenCalledWith(
				expect.objectContaining({
					args: expect.objectContaining({ pin: "1234" }),
				}),
			);
			expect(store.isLocked).toBe(false);
		});
	});

	const mountFirstUse = (mode = "lock", pinLength = 0) => {
		const store = useEmployeeStore();
		useUIStore().setPosProfile({ name: "Main POS" } as any);
		store.setTerminalEmployees([
			{ user: "cashier@example.com", full_name: "Main Cashier", pin_length: pinLength },
			{ user: "backup@example.com", full_name: "Backup Cashier", pin_length: 0, is_current: true },
		]);
		if (mode === "switch") {
			store.applyTerminalState({ active_cashier: "cashier@example.com", locked: false });
			store.openEmployeeSwitch();
		}
		const wrapper = mount(EmployeeSwitchDialog, {
			global: { components: {
				VDialog: VDialogStub, VCard: BoxStub, VCardTitle: BoxStub,
				VCardText: BoxStub, VCardActions: BoxStub, VBtn: VBtnStub,
				VIcon: BoxStub, VAlert: BoxStub, VTextField: VTextFieldStub,
			} },
		});
		return { store, wrapper };
	};

	it.each([["lock", "0578"], ["switch", "0578"], ["lock", "01234567"], ["switch", "01234567"]])("creates the signed-in cashier's first PIN from the %s dialog with %s", async (mode, pin) => {
		const { store, wrapper } = mountFirstUse(mode);
		expect(wrapper.text()).toContain("Create your PIN");
		const inputs = wrapper.findAll("input");
		expect(inputs).toHaveLength(2);
		for (const input of inputs) {
			expect(input.attributes("type")).toBe("password");
			expect(input.attributes("inputmode")).toBe("numeric");
			expect(input.attributes("autocomplete")).toBe("new-password");
		}
		await inputs[0].setValue(pin);
		await inputs[1].setValue(pin);
		expect((window as any).frappe.call).not.toHaveBeenCalled();
		(window as any).frappe.call.mockResolvedValue({ message: {
			user: "cashier@example.com", full_name: "Main Cashier", has_pin: true,
			terminal_state: { active_cashier: "cashier@example.com", locked: false },
		} });
		await wrapper.get(".employee-switch-dialog__actions button:last-child").trigger("click");
		await flushPromises();
		expect((window as any).frappe.call).toHaveBeenCalledOnce();
		expect((window as any).frappe.call).toHaveBeenCalledWith({
			method: "posawesome.posawesome.api.employees.save_cashier_pin",
			args: { pos_profile: "Main POS", user: "cashier@example.com", new_pin: pin },
		});
		expect(store.currentCashier?.user).toBe("cashier@example.com");
		expect(store.isLocked).toBe(false);
		expect(store.switchDialogOpen).toBe(false);
		expect(store.terminalEmployees[0].pin_length).toBe(pin.length);
		store.lockTerminal();
		await wrapper.vm.$nextTick();
		expect(wrapper.text()).not.toContain("Create your PIN");
		expect(wrapper.findAll("input")).toHaveLength(1);
	});

	it.each(["lock", "switch"])("directs a different PIN-less cashier to a supervisor in %s mode", async (mode) => {
		const { wrapper } = mountFirstUse(mode);
		const selector = mode === "lock" ? "terminal-unlock-cashier" : "employee-option";
		await wrapper.get(`[data-test="${selector}-backup@example.com"]`).trigger("click");
		expect(wrapper.text()).toMatch(/ask a.*supervisor/i);
		expect(wrapper.text()).not.toContain("User form");
		expect(wrapper.text()).not.toContain("Create your PIN");
		expect(wrapper.findAll("input")).toHaveLength(0);
		expect(wrapper.get(".employee-switch-dialog__actions button:last-child").attributes("disabled")).toBeDefined();
		expect((window as any).frappe.call).not.toHaveBeenCalled();
	});

	it.each(["123", "123456789", "12ab"])("does not save an invalid new PIN %s", async (pin) => {
		const { store, wrapper } = mountFirstUse();
		expect(wrapper.findAll("input")).toHaveLength(2);
		await wrapper.findAll("input")[0].setValue(pin);
		await wrapper.findAll("input")[1].setValue(pin);
		await wrapper.get(".employee-switch-dialog__actions button:last-child").trigger("click");
		await flushPromises();
		expect(wrapper.text()).toContain("4 to 8 digits");
		expect((window as any).frappe.call).not.toHaveBeenCalled();
		expect(store.isLocked).toBe(true);
	});

	it("shows a mismatch without saving and clears both credentials when selection changes", async () => {
		const { wrapper } = mountFirstUse();
		expect(wrapper.findAll("input")).toHaveLength(2);
		await wrapper.findAll("input")[0].setValue("1234");
		await wrapper.findAll("input")[1].setValue("1235");
		await wrapper.get(".employee-switch-dialog__actions button:last-child").trigger("click");
		await flushPromises();
		expect(wrapper.text()).toContain("PIN confirmation does not match");
		expect((window as any).frappe.call).not.toHaveBeenCalled();
		await wrapper.get('[data-test="terminal-unlock-cashier-backup@example.com"]').trigger("click");
		await wrapper.get('[data-test="terminal-unlock-cashier-cashier@example.com"]').trigger("click");
		expect(wrapper.findAll("input").map(input => (input.element as HTMLInputElement).value)).toEqual(["", ""]);
		expect(wrapper.text()).not.toContain("PIN confirmation does not match");
	});

	it.each(["server-error", "unverified"])("keeps the terminal locked after %s on first PIN save", async (failure) => {
		const { store, wrapper } = mountFirstUse();
		expect(wrapper.findAll("input")).toHaveLength(2);
		await wrapper.findAll("input")[0].setValue("12345678");
		await wrapper.findAll("input")[1].setValue("12345678");
		if (failure === "server-error") {
			(window as any).frappe.call.mockRejectedValue(new Error("Invalid cashier PIN."));
		} else {
			(window as any).frappe.call.mockResolvedValue({ message: { user: "cashier@example.com", has_pin: true } });
		}
		await wrapper.get(".employee-switch-dialog__actions button:last-child").trigger("click");
		await flushPromises();
		expect(store.isLocked).toBe(true);
		expect(store.currentCashier).toBeNull();
		expect(wrapper.text()).toContain(failure === "server-error" ? "Invalid cashier PIN" : "server did not confirm");
	});
});
