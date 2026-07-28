// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

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
		expect(wrapper.text()).toContain(
			"Set each cashier PIN in the User form",
		);
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

	it("opens the lock dialog and focuses the PIN field whenever the terminal locks", async () => {
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

		const wrapper = mount(EmployeeSwitchDialog, {
			attachTo: document.body,
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

		expect(wrapper.find('[data-test="terminal-lock-dialog"]').exists()).toBe(
			false,
		);

		store.lockTerminal();
		await wrapper.vm.$nextTick();
		await wrapper.vm.$nextTick();

		const pinInput = wrapper.get(
			'input[data-test="terminal-unlock-pin"]',
		).element;
		expect(wrapper.get('[data-test="terminal-lock-dialog"]').isVisible()).toBe(
			true,
		);
		expect(document.activeElement).toBe(pinInput);
		wrapper.unmount();
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
});
