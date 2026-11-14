<template>
	<div
		ref="tableContainer"
		class="my-0 py-0 overflow-y-auto posa-items-table-container posa-responsive-table-container pos-themed-card"
		:style="containerStyles"
		:class="[containerClasses, gridContainerClasses]"
		role="region"
		:aria-label="__('Invoice Items')"
		@keydown.capture="handleGridKeydown"
		@dragover="onDragOverFromSelector($event)"
		@drop="onDropFromSelector($event)"
		@dragenter="onDragEnterFromSelector"
		@dragleave="onDragLeaveFromSelector"
	>
		<v-data-table-virtual
			ref="virtualTable"
			:headers="responsiveHeaders"
			:items="displayItems"
			show-expand
			item-value="posa_row_id"
			class="posa-cart-table elevation-2 pos-themed-card"
			:class="[tableClasses, { 'posa-cart-table--counter-grid': counterGrid }]"
			:items-per-page="virtualScrollConfig.itemsPerPage"
			:item-height="virtualScrollConfig.itemHeight"
			:buffer-size="virtualScrollConfig.bufferSize"
			fixed-header
			:density="tableDensity"
			hide-default-footer
			:single-expand="true"
			:header-props="dynamicHeaderProps"
			:search="counterGrid ? '' : itemSearch"
			:custom-filter="customItemFilter"
		>
			<template #no-data>
				<div class="posa-cart-empty-state">
					<div class="posa-cart-empty-state__icon-wrap">
						<v-icon :icon="emptyStateIcon" size="42" class="posa-cart-empty-state__icon" />
					</div>
					<div class="posa-cart-empty-state__title">{{ emptyStateTitle }}</div>
					<div class="posa-cart-empty-state__subtitle">{{ emptyStateSubtitle }}</div>
				</div>
			</template>

			<template v-slot:item="{ item }">
				<CounterGridEntryRow
					v-if="isCounterGridEntry(item)"
					v-model="counterGridEntryQuery"
					:columns="finalVisibleColumns"
					:row-number="items.length + 1"
					@submit="openCounterGridItemSearch"
					@navigate-back="focusPreviousCounterGridEntry"
				/>
				<CartItemRow
					v-else
					:item="item"
					:row-index="getItemIndex(item)"
					:visible-columns="finalVisibleColumns"
					:posProfile="pos_profile"
					:isReturnInvoice="isReturnInvoice"
					:invoiceType="invoiceType"
					:displayCurrency="displayCurrency"
					:formatFloat="memoizedFormatFloat"
					:formatCurrency="memoizedFormatCurrency"
					:currencySymbol="currencySymbol"
					:isNumber="isNumber"
					:isNegative="memoizedIsNegative"
					:hideQtyDecimals="hide_qty_decimals"
					:isRTL="isRtl"
					:keyboard-mode="gridMode"
					:active-row="isGridRowActive(item)"
					:active-cell-key="activeCellKey || ''"
					@update-qty="handleQtyUpdate"
					@qty-edit-submitted="handleQtyEditSubmitted"
					@minus-click="handleMinusClick"
					@add-one="addOne"
					@calc-uom="calcUom"
					@update-rate="handleRateUpdate"
					@rate-edit-submitted="(submittedItem) => handleGridEditorSubmitted(submittedItem, 'rate')"
					@update-discount-percent="handleDiscountPercentUpdate"
					@update-discount-amount="handleDiscountAmountUpdate"
					@discount-percent-edit-submitted="
						(submittedItem) => handleGridEditorSubmitted(submittedItem, 'discount_percentage')
					"
					@discount-amount-edit-submitted="
						(submittedItem) => handleGridEditorSubmitted(submittedItem, 'discount_amount')
					"
					@open-name-dialog="openNameDialog"
					@reset-item-name="resetItemName"
					@toggle-offer="toggleOffer"
					@toggle-expand="openItemHistory(item)"
					@open-batch-serial="openBatchSerialSelector"
					@remove-item="removeItem"
					@click="handleRowClick($event, item)"
				/>
			</template>
		</v-data-table-virtual>

		<BatchSerialSelectionDialog
			v-model="batchSerialDialog"
			:item="batchSerialTarget"
			:cart-items="items"
			:is-return-invoice="isReturnInvoice"
			:loading="batchSerialLoading"
			@save="commitBatchSerialSelection"
		/>

		<ItemSalesHistoryModal
			v-model="itemHistoryDialog"
			:item="itemHistoryTarget"
			:pos-profile="pos_profile"
			:invoice-type="invoiceType"
			:is-return-invoice="isReturnInvoice"
			:invoice-doc="invoice_doc"
			:hide-qty-decimals="hide_qty_decimals"
			:expanded-content-classes="expandedContentClasses"
			:display-currency="displayCurrency"
			:format-float="memoizedFormatFloat"
			:format-currency="memoizedFormatCurrency"
			:currency-symbol="currencySymbol"
			:is-number="isNumber"
			:set-formated-currency="setFormatedCurrency"
			:calc-prices="calcPrices"
			:calc-uom="calcUom"
			:change-price-list-rate="changePriceListRate"
			:get-serial-options="getSerialOptions"
			:set-serial-no="setSerialNo"
			:set-batch-qty="setBatchQty"
			:validate-due-date="validateDueDate"
			@qty-change="handleQtyChange"
			@edit-item="handleItemEditRequest"
			@after-leave="handleItemHistoryAfterLeave"
		/>

		<!-- Edit name dialog -->
		<v-dialog v-model="editNameDialog" max-width="400">
			<v-card>
				<v-card-title>{{ __("Item Name") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="editedName" :maxlength="140" />
				</v-card-text>
				<v-card-actions>
					<v-btn
						v-if="editNameTarget && editNameTarget.name_overridden"
						variant="text"
						@click="resetItemName(editNameTarget)"
						>{{ __("Reset") }}</v-btn
					>
					<v-spacer></v-spacer>
					<v-btn variant="text" @click="editNameDialog = false">{{ __("Cancel") }}</v-btn>
					<v-btn color="primary" variant="text" @click="saveItemName">{{ __("Save") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, onMounted, watch, getCurrentInstance } from "vue";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import BatchSerialSelectionDialog from "./BatchSerialSelectionDialog.vue";
import {
	createBatchAllocationLines,
	type BatchAllocation,
} from "../../../composables/pos/shared/batchAllocation";
import { loadItemSelectorSettings } from "../../../utils/itemSelectorSettings";
import { logComponentRender } from "../../../utils/perf";
import CartItemRow from "./CartItemRow.vue";
import CounterGridEntryRow from "./CounterGridEntryRow.vue";
import ItemSalesHistoryModal from "./ItemSalesHistoryModal.vue";

import { useItemsTableSearch } from "../../../composables/pos/items/useItemsTableSearch";
import { useItemsTableDragDrop } from "../../../composables/pos/items/useItemsTableDragDrop";
import {
	DATA_TABLE_EXPAND_COLUMN,
	useItemsTableResponsive,
} from "../../../composables/pos/items/useItemsTableResponsive";
import { useItemsTableMerge } from "../../../composables/pos/items/useItemsTableMerge";
import { useItemsTableNameEdit } from "../../../composables/pos/items/useItemsTableNameEdit";
import { useFormatters } from "../../../composables/core/useFormatters";
import { useRtl } from "../../../composables/core/useRtl";
import {
	activateCartGridCell,
	ensureCartGridRowRendered,
	getAdjacentCartGridColumnKey,
	getCartGridCellTarget,
	focusCartItemField,
	focusCartGridCell,
	focusCartGridRow,
	getNavigableCartColumnKeys,
	isCartGridColumnKey,
	isCartGridDirectEditColumnKey,
	resolveCounterGridKeyboardCommand,
	shouldDelegateCartGridKeyToEditor,
	type CartGridColumnKey,
	type CartFieldFocusOptions,
	type CartShortcutField,
} from "../../../utils/cartFieldFocus";
import { isEditableElement } from "../../../utils/keyboardNavigation";
import "./items-table-styles.css";

// Global declarations for Frappe
declare const __: (_str: string, _args?: any[]) => string;

interface Props {
	headers?: any[];
	expanded?: any[];
	itemsPerPage?: number;
	itemSearch?: string;
	pos_profile?: any;
	invoiceType?: string;
	stock_settings?: any;
	displayCurrency?: string;
	formatFloat: (_value: number, _precision?: number | string) => string;
	formatCurrency: (_value: number, _precision?: number | string) => string;
	currencySymbol: (_currency?: string) => string;
	isNumber: (_value: any) => boolean;
	setFormatedQty: (_item: any, _field: string, _value: any, _force?: boolean, _event?: any) => void;
	setFormatedCurrency: (_item: any, _field: string, _value: any, _force?: boolean, _event?: any) => void;
	calcPrices: (_item: any, _value: any, _event?: any) => void;
	calcUom: (_item: any, _uom: string) => void;
	setSerialNo: (_item: any) => void;
	setBatchQty: (_item: any, _event: any) => void;
	refreshBatchSerialData?: (_item: any) => Promise<any> | any;
	validateDueDate: (_item: any) => void;
	removeItem: (_item: any) => void;
	subtractOne: (_item: any) => void;
	addOne: (_item: any) => void;
	isReturnInvoice?: boolean;
	toggleOffer: (_item: any) => void;
	changePriceListRate: (_item: any) => void;
	isNegative: (_value: any) => boolean;
	counterGrid?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
	headers: () => [],
	expanded: () => [],
	isReturnInvoice: false,
	counterGrid: false,
});

const emit = defineEmits<{
	"update:expanded": [val: any[]];
	"show-drop-feedback": [val: boolean];
	"item-dropped": [val: boolean];
	"edit-item": [item: any];
	"batch-serial-changed": [item: any];
}>();

const { proxy } = getCurrentInstance() as any;
const eventBus = proxy?.eventBus;
const invoiceStore = useInvoiceStore();
const tableContainer = ref<HTMLElement | null>(null);
const virtualTable = ref<any>(null);
type CartGridMode = "inactive" | "row" | "cell";
const gridMode = ref<CartGridMode>("inactive");
const activeRowIndex = ref(-1);
const activeRowId = ref<string | null>(null);
const activeCellKey = ref<CartGridColumnKey | null>(null);
const selectedRowIndex = ref(-1);
const selectedRowId = ref<string | null>(null);
const itemHistoryDialog = ref(false);
const itemHistoryTarget = ref<any | null>(null);
const batchSerialDialog = ref(false);
const batchSerialLoading = ref(false);
const batchSerialTarget = ref<any | null>(null);
const pendingHistoryEditItem = ref<any | null>(null);
const counterGridEntryQuery = ref("");
const COUNTER_GRID_ENTRY_ID = "__counter_grid_entry__";
const counterGridEntryItem = Object.freeze({
	posa_row_id: COUNTER_GRID_ENTRY_ID,
	__counterGridEntry: true,
});

// Composables
const { customItemFilter } = useItemsTableSearch();
const dragDropHandlers = useItemsTableDragDrop(emit, eventBus);
const { isRtl } = useRtl();
const { memoizedFormatFloat, memoizedFormatCurrency, clearFormatCache } = useFormatters({
	formatFloat: props.formatFloat,
	formatCurrency: props.formatCurrency,
});

const responsive = useItemsTableResponsive(
	tableContainer,
	computed(() => props.headers || []),
);
const merge = useItemsTableMerge(computed(() => invoiceStore.items));
const nameEdit = useItemsTableNameEdit();

// Computed
const items = computed(() => invoiceStore.items);
const displayItems = computed(() =>
	props.counterGrid ? [...items.value, counterGridEntryItem] : items.value,
);
const invoice_doc = computed(() => invoiceStore.invoiceDoc || {});
const hasItemSearch = computed(() => !!props.itemSearch?.trim());
const emptyStateIcon = computed(() => (hasItemSearch.value ? "mdi-cart-search" : "mdi-cart-outline"));
const emptyStateTitle = computed(() =>
	hasItemSearch.value ? __("No matching items in cart") : __("No items in cart"),
);
const emptyStateSubtitle = computed(() =>
	hasItemSearch.value
		? __("Try a different search term or clear the cart search.")
		: __("Add items from the selector to start building this sale."),
);

const memoizedIsNegative = computed(() => {
	return (value: any) => {
		if (typeof value === "number") return value < 0;
		return props.isNegative(value);
	};
});

const {
	breakpoint,
	responsiveHeaders,
	containerStyles,
	containerClasses,
	tableClasses,
	expandedContentClasses,
	tableDensity,
	containerHeight,
} = responsive;

const dynamicHeaderProps = computed(() => ({
	class: `responsive-header container-${breakpoint.value}`,
}));

const finalVisibleColumns = computed(() => [...responsiveHeaders.value, DATA_TABLE_EXPAND_COLUMN]);
const navigableGridColumnKeys = computed(() => getNavigableCartColumnKeys(finalVisibleColumns.value));
const gridContainerClasses = computed(() => ({
	"posa-cart-grid-active": gridMode.value !== "inactive",
	"posa-cart-grid-row-mode": gridMode.value === "row",
	"posa-cart-grid-cell-mode": gridMode.value === "cell",
	"posa-items-table-container--counter-grid": props.counterGrid,
}));
const virtualScrollConfig = computed(() => {
	const itemCount = items.value?.length || 0;
	const height = containerHeight.value || 600;

	return {
		itemHeight: tableDensity.value === "compact" ? 48 : tableDensity.value === "comfortable" ? 72 : 60,
		itemsPerPage: Math.max(20, Math.ceil(height / 60) + 5),
		bufferSize: itemCount > 1000 ? 20 : itemCount > 500 ? 15 : 10,
	};
});

const hide_qty_decimals = computed(() => {
	const opts = loadItemSelectorSettings();
	return !!opts?.hide_qty_decimals;
});

const clampRowIndex = (index: number) => {
	const count = items.value?.length || 0;
	if (!count) {
		return -1;
	}
	return Math.max(0, Math.min(index, count - 1));
};

const getStableRowId = (row: any, index: number) =>
	String(row?.posa_row_id || row?.name || `${row?.item_code || "row"}:${index}`);

const findRowIndexById = (rowId: string | null) => {
	if (!rowId) return -1;
	return items.value.findIndex((row: any, index: number) => getStableRowId(row, index) === rowId);
};

const rememberActiveRow = (rowIndex: number) => {
	const nextRowIndex = clampRowIndex(rowIndex);
	activeRowIndex.value = nextRowIndex;
	activeRowId.value = nextRowIndex >= 0 ? getStableRowId(items.value[nextRowIndex], nextRowIndex) : null;
	return nextRowIndex;
};

const rememberSelectedRow = (rowIndex: number) => {
	selectedRowIndex.value = clampRowIndex(rowIndex);
	selectedRowId.value =
		selectedRowIndex.value >= 0
			? getStableRowId(items.value[selectedRowIndex.value], selectedRowIndex.value)
			: null;
	return selectedRowIndex.value;
};

const deactivateKeyboardGrid = () => {
	gridMode.value = "inactive";
	activeRowIndex.value = -1;
	activeRowId.value = null;
	activeCellKey.value = null;
};

let gridFocusRequestToken = 0;
const waitForVirtualRowRender = async () => {
	await nextTick();
	await new Promise<void>((resolve) =>
		window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())),
	);
};

