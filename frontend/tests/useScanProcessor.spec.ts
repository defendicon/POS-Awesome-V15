import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

vi.mock("../src/offline/index", () => ({
	saveItems: vi.fn(async () => {}),
	savePriceListItems: vi.fn(async () => {}),
}));

vi.mock("../src/posapp/stores/toastStore", () => ({
	useToastStore: () => ({
		show: vi.fn(),
	}),
}));

import { useScanProcessor } from "../src/posapp/composables/pos/items/useScanProcessor";

const createScannableItem = (overrides: Record<string, any> = {}) => ({
	item_code: "ITEM-SCAN",
	item_name: "Scannable Item",
	available_qty: 5,
	actual_qty: 5,
	qty: 1,
	rate: 10,
	price_list_rate: 10,
	base_rate: 10,
	base_price_list_rate: 10,
	is_stock_item: 1,
	allow_negative_stock: 0,
	has_serial_no: 0,
	has_batch_no: 0,
	...overrides,
});

const makeContext = (
	options: {
		deferStockValidationToPayment?: boolean;
		allowNegativeStock?: boolean;
	} = {},
) => {
	const addItem = vi.fn(async () => {});

	return {
		items: ref<any[]>([]),
		pos_profile: ref({
			currency: "USD",
			warehouse: "Main Warehouse",
			company: "Test Co",
			posa_search_serial_no: 1,
			posa_search_batch_no: 0,
		}),
		active_price_list: ref("Standard Selling"),
		customer_price_list: ref<string | null>(null),
		itemDetailFetcher: {
			update_items_details: vi.fn(async () => {}),
		},
		itemAddition: {
			addItem,
		},
		barcodeIndex: {
			ensureBarcodeIndex: vi.fn(() => new Map()),
			lookupItemByBarcode: vi.fn(() => null),
			replaceBarcodeIndex: vi.fn(),
			indexItem: vi.fn(),
			searchItemsByCode: vi.fn(() => []),
			resetBarcodeIndex: vi.fn(),
		},
		scannerInput: {
			ensureScaleBarcodeSettings: vi.fn(async () => {}),
			updateScaleBarcodeSettings: vi.fn(),
			getScaleBarcodePrefix: vi.fn(() => ""),
			scaleBarcodeMatches: vi.fn(() => false),
			playScanTone: vi.fn(),
			scannerLocked: ref(false),
			scanErrorDialog: ref(false),
			scanErrorMessage: ref(""),
			scanErrorCode: ref(""),
			scanErrorDetails: ref(""),
		},
		searchCache: ref(new Map()),
		eventBus: {
			emit: vi.fn(),
		},
		format_number: (value: unknown) => String(value ?? ""),
		float_precision: computed(() => 2),
		hide_qty_decimals: computed(() => false),
		blockSaleBeyondAvailableQty: computed(() => false),
		deferStockValidationToPayment: computed(
			() => options.deferStockValidationToPayment ?? false,
		),
		currency_precision: computed(() => 2),
		exchange_rate: computed(() => 1),
		format_currency: (value: number) => String(value),
		ratePrecision: () => 2,
		customer: ref(null),
		stock_settings: ref({
			allow_negative_stock: options.allowNegativeStock === false ? 0 : 1,
		}),
		search_from_scanner_ref: ref(false),
		addItem,
	};
};

