// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

vi.mock("../src/posapp/composables/pos/shared/useStockUtils", () => ({
	useStockUtils: () => ({
		calc_stock_qty: vi.fn(),
	}),
}));

vi.mock("../src/posapp/composables/pos/items/useItemAddition", () => ({
	useItemAddition: () => ({
		removeItem: vi.fn(),
		addItem: vi.fn(),
	}),
}));

describe("invoice offline fallbacks", () => {
	beforeEach(() => {
		vi.resetModules();
		setActivePinia(createPinia());
		(window as any).__ = (value: string) => value;
		(window as any).frappe = {
			call: vi.fn(),
			datetime: {
				nowdate: () => "2026-04-09",
				get_today: () => "2026-04-09",
			},
		};
	});

	it("uses cached delivery charges when the live request fails", async () => {
		const offlineCache = await import("../src/offline/cache");
		const { useUIStore } = await import("../src/posapp/stores/uiStore");
		const uiStore = useUIStore();
		uiStore.setPosProfile({
			name: "POS-1",
			company: "Test Company",
			currency: "PKR",
		} as any);

		offlineCache.saveDeliveryChargesCache("POS-1", "CUST-1", [
			{ name: "DEL-1", rate: 250 },
		]);
		(window as any).frappe.call = vi
			.fn()
			.mockRejectedValue(new Error("offline"));

		const { useInvoiceItems } = await import(
			"../src/posapp/composables/pos/invoice/useInvoiceItems"
		);
		const invoiceItems = useInvoiceItems(ref("Invoice"));

		await invoiceItems.fetch_delivery_charges("CUST-1");

		expect(invoiceItems.delivery_charges.value).toEqual([
			{ name: "DEL-1", rate: 250 },
		]);
	});

	it("uses cached customer addresses when address lookup fails", async () => {
		const offlineCache = await import("../src/offline/cache");
		offlineCache.saveCustomerAddressesCache("CUST-1", [
			{ name: "ADDR-1", address_title: "Main Address" },
		]);
		(window as any).frappe.call = vi.fn(({ error }: any) => {
			error?.(new Error("offline"));
		});

		const { useInvoiceDetails } = await import(
			"../src/posapp/composables/pos/invoice/useInvoiceDetails"
		);
		const invoiceDetails = useInvoiceDetails({
			invoiceDoc: ref({ customer: "CUST-1" }),
			posProfile: ref({ name: "POS-1" }),
			invoiceType: ref("Invoice"),
		});

		invoiceDetails.get_addresses();

		expect(invoiceDetails.addresses.value).toEqual([
			{
				name: "ADDR-1",
				address_title: "Main Address",
				display_title: "Main Address",
			},
		]);
	});

	it("uses cached currency data when currency endpoints fail", async () => {
		const offlineCache = await import("../src/offline/cache");
		const { useUIStore } = await import("../src/posapp/stores/uiStore");
		const uiStore = useUIStore();
		uiStore.setPosProfile({
			name: "POS-1",
			company: "Test Company",
			currency: "PKR",
			selling_price_list: "Retail",
			posa_decimal_precision: "2",
		} as any);
		uiStore.setCompanyDoc({
			default_currency: "PKR",
		});

		offlineCache.saveCurrencyOptionsCache("POS-1", [
			{ value: "PKR", title: "PKR" },
			{ value: "USD", title: "USD" },
		]);
		offlineCache.savePriceListMetaCache("POS-1", {
			price_lists: ["Retail"],
			price_list_currency: "USD",
		});
		offlineCache.saveExchangeRateCache({
			profileName: "POS-1",
			company: "Test Company",
			fromCurrency: "USD",
			toCurrency: "EUR",
			date: "2026-04-09",
			exchange_rate: 1.5,
		});
		offlineCache.saveExchangeRateCache({
			profileName: "POS-1",
			company: "Test Company",
			fromCurrency: "EUR",
			toCurrency: "PKR",
			date: "2026-04-09",
			exchange_rate: 300,
		});

		(window as any).frappe.call = vi
			.fn()
			.mockRejectedValue(new Error("offline"));

		const { useInvoiceCurrency } = await import(
			"../src/posapp/composables/pos/invoice/useInvoiceCurrency"
		);
		const invoiceCurrency = useInvoiceCurrency();

		const currencies = await invoiceCurrency.fetch_available_currencies();
		invoiceCurrency.selected_currency.value = "EUR";
		invoiceCurrency.price_list_currency.value = "USD";
		await invoiceCurrency.update_currency_and_rate();

		expect(currencies).toEqual([
			{ value: "PKR", title: "PKR" },
			{ value: "USD", title: "USD" },
		]);
		expect(invoiceCurrency.exchange_rate.value).toBe(1.5);
		expect(invoiceCurrency.conversion_rate.value).toBe(300);
	});

	it("rebuilds cart rates from the original price-list rate when currency is toggled back", async () => {
		const { useUIStore } = await import("../src/posapp/stores/uiStore");
		const { useInvoiceStore } = await import("../src/posapp/stores/invoiceStore");
		const { useInvoiceCurrency } = await import(
			"../src/posapp/composables/pos/invoice/useInvoiceCurrency"
		);

		const uiStore = useUIStore();
		uiStore.setPosProfile({
			name: "POS-1",
			company: "Test Company",
			currency: "PKR",
			selling_price_list: "Retail",
			posa_decimal_precision: "2",
		} as any);
		uiStore.setCompanyDoc({
			default_currency: "PKR",
		});

		const invoiceStore = useInvoiceStore();
		invoiceStore.addItem({
			item_code: "ITEM-10",
			qty: 1,
			rate: 0.04,
			price_list_rate: 0.04,
			base_rate: 11.2,
			base_price_list_rate: 11.2,
			original_rate: 10,
			original_currency: "PKR",
			conversion_factor: 1,
			discount_amount: 0,
			base_discount_amount: 0,
			amount: 0.04,
			base_amount: 11.2,
			posa_row_id: "row-10",
		} as any);

		const invoiceCurrency = useInvoiceCurrency();
		invoiceCurrency.price_list_currency.value = "PKR";
		invoiceCurrency.selected_currency.value = "USD";
		invoiceCurrency.exchange_rate.value = 0.0035714285714285713;
		invoiceCurrency.conversion_rate.value = 280;

		await invoiceCurrency.update_item_rates();

		expect(invoiceStore.items[0].base_rate).toBe(10);
		expect(invoiceStore.items[0].rate).toBe(0.04);

		invoiceCurrency.selected_currency.value = "PKR";
		invoiceCurrency.exchange_rate.value = 1;
		invoiceCurrency.conversion_rate.value = 1;

		await invoiceCurrency.update_item_rates();

		expect(invoiceStore.items[0].base_rate).toBe(10);
		expect(invoiceStore.items[0].rate).toBe(10);
		expect(invoiceStore.grossTotal).toBe(10);
	});
});