const focusActiveGridTarget = async (options: { activateDirectEdit?: boolean } = {}) => {
	const requestToken = ++gridFocusRequestToken;
	const activateDirectEdit = options.activateDirectEdit !== false;
	const rowIndex = activeRowIndex.value;
	await ensureCartGridRowRendered(
		tableContainer.value,
		rowIndex,
		virtualTable.value?.scrollToIndex,
		waitForVirtualRowRender,
	);
	await nextTick();
	if (requestToken !== gridFocusRequestToken) return;
	if (gridMode.value === "row") {
		focusCartGridRow(tableContainer.value, activeRowIndex.value);
		return;
	}
	if (gridMode.value === "cell" && activeCellKey.value) {
		focusCartGridCell(tableContainer.value, activeRowIndex.value, activeCellKey.value, {
			activate: activateDirectEdit && isCartGridDirectEditColumnKey(activeCellKey.value),
		});
	}
};

const setActiveGridRow = (rowIndex: number) => {
	const nextRowIndex = clampRowIndex(rowIndex);
	if (nextRowIndex < 0) {
		deactivateKeyboardGrid();
		return false;
	}

	rememberActiveRow(nextRowIndex);
	rememberSelectedRow(nextRowIndex);
	if (gridMode.value === "inactive") {
		gridMode.value = "row";
	}
	void focusActiveGridTarget();
	return true;
};

