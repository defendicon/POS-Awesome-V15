// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

import EmptyState from "../src/posapp/components/reports/components/EmptyState.vue";
import InsightRow from "../src/posapp/components/reports/components/InsightRow.vue";
import MetricCard from "../src/posapp/components/reports/components/MetricCard.vue";
import SummaryMetric from "../src/posapp/components/reports/components/SummaryMetric.vue";
import TrendPanel from "../src/posapp/components/reports/components/TrendPanel.vue";

const BoxStub = defineComponent({
	inheritAttrs: false,
	setup(_, { attrs, slots }) {
		return () => h("div", attrs, slots.default?.());
	},
});

describe("reports presentational atoms", () => {
	it("renders metric cards with existing classes and icon text", () => {
		const wrapper = mount(MetricCard, {
			props: {
				label: "Today Sales",
				value: "PKR 1,234.50",
				icon: "mdi-cart-outline",
				styleClass: "metric-card--sales",
			},
			global: {
				components: {
					VCard: BoxStub,
					VIcon: BoxStub,
				},
			},
		});

		expect(wrapper.classes()).toContain("metric-card");
		expect(wrapper.classes()).toContain("metric-card--sales");
		expect(wrapper.text()).toContain("Today Sales");
		expect(wrapper.text()).toContain("PKR 1,234.50");
		expect(wrapper.text()).toContain("mdi-cart-outline");
	});

	it("renders summary metrics with an optional value class", () => {
		const wrapper = mount(SummaryMetric, {
			props: {
				label: "Expected vs Actual",
				value: "PKR -10.00",
				valueClass: "summary-metric__value--danger",
			},
		});

		expect(wrapper.classes()).toContain("summary-metric");
		expect(wrapper.find(".summary-metric__label").text()).toBe("Expected vs Actual");
		expect(wrapper.find(".summary-metric__value").classes()).toContain(
			"summary-metric__value--danger",
		);
		expect(wrapper.find(".summary-metric__value").text()).toBe("PKR -10.00");
	});

	it("renders insight rows with prop text and default slot content", () => {
		const wrapper = mount(InsightRow, {
			props: {
				title: "Cash",
				value: "PKR 600.00",
				meta: "Invoices: 3",
			},
			slots: {
				default: "<div class=\"progress-marker\">progress</div>",
			},
		});

		expect(wrapper.classes()).toContain("insight-row");
		expect(wrapper.find(".insight-row__title").text()).toBe("Cash");
		expect(wrapper.find(".insight-row__value").text()).toBe("PKR 600.00");
		expect(wrapper.find(".insight-row__meta").text()).toBe("Invoices: 3");
		expect(wrapper.find(".progress-marker").exists()).toBe(true);
	});

	it("allows insight row title, value, and meta slots to override props", () => {
		const wrapper = mount(InsightRow, {
			props: {
				title: "Ignored",
				value: "Ignored",
				meta: "Ignored",
			},
			slots: {
				title: "Acme Supplies",
				value: "PKR 5,000.00",
				meta: "Share: 100.0%",
			},
		});

		expect(wrapper.text()).toContain("Acme Supplies");
		expect(wrapper.text()).toContain("PKR 5,000.00");
		expect(wrapper.text()).toContain("Share: 100.0%");
		expect(wrapper.text()).not.toContain("Ignored");
	});

	it("renders trend panel title and content slot", () => {
		const wrapper = mount(TrendPanel, {
			props: {
				title: "Day-wise (MTD)",
			},
			slots: {
				default: "<div class=\"trend-list\">rows</div>",
			},
		});

		expect(wrapper.classes()).toContain("trend-panel");
		expect(wrapper.find(".summary-metric__label").text()).toBe("Day-wise (MTD)");
		expect(wrapper.find(".trend-list").exists()).toBe(true);
	});

	it("renders empty state messages through prop or slot", () => {
		const propWrapper = mount(EmptyState, {
			props: {
				message: "No payment collection data found.",
			},
		});
		const slotWrapper = mount(EmptyState, {
			slots: {
				default: "No suppliers found for this period.",
			},
		});

		expect(propWrapper.classes()).toContain("empty-state");
		expect(propWrapper.text()).toBe("No payment collection data found.");
		expect(slotWrapper.text()).toBe("No suppliers found for this period.");
	});
});
