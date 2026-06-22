// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";

describe("InvoiceActionButtons", () => {
	it("does not render share last invoice in the invoice summary actions", async () => {
		vi.stubGlobal("__", (value: string) => value);
		const { default: InvoiceActionButtons } = await import(
			"../src/posapp/components/pos/invoice/InvoiceActionButtons.vue"
		);

		const wrapper = shallowMount(InvoiceActionButtons, {
			props: {
				pos_profile: {
					custom_allow_select_sales_order: 0,
					posa_allow_return: 1,
					posa_allow_print_draft_invoices: 1,
				},
			},
			global: {
				stubs: {
					VRow: { template: "<div><slot /></div>" },
					VCol: { template: "<div><slot /></div>" },
					VBtn: {
						props: ["prependIcon"],
						template: "<button><slot /></button>",
					},
				},
			},
		});

		expect(wrapper.text()).not.toContain("Share Last Invoice");
		expect((InvoiceActionButtons as any).emits).not.toContain("share-last");
	});
});