const enterGridCellMode = (preferredCellKey?: CartGridColumnKey | null) => {
	const keys = navigableGridColumnKeys.value;
	if (!keys.length || activeRowIndex.value < 0) {
		return false;
	}

	const nextCellKey =
		preferredCellKey && keys.includes(preferredCellKey) ? preferredCellKey : (keys[0] ?? null);
	if (!nextCellKey) {
		return false;
	}
	activeCellKey.value = nextCellKey;
	gridMode.value = "cell";
	void focusActiveGridTarget();
	return true;
};

const moveGridRow = (delta: number) => {
	const currentCell = activeCellKey.value;
	const moved = setActiveGridRow(activeRowIndex.value + delta);
	if (moved && gridMode.value === "cell" && currentCell) {
		enterGridCellMode(currentCell);
	}
	return moved;
};

const moveGridCell = (delta: number) => {
	if (gridMode.value !== "cell") {
		return false;
	}

	const keys = navigableGridColumnKeys.value;
	if (!keys.length) {
		return false;
	}

	const nextCellKey = getAdjacentCartGridColumnKey(keys, activeCellKey.value, delta);
	if (!nextCellKey) {
		void focusActiveGridTarget({ activateDirectEdit: false });
		return false;
	}
	activeCellKey.value = nextCellKey;
	rememberSelectedRow(activeRowIndex.value);
	void focusActiveGridTarget();
	return true;
};

