// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { reorderRows } from "../src/posapp/utils/rowOrder";
import { useRowReorder } from "../src/posapp/composables/core/useRowReorder";
import { useSelectorRowOrder } from "../src/posapp/composables/pos/items/useSelectorRowOrder";
import { useInvoiceStore } from "../src/posapp/stores/invoiceStore";

vi.mock("../src/offline/index", () => ({
	getTaxTemplate: () => null,
	getTaxInclusiveSetting: () => false,
	isOffline: () => false,
}));
vi.mock("../src/posapp/components/pos/invoice_utils/currency", () => ({
	_getPlcConversionRate: () => 1,
}));
import { get_invoice_doc } from "../src/posapp/components/pos/invoice_utils/document";

beforeEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
	setActivePinia(createPinia());
	(window as any).__ = (text: string) => text;
	(globalThis as any).frappe = { datetime: { nowdate: () => "2026-11-17" } };
	(globalThis as any).flt = (value: unknown, precision = 2) =>
		Number(Number(value || 0).toFixed(precision));
});

describe("shared row reordering", () => {
	it("handles before/after, column-sorted visible slices and missing/stale targets", () => {
		const rows = ["hidden-a", "a", "b", "c", "hidden-b"];
		expect(reorderRows(rows, String, "a", "c", true)).toEqual([
			"hidden-a",
			"b",
			"c",
			"a",
			"hidden-b",
		]);
		expect(reorderRows(rows, String, "c", "a", false)).toEqual([
			"hidden-a",
			"c",
			"a",
			"b",
			"hidden-b",
		]);
		expect(
			reorderRows(rows, String, "a", "c", false, ["c", "b", "a"]),
		).toEqual(["hidden-a", "a", "c", "b", "hidden-b"]);
		expect(reorderRows(rows, String, "missing", "a", false)).toBeNull();
		expect(reorderRows(rows, String, "a", "a", true)).toBeNull();
		expect(reorderRows(["a", "a"], String, "a", "b", false)).toBeNull();
	});

	it("saves selector order by scope, retains fresh row objects and safely resets", async () => {
		const scope = ref("selector:user-1:profile-1");
		let api!: ReturnType<typeof useSelectorRowOrder>;
		const wrapper = mount(
			defineComponent({
				setup() {
					api = useSelectorRowOrder(scope);
					return () => h("div");
				},
			}),
		);
		const rows = [
			{ item_code: "a", rate: 10 },
			{ item_code: "b", rate: 20 },
			{ item_code: "c", rate: 30 },
		];
		api.move(rows, "c", "a", false, ["a", "b", "c"]);
		expect(api.apply(rows).map((row) => row.item_code)).toEqual([
			"c",
			"a",
			"b",
		]);
		const fresh = rows.map((row) => ({ ...row, rate: row.rate * 2 }));
		expect(api.apply(fresh)[0]).toBe(fresh[2]);
		scope.value = "selector:user-2:profile-1";
		await nextTick();
		expect(api.apply(rows)).toBe(rows);
		scope.value = "selector:user-1:profile-1";
		await nextTick();
		expect(api.apply(rows)[0]).toBe(rows[2]);
		api.reset();
		expect(api.apply(rows)).toBe(rows);
		wrapper.unmount();
	});

	it("keeps selector reordering usable when browser storage is corrupt or unavailable", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		localStorage.setItem("scope", "{broken");
		let api!: ReturnType<typeof useSelectorRowOrder>;
		const wrapper = mount(
			defineComponent({
				setup() {
					api = useSelectorRowOrder(ref("scope"));
					return () => h("div");
				},
			}),
		);
		expect(api.error.value).toContain("could not be loaded");
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("denied");
		});
		const rows = [{ item_code: "a" }, { item_code: "b" }];
		api.move(rows, "b", "a", false, ["a", "b"]);
		expect(api.apply(rows)[0]).toBe(rows[1]);
		expect(api.error.value).toContain("session only");
		wrapper.unmount();
	});

	it("commits only handle drags, supports keyboard moves, and cancels Escape/outside drops", async () => {
		const commit = vi.fn();
		const root = ref<HTMLElement | null>(null);
		const wrapper = mount(
			defineComponent({
				setup() {
					const api = useRowReorder(root, commit);
					return () =>
						h(
							"div",
							{
								ref: root,
								onPointerdownCapture: api.onPointerDown,
								onKeydownCapture: api.onKeydown,
							},
							["a", "b"].map((key) =>
								h("div", { "data-row-reorder-id": key }, [
									h(
										"button",
										{
											"data-row-reorder-key": key,
											"aria-label": key,
										},
										key,
									),
								]),
							),
						);
				},
			}),
		);
		const target = wrapper.find('[data-row-reorder-id="b"]').element;
		vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
			top: 100,
			height: 50,
		} as DOMRect);
		Object.defineProperty(document, "elementFromPoint", {
			configurable: true,
			value: vi.fn(() => target),
		});
		const start = () =>
			wrapper
				.find('[data-row-reorder-key="a"]')
				.element.dispatchEvent(
					new MouseEvent("pointerdown", {
						bubbles: true,
						button: 0,
						clientX: 20,
						clientY: 20,
					}),
				);
		start();
		window.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX: 20,
				clientY: 140,
				cancelable: true,
			}),
		);
		expect(target.classList.contains("pos-row-reorder-after")).toBe(true);
		window.dispatchEvent(new MouseEvent("pointerup"));
		expect(commit).toHaveBeenLastCalledWith({
			source: "a",
			target: "b",
			after: true,
			visibleKeys: ["a", "b"],
		});
		commit.mockClear();
		start();
		window.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX: 20,
				clientY: 140,
				cancelable: true,
			}),
		);
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		window.dispatchEvent(new MouseEvent("pointerup"));
		expect(commit).not.toHaveBeenCalled();
		expect(document.querySelector(".pos-row-reorder-ghost")).toBeNull();
		start();
		window.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX: 20,
				clientY: 140,
				cancelable: true,
			}),
		);
		(document.elementFromPoint as any).mockReturnValue(null);
		window.dispatchEvent(
			new MouseEvent("pointermove", {
				clientX: 500,
				clientY: 500,
				cancelable: true,
			}),
		);
		window.dispatchEvent(new MouseEvent("pointerup"));
		expect(commit).not.toHaveBeenCalled();
		await wrapper
			.find('[data-row-reorder-key="a"]')
			.trigger("keydown", { altKey: true, key: "ArrowDown" });
		expect(commit).toHaveBeenCalledTimes(1);
		wrapper.unmount();
	});

	it("preserves duplicate-code invoice lines, amounts, UOM and batch/serial data through payload and recovery", () => {
		const store = useInvoiceStore();
		store.setItems([
			{
				posa_row_id: "line-a",
				item_code: "same",
				item_name: "Same",
				qty: 2,
				rate: 12,
				amount: 24,
				discount_amount: 1,
				uom: "Box",
				conversion_factor: 5,
				stock_qty: 10,
				batch_no: "BATCH-A",
				idx: 1,
			},
			{
				posa_row_id: "line-b",
				item_code: "same",
				item_name: "Same",
				qty: 1,
				rate: 7,
				amount: 7,
				discount_amount: 0,
				uom: "Unit",
				serial_no: "SERIAL-B",
				idx: 2,
			},
		]);
		const original = store.items[0];
		const totals = [store.totalQty, store.grossTotal, store.discountTotal];
		expect(store.reorderItems(["line-b", "line-a"])).toBe(true);
		expect(store.items[1]).toBe(original);
		expect(store.items.map((row) => row.idx)).toEqual([1, 2]);
		expect([store.totalQty, store.grossTotal, store.discountTotal]).toEqual(
			totals,
		);
		expect(store.items[1]).toMatchObject({
			batch_no: "BATCH-A",
			stock_qty: 10,
			conversion_factor: 5,
		});
		expect(store.reorderItems(["line-a", "line-a"])).toBe(false);
		expect(store.reorderItems(["missing", "line-a"])).toBe(false);
		const context: any = {
			invoiceType: "Invoice",
			pos_profile: {
				company: "Company",
				name: "POS",
				currency: "PKR",
				payments: [],
			},
			selected_currency: "PKR",
			conversion_rate: 1,
			company: { default_currency: "PKR" },
			price_list_currency: "PKR",
			get_price_list: () => "Retail",
			customer_info: { customer: "Walk-In", customer_name: "Walk-In" },
			customer: "Walk-In",
			isReturnInvoice: false,
			items: store.items,
			packed_items: [],
			Total: 31,
			subtotal: 31,
			additional_discount: 0,
			additional_discount_percentage: 0,
			roundAmount: (value: number) => value,
			pos_opening_shift: { name: "SHIFT" },
			posa_offers: [],
			posa_coupons: [],
			selected_delivery_charge: null,
			delivery_charges_rate: 0,
			posting_date_display: "2026-11-17",
			formatDateForBackend: (value: string) => value,
			invoice_doc: { payments: [], taxes: [] },
		};
		const doc = get_invoice_doc(context);
		expect(doc.items.map((row: any) => row.posa_row_id)).toEqual([
			"line-b",
			"line-a",
		]);
		const snapshot = JSON.parse(JSON.stringify(doc));
		store.clearItems();
		store.setItems(snapshot.items);
		expect(store.items.map((row) => row.posa_row_id)).toEqual([
			"line-b",
			"line-a",
		]);
	});
});
