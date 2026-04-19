// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import "fake-indexeddb/auto";

import PaymentOptions from "../src/posapp/components/pos/payments/PaymentOptions.vue";
import {
	clearOfflineInvoices,
	getOfflineInvoices,
	memory,
	saveOfflineInvoice,
	saveStoredValueSnapshot,
	getCachedStoredValueSnapshot,
	clearStoredValueSnapshotCache,
	setCustomerStorage,
	getStoredCustomer,
} from "../src/offline/index";

const BoxStub = defineComponent({
	setup(_, { slots }) {
		return () => h("div", {}, slots.default?.());
	},
});

const VSwitchStub = defineComponent({
	name: "VSwitchStub",
	props: {
		label: {
			type: String,
			default: "",
		},
		modelValue: {
			type: Boolean,
			default: false,
		},
	},
	emits: ["update:modelValue"],
	setup(props, { emit }) {
		return () =>
			h("label", {}, [
				h("input", {
					type: "checkbox",
					checked: props.modelValue,
					onChange: (event: Event) =>
						emit("update:modelValue", (event.target as HTMLInputElement).checked),
				}),
				props.label,
			]);
	},
});

const VueDatePickerStub = defineComponent({
	setup() {
		return () => h("div");
	},
});

const VTextFieldStub = defineComponent({
	setup() {
		return () => h("input");
	},
});

describe("stored value UX", () => {
	beforeEach(async () => {
		(window as any).frappe = { _: (value: string) => value };
		(globalThis as any).frappe = { _: (value: string) => value };
		(window as any).__ = (value: string) => value;
		(globalThis as any).__ = (value: string) => value;
		await clearOfflineInvoices();
		clearStoredValueSnapshotCache();
		memory.pos_opening_storage = {
			stock_settings: {
				allow_negative_stock: 1,
			},
			pos_profile: {},
		};
	});

	it("surfaces stored value summary details when redemption is enabled", () => {
		const wrapper = mount(PaymentOptions, {
			props: {
				invoiceDoc: {
					is_return: 0,
				},
				posProfile: {
					use_customer_credit: 1,
				},
				redeemCustomerCredit: true,
				availableCustomerCredit: 850,
				redeemedCustomerCredit: 300,
				customerCreditSources: 2,
			},
			global: {
				components: {
					VRow: BoxStub,
					VCol: BoxStub,
					VSwitch: VSwitchStub,
					VTextField: VTextFieldStub,
					VChip: BoxStub,
					VueDatePicker: VueDatePickerStub,
				},
			},
		});

		expect(wrapper.text()).toContain("Use Customer Balance");
		expect(wrapper.text()).toContain("Available Customer Redeemable Balance");
		expect(wrapper.text()).toContain("Available customer redeemable balance");
		expect(wrapper.text()).toContain("Applied now");
		expect(wrapper.text()).toContain("2 source(s)");
	});

	it("stores cached stored value snapshots for offline reuse", () => {
		saveStoredValueSnapshot("CUST-001", "Test Company", [
			{
				type: "Advance",
				credit_origin: "ACC-PAY-0001",
				total_credit: 120,
			},
		]);

		const cached = getCachedStoredValueSnapshot("CUST-001", "Test Company");

		expect(cached?.available_amount).toBe(120);
		expect(cached?.source_count).toBe(1);
		expect(cached?.sources[0]?.credit_origin).toBe("ACC-PAY-0001");
	});

	it("preserves stored value summary on cached customers", async () => {
		await setCustomerStorage([
			{
				name: "CUST-002",
				customer_name: "Stored Value Customer",
				stored_value_balance: 85,
				stored_value_sources: 2,
			},
		]);

		const customer = await getStoredCustomer("CUST-002");

		expect(customer?.stored_value_balance).toBe(85);
		expect(customer?.stored_value_sources).toBe(2);
	});

	it("adds replay-safe customer balance metadata to offline invoices", async () => {
		await saveOfflineInvoice({
			invoice: {
				name: "OFFLINE-SINV-1",
				customer: "CUST-003",
				items: [{ item_code: "ITEM-1", item_name: "Item 1", qty: 1 }],
			},
			data: {
				redeemed_customer_credit: 50,
				customer_credit_dict: [
					{
						type: "Advance",
						credit_origin: "ACC-PAY-0002",
						total_credit: 50,
						credit_to_redeem: 50,
					},
				],
			},
		});

		const queued = getOfflineInvoices();

		expect(queued).toHaveLength(1);
		expect(queued[0]?.data?.customer_balance_replay).toEqual(
			expect.objectContaining({
				customer: "CUST-003",
				redeemed_customer_credit: 50,
				sources: [
					expect.objectContaining({
						credit_origin: "ACC-PAY-0002",
						credit_to_redeem: 50,
					}),
				],
			}),
		);
	});
});