const getEditableKeysForRow = (rowIndex: number) =>
	navigableGridColumnKeys.value.filter(
		(key) =>
			isCartGridDirectEditColumnKey(key) &&
			Boolean(getCartGridCellTarget(tableContainer.value, rowIndex, key)),
	);

const getAvailableKeysForRow = (rowIndex: number) =>
	navigableGridColumnKeys.value.filter((key) =>
		Boolean(getCartGridCellTarget(tableContainer.value, rowIndex, key)),
	);

const moveGridEntry = async (delta: number) => {
	if (gridMode.value !== "cell") {
		return false;
	}

	const keys = getEditableKeysForRow(activeRowIndex.value);
	if (!keys.length) {
		return moveGridCell(delta);
	}

	const currentIndex = activeCellKey.value ? keys.indexOf(activeCellKey.value) : -1;
	const nextIndex = currentIndex + delta;
	if (nextIndex >= 0 && nextIndex < keys.length) {
		activeCellKey.value = keys[nextIndex] ?? null;
		void focusActiveGridTarget();
		return true;
	}

	const nextRowIndex = clampRowIndex(activeRowIndex.value + (delta > 0 ? 1 : -1));
	if (nextRowIndex >= 0 && nextRowIndex !== activeRowIndex.value) {
		await ensureCartGridRowRendered(
			tableContainer.value,
			nextRowIndex,
			virtualTable.value?.scrollToIndex,
			waitForVirtualRowRender,
		);
		const nextRowKeys = getEditableKeysForRow(nextRowIndex);
		if (!nextRowKeys.length) {
			void focusActiveGridTarget();
			return false;
		}
		rememberActiveRow(nextRowIndex);
		rememberSelectedRow(nextRowIndex);
		activeCellKey.value =
			delta > 0 ? (nextRowKeys[0] ?? null) : (nextRowKeys[nextRowKeys.length - 1] ?? null);
		void focusActiveGridTarget();
		return true;
	}

	if (props.counterGrid && delta > 0 && activeRowIndex.value === items.value.length - 1) {
		deactivateKeyboardGrid();
		void focusCounterGridEntry();
		return true;
	}

	void focusActiveGridTarget();
	return false;
};

const moveGridTraversal = async (delta: number) => {
	if (gridMode.value !== "cell" || delta === 0) {
		return false;
	}

	const direction = delta > 0 ? 1 : -1;
	const currentKeys = getAvailableKeysForRow(activeRowIndex.value);
	const nextCellKey = getAdjacentCartGridColumnKey(currentKeys, activeCellKey.value, direction);
	if (nextCellKey) {
		activeCellKey.value = nextCellKey;
		void focusActiveGridTarget();
		return true;
	}

	for (
		let rowIndex = activeRowIndex.value + direction;
		rowIndex >= 0 && rowIndex < items.value.length;
		rowIndex += direction
	) {
		await ensureCartGridRowRendered(
			tableContainer.value,
			rowIndex,
			virtualTable.value?.scrollToIndex,
			waitForVirtualRowRender,
		);
		const rowKeys = getAvailableKeysForRow(rowIndex);
		if (!rowKeys.length) continue;
		rememberActiveRow(rowIndex);
		rememberSelectedRow(rowIndex);
		activeCellKey.value = direction > 0 ? (rowKeys[0] ?? null) : (rowKeys[rowKeys.length - 1] ?? null);
		void focusActiveGridTarget();
		return true;
	}

	if (props.counterGrid && direction > 0) {
		deactivateKeyboardGrid();
		void focusCounterGridEntry();
		return true;
	}

	void focusActiveGridTarget({ activateDirectEdit: false });
	return false;
};

