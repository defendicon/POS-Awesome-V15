// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import notificationBellSource from "../src/posapp/components/navbar/NotificationBell.vue?raw";
import invoiceManagementSource from "../src/posapp/components/pos/flows/InvoiceManagement.vue?raw";
import itemsSelectorSource from "../src/posapp/components/pos/items/ItemsSelector.vue?raw";
import itemsSelectorCardsSource from "../src/posapp/components/pos/items/ItemsSelectorCards.vue?raw";
import itemsSelectorTableSource from "../src/posapp/components/pos/items/ItemsSelectorTable.vue?raw";

describe("UI regression coverage", () => {
	beforeEach(() => {
		(window as any).__ = (text: string) => text;
		(window as any).matchMedia =
			(window as any).matchMedia ||
			(() => ({
				matches: false,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn(),
			}));
	});

	it("locks the notification empty state copy and affordances", () => {
		const source = notificationBellSource;

		expect(source).toContain("Everything is quiet right now");
		expect(source).toContain("All caught up");
		expect(source).toContain(
			"Invoice failures and retry issues will appear here when they need your attention.",
		);
		expect(source).toContain("__('View notifications') + (unreadCount ? ` (${unreadCount})` : '')");
		expect(source).toContain('v-if="notifications.length"');
		expect(source).toContain('class="empty-pill"');
	});

	it("locks the item selector empty-state decision copy", () => {
		const source = itemsSelectorSource;

		expect(source).toContain('const emptyStateTitle = computed(() => {');
		expect(source).toContain('return __("No items match this search")');
		expect(source).toContain('return __("No items in this group")');
		expect(source).toContain('return __("No items available yet")');
		expect(source).toContain(
			'return __("Try a different keyword or reset the group filter to see more items.");',
		);
		expect(source).toContain(
			'return __("Items will appear here after the catalog sync completes or when products are added to this profile.");',
		);
		expect(source).toContain(
			'if (hasSearchFilter.value && hasGroupFilter.value) return __("Clear Search and Filters");',
		);
		expect(source).toContain(
			'if (hasGroupFilter.value) return __("Show All Items");',
		);
		expect(source).toContain("const resetItemFilters = () => {");
		expect(source).toContain('item_group.value = "ALL";');
	});

	it("locks the item card empty state chips and loading skeleton count", () => {
		const source = itemsSelectorCardsSource;

		expect(source).toContain('<Skeleton v-for="n in 8"');
		expect(source).toContain("<RecycleScroller");
		expect(source).toContain('import { RecycleScroller } from "vue-virtual-scroller"');
		expect(source).toContain('@update="handleRangeUpdate"');
		expect(source).toContain('v-if="searchInput"');
		expect(source).toContain("{{ searchInput }}");
		expect(source).toContain("itemGroup && itemGroup !== 'ALL'");
		expect(source).toContain("{{ itemGroup }}");
		expect(source).toContain('class="items-empty-state__action"');
		expect(source).toContain('emit("clear-search")');
	});

	it("keeps desktop item selector tables fully expanded", () => {
		const source = itemsSelectorTableSource;
		const selectorSource = itemsSelectorSource;

		expect(source).toContain("<v-data-table-virtual");
		expect(source).toContain('item-value="item_code"');
		expect(source).toContain('@scroll.passive="handleListScroll"');
		expect(source).toContain("const responsiveWidth = computed(() => {");
		expect(source).toContain("if (viewportWidth.value >= 1024) {");
		expect(source).toContain('if (responsiveWidth.value >= 1280) return "xl";');
		expect(source).toContain('if (responsiveWidth.value >= 1100) return "lg";');
		expect(source).toContain('if (responsiveWidth.value >= 900) return "md";');
		expect(source).toContain('xs: ["item_name", "rate"],');
		expect(source).toContain('md: ["item_name", "actual_qty", "rate"],');
		expect(source).toContain('lg: ["item_name", "item_code", "actual_qty", "rate"],');
		expect(source).toContain('minWidth: "100%",');
		expect(selectorSource).toContain('@list-scroll="onListScroll"');
	});

	it("keeps invoice management loaders and reset actions in each tab", () => {
		const source = invoiceManagementSource;

		expect(source).toContain('class="tab-loader__headline"');
		expect(source).toContain('class="tab-loader__skeletons"');
		expect(source).toContain('class="empty-state__actions"');
		expect(source).toContain('v-if="hasActiveFilters(\'history\')"');
		expect(source).toContain('v-if="hasActiveFilters(\'partial\')"');
		expect(source).toContain('v-if="hasActiveFilters(\'drafts\')"');
		expect(source).toContain('v-if="hasActiveFilters(\'returns\')"');
		expect(source).toContain("hasActiveFilters(tab) {");
		expect(source).toContain("resetFilters(tab) {");
	});

	it("resets invoice management filters per tab", async () => {
		const { default: InvoiceManagement } = await import(
			"../src/posapp/components/pos/flows/InvoiceManagement.vue"
		);
		const methods = (InvoiceManagement as any).methods;
		const vm = {
			historySearch: "INV-1",
			historyStatus: "Paid",
			historyDateFrom: "2026-03-01",
			historyDateTo: "2026-03-09",
			partialSearch: "Customer",
			partialStatus: "Overdue",
			partialDateFrom: "2026-03-01",
			partialDateTo: "2026-03-09",
			draftSearch: "Draft",
			draftDateFrom: "2026-03-02",
			draftDateTo: "2026-03-08",
			returnSearch: "RET-1",
			returnDateFrom: "2026-03-03",
			returnDateTo: "2026-03-04",
		};

		expect(methods.hasActiveFilters.call(vm, "history")).toBe(true);
		expect(methods.hasActiveFilters.call(vm, "partial")).toBe(true);
		expect(methods.hasActiveFilters.call(vm, "drafts")).toBe(true);
		expect(methods.hasActiveFilters.call(vm, "returns")).toBe(true);

		methods.resetFilters.call(vm, "history");
		methods.resetFilters.call(vm, "partial");
		methods.resetFilters.call(vm, "drafts");
		methods.resetFilters.call(vm, "returns");

		expect(vm.historySearch).toBe("");
		expect(vm.historyStatus).toBe("All");
		expect(vm.historyDateFrom).toBe("");
		expect(vm.historyDateTo).toBe("");
		expect(vm.partialSearch).toBe("");
		expect(vm.partialStatus).toBe("All");
		expect(vm.partialDateFrom).toBe("");
		expect(vm.partialDateTo).toBe("");
		expect(vm.draftSearch).toBe("");
		expect(vm.draftDateFrom).toBe("");
		expect(vm.draftDateTo).toBe("");
		expect(vm.returnSearch).toBe("");
		expect(vm.returnDateFrom).toBe("");
		expect(vm.returnDateTo).toBe("");
		expect(methods.hasActiveFilters.call(vm, "history")).toBe(false);
		expect(methods.hasActiveFilters.call(vm, "partial")).toBe(false);
		expect(methods.hasActiveFilters.call(vm, "drafts")).toBe(false);
		expect(methods.hasActiveFilters.call(vm, "returns")).toBe(false);
	});
});
