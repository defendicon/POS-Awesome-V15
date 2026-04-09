// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

import NavbarSettingsPanel from "../src/posapp/components/navbar/NavbarSettingsPanel.vue";

describe("NavbarSettingsPanel", () => {
	const sections = [
		{
			id: "offline-sync",
			title: "Offline & Sync",
			description: "Offline maintenance actions.",
			actions: [
				{
					id: "refresh-offline-data",
					label: "Refresh Offline Data",
					subtitle: "Fetch fresh prerequisite data",
					icon: "mdi-sync",
					tone: "info",
				},
				{
					id: "clear-cache",
					label: "Clear Cache",
					subtitle: "Reset cached browser data",
					icon: "mdi-broom",
					tone: "warning",
				},
			],
		},
		{
			id: "terminal-devices",
			title: "Terminal & Devices",
			description: "Terminal tools.",
			actions: [
				{
					id: "open-customer-display",
					label: "Open Customer Display",
					subtitle: "Show the live cart",
					icon: "mdi-monitor-eye",
					tone: "primary",
				},
			],
		},
		{
			id: "personal",
			title: "Personal",
			description: "Personal settings.",
			actions: [
				{
					id: "manage-cashier-pin",
					label: "Manage Cashier PIN",
					subtitle: "Create or change your PIN",
					icon: "mdi-form-textbox-password",
					tone: "secondary",
				},
				{
					id: "toggle-theme",
					label: "Toggle Theme",
					subtitle: "Switch theme",
					icon: "mdi-theme-light-dark",
					tone: "secondary",
				},
			],
		},
		{
			id: "system-diagnostics",
			title: "System / Diagnostics",
			description: "System-level actions.",
			actions: [
				{
					id: "show-about",
					label: "About",
					subtitle: "View app information",
					icon: "mdi-information-outline",
					tone: "neutral",
				},
			],
		},
	];

	const mountPanel = (attrs: Record<string, unknown> = {}) =>
		mount(NavbarSettingsPanel, {
			props: {
				modelValue: true,
				sections,
			},
			attrs,
		});

	it("renders grouped settings sections for offline, terminal, personal, and diagnostics actions", () => {
		const wrapper = mountPanel();

		expect(wrapper.get('[data-test="settings-panel-category-offline-sync"]').text()).toContain(
			"Offline & Sync",
		);
		expect(wrapper.get('[data-test="settings-panel-category-terminal-devices"]').text()).toContain(
			"Terminal & Devices",
		);
		expect(wrapper.get('[data-test="settings-panel-category-personal"]').text()).toContain("Personal");
		expect(wrapper.get('[data-test="settings-panel-category-system-diagnostics"]').text()).toContain(
			"System / Diagnostics",
		);
		expect(wrapper.get('[data-test="settings-panel-detail-title"]').text()).toContain("Offline & Sync");
		expect(wrapper.find('[data-test="settings-panel-action-refresh-offline-data"]').exists()).toBe(true);
		expect(wrapper.find('[data-test="settings-panel-action-open-customer-display"]').exists()).toBe(false);
	});

	it("switches the right pane when a different left-rail category is selected", async () => {
		const wrapper = mountPanel();

		await wrapper.get('[data-test="settings-panel-category-terminal-devices"]').trigger("click");

		expect(wrapper.get('[data-test="settings-panel-detail-title"]').text()).toContain(
			"Terminal & Devices",
		);
		expect(wrapper.find('[data-test="settings-panel-action-refresh-offline-data"]').exists()).toBe(false);
		expect(wrapper.find('[data-test="settings-panel-action-open-customer-display"]').exists()).toBe(true);
	});

	it("opens embedded detail mode for manage cashier pin", async () => {
		const wrapper = mountPanel();

		await wrapper.get('[data-test="settings-panel-category-personal"]').trigger("click");
		await wrapper.get('[data-test="settings-panel-action-manage-cashier-pin"]').trigger("click");

		expect(wrapper.get('[data-test="settings-panel-detail-title"]').text()).toContain(
			"Manage Cashier PIN",
		);
		expect(wrapper.find('[data-test="settings-panel-detail-view"]').exists()).toBe(true);
		expect(wrapper.find('[data-test="settings-panel-action-toggle-theme"]').exists()).toBe(false);
	});

	it("returns to section overview from embedded detail mode", async () => {
		const wrapper = mountPanel();

		await wrapper.get('[data-test="settings-panel-category-personal"]').trigger("click");
		await wrapper.get('[data-test="settings-panel-action-manage-cashier-pin"]').trigger("click");
		await wrapper.get('[data-test="settings-panel-detail-back"]').trigger("click");

		expect(wrapper.find('[data-test="settings-panel-detail-view"]').exists()).toBe(false);
		expect(wrapper.find('[data-test="settings-panel-action-manage-cashier-pin"]').exists()).toBe(true);
		expect(wrapper.find('[data-test="settings-panel-action-toggle-theme"]').exists()).toBe(true);
	});

	it("emits the selected action id when a settings action is clicked", async () => {
		const onSelectAction = vi.fn();
		const wrapper = mountPanel({
			onSelectAction,
		});

		await wrapper.get('[data-test="settings-panel-action-refresh-offline-data"]').trigger("click");

		expect(onSelectAction).toHaveBeenCalledWith("refresh-offline-data");
	});

	it("emits close state when the close button is pressed", async () => {
		const onUpdateModelValue = vi.fn();
		const wrapper = mountPanel({
			"onUpdate:modelValue": onUpdateModelValue,
		});

		await wrapper.get('[data-test="navbar-settings-panel-close"]').trigger("click");

		expect(onUpdateModelValue).toHaveBeenCalledWith(false);
	});
});