const focusPreviousCounterGridEntry = (method: "arrow-up" | "shift-tab" = "shift-tab") => {
	const rowIndex = items.value.length - 1;
	if (rowIndex < 0) return false;
	const keys = getAvailableKeysForRow(rowIndex);
	if (!keys.length) return enterKeyboardGrid({ rowIndex, mode: "row" });
	gridMode.value = "cell";
	rememberActiveRow(rowIndex);
	rememberSelectedRow(rowIndex);
	activeCellKey.value = method === "arrow-up" ? (keys[0] ?? null) : (keys[keys.length - 1] ?? null);
	void focusActiveGridTarget({ activateDirectEdit: false });
	return true;
};

const commitActiveGridEditor = async () => {
	const activeElement = document.activeElement as HTMLElement | null;
	if (
		!activeElement ||
		!tableContainer.value?.contains(activeElement) ||
		!isEditableElement(activeElement)
	) {
		return false;
	}

	activeElement.blur?.();
	await nextTick();
	await new Promise((resolve) => window.setTimeout(resolve, 0));
	return true;
};

const commitActiveGridEditorAndMoveCell = async (delta: number) => {
	await commitActiveGridEditor();
	moveGridCell(delta);
};

const commitActiveGridEditorAndMoveEntry = async (delta: number) => {
	await commitActiveGridEditor();
	await moveGridEntry(delta);
};

const commitActiveGridEditorAndMoveBoundary = async (
	rowEdge: "current" | "first" | "last",
	columnEdge: "first" | "last",
) => {
	await commitActiveGridEditor();
	const rowIndex =
		rowEdge === "first" ? 0 : rowEdge === "last" ? items.value.length - 1 : activeRowIndex.value;
	const nextRowIndex = clampRowIndex(rowIndex);
	if (nextRowIndex < 0) return false;

	await ensureCartGridRowRendered(
		tableContainer.value,
		nextRowIndex,
		virtualTable.value?.scrollToIndex,
		waitForVirtualRowRender,
	);
	const keys = getAvailableKeysForRow(nextRowIndex);
	if (!keys.length) return false;

	gridMode.value = "cell";
	rememberActiveRow(nextRowIndex);
	rememberSelectedRow(nextRowIndex);
	activeCellKey.value = columnEdge === "first" ? (keys[0] ?? null) : (keys[keys.length - 1] ?? null);
	void focusActiveGridTarget({ activateDirectEdit: false });
	return true;
};

const advanceGridEntryFromItem = (item: any, fromCellKey: CartGridColumnKey, delta = 1) => {
	const rowIndex = getItemIndex(item);
	if (rowIndex < 0) {
		eventBus?.emit("focus_item_search");
		return false;
	}

	gridMode.value = "cell";
	rememberActiveRow(rowIndex);
	rememberSelectedRow(rowIndex);
	activeCellKey.value = fromCellKey;
	void commitActiveGridEditorAndMoveEntry(delta);
	return true;
};

const stayOnGridEntryFromItem = (item: any, fromCellKey: CartGridColumnKey) => {
	const rowIndex = getItemIndex(item);
	if (rowIndex < 0) {
		eventBus?.emit("focus_item_search");
		return false;
	}

	gridMode.value = "cell";
	rememberActiveRow(rowIndex);
	rememberSelectedRow(rowIndex);
	activeCellKey.value = fromCellKey;
	void focusActiveGridTarget({ activateDirectEdit: false });
	return true;
};

const openItemHistory = (item: any) => {
	if (!item) {
		return false;
	}
	rememberSelectedRow(getItemIndex(item));
	itemHistoryTarget.value = item;
	itemHistoryDialog.value = true;
	deactivateKeyboardGrid();
	return true;
};

const openBatchSerialSelector = async (itemOrRowId: any) => {
	const item =
		typeof itemOrRowId === "string"
			? items.value.find((line: any) => line?.posa_row_id === itemOrRowId)
			: itemOrRowId;
	if (!item || (!item.has_batch_no && !item.has_serial_no)) return false;
	rememberSelectedRow(getItemIndex(item));
	batchSerialTarget.value = item;
	batchSerialDialog.value = true;
	deactivateKeyboardGrid();
	const needsBatchData =
		item.has_batch_no && (!Array.isArray(item.batch_no_data) || item.batch_no_data.length === 0);
	const needsSerialData =
		item.has_serial_no && (!Array.isArray(item.serial_no_data) || item.serial_no_data.length === 0);
	if ((needsBatchData || needsSerialData) && props.refreshBatchSerialData) {
		batchSerialLoading.value = true;
		try {
			await props.refreshBatchSerialData(item);
		} catch (error) {
			console.warn("Unable to refresh batch/serial options", error);
		} finally {
			batchSerialLoading.value = false;
		}
	}
	return true;
};

