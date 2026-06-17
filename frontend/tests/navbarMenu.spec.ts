// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { shallowMount } from "@vue/test-utils";

import NavbarMenu from "../src/posapp/components/navbar/NavbarMenu.vue";
import NavbarCashierPinForm from "../src/posapp/components/navbar/NavbarCashierPinForm.vue";
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

	const mountPinForm = (overrides: Record<string, any> = {}) =>
		shallowMount(NavbarCashierPinForm, {
			props: {
				posProfile: { name: "Main POS", ...overrides.posProfile },
				currentCashier: {
					user: "cashier@example.com",
					full_name: "Main Cashier",
					is_supervisor: false,
					...overrides.currentCashier,
				},
				currentCashierDisplay: "Main Cashier",
				showBack: false,
				...overrides.props,
			},
			global: {
				mocks: {
					__: (value: string) => value,
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
			"share-last-invoice",
			"sync-offline-sales",
			"close-shift",
		]);
		expect((wrapper.vm as any).quickActionRows).toHaveLength(6);
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

		const wrapper = mountPinForm();

		await vi.waitFor(() =>
			expect(wrapper.find('[data-test="cashier-pin-message"]').text()).toBe(
				"No cashier PIN is set yet. Create one now.",
			),
		);
		await wrapper.find('[data-test="cashier-pin-new-input"] input').setValue("5678");
		await wrapper.find('[data-test="cashier-pin-confirm-input"] input').setValue("5678");
		await wrapper.find('[data-test="cashier-pin-save"]').trigger("click");
		await flushPromises();

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

		const wrapper = mountPinForm();

		await vi.waitFor(() =>
			expect(wrapper.find('[data-test="cashier-pin-current-input"]').exists()).toBe(true),
		);
		await wrapper.find('[data-test="cashier-pin-new-input"] input').setValue("7890");
		await wrapper.find('[data-test="cashier-pin-confirm-input"] input').setValue("7890");
		await wrapper.find('[data-test="cashier-pin-save"]').trigger("click");
		await flushPromises();

		expect(wrapper.find('[data-test="cashier-pin-message"]').text()).toBe(
			"Enter the current PIN first.",
		);
		expect(frappeCall).not.toHaveBeenCalledWith(
			expect.objectContaining({
				method: "posawesome.posawesome.api.employees.save_cashier_pin",
			}),
		);
	});
});
