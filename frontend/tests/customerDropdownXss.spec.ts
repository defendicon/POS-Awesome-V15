// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";

import customerSource from "../src/posapp/components/pos/customer/Customer.vue?raw";

const maliciousCustomer = {
	name: '<img src=x onerror=alert(1)>',
	customer_name: "Unsafe Customer",
	tax_id: "<script>alert(1)</script>",
	email_id: '<img src=x onerror=alert(1)>',
	mobile_no: "<script>alert(1)</script>",
	primary_address: '<img src=x onerror=alert(1)>',
};

const CustomerDropdownItem = defineComponent({
	props: {
		item: {
			type: Object,
			required: true,
		},
	},
	template: `
		<div>
			<div v-if="item.raw.customer_name !== item.raw.name">ID: {{ item.raw.name }}</div>
			<div v-if="item.raw.tax_id">TAX ID: {{ item.raw.tax_id }}</div>
			<div v-if="item.raw.email_id">Email: {{ item.raw.email_id }}</div>
			<div v-if="item.raw.mobile_no">Mobile No: {{ item.raw.mobile_no }}</div>
			<div v-if="item.raw.primary_address">Primary Address: {{ item.raw.primary_address }}</div>
		</div>
	`,
});

describe("Customer dropdown XSS regression", () => {
	it("renders customer fields as text instead of HTML", () => {
		const wrapper = mount(CustomerDropdownItem, {
			props: {
				item: { raw: maliciousCustomer },
			},
		});

		expect(wrapper.text()).toContain("ID: <img src=x onerror=alert(1)>");
		expect(wrapper.text()).toContain("TAX ID: <script>alert(1)</script>");
		expect(wrapper.text()).toContain("Email: <img src=x onerror=alert(1)>");
		expect(wrapper.text()).toContain("Mobile No: <script>alert(1)</script>");
		expect(wrapper.text()).toContain("Primary Address: <img src=x onerror=alert(1)>");
		expect(wrapper.find("img").exists()).toBe(false);
		expect(wrapper.find("script").exists()).toBe(false);
	});

	it("keeps Customer.vue dropdown fields on safe interpolation", () => {
		expect(customerSource).not.toContain("v-html");
		expect(customerSource).toContain('{{ __("ID") }}: {{ item.raw.name }}');
		expect(customerSource).toContain('{{ __("TAX ID") }}: {{ item.raw.tax_id }}');
		expect(customerSource).toContain('{{ __("Email") }}: {{ item.raw.email_id }}');
		expect(customerSource).toContain('{{ __("Mobile No") }}: {{ item.raw.mobile_no }}');
		expect(customerSource).toContain('{{ __("Primary Address") }}: {{ item.raw.primary_address }}');
	});

	it("commits a clicked customer before closing the autocomplete menu", () => {
		expect(customerSource).toContain("const commitPendingCustomerSelection = () =>");
		expect(customerSource).toContain("customersStore.setSelectedCustomer(tempSelectedCustomer.value)");
		expect(customerSource).toMatch(
			/const\s+closeCustomerMenu\s*=\s*\(\)\s*=>\s*{\s*commitPendingCustomerSelection\(\);/,
		);
	});

	it("keeps customer loading progress outside the clipped append icon area", () => {
		expect(customerSource).toContain("customer-load-status");
		expect(customerSource).not.toContain("customer-load-percent");
		expect(customerSource).toContain("? frappe._(\"Loading customers\")");
		expect(customerSource).toContain("? __(\"Loading customers...\")");
	});
});