const commitBatchSerialSelection = (selection: {
	batchNo: string | null;
	allocations: BatchAllocation[];
	serials: string[];
}) => {
	const target = batchSerialTarget.value;
	if (!target?.posa_row_id) return;
	const allocationLines = target.has_batch_no
		? createBatchAllocationLines(target, selection.allocations, selection.serials)
		: [{ ...target, serial_no_selected: [...selection.serials] }];
	if (!allocationLines.length) return;
	const [primaryLine, ...splitLines] = allocationLines;
	const updated = invoiceStore.updateItemWithTotals(target.posa_row_id, (item: any) => {
		Object.assign(item, primaryLine);
		if (item.has_batch_no && primaryLine.batch_no) {
			props.setBatchQty(item, primaryLine.batch_no);
		}
		if (item.has_serial_no) {
			item.serial_no_selected = [...primaryLine.serial_no_selected];
			props.setSerialNo(item);
		}
		item._batch_serial_assignment_source = "manual";
	});
	if (updated) {
		for (const line of splitLines) {
			if (line.has_batch_no && line.batch_no) {
				props.setBatchQty(line, line.batch_no);
			}
			if (line.has_serial_no) {
				props.setSerialNo(line);
			}
		}
		if (splitLines.length) {
			const targetIndex = invoiceStore.itemOrder.indexOf(updated.posa_row_id);
			invoiceStore.addItems(splitLines, targetIndex >= 0 ? targetIndex + 1 : -1);
		}
		invoiceStore.recalculateTotals();
		emit("batch-serial-changed", updated);
	}
};

const openSelectedItemWorkspace = () => {
	const item =
		getActiveGridItem() || getSelectedGridItem() || items.value?.[items.value.length - 1] || null;
	return openItemHistory(item);
};

const handleItemEditRequest = (item: any) => {
	pendingHistoryEditItem.value = item || null;
	itemHistoryDialog.value = false;
};

const handleItemHistoryAfterLeave = () => {
	const item = pendingHistoryEditItem.value;
	pendingHistoryEditItem.value = null;
	if (item) emit("edit-item", item);
};

const isCounterGridEntry = (item: any) =>
	Boolean(item?.__counterGridEntry || item?.posa_row_id === COUNTER_GRID_ENTRY_ID);

const openCounterGridItemSearch = (rawQuery = counterGridEntryQuery.value) => {
	const query = String(rawQuery || "").trim();
	if (!query) return false;
	deactivateKeyboardGrid();
	eventBus?.emit("open_counter_item_search", { query });
	return true;
};

const focusCounterGridEntry = async () => {
	await nextTick();
	window.setTimeout(() => {
		const entry = tableContainer.value?.querySelector(
			'[data-testid="counter-grid-item-entry"]',
		) as HTMLInputElement | null;
		entry?.focus();
	}, 50);
};

const clearCounterGridEntry = () => {
	counterGridEntryQuery.value = "";
};

const activateGridRow = () => {
	const item = items.value?.[activeRowIndex.value];
	return openItemHistory(item);
};

const activateGridCell = () => {
	if (gridMode.value !== "cell" || !activeCellKey.value) {
		return false;
	}
	return activateCartGridCell(tableContainer.value, activeRowIndex.value, activeCellKey.value);
};

const enterKeyboardGrid = (
	options: { rowIndex?: number; mode?: "row" | "cell"; cellEdge?: "first" | "last" } = {},
) => {
	const fallbackRow = (items.value?.length || 0) - 1;
	const rowIndex = Number.isInteger(options.rowIndex) ? Number(options.rowIndex) : fallbackRow;
	const nextRowIndex = clampRowIndex(rowIndex);
	if (nextRowIndex < 0) {
		deactivateKeyboardGrid();
		return false;
	}

	gridMode.value = options.mode === "cell" ? "cell" : "row";
	rememberActiveRow(nextRowIndex);
	rememberSelectedRow(nextRowIndex);
	if (gridMode.value === "cell") {
		const keys = navigableGridColumnKeys.value;
		activeCellKey.value = options.cellEdge === "last" ? keys[keys.length - 1] || null : keys[0] || null;
	} else {
		activeCellKey.value = null;
	}
	void focusActiveGridTarget();
	return true;
};

const getActiveGridItem = () => {
	if (gridMode.value === "inactive") {
		return null;
	}
	return items.value?.[activeRowIndex.value] || null;
};

const getSelectedGridItem = () => {
	const stableIndex = findRowIndexById(selectedRowId.value);
	const rowIndex = stableIndex >= 0 ? stableIndex : clampRowIndex(selectedRowIndex.value);
	return rowIndex >= 0 ? items.value?.[rowIndex] || null : null;
};

// Watchers
watch(() => props.displayCurrency, clearFormatCache);
watch(() => props.pos_profile, clearFormatCache, { deep: true });
watch(items, () => {
	if (gridMode.value === "inactive") {
		return;
	}
	const stableActiveIndex = findRowIndexById(activeRowId.value);
	const nextRowIndex = stableActiveIndex >= 0 ? stableActiveIndex : clampRowIndex(activeRowIndex.value);
	if (nextRowIndex < 0) {
		deactivateKeyboardGrid();
		selectedRowIndex.value = -1;
		selectedRowId.value = null;
		return;
	}
	rememberActiveRow(nextRowIndex);
	if (selectedRowIndex.value >= 0) {
		const stableSelectedIndex = findRowIndexById(selectedRowId.value);
		rememberSelectedRow(stableSelectedIndex >= 0 ? stableSelectedIndex : selectedRowIndex.value);
	}
	void focusActiveGridTarget();
});
watch(navigableGridColumnKeys, (keys) => {
	if (gridMode.value !== "cell") {
		return;
	}
	if (!keys.length) {
		gridMode.value = "row";
		activeCellKey.value = null;
		void focusActiveGridTarget();
		return;
	}
	if (!activeCellKey.value || !keys.includes(activeCellKey.value)) {
		activeCellKey.value = keys[0] ?? null;
		void focusActiveGridTarget();
	}
});

