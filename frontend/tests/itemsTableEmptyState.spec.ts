// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, it, expect, vi } from "vitest";
import { createTestingPinia } from "@pinia/testing";
import ItemsTable from "../src/posapp/components/pos/invoice/ItemsTable.vue";
import { useInvoiceStore } from "../src/posapp/stores/invoiceStore";

// Mock dependencies
vi.mock("../src/posapp/utils/itemSelectorSettings", () => ({
  loadItemSelectorSettings: () => ({ hide_qty_decimals: false }),
}));

vi.mock("../src/posapp/utils/perf", () => ({
  logComponentRender: vi.fn(),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsTableSearch", () => ({
  useItemsTableSearch: () => ({ customItemFilter: vi.fn() }),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsTableDragDrop", () => ({
  useItemsTableDragDrop: () => ({
    onDragOverFromSelector: vi.fn(),
    onDragEnterFromSelector: vi.fn(),
    onDragLeaveFromSelector: vi.fn(),
    onDropFromSelector: vi.fn(),
  }),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsTableResponsive", () => ({
  useItemsTableResponsive: () => ({
    breakpoint: { value: "lg" },
    responsiveHeaders: [],
    isColumnVisible: () => true,
    containerStyles: {},
    containerClasses: "",
    tableClasses: "",
    expandedContentClasses: "",
    tableDensity: { value: "comfortable" },
    containerHeight: { value: 600 },
  }),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsTableMerge", () => ({
  useItemsTableMerge: () => ({ clearMergeCache: vi.fn() }),
}));

vi.mock("../src/posapp/composables/pos/items/useItemsTableNameEdit", () => ({
  useItemsTableNameEdit: () => ({
    editNameDialog: false,
    editedName: "",
    editNameTarget: null,
    openNameDialog: vi.fn(),
    saveItemName: vi.fn(),
    resetItemName: vi.fn(),
  }),
}));

vi.mock("../src/posapp/composables/core/useFormatters", () => ({
  useFormatters: () => ({
    memoizedFormatFloat: (v: any) => String(v),
    memoizedFormatCurrency: (v: any) => String(v),
    clearFormatCache: vi.fn(),
  }),
}));

vi.mock("../src/posapp/composables/core/useRtl", () => ({
  useRtl: () => ({ isRtl: false }),
}));

// Mock global translation function
global.__ = (key: string) => key;
global.frappe = {
  datetime: {
    nowdate: () => "2024-01-01",
  },
};

const DataTableStub = {
    template: "<div><slot name='no-data' v-if='!items || !items.length'></slot><div v-else><slot name='item' v-for='item in items' :item='item'></slot></div></div>",
    props: ["items"],
};

describe("ItemsTable.vue", () => {
  it("renders empty state when no items are present", async () => {
    const wrapper = mount(ItemsTable, {
      global: {
        config: {
          globalProperties: {
            __: (key: string) => key,
          },
        },
        components: {
          "v-data-table-virtual": DataTableStub,
        },
        plugins: [createTestingPinia({ createSpy: vi.fn })],
        stubs: {
          "v-icon": true,
          "v-dialog": true,
          "v-card": true,
          "v-card-title": true,
          "v-card-text": true,
          "v-text-field": true,
          "v-card-actions": true,
          "v-btn": true,
          "v-spacer": true,
          ItemsTableExpandedRow: true,
          CartItemRow: true,
        },
      },
      props: {
        formatFloat: (v: any) => String(v),
        formatCurrency: (v: any) => String(v),
        currencySymbol: () => "$",
        isNumber: () => true,
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
        isNegative: () => false,
      },
    });

    const store = useInvoiceStore();
    store.items = []; // Empty items
    await wrapper.vm.$nextTick();

    // Assert that the empty state text is visible
    expect(wrapper.text()).toContain("Your cart is empty");
    expect(wrapper.text()).toContain("Scan a barcode or use the search bar");
  });
});