describe("useScanProcessor serial scan handling", () => {
	beforeEach(() => {
		(globalThis as any).__ = (text: string) => text;
		(globalThis as any).frappe = {
			call: vi.fn(async ({ method }: { method: string }) => {
				if (method === "posawesome.posawesome.api.items.parse_scale_barcode") {
					return { message: null };
				}
				return { message: null };
			}),
			show_alert: vi.fn(),
		};
	});

	it("adds item and auto-sets serial when scanned code matches serial_no_data locally", async () => {
		const ctx = makeContext();
		ctx.items.value = [
			{
				item_code: "ITEM-LOCAL",
				item_name: "Local Item",
				has_serial_no: 1,
				has_batch_no: 1,
				serial_no_data: [
					{ serial_no: "SER-LOCAL-001", batch_no: "BATCH-LOCAL-1" },
				],
				batch_no_data: [{ batch_no: "BATCH-LOCAL-1", batch_qty: 2 }],
				available_qty: 5,
				rate: 10,
				price_list_rate: 10,
				base_rate: 10,
				base_price_list_rate: 10,
			},
		];

		const { processScannedItem } = useScanProcessor(ctx as any);
		await processScannedItem("SER-LOCAL-001");

		expect(ctx.itemAddition.addItem).toHaveBeenCalledTimes(1);
		const addedItem = ctx.itemAddition.addItem.mock.calls[0][0];
		expect(addedItem.item_code).toBe("ITEM-LOCAL");
		expect(addedItem.to_set_serial_no).toBe("SER-LOCAL-001");
		expect(addedItem.to_set_batch_no).toBe("BATCH-LOCAL-1");
	});

	it("resolves serial scan via server, fetches item by resolved item_code, and auto-sets serial", async () => {
		const ctx = makeContext();

		(globalThis as any).frappe.call = vi.fn(
			async ({ method, args }: { method: string; args: any }) => {
				if (method === "posawesome.posawesome.api.items.parse_scale_barcode") {
					return { message: null };
				}
				if (
					method ===
					"posawesome.posawesome.api.items.search_serial_or_batch_or_barcode_number"
				) {
					expect(args.search_value).toBe("SER-SERVER-002");
					expect(args.search_serial_no).toBe(1);
					return {
						message: {
							item_code: "ITEM-SERVER",
							serial_no: "SER-SERVER-002",
						},
					};
				}
				if (method === "posawesome.posawesome.api.items.get_items") {
					expect(args.search_value).toBe("ITEM-SERVER");
					return {
						message: [
							{
								item_code: "ITEM-SERVER",
								item_name: "Server Item",
								has_serial_no: 1,
								has_batch_no: 0,
								serial_no_data: [],
								available_qty: 5,
								rate: 20,
								price_list_rate: 20,
								base_rate: 20,
								base_price_list_rate: 20,
							},
						],
					};
				}
				return { message: null };
			},
		);

		const { processScannedItem } = useScanProcessor(ctx as any);
		await processScannedItem("SER-SERVER-002");

		expect(ctx.itemAddition.addItem).toHaveBeenCalledTimes(1);
		const addedItem = ctx.itemAddition.addItem.mock.calls[0][0];
		expect(addedItem.item_code).toBe("ITEM-SERVER");
		expect(addedItem.to_set_serial_no).toBe("SER-SERVER-002");
	});

	it("blocks scanned items with insufficient stock for invoice flow", async () => {
		const ctx = makeContext({
			deferStockValidationToPayment: false,
			allowNegativeStock: false,
		});
		const { addScannedItemToInvoice } = useScanProcessor(ctx as any);

		await addScannedItemToInvoice(
			createScannableItem({ available_qty: 0, actual_qty: 0 }),
			"ITEM-SCAN",
		);

		expect(ctx.itemAddition.addItem).not.toHaveBeenCalled();
		expect(ctx.scannerInput.scanErrorDialog.value).toBe(true);
		expect(ctx.scannerInput.scanErrorCode.value).toBe("ITEM-SCAN");
		expect(ctx.scannerInput.scanErrorDetails.value).toContain(
			"Adjust the quantity",
		);
	});

	it("allows scanned items with insufficient stock for order flow when stock validation is deferred", async () => {
		const ctx = makeContext({ deferStockValidationToPayment: true });
		const { addScannedItemToInvoice } = useScanProcessor(ctx as any);

		await addScannedItemToInvoice(
			createScannableItem({ available_qty: 0, actual_qty: 0 }),
			"ITEM-SCAN",
		);

		expect(ctx.itemAddition.addItem).toHaveBeenCalledTimes(1);
		expect(ctx.scannerInput.scanErrorDialog.value).toBe(false);
	});

	it("allows scanned items with insufficient stock for quotation flow when stock validation is deferred", async () => {
		const ctx = makeContext({ deferStockValidationToPayment: true });
		const { addScannedItemToInvoice } = useScanProcessor(ctx as any);

		await addScannedItemToInvoice(
			createScannableItem({ available_qty: 0, actual_qty: 0 }),
			"ITEM-SCAN",
		);

		expect(ctx.itemAddition.addItem).toHaveBeenCalledTimes(1);
		expect(ctx.scannerInput.scanErrorDialog.value).toBe(false);
	});

	it("uses the standard barcode uom when posa_uom is not populated", async () => {
		const ctx = makeContext();
		(globalThis as any).frappe.call = vi.fn(
			async ({ method, args }: { method: string; args: any }) => {
				if (
					method ===
					"posawesome.posawesome.api.items.get_price_for_uom"
				) {
					expect(args).toMatchObject({
						item_code: "ITEM-SCAN",
						price_list: "Standard Selling",
						uom: "Box",
					});
					return { message: 120 };
				}
				return { message: null };
			},
		);

		const { addScannedItemToInvoice } = useScanProcessor(ctx as any);
		await addScannedItemToInvoice(
			createScannableItem({
				stock_uom: "Nos",
				item_barcode: [{ barcode: "BOX-001", uom: "Box" }],
				item_uoms: [
					{ uom: "Nos", conversion_factor: 1 },
					{ uom: "Box", conversion_factor: 12 },
				],
			}),
			"BOX-001",
		);

		expect(ctx.itemAddition.addItem).toHaveBeenCalledTimes(1);
		const addedItem = ctx.itemAddition.addItem.mock.calls[0][0];
		expect(addedItem.uom).toBe("Box");
		expect(addedItem.rate).toBe(120);
		expect(addedItem.conversion_factor).toBe(12);
	});
});