// Methods
const getSerialOptions = (item: any) => {
	if (Array.isArray(item?.filtered_serial_no_data)) {
		return item.filtered_serial_no_data;
	}
	return Array.isArray(item?.serial_no_data) ? item.serial_no_data : [];
};

const handleQtyChange = (item: any, event: any) => {
	const newQty = parseFloat(event.target.value) || 0;
	if (newQty === 0) {
		props.removeItem(item);
	} else {
		props.setFormatedQty(item, "qty", null, false, event.target.value);
	}
	eventBus?.emit("recalculate_return_discount", { defer: true });
};

const handleMinusClick = (item: any) => {
	// Replacement rows should still be removed directly.
	if (item.posa_is_replace) {
		props.removeItem(item);
		return;
	}

	// magnitude-based removal: only remove if qty magnitude <= 1
	// This handles -1 for returns and 1 for normal invoices correctly
	const absQty = Math.abs(item.qty || 0);
	if (absQty <= 1) {
		props.removeItem(item);
	} else {
		// subtract_one handles the sign-aware logic (e.g. -5 -> -4 in returns)
		props.subtractOne(item);
	}
	eventBus?.emit("recalculate_return_discount", { defer: true });
};

const handleQtyUpdate = (item: any, newQty: any) => {
	props.setFormatedQty(item, "qty", null, false, newQty);
	eventBus?.emit("recalculate_return_discount", { defer: true });
};

const getItemIndex = (item: any) => {
	if (!item) {
		return -1;
	}
	const rowId = item?.posa_row_id;
	if (rowId) {
		return items.value.findIndex((row: any) => row?.posa_row_id === rowId);
	}
	return items.value.findIndex((row: any) => row === item);
};

const handleQtyEditSubmitted = (item: any) => {
	advanceGridEntryFromItem(item, "qty");
};

const handleGridEditorSubmitted = (item: any, fromCellKey: CartGridColumnKey) => {
	if (!props.counterGrid && (fromCellKey === "discount_percentage" || fromCellKey === "discount_amount")) {
		stayOnGridEntryFromItem(item, fromCellKey);
		return;
	}
	advanceGridEntryFromItem(item, fromCellKey);
};

const handleRateUpdate = (item: any, newRate: any) => {
	props.setFormatedCurrency(item, "rate", null, false, { target: { value: newRate } });
	props.calcPrices(item, newRate, { target: { id: "rate" } });
	if (item._missingPriceListRate && item._manual_rate_set && Number(item.rate) > 0) {
		item._missingPriceListRate = false;
	}
};

const handleDiscountPercentUpdate = (item: any, newDiscount: any) => {
	props.setFormatedCurrency(item, "discount_percentage", null, false, {
		target: { value: newDiscount },
	});
	props.calcPrices(item, newDiscount, { target: { id: "discount_percentage" } });
};

const handleDiscountAmountUpdate = (item: any, newDiscount: any) => {
	props.setFormatedCurrency(item, "discount_amount", null, false, {
		target: { value: newDiscount },
	});
	props.calcPrices(item, newDiscount, { target: { id: "discount_amount" } });
};

const handleRowClick = (event: any, item: any) => {
	rememberSelectedRow(getItemIndex(item));
	if (isEditableElement(event.target as HTMLElement)) {
		return;
	}
	openItemHistory(item);
};

const focusItemField = (index: number, field: CartShortcutField, options?: CartFieldFocusOptions) => {
	deactivateKeyboardGrid();
	rememberSelectedRow(index);
	return focusCartItemField(tableContainer.value, index, field, options);
};

const focusMissingRateRow = async (index: number) => {
	await ensureCartGridRowRendered(
		tableContainer.value,
		index,
		virtualTable.value?.scrollToIndex,
		waitForVirtualRowRender,
	);
	focusCartGridRow(tableContainer.value, index);
};

const isGridRowActive = (item: any) => {
	return gridMode.value !== "inactive" && getItemIndex(item) === activeRowIndex.value;
};

const isArrowNavigationKey = (key: string) =>
	key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";

const getRowIndexFromEvent = (event: KeyboardEvent) => {
	const target = event.target as HTMLElement | null;
	const row = target?.closest?.(".posa-cart-item-row") as HTMLElement | null;
	const rawIndex = row?.dataset?.cartRowIndex;
	const parsed = Number(rawIndex);
	return Number.isInteger(parsed) ? parsed : -1;
};

const activateGridFromEventTarget = (event: KeyboardEvent) => {
	const rowIndex = getRowIndexFromEvent(event);
	const target = event.target as HTMLElement | null;
	const cell = target?.closest?.("[data-column-key]") as HTMLElement | null;
	const columnKey = cell?.dataset?.columnKey;
	if (rowIndex < 0 || !isCartGridColumnKey(columnKey)) return false;

	gridMode.value = "cell";
	rememberActiveRow(rowIndex);
	rememberSelectedRow(rowIndex);
	activeCellKey.value = columnKey;
	return true;
};

