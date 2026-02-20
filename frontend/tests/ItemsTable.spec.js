// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { createTestingPinia } from "@pinia/testing";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import ItemsTable from "../src/posapp/components/pos/invoice/ItemsTable.vue";

// Mock global functions
global.window = global.window || {};
global.window.__ = (str) => str;
global.__ = (str) => str;

// Mock CSS
vi.mock("../src/posapp/components/pos/invoice/items-table-styles.css", () => ({}));

describe("ItemsTable.vue", () => {
	let vuetify;

	beforeAll(() => {
		// Ensure mocks are in place
		global.window = global.window || {};
		global.navigator = global.navigator || { userAgent: "node" };
		global.frappe = {
			datetime: {
				nowdate: () => "2024-01-01",
			},
			utils: {
				is_rtl: () => false,
			},
			provide: vi.fn(),
		};

		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: vi.fn().mockImplementation((query) => ({
				matches: false,
				media: query,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});

		global.ResizeObserver = class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		};

		vuetify = createVuetify({
			components,
			directives,
		});
	});

	it("renders empty state when items are empty", () => {
		const wrapper = mount(ItemsTable, {
			global: {
				config: {
					globalProperties: {
						__: (str) => str,
					},
				},
				plugins: [
					createTestingPinia({
						initialState: {
							invoiceStore: {
								items: [], // Empty items
								invoiceDoc: {},
							},
						},
						createSpy: vi.fn,
					}),
					vuetify,
				],
				mocks: {
					eventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() },
				},
				stubs: {
					// Stub out child components to isolate ItemsTable
					CartItemRow: true,
					ItemsTableExpandedRow: true,
					"v-dialog": true,
				},
			},
			props: {
				headers: [],
				expanded: [],
				itemsPerPage: 10,
				formatFloat: (val) => val,
				formatCurrency: (val) => val,
				currencySymbol: () => "$",
				isNumber: () => true,
				isNegative: () => false,
				setFormatedQty: vi.fn(),
				setFormatedCurrency: vi.fn(),
				calcPrices: vi.fn(),
				calcUom: vi.fn(),
				setSerialNo: vi.fn(),
				setBatchQty: vi.fn(),
				validateDueDate: vi.fn(),
				removeItem: vi.fn(),
				subtractOne: vi.fn(),
				addOne: vi.fn(),
				toggleOffer: vi.fn(),
				changePriceListRate: vi.fn(),
			},
		});

		// Check for the text "Your cart is empty"
		const text = wrapper.text();
		expect(text).toContain("Your cart is empty");
		expect(text).toContain("Scan a barcode or use the search bar");
	});
});
