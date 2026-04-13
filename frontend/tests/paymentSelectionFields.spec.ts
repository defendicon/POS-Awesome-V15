// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";

import PaymentSelectionFields from "../src/features/payments/components/invoice/PaymentSelectionFields.vue";

const VRowStub = {
	template: "<div><slot /></div>",
};

const VColStub = {
	template: "<div><slot /></div>",
};

describe("PaymentSelectionFields", () => {
	beforeEach(() => {
		(globalThis as any).window.__ = (text: string) => text;
		(globalThis as any).window.frappe = {
			_: (text: string) => text,
		};
	});

	it("hides the print format field when selection is disabled", () => {
		const wrapper = mount(PaymentSelectionFields, {
			props: {
				showPrintFormat: false,
			},
			global: {
				stubs: {
					"v-row": VRowStub,
					"v-col": VColStub,
					"v-select": true,
				},
			},
		});

		const html = wrapper.html();
		expect(html).toContain("<!-- Print Format Selection -->");
		expect(html).toContain("<!--v-if-->");
	});

	it("shows the print format field when selection is enabled", () => {
		const wrapper = mount(PaymentSelectionFields, {
			props: {
				showPrintFormat: true,
			},
			global: {
				stubs: {
					"v-row": VRowStub,
					"v-col": VColStub,
					"v-select": true,
				},
			},
		});

		const html = wrapper.html();
		expect(html).toContain("<!-- Print Format Selection -->");
		expect(html).not.toContain("<!--v-if-->");
	});
});
