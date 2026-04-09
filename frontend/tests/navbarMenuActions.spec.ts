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

describe("NavbarMenu action surfaces", () => {
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

	it("keeps cashier actions in quick actions and moves offline data tools out of the menu", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: false,
		});

		const wrapper = mountMenu();
		await flushPromises();

		expect((wrapper.vm as any).quickActions.map((action: any) => action.id)).toEqual([
			"switch-cashier",
			"lock-screen",
			"print-last-invoice",
			"sync-offline-sales",
			"close-shift",
		]);
		expect((wrapper.vm as any).quickActions[3].label).toBe("Sync Offline Sales");

		const sections = (wrapper.vm as any).settingsSections;
		expect(sections.map((section: any) => section.id)).toEqual([
			"personal",
			"terminal",
			"tools",
			"session",
		]);

		const actionIds = sections.flatMap((section: any) =>
			section.actions.map((action: any) => action.id),
		);
		expect(actionIds).not.toContain("manage-cashier-pin");
		expect(actionIds).not.toContain("clear-cache");
		expect(actionIds).not.toContain("toggle-offline");
		expect(actionIds).not.toContain("system-status");
	});
});
