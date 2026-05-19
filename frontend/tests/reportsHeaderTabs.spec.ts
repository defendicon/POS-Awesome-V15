// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import DashboardHeader from "../src/posapp/components/reports/components/DashboardHeader.vue";
import DashboardTabs from "../src/posapp/components/reports/components/DashboardTabs.vue";

const BoxStub = defineComponent({
	inheritAttrs: false,
	setup(_, { attrs, slots }) {
		return () => h("div", attrs, slots.default?.());
	},
});

const ButtonStub = defineComponent({
	name: "VBtn",
	setup(_, { attrs, slots }) {
		return () => h("button", attrs, slots.default?.());
	},
});

const SelectStub = defineComponent({
	name: "VSelect",
	props: {
		modelValue: {
			type: [String, Number, Boolean],
			default: "",
		},
		label: {
			type: String,
			default: "",
		},
		disabled: Boolean,
	},
	emits: ["update:modelValue"],
	setup(props, { emit }) {
		return () =>
			h(
				"button",
				{
					class: "select-stub",
					disabled: props.disabled,
					onClick: () => emit("update:modelValue", `${props.modelValue || ""}-next`),
				},
				`${props.label}:${props.modelValue}`,
			);
	},
});

const TextFieldStub = defineComponent({
	name: "VTextField",
	props: {
		modelValue: {
			type: String,
			default: "",
		},
		label: {
			type: String,
			default: "",
		},
		max: {
			type: String,
			default: "",
		},
		disabled: Boolean,
	},
	emits: ["update:modelValue"],
	setup(props, { emit }) {
		return () =>
			h(
				"button",
				{
					class: "text-field-stub",
					disabled: props.disabled,
					onClick: () => emit("update:modelValue", "2026-04"),
				},
				`${props.label}:${props.modelValue}:max=${props.max}`,
			);
	},
});

const TabsStub = defineComponent({
	name: "VTabs",
	props: {
		modelValue: {
			type: String,
			default: "",
		},
	},
	emits: ["update:modelValue"],
	setup(_, { slots, emit }) {
		return () =>
			h(
				"button",
				{
					class: "tabs-stub",
					onClick: () => emit("update:modelValue", "finance"),
				},
				slots.default?.(),
			);
	},
});

const mountHeader = (overrides: Partial<InstanceType<typeof DashboardHeader>["$props"]> = {}) =>
	mount(DashboardHeader, {
		props: {
			scopeDisplayLabel: "Scope: All Profiles",
			selectedProfilesCount: 2,
			profitMethodLabel: "Profit: Invoice Item Estimate",
			profitMethodColor: "warning",
			dashboardScope: "all",
			dashboardScopeItems: [
				{ label: "All Profiles", value: "all" },
				{ label: "Current Profile", value: "current" },
				{ label: "Specific Profile", value: "specific" },
			],
			selectedProfileFilter: "",
			profileFilterItems: [{ label: "Main POS", value: "Main POS" }],
			selectedReportMonth: "2026-05",
			currentMonthToken: "2026-05",
			lastUpdatedLabel: "Updated: 9:00 AM",
			isPosSupervisor: true,
			loading: false,
			...overrides,
		},
		global: {
			components: {
				VBtn: ButtonStub,
				VChip: BoxStub,
				VSelect: SelectStub,
				VTextField: TextFieldStub,
			},
		},
	});

describe("DashboardHeader", () => {
	it("renders dashboard metadata, filters, month max, and refresh action", async () => {
		let refreshCount = 0;
		const wrapper = mountHeader({
			onRefresh: () => {
				refreshCount += 1;
			},
		});

		expect(wrapper.text()).toContain("Awesome Dashboard");
		expect(wrapper.text()).toContain("Scope: All Profiles");
		expect(wrapper.text()).toContain("Profiles: 2");
		expect(wrapper.text()).toContain("Profit: Invoice Item Estimate");
		expect(wrapper.text()).toContain("Scope:all");
		expect(wrapper.text()).toContain("Month:2026-05:max=2026-05");
		expect(wrapper.text()).toContain("Updated: 9:00 AM");
		wrapper.findComponent(ButtonStub).vm.$emit("click");
		await wrapper.vm.$nextTick();

		expect(refreshCount).toBe(1);
	});

	it("shows specific profile filter only for specific scope and emits filter updates", async () => {
		const updates = {
			profile: "",
			month: "",
		};
		const wrapper = mountHeader({
			dashboardScope: "specific",
			selectedProfileFilter: "Main POS",
			"onUpdate:selectedProfileFilter": (value: string) => {
				updates.profile = value;
			},
			"onUpdate:selectedReportMonth": (value: string) => {
				updates.month = value;
			},
		});

		expect(wrapper.text()).toContain("Profile:Main POS");

		const selects = wrapper.findAllComponents(SelectStub);
		selects[1].vm.$emit("update:modelValue", "Main POS-next");
		wrapper.findComponent(TextFieldStub).vm.$emit("update:modelValue", "2026-04");
		await wrapper.vm.$nextTick();

		expect(updates.profile).toBe("Main POS-next");
		expect(updates.month).toBe("2026-04");
	});

	it("disables filters and refresh for non-supervisors", () => {
		const wrapper = mountHeader({
			isPosSupervisor: false,
			dashboardScope: "specific",
		});

		expect(wrapper.findAll("button").every((button) => button.attributes("disabled") !== undefined))
			.toBe(true);
	});
});

describe("DashboardTabs", () => {
	const tabs = [
		{ value: "sales" as const, label: "Sales", icon: "mdi-point-of-sale" },
		{ value: "finance" as const, label: "Finance", icon: "mdi-finance" },
	];

	it("renders desktop and mobile tab labels", () => {
		const wrapper = mount(DashboardTabs, {
			props: {
				activeTab: "sales",
				tabs,
			},
			global: {
				components: {
					VBtn: ButtonStub,
					VIcon: BoxStub,
					VTab: BoxStub,
					VTabs: TabsStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Sales");
		expect(wrapper.text()).toContain("Finance");
		expect(wrapper.text()).toContain("mdi-point-of-sale");
	});

	it("emits updates from desktop tabs and mobile tab buttons", async () => {
		const updates: string[] = [];
		const wrapper = mount(DashboardTabs, {
			props: {
				activeTab: "sales",
				tabs,
				"onUpdate:activeTab": (value: string) => {
					updates.push(value);
				},
			},
			global: {
				components: {
					VBtn: ButtonStub,
					VIcon: BoxStub,
					VTab: BoxStub,
					VTabs: TabsStub,
				},
			},
		});

		wrapper.findComponent(TabsStub).vm.$emit("update:modelValue", "finance");
		wrapper.findAllComponents(ButtonStub)[1].vm.$emit("click");
		await wrapper.vm.$nextTick();

		expect(updates).toEqual(["finance", "finance"]);
	});
});