const handleGridKeydown = (event: KeyboardEvent) => {
	if (
		shouldDelegateCartGridKeyToEditor(event.target, event.key, {
			shiftKey: event.shiftKey,
		})
	)
		return;
	if (
		props.counterGrid &&
		gridMode.value === "inactive" &&
		(event.key === "Home" || event.key === "End" || (event.key === "Enter" && event.shiftKey))
	) {
		activateGridFromEventTarget(event);
	}
	if (
		gridMode.value === "inactive" &&
		isArrowNavigationKey(event.key) &&
		!event.defaultPrevented &&
		!event.altKey &&
		!event.ctrlKey &&
		!event.metaKey &&
		!isEditableElement(event.target as HTMLElement)
	) {
		event.preventDefault();
		event.stopPropagation();
		const targetRowIndex = getRowIndexFromEvent(event);
		const count = items.value?.length || 0;
		const fallbackRowIndex = event.key === "ArrowDown" ? 0 : count - 1;
		const rowIndex = targetRowIndex >= 0 ? targetRowIndex : fallbackRowIndex;
		const mode = event.key === "ArrowLeft" || event.key === "ArrowRight" ? "cell" : "row";
		enterKeyboardGrid({
			rowIndex,
			mode,
			cellEdge: event.key === "ArrowLeft" ? "last" : "first",
		});
		return;
	}

	const counterGridCommand = props.counterGrid
		? resolveCounterGridKeyboardCommand(event, {
				mode: gridMode.value,
				directEditCell: isCartGridDirectEditColumnKey(activeCellKey.value),
			})
		: null;
	if (counterGridCommand) {
		event.preventDefault();
		event.stopPropagation();
		if (counterGridCommand.type === "move-entry") {
			void commitActiveGridEditorAndMoveEntry(counterGridCommand.delta);
		} else {
			void commitActiveGridEditorAndMoveBoundary(counterGridCommand.row, counterGridCommand.column);
		}
		return;
	}

	if (
		gridMode.value === "inactive" ||
		event.defaultPrevented ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey
	) {
		return;
	}

	if (event.key === "Tab") {
		if (props.counterGrid && gridMode.value === "cell") {
			event.preventDefault();
			event.stopPropagation();
			void commitActiveGridEditor().then(() => moveGridTraversal(event.shiftKey ? -1 : 1));
			return;
		}
		void commitActiveGridEditor();
		deactivateKeyboardGrid();
		eventBus?.emit("focus_item_search");
		return;
	}

	if (event.key === "Escape") {
		event.preventDefault();
		if (gridMode.value === "cell") {
			void commitActiveGridEditor();
			gridMode.value = "row";
			activeCellKey.value = null;
			void focusActiveGridTarget();
		} else {
			deactivateKeyboardGrid();
			eventBus?.emit("focus_item_search");
		}
		return;
	}

	if (gridMode.value === "row") {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			moveGridRow(event.key === "ArrowDown" ? 1 : -1);
			return;
		}
		if (event.key === "ArrowRight") {
			event.preventDefault();
			enterGridCellMode(activeCellKey.value);
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			activateGridRow();
		}
		return;
	}

	if (gridMode.value === "cell") {
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			event.stopPropagation();
			void commitActiveGridEditorAndMoveCell(event.key === "ArrowRight" ? 1 : -1);
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			void commitActiveGridEditor().then(() => {
				moveGridRow(event.key === "ArrowDown" ? 1 : -1);
			});
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			event.stopPropagation();
			if (activeCellKey.value && isCartGridDirectEditColumnKey(activeCellKey.value)) {
				void commitActiveGridEditorAndMoveEntry(event.shiftKey ? -1 : 1);
			} else {
				activateGridCell();
			}
		}
	}
};

// Drag and Drop delegation
const onDragOverFromSelector = (event: DragEvent) => dragDropHandlers.onDragOverFromSelector(event);
const onDragEnterFromSelector = () => dragDropHandlers.onDragEnterFromSelector();
const onDragLeaveFromSelector = (event: DragEvent) => dragDropHandlers.onDragLeaveFromSelector(event);
const onDropFromSelector = (event: DragEvent) => dragDropHandlers.onDropFromSelector(event);

// Name editing logic
const { editNameDialog, editedName, editNameTarget, openNameDialog, saveItemName, resetItemName } = nameEdit;

// Life-cycle
onMounted(() => {
	logComponentRender({ $el: tableContainer.value }, "ItemsTable", "mounted", {
		rows: items.value?.length || 0,
	});
	eventBus?.on?.("open_batch_serial_selector", openBatchSerialSelector);
});

onBeforeUnmount(() => {
	eventBus?.off?.("open_batch_serial_selector", openBatchSerialSelector);
	merge.clearMergeCache();
});

defineExpose({
	focusItemField,
	focusMissingRateRow,
	enterKeyboardGrid,
	getActiveGridItem,
	getSelectedGridItem,
	openSelectedItemWorkspace,
	focusCounterGridEntry,
	clearCounterGridEntry,
});
</script>

<style>
/* Global styles for ItemsTable and its children */
@import "./items-table-styles.css";
</style>

<style scoped>
/* Scoped styles for ItemsTable component specific logic */
.posa-items-table-container {
	position: relative;
	transition: none;
}

.posa-items-table-container--counter-grid :deep(.posa-cart-table thead th) {
	background: #174a70 !important;
	color: #ffffff !important;
}

.posa-items-table-container--counter-grid
	:deep(.posa-cart-table tbody tr:not(.posa-cart-item-row--keyboard-active):hover td) {
	background: var(--pos-hover-bg) !important;
}

.posa-items-table-container--counter-grid :deep(.posa-cart-item-row),
.posa-items-table-container--counter-grid :deep(.posa-cart-item-row > td),
.posa-items-table-container--counter-grid :deep(.posa-cart-item-row > td *) {
	animation: none !important;
	transition: none !important;
}

.posa-items-table-container--counter-grid :deep(.posa-cart-item-row--keyboard-active > td) {
	background: #174a70 !important;
	color: #ffffff !important;
}
</style>
