// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { shallowMount } from "@vue/test-utils";

import NavbarMenu from "../src/posapp/components/navbar/NavbarMenu.vue";
import { useEmployeeStore } from "../src/posapp/stores/employeeStore";

const flushPromises = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe("NavbarMenu cashier pin management", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("frappe", {
			session: {
				user: "cashier@example.com",
				user_fullname: "Main Cashier",
			},
			boot: {
				pos_profile: {},
			},
			call: vi.fn(async ({ method }: { method: string }) => {
				if (method === "posawesome.posawesome.api.utilities.get_current_user_language") {
					return {
						message: {
							success: true,
							available_languages: [{ code: "en", name: "English", native_name: "English" }],
							language_code: "en",
						},
					};
				}
				return { message: {} };
			}),
		});
	});

	const mountMenu = (overrides: Record<string, any> = {}) =>
		shallowMount(NavbarMenu, {
			props: {
				posProfile: {
					name: "Main POS",
					posa_allow_print_last_invoice: 1,
					posa_enable_customer_display: 1,
					posa_hide_closing_shift: 0,
					posa_silent_print: 1,
					...overrides.posProfile,
				},
				cashierName: "Main Cashier",
				manualOffline: false,
				networkOnline: true,
				serverOnline: true,
				...overrides.props,
			},
			global: {
				mocks: {
					__: (value: string) => value,
					$theme: { isDark: { value: false } },
				},
				stubs: {
					QzTrayDialog: true,
					VMenu: true,
					VBtn: true,
					VIcon: true,
					VCard: true,
					VList: true,
					VListItem: true,
					VDivider: true,
					VDialog: true,
					VCardTitle: true,
					VCardText: true,
					VCardActions: true,
					VSpacer: true,
					VSelect: true,
					VSwitch: true,
					VSnackbar: true,
					VAlert: true,
					VTextField: true,
				},
			},
		});

	it("surfaces a cashier-first quick actions panel and grouped settings sections", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: false,
		});

		const wrapper = mountMenu();
		await flushPromises();

		expect((wrapper.vm as any).activePanel).toBe("main");
		expect((wrapper.vm as any).quickActions.map((action: any) => action.id)).toEqual([
			"switch-cashier",
			"lock-screen",
			"print-last-invoice",
			"sync-offline-sales",
			"close-shift",
		]);
		expect((wrapper.vm as any).quickActionRows).toHaveLength(5);
		expect((wrapper.vm as any).quickActionRows.every((row: any[]) => row.length === 1)).toBe(true);

		await (wrapper.vm as any).openSettingsPanel();

		expect((wrapper.vm as any).activePanel).toBe("settings");
		expect((wrapper.vm as any).settingsSections.map((section: any) => section.id)).toEqual([
			"personal",
			"terminal",
			"tools",
			"session",
		]);
		expect((wrapper.vm as any).supervisorSections).toEqual([]);
	});

	it("shows restricted supervisor tools only for POS supervisors", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "supervisor@example.com",
			full_name: "Supervisor",
			is_supervisor: true,
		});

		const wrapper = mountMenu();
		await flushPromises();
		await (wrapper.vm as any).openSettingsPanel();

		expect((wrapper.vm as any).showSupervisorSection).toBe(true);
		expect((wrapper.vm as any).supervisorSections).toEqual([
			expect.objectContaining({
				id: "restricted",
				actions: [
					expect.objectContaining({
						id: "awesome-dashboard",
					}),
				],
			}),
		]);
	});

	it("creates a cashier pin without requiring a current pin when none exists", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: false,
		});

		(window as any).frappe.call = vi.fn(async ({ method, args }: { method: string; args: any }) => {
			if (method === "posawesome.posawesome.api.utilities.get_current_user_language") {
				return {
					message: {
						success: true,
						available_languages: [{ code: "en", name: "English", native_name: "English" }],
						language_code: "en",
					},
				};
			}
			if (method === "posawesome.posawesome.api.employees.get_cashier_pin_status") {
				return {
					message: {
						user: "cashier@example.com",
						full_name: "Main Cashier",
						has_pin: false,
					},
				};
			}
			if (method === "posawesome.posawesome.api.employees.save_cashier_pin") {
				return {
					message: {
						user: "cashier@example.com",
						full_name: "Main Cashier",
						has_pin: true,
					},
				};
			}
			throw new Error(`Unexpected method: ${method} ${JSON.stringify(args)}`);
		});

		const wrapper = mountMenu();

		await flushPromises();
		await (wrapper.vm as any).openPinDialog();
		expect((wrapper.vm as any).pinDialogTitle).toBe("Create Cashier PIN");
		(wrapper.vm as any).pinForm.new_pin = "5678";
		(wrapper.vm as any).pinForm.confirm_pin = "5678";
		await (wrapper.vm as any).saveCashierPin();

		expect((window as any).frappe.call).toHaveBeenCalledWith({
			method: "posawesome.posawesome.api.employees.save_cashier_pin",
			args: {
				pos_profile: "Main POS",
				user: "cashier@example.com",
				current_pin: "",
				new_pin: "5678",
			},
		});
	});

	it("requires the current pin before allowing an existing cashier pin to change", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: false,
		});

		const frappeCall = vi.fn(async ({ method }: { method: string }) => {
			if (method === "posawesome.posawesome.api.utilities.get_current_user_language") {
				return {
					message: {
						success: true,
						available_languages: [{ code: "en", name: "English", native_name: "English" }],
						language_code: "en",
					},
				};
			}
			if (method === "posawesome.posawesome.api.employees.get_cashier_pin_status") {
				return {
					message: {
						user: "cashier@example.com",
						full_name: "Main Cashier",
						has_pin: true,
					},
				};
			}
			return { message: {} };
		});
		(window as any).frappe.call = frappeCall;

		const wrapper = mountMenu();

		await flushPromises();
		await (wrapper.vm as any).openPinDialog();
		(wrapper.vm as any).pinForm.new_pin = "7890";
		(wrapper.vm as any).pinForm.confirm_pin = "7890";
		await (wrapper.vm as any).saveCashierPin();

		expect((wrapper.vm as any).pinDialogTitle).toBe("Change Cashier PIN");
		expect((wrapper.vm as any).pinMessage).toBe("Enter the current PIN first.");
		expect(frappeCall).not.toHaveBeenCalledWith(
			expect.objectContaining({
				method: "posawesome.posawesome.api.employees.save_cashier_pin",
			}),
		);
	});
});
