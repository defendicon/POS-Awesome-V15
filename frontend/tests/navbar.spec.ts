// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { shallowMount } from "@vue/test-utils";

vi.mock("../src/posapp/composables/core/useRtl", () => ({
	useRtl: () => ({
		isRtl: false,
		rtlStyles: {},
		rtlClasses: [],
	}),
}));

vi.mock("../src/offline/index", () => ({
	forceClearAllCache: vi.fn(async () => undefined),
	isOffline: vi.fn(() => false),
}));

vi.mock("../src/utils/clearAllCaches", () => ({
	clearAllCaches: vi.fn(async () => undefined),
}));

import Navbar from "../src/posapp/components/Navbar.vue";
import { useEmployeeStore } from "../src/posapp/stores/employeeStore";
import { clearAllCaches } from "../src/utils/clearAllCaches";
import { isOffline } from "../src/offline/index";
import { cacheOfflineCashiers } from "../src/posapp/utils/offlineCashier";

describe("Navbar supervisor access", () => {
	afterEach(() => {
		vi.mocked(isOffline).mockReturnValue(false);
		vi.useRealTimers();
	});

	beforeEach(() => {
		setActivePinia(createPinia());
		window.localStorage.clear();
		vi.stubGlobal("__", (value: string) => value);
		vi.stubGlobal("frappe", {
			session: {
				user: "cashier@example.com",
				user_fullname: "Main Cashier",
			},
			boot: {
				sysdefaults: { company: "Test Co" },
				website_settings: {},
			},
			call: vi.fn(async ({ method }: { method: string }) => {
				if (method.endsWith("get_terminal_employees")) {
					return {
						message: [
							{
								user: "cashier@example.com",
								full_name: "Main Cashier",
								is_current: true,
								is_supervisor: false,
							},
						],
					};
				}
				return {
					message: {
						pos_profile: "Main POS",
						active_cashier: "cashier@example.com",
						locked: method.endsWith("lock_terminal"),
					},
				};
			}),
		});
	});

	it("restores prepared cashiers after an offline reload without cashier API requests", async () => {
		vi.mocked(isOffline).mockReturnValue(true);
		cacheOfflineCashiers("Main POS", [{ user: "backup@example.com", full_name: "Backup Cashier", offline_access: { version: 1, iterations: 600_000, salt: "cached", iv: "cached", ciphertext: "cached", expires_at: Date.now() / 1000 + 3600 } }]);
		const wrapper = shallowMount(Navbar, {
			props: { posProfile: { name: "Main POS" } },
			global: {
				mocks: { __: (value: string) => value },
				stubs: { NavbarAppBar: true, NavbarDrawer: true, NavbarMenu: true, NotificationBell: true, StatusIndicator: true, CacheUsageMeter: true, AboutDialog: true, EmployeeSwitchDialog: true, OfflineInvoicesDialog: true, ServerUsageGadget: true, DatabaseUsageGadget: true, VDialog: true, VCard: true, VCardTitle: true, VCardText: true, VSnackbar: true, VBtn: true, VProgressCircular: true },
			},
		});
		await (wrapper.vm as any).fetchTerminalEmployees();
		const store = useEmployeeStore();
		expect(store.terminalEmployees.map((row) => row.user)).toEqual(["backup@example.com"]);
		expect(store.isLocked).toBe(true);
		expect(store.currentCashier).toBeNull();
		expect(vi.mocked(frappe.call).mock.calls.filter(([args]) => args.method.includes("api.employees."))).toEqual([]);
		wrapper.unmount();
	});

	it("shows the dashboard drawer item only for POS supervisors", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: false,
		});

		const wrapper = shallowMount(Navbar, {
			props: {
				posProfile: { name: "Main POS" },
			},
			global: {
				mocks: {
					__: (value: string) => value,
				},
				stubs: {
					NavbarAppBar: true,
					NavbarDrawer: true,
					NavbarMenu: true,
					NotificationBell: true,
					StatusIndicator: true,
					CacheUsageMeter: true,
					AboutDialog: true,
					EmployeeSwitchDialog: true,
					OfflineInvoicesDialog: true,
					ServerUsageGadget: true,
					DatabaseUsageGadget: true,
					VDialog: true,
					VCard: true,
					VCardTitle: true,
					VCardText: true,
					VSnackbar: true,
					VBtn: true,
					VProgressCircular: true,
				},
			},
		});

		await Promise.resolve();
		expect(
			(wrapper.vm as any).items.some(
				(item: any) => item.to === "/dashboard",
			),
		).toBe(false);

		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: true,
		});
		await (wrapper.vm as any).$nextTick();

		expect(
			(wrapper.vm as any).items.some(
				(item: any) => item.to === "/dashboard",
			),
		).toBe(true);
	});

	it("shows the gift cards drawer item when gift cards are enabled on the POS profile", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: true,
		});

		const wrapper = shallowMount(Navbar, {
			props: {
				posProfile: { name: "Main POS", posa_use_gift_cards: 1 },
			},
			global: {
				mocks: {
					__: (value: string) => value,
				},
				stubs: {
					NavbarAppBar: true,
					NavbarDrawer: true,
					NavbarMenu: true,
					NotificationBell: true,
					StatusIndicator: true,
					CacheUsageMeter: true,
					AboutDialog: true,
					EmployeeSwitchDialog: true,
					OfflineInvoicesDialog: true,
					ServerUsageGadget: true,
					DatabaseUsageGadget: true,
					VDialog: true,
					VCard: true,
					VCardTitle: true,
					VCardText: true,
					VSnackbar: true,
					VBtn: true,
					VProgressCircular: true,
				},
			},
		});

		await Promise.resolve();
		expect(
			(wrapper.vm as any).items.some(
				(item: any) => item.to === "/gift-cards",
			),
		).toBe(true);
	});

	it("passes a footer settings launcher to the drawer and opens the settings panel from it", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: true,
		});

		const wrapper = shallowMount(Navbar, {
			props: {
				posProfile: {
					name: "Main POS",
					posa_enable_customer_display: 1,
				},
				manualOffline: false,
				networkOnline: true,
				serverOnline: true,
			},
			global: {
				mocks: {
					__: (value: string) => value,
				},
				stubs: {
					NotificationBell: true,
					AboutDialog: true,
					EmployeeSwitchDialog: true,
					OfflineInvoicesDialog: true,
					ServerUsageGadget: true,
					DatabaseUsageGadget: true,
					VDialog: true,
					VCard: true,
					VCardTitle: true,
					VCardText: true,
					VSnackbar: true,
					VBtn: true,
					VProgressCircular: true,
				},
			},
		});

		await Promise.resolve();
		(wrapper.vm as any).drawer = true;
		await nextTick();

		expect(
			wrapper.get('[data-test="drawer-footer-action"]').text(),
		).toContain("Settings");

		await wrapper
			.get('[data-test="drawer-footer-action"]')
			.trigger("click");
		await nextTick();

		expect((wrapper.vm as any).drawer).toBe(false);
		expect((wrapper.vm as any).settingsPanelOpen).toBe(true);
	});

	it("shows an error toast instead of a false success toast when cache clearing fails", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setCurrentCashier({
			user: "cashier@example.com",
			full_name: "Main Cashier",
			is_supervisor: true,
		});

		(
			clearAllCaches as unknown as ReturnType<typeof vi.fn>
		).mockRejectedValueOnce(new Error("boom"));

		const wrapper = shallowMount(Navbar, {
			props: {
				posProfile: { name: "Main POS" },
			},
			global: {
				mocks: {
					__: (value: string) => value,
				},
				stubs: {
					NavbarAppBar: true,
					NavbarDrawer: true,
					NavbarMenu: true,
					NotificationBell: true,
					StatusIndicator: true,
					CacheUsageMeter: true,
					AboutDialog: true,
					EmployeeSwitchDialog: true,
					OfflineInvoicesDialog: true,
					ServerUsageGadget: true,
					DatabaseUsageGadget: true,
					VDialog: true,
					VCard: true,
					VCardTitle: true,
					VCardText: true,
					VSnackbar: true,
					VBtn: true,
					VProgressCircular: true,
				},
			},
		});

		await (wrapper.vm as any).clearCache();

		const shownTitles = (wrapper.vm as any).toastStore.history.map(
			(entry: { title: string }) => entry.title,
		);
		expect(shownTitles).toContain("Failed to clear cache");
		expect(shownTitles).not.toContain("Cache cleared successfully");
	});

	it("fails closed and marks the server lock pending when lock persistence fails", async () => {
		const employeeStore = useEmployeeStore();
		employeeStore.setTerminalEmployees([
			{
				user: "cashier@example.com",
				full_name: "Main Cashier",
			},
		]);
		employeeStore.applyTerminalState({
			active_cashier: "cashier@example.com",
			locked: false,
		});

		const wrapper = shallowMount(Navbar, {
			props: { posProfile: { name: "Main POS" } },
			global: {
				mocks: { __: (value: string) => value },
				stubs: {
					NavbarAppBar: true,
					NavbarDrawer: true,
					NavbarMenu: true,
					NotificationBell: true,
					StatusIndicator: true,
					CacheUsageMeter: true,
					AboutDialog: true,
					EmployeeSwitchDialog: true,
					OfflineInvoicesDialog: true,
					ServerUsageGadget: true,
					DatabaseUsageGadget: true,
					VDialog: true,
					VCard: true,
					VCardTitle: true,
					VCardText: true,
					VSnackbar: true,
					VBtn: true,
					VProgressCircular: true,
				},
			},
		});
		await (wrapper.vm as any).fetchTerminalEmployees();
		(frappe.call as ReturnType<typeof vi.fn>).mockClear();
		(frappe.call as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
			new Error("server unavailable"),
		);

		const result = await (wrapper.vm as any).lockPosScreen();

		expect(result).toBeUndefined();
		expect(employeeStore.isLocked).toBe(true);
		expect(employeeStore.terminalLockPending).toBe(true);
		expect(frappe.call).toHaveBeenLastCalledWith({
			method: "posawesome.posawesome.api.employees.lock_terminal",
			args: { pos_profile: "Main POS" },
		});
		expect((wrapper.vm as any).toastStore.history.at(-1)?.title).toContain(
			"Server lock pending",
		);
		wrapper.unmount();
	});

	it("surfaces cashier loading failures and recovers without retaining stale users", async () => {
		const employeeStore = useEmployeeStore();
		(frappe.call as ReturnType<typeof vi.fn>).mockImplementation(
			async ({ method }: { method: string }) => {
				if (method.endsWith("get_terminal_employees")) {
					throw new Error("temporary network failure");
				}
				return {
					message: {
						pos_profile: "Main POS",
						active_cashier: null,
						locked: true,
					},
				};
			},
		);

		const wrapper = shallowMount(Navbar, {
			props: { posProfile: { name: "Main POS" } },
			global: {
				mocks: { __: (value: string) => value },
				stubs: {
					NavbarAppBar: true,
					NavbarDrawer: true,
					NavbarMenu: true,
					NotificationBell: true,
					StatusIndicator: true,
					CacheUsageMeter: true,
					AboutDialog: true,
					EmployeeSwitchDialog: true,
					OfflineInvoicesDialog: true,
					ServerUsageGadget: true,
					DatabaseUsageGadget: true,
					VDialog: true,
					VCard: true,
					VCardTitle: true,
					VCardText: true,
					VSnackbar: true,
					VBtn: true,
					VProgressCircular: true,
				},
			},
		});

		await vi.waitFor(() => {
			expect(employeeStore.terminalEmployeesLoadStatus).toBe("error");
		});
		expect(employeeStore.terminalEmployees).toEqual([]);
		expect(employeeStore.terminalEmployeesLoadError).toContain(
			"Unable to load cashiers",
		);
		expect(employeeStore.isLocked).toBe(true);

		(frappe.call as ReturnType<typeof vi.fn>).mockImplementation(
			async ({ method }: { method: string }) => {
				if (method.endsWith("get_terminal_employees")) {
					return {
						message: [
							{
								user: "cashier@example.com",
								full_name: "Main Cashier",
							},
						],
					};
				}
				return {
					message: {
						pos_profile: "Main POS",
						active_cashier: null,
						locked: true,
					},
				};
			},
		);

		await (wrapper.vm as any).fetchTerminalEmployees();

		expect(employeeStore.terminalEmployeesLoadStatus).toBe("ready");
		expect(
			employeeStore.terminalEmployees.map((cashier) => cashier.user),
		).toEqual(["cashier@example.com"]);
		expect(employeeStore.terminalEmployeesLoadError).toBe("");
		wrapper.unmount();
	});

	it("makes cashiers available before the terminal state request finishes", async () => {
		const employeeStore = useEmployeeStore();
		let resolveTerminalState: (value: any) => void = () => undefined;
		const terminalStateResponse = new Promise((resolve) => {
			resolveTerminalState = resolve;
		});
		(frappe.call as ReturnType<typeof vi.fn>).mockImplementation(
			async ({ method }: { method: string }) => {
				if (method.endsWith("get_terminal_employees")) {
					return {
						message: [
							{ user: "cashier@example.com", full_name: "Main Cashier" },
						],
					};
				}
				return terminalStateResponse;
			},
		);

		const wrapper = shallowMount(Navbar, {
			props: { posProfile: { name: "Main POS" } },
			global: {
				mocks: { __: (value: string) => value },
				stubs: {
					NavbarAppBar: true,
					NavbarDrawer: true,
					NavbarMenu: true,
					NotificationBell: true,
					StatusIndicator: true,
					CacheUsageMeter: true,
					AboutDialog: true,
					EmployeeSwitchDialog: true,
					OfflineInvoicesDialog: true,
					ServerUsageGadget: true,
					DatabaseUsageGadget: true,
					VDialog: true,
					VCard: true,
					VCardTitle: true,
					VCardText: true,
					VSnackbar: true,
					VBtn: true,
					VProgressCircular: true,
				},
			},
		});

		await vi.waitFor(() => {
			expect(employeeStore.terminalEmployeesLoadStatus).toBe("ready");
		});
		expect(employeeStore.terminalStateLoaded).toBe(false);
		expect(employeeStore.terminalEmployees[0]?.user).toBe("cashier@example.com");

		resolveTerminalState({
			message: {
				pos_profile: "Main POS",
				active_cashier: null,
				locked: true,
			},
		});
		await vi.waitFor(() => expect(employeeStore.terminalStateLoaded).toBe(true));
		wrapper.unmount();
	});

	it("turns never-settling cashier requests into a recoverable load error", async () => {
		vi.useFakeTimers();
		const employeeStore = useEmployeeStore();
		(frappe.call as ReturnType<typeof vi.fn>).mockImplementation(
			() => new Promise(() => undefined),
		);

		const wrapper = shallowMount(Navbar, {
			props: { posProfile: { name: "Main POS" } },
			global: {
				mocks: { __: (value: string) => value },
				stubs: {
					NavbarAppBar: true,
					NavbarDrawer: true,
					NavbarMenu: true,
					NotificationBell: true,
					StatusIndicator: true,
					CacheUsageMeter: true,
					AboutDialog: true,
					EmployeeSwitchDialog: true,
					OfflineInvoicesDialog: true,
					ServerUsageGadget: true,
					DatabaseUsageGadget: true,
					VDialog: true,
					VCard: true,
					VCardTitle: true,
					VCardText: true,
					VSnackbar: true,
					VBtn: true,
					VProgressCircular: true,
				},
			},
		});

		expect(employeeStore.terminalEmployeesLoadStatus).toBe("loading");
		await vi.advanceTimersByTimeAsync(20_000);
		await nextTick();

		expect(employeeStore.terminalEmployeesLoadStatus).toBe("error");
		expect(employeeStore.terminalEmployeesLoadError).toContain(
			"server took too long",
		);
		expect(employeeStore.isLocked).toBe(true);
		wrapper.unmount();
		vi.useRealTimers();
	});
});
