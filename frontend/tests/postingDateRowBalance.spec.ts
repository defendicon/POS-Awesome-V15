// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import PostingDateRow from "../src/posapp/components/pos/invoice/PostingDateRow.vue";
import invoiceSource from "../src/posapp/components/pos/Invoice.vue?raw";

const Box = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});
const Tooltip = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.activator?.({ props: {} }));
	},
});

const mountBalance = (balance: any, loading = false, show = true) => {
	const formatCurrency = vi.fn(
		(value, currency) => `${currency} ${Number(value || 0).toFixed(2)}`,
	);
	const wrapper = mount(PostingDateRow, {
		props: {
			pos_profile: {
				posa_allow_change_posting_date: 1,
				posa_show_customer_balance: show,
			},
			customer_balance: balance,
			customer_balance_currency: "USD",
			balance_loading: loading,
			formatCurrency,
		},
		global: {
			components: {
				VSheet: Box,
				VRow: Box,
				VCol: Box,
				VChip: Box,
				VTooltip: Tooltip,
				VSelect: Box,
				VIcon: Box,
				VSkeletonLoader: Box,
				VueDatePicker: Box,
			},
		},
	});
	return { wrapper, formatCurrency };
};

describe("PostingDateRow customer balance", () => {
	it("renders a new invoice balance as unavailable before the first request", () => {
		// Execute the real Options API initializer without booting the full POS,
		// its stores, workers, network connections and payment integrations.
		const { descriptor } = parse(invoiceSource);
		const source = ts.createSourceFile(
			"Invoice.js",
			descriptor.script!.content,
			ts.ScriptTarget.Latest,
			true,
		);
		const exported = source.statements.find(ts.isExportAssignment)!;
		const options = exported.expression as ts.ObjectLiteralExpression;
		const data = options.properties.find(
			(property) =>
				ts.isMethodDeclaration(property) &&
				property.name.getText(source) === "data",
		)!;
		const initial = new Function(
			`return ({${data.getText(source)}}).data();`,
		)();
		expect(
			mountBalance(initial.customer_balance)
				.wrapper.get(".balance-amount")
				.text(),
		).toBe("Unavailable");
	});

	it.each([null, undefined, NaN, Infinity])(
		"renders %s as neutral unavailable, never formatted money",
		(balance) => {
			const { wrapper, formatCurrency } = mountBalance(balance);
			expect(wrapper.get(".balance-amount").text()).toBe("Unavailable");
			expect(formatCurrency).not.toHaveBeenCalled();
			expect(wrapper.find('[color="success"]').exists()).toBe(false);
			expect(wrapper.find('[color="error"]').exists()).toBe(false);
		},
	);

	it.each([
		[0, "USD 0.00", "success"],
		[125.5, "USD 125.50", "success"],
		[-42.25, "USD -42.25", "error"],
	])("keeps known %s formatting and sign styling", (balance, text, color) => {
		const { wrapper, formatCurrency } = mountBalance(balance);
		expect(wrapper.get(".balance-amount").text()).toBe(text);
		expect(wrapper.find(`[color="${color}"]`).exists()).toBe(true);
		expect(formatCurrency).toHaveBeenCalledWith(balance, "USD");
	});

	it("keeps loading and POS Profile visibility behavior", () => {
		expect(
			mountBalance(null, true).wrapper.find(".balance-skeleton").exists(),
		).toBe(true);
		expect(
			mountBalance(0, false, false)
				.wrapper.find(".balance-container")
				.exists(),
		).toBe(false);
	});
});
