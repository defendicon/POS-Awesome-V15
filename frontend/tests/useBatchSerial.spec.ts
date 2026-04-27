import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	getDisplayableBatchOptions,
	useBatchSerial,
} from "../src/posapp/composables/pos/shared/useBatchSerial";

beforeEach(() => {
	vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("useBatchSerial.setSerialNo", () => {
	it("does not force qty to zero when no serial is selected", () => {
		const { setSerialNo } = useBatchSerial();
		const context = { forceUpdate: vi.fn() };
		const item: any = {
			has_serial_no: 1,
			has_batch_no: 0,
			serial_no_data: [{ serial_no: "SER-001" }, { serial_no: "SER-002" }],
			serial_no_selected: [],
			stock_qty: 15,
			qty: 15,
		};

		setSerialNo(item, context);

		expect(item.qty).toBe(15);
		expect(item.serial_no_selected_count).toBe(0);
		expect(item.serial_no).toBe("");
	});

	it("preserves selected serials when serial dataset is temporarily empty", () => {
		const { setSerialNo } = useBatchSerial();
		const context = { forceUpdate: vi.fn() };
		const item: any = {
			has_serial_no: 1,
			has_batch_no: 0,
			serial_no_data: [],
			serial_no_selected: ["SER-001"],
			stock_qty: 1,
			qty: 1,
		};

		setSerialNo(item, context);

		expect(item.serial_no_selected).toEqual(["SER-001"]);
		expect(item.serial_no).toBe("SER-001");
		expect(item.serial_no_selected_count).toBe(1);
		expect(item.qty).toBe(1);
	});

	it("removes invalid serials when valid dataset exists", () => {
		const { setSerialNo } = useBatchSerial();
		const context = { forceUpdate: vi.fn() };
		const item: any = {
			has_serial_no: 1,
			has_batch_no: 0,
			serial_no_data: [{ serial_no: "SER-VALID" }],
			serial_no_selected: ["SER-VALID", "SER-INVALID"],
			stock_qty: 2,
			qty: 2,
		};

		setSerialNo(item, context);

		expect(item.serial_no_selected).toEqual(["SER-VALID"]);
		expect(item.serial_no).toBe("SER-VALID");
		expect(item.serial_no_selected_count).toBe(1);
		expect(item.qty).toBe(1);
	});
});

describe("useBatchSerial.setBatchQty", () => {
	it("returns only batches with stock greater than zero for display", () => {
		expect(
			getDisplayableBatchOptions([
				{ batch_no: "B-AVAILABLE", available_qty: 3 },
				{ batch_no: "B-ZERO", available_qty: 0 },
				{ batch_no: "B-NEGATIVE", available_qty: -2 },
				{ batch_no: "B-FALLBACK", batch_qty: 4 },
				{ batch_no: "B-FALLBACK-ZERO", batch_qty: 0 },
			]),
		).toEqual([
			{ batch_no: "B-AVAILABLE", available_qty: 3 },
			{ batch_no: "B-FALLBACK", batch_qty: 4 },
		]);
	});

	it("ignores expired batches and picks next non-expired batch", () => {
		const { setBatchQty } = useBatchSerial();
		const context: any = {
			items: [],
			price_list_currency: "USD",
			selected_currency: "USD",
			exchange_rate: 1,
			currency_precision: 2,
			flt: (value: any) => Number(value),
			forceUpdate: vi.fn(),
		};

		const item: any = {
			item_code: "ITEM-BATCH",
			qty: 3,
			has_batch_no: 1,
			has_serial_no: 0,
			batch_no_data: [
				{
					batch_no: "B-EXPIRED",
					batch_qty: 10,
					is_expired: true,
				},
				{
					batch_no: "B-VALID",
					batch_qty: 5,
					is_expired: false,
				},
			],
		};

		setBatchQty(item, null, false, context);

		expect(item.batch_no).toBe("B-VALID");
		expect(item.batch_no_data.map((b: any) => b.batch_no)).toEqual([
			"B-VALID",
		]);
	});

	it("applies batch price immediately during auto batch selection", () => {
		const { setBatchQty } = useBatchSerial();
		const context: any = {
			items: [],
			pos_profile: { currency: "USD" },
			price_list_currency: "USD",
			selected_currency: "USD",
			exchange_rate: 1,
			currency_precision: 2,
			flt: (value: any) => Number(value),
			forceUpdate: vi.fn(),
		};

		const item: any = {
			item_code: "ITEM-BATCH-PRICE",
			qty: 2,
			has_batch_no: 1,
			has_serial_no: 0,
			rate: 15,
			price_list_rate: 15,
			base_rate: 15,
			base_price_list_rate: 15,
			batch_no_data: [
				{
					batch_no: "B-FEFO",
					batch_qty: 8,
					batch_price: 12,
					is_expired: false,
				},
			],
		};

		setBatchQty(item, null, false, context);

		expect(item.batch_no).toBe("B-FEFO");
		expect(item.batch_price).toBe(12);
		expect(item.base_batch_price).toBe(12);
		expect(item.rate).toBe(12);
		expect(item.price_list_rate).toBe(12);
		expect(item.base_rate).toBe(12);
		expect(item.base_price_list_rate).toBe(12);
		expect(item.amount).toBe(24);
		expect(item.base_amount).toBe(24);
	});

	it("does not zero item totals when selected batch has no positive batch price", () => {
		const { setBatchQty } = useBatchSerial();
		const context: any = {
			items: [],
			pos_profile: { currency: "USD" },
			price_list_currency: "USD",
			selected_currency: "USD",
			exchange_rate: 1,
			currency_precision: 2,
			flt: (value: any) => Number(value),
			forceUpdate: vi.fn(),
		};

		const item: any = {
			item_code: "ITEM-BATCH-ZERO-PRICE",
			qty: 2,
			has_batch_no: 1,
			has_serial_no: 0,
			rate: 15,
			price_list_rate: 15,
			base_rate: 15,
			base_price_list_rate: 15,
			amount: 30,
			base_amount: 30,
			batch_no_data: [
				{
					batch_no: "B-ZERO-PRICE",
					batch_qty: 8,
					batch_price: 0,
					is_expired: false,
				},
			],
		};

		setBatchQty(item, "B-ZERO-PRICE", false, context);

		expect(item.batch_no).toBe("B-ZERO-PRICE");
		expect(item.rate).toBe(15);
		expect(item.price_list_rate).toBe(15);
		expect(item.base_rate).toBe(15);
		expect(item.base_price_list_rate).toBe(15);
		expect(item.amount).toBe(30);
		expect(item.base_amount).toBe(30);
	});
});
