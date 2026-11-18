<template>
	<div ref="columnRoot" @pointerdown.capture="handleColumnPointerDown" @keydown.capture="handleColumnKeydown" @dblclick.capture="columnWidths.onDoubleClick" class="pharmacy-search-results pos-column-widths" :class="{ 'pos-column-widths--custom': columnWidths.hasWidths.value, 'pos-customization-editing': columnOrder.editing.value }" :style="columnWidths.tableStyle(sizedHeaders)" data-testid="pharmacy-item-search-results">
		<v-alert v-if="columnWidths.error.value" type="warning" density="compact">{{ columnWidths.error.value }}</v-alert>
		<span class="sr-only" role="status" aria-live="polite">{{ columnWidths.announcement.value }}</span>
		<v-alert v-if="columnOrder.error.value" type="warning" density="compact">{{ __(columnOrder.error.value) }}</v-alert>
		<span class="sr-only" role="status" aria-live="polite">{{ columnOrder.announcement.value }}</span>
		<div class="pharmacy-search-controls">
			<div
				v-if="mode === 'alternates'"
				class="pharmacy-alternate-context"
				data-testid="alternate-items-context"
			>
				<v-btn
					v-if="allowAlternateBack"
					icon="mdi-arrow-left"
					size="small"
					variant="text"
					:aria-label="__('Back to item search results')"
					@click="emit('alternate-back')"
				/>
				<div>
					<strong>{{ __("In-stock alternates") }}</strong>
					<span>
						{{ alternateRequestedItem?.item_name || alternateRequestedItem?.item_code || "-" }}
						<span v-if="alternateRequestedItem?.generic">
							| {{ alternateRequestedItem.generic }}
						</span>
					</span>
				</div>
			</div>
			<v-select
				v-if="mode !== 'alternates'"
				:model-value="searchField"
				:items="searchFields"
				item-title="title"
				item-value="value"
				:label="__('Search field')"
				density="compact"
				variant="outlined"
				hide-details
				class="pharmacy-search-controls__field"
				@update:model-value="emit('update:search-field', $event)"
			/>
			<v-select
				v-if="mode !== 'alternates'"
				:model-value="itemGroup"
				:items="itemGroups"
				:label="__('Item group')"
				density="compact"
				variant="outlined"
				hide-details
				class="pharmacy-search-controls__group"
				@update:model-value="emit('update:item-group', $event)"
			/>
			<v-switch
				v-if="mode !== 'alternates'"
				:model-value="includeZeroStock"
				:label="__('Include zero stock')"
				color="primary"
				density="compact"
				hide-details
				data-testid="pharmacy-include-zero-stock"
				@update:model-value="emit('update:include-zero-stock', $event)"
			/>
			<div class="pharmacy-search-controls__status" role="status" aria-live="polite">
				<span>{{ tableItems.length }} {{ __("results") }}</span>
				<span>{{ activePriceList || posProfile?.selling_price_list || __("No price list") }}</span>
				<span>{{ posProfile?.warehouse || __("No warehouse") }}</span>
				<span v-if="lastSyncTime">{{ __("Synced") }} {{ lastSyncTime }}</span>
			</div>
		</div>
		<div
			class="pharmacy-search-announcement"
			role="status"
			aria-live="polite"
			aria-atomic="true"
			data-testid="pharmacy-search-announcement"
		>
			{{ activeResultAnnouncement }}
		</div>

		<div class="pharmacy-results-keyboard-boundary" tabindex="-1" @keydown.capture="handleTableKeydown">
			<v-data-table-virtual
				ref="tableRef"
				:id="resultsGridId"
				:aria-label="__('Item search results')"
				:headers="sizedHeaders"
				:items="tableItems"
				item-value="item_code"
				fixed-header
				density="compact"
				height="100%"
				class="pharmacy-results-table"
				:row-props="getPharmacyRowProps"
				:no-data-text="__('No matching items')"
				@click:row="handleRowClick"
				@scroll.passive="emit('list-scroll', $event)"
			>
				<template v-for="header in sizedHeaders" :key="header.key" v-slot:[`header.${header.key}`]="slotProps">
					<ColumnOrderHeader :column="slotProps.column" :get-sort-icon="slotProps.getSortIcon" />
				</template>
				<template #item.item_name="{ item }">
					<div class="pharmacy-product-cell">
						<div class="d-flex align-center"><RowReorderHandle :row-key="String(item.item_code)" :label="item.item_name || item.item_code" /><strong>{{ cleanPharmacyText(item.item_name) || item.item_code }}</strong></div>
						<span v-if="cleanPharmacyText(item.retailmind_short_name)">
							{{ cleanPharmacyText(item.retailmind_short_name) }}
						</span>
					</div>
				</template>
				<template #item.pack="{ item }">
					{{ resolvePackLabel(item) || "-" }}
				</template>
				<template #item.company="{ item }">
					{{
						cleanPharmacyText(
							item.brand ||
								item.company ||
								item.retailmind_old_pos_company_code ||
								item.company_code,
						) || "-"
					}}
				</template>
				<template #item.item_group="{ item }">
					{{ cleanPharmacyText(item.item_group) || "-" }}
				</template>
				<template #item.generic="{ item }">
					{{ cleanPharmacyText(item.retailmind_old_pos_generic_name || item.generic_name) || "-" }}
				</template>
				<template #item.rate="{ item }">
					<span class="pharmacy-rate-cell">
						{{ currencySymbol(priceCurrency(item)) }}
						{{
							formatCurrency(
								resolveRetailPrice(item),
								priceCurrency(item),
								ratePrecision(resolveRetailPrice(item)),
							)
						}}
					</span>
				</template>
				<template #item.rack="{ item }">
					{{ cleanPharmacyText(item.retailmind_old_pos_rack || item.rack) || "-" }}
				</template>
				<template #item.pack_stock="{ item }">
					<span :title="availableStockTitle(item)">{{ packStockLabel(item) }}</span>
				</template>
				<template #item.loose_stock="{ item }">
					<span :title="availableStockTitle(item)">{{ looseStockLabel(item) }}</span>
				</template>
				<template #item.profit="{ item }">
					<span v-if="item.profit_display_allowed && Number.isFinite(Number(item.profit_amount))">
						{{ currencySymbol(priceCurrency(item)) }}
						{{
							formatCurrency(
								item.profit_amount,
								priceCurrency(item),
								ratePrecision(item.profit_amount),
							)
						}}
					</span>
					<span v-else>-</span>
				</template>
			</v-data-table-virtual>
		</div>
		<div
			v-if="mode === 'alternates' && !searchPending && !tableItems.length"
			class="pharmacy-alternate-empty"
			role="status"
			data-testid="alternate-items-empty"
		>
			<v-icon icon="mdi-package-variant-closed-remove" size="28" />
			<strong>{{ alternateEmptyText }}</strong>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useColumnWidths } from "../../../composables/core/useColumnWidths";
import ColumnOrderHeader from "../../ui/ColumnOrderHeader.vue";
import { useColumnOrder, columnOrderStorageKey } from "../../../composables/core/useColumnOrder";
import RowReorderHandle from "../../ui/RowReorderHandle.vue";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

import {
	cleanPharmacyText,
	projectPackLooseStock,
	resolvePackLabel,
	resolveRetailPrice,
} from "../../../utils/pharmacyItem";
import {
	getPharmacyItemResultId,
	PHARMACY_ITEM_RESULTS_GRID_ID,
} from "../../../utils/itemSearchAccessibility";

const props = defineProps({
	displayedItems: { type: Array, default: () => [] },
	searchTerm: { type: String, default: "" },
	searchField: { type: String, default: "all" },
	includeZeroStock: { type: Boolean, default: false },
	highlightedItemCode: { type: String, default: "" },
	posProfile: { type: Object, default: () => ({}) },
	preferenceUser: { type: String, default: "" },
	selectedCurrency: { type: String, default: "" },
	currencySymbol: { type: Function, required: true },
	formatCurrency: { type: Function, required: true },
	formatNumber: { type: Function, required: true },
	ratePrecision: { type: Function, required: true },
	rowProps: { type: [Object, Function], default: null },
	lastSyncTime: { type: String, default: "" },
	itemGroups: { type: Array, default: () => [] },
	itemGroup: { type: String, default: "ALL" },
	activePriceList: { type: String, default: "" },
	searchPending: { type: Boolean, default: false },
	resultsGridId: { type: String, default: PHARMACY_ITEM_RESULTS_GRID_ID },
	mode: { type: String, default: "search" },
	alternateRequestedItem: { type: Object, default: null },
	alternateReason: { type: String, default: "" },
	allowAlternateBack: { type: Boolean, default: false },
});

const emit = defineEmits([
	"row-click",
	"list-scroll",
	"update:item-group",
	"update:search-field",
	"update:include-zero-stock",
	"navigation-boundary",
	"navigation-key",
	"select-highlighted",
	"alternate-back",
]);
const __ = window.__ || ((value: string) => value);
const tableRef = ref<any>(null);
const tableItems = computed<Record<string, any>[]>(() =>
	Array.isArray(props.displayedItems) ? (props.displayedItems as Record<string, any>[]) : [],
);

const resolveRowItem = (candidate: any): Record<string, any> | null => {
	if (!candidate || typeof candidate !== "object") return null;
	if (candidate.item_code) return candidate;
	for (const key of ["raw", "item", "internalItem"]) {
		const resolved = resolveRowItem(candidate[key]);
		if (resolved?.item_code) return resolved;
	}
	return null;
};

const stripHighlightClass = (value: any): any => {
	if (typeof value === "string") {
		return value
			.split(/\s+/)
			.filter((className) => className && className !== "item-row-highlighted")
			.join(" ");
	}
	if (Array.isArray(value)) return value.map(stripHighlightClass);
	if (value && typeof value === "object") {
		const classes = { ...value };
		delete classes["item-row-highlighted"];
		return classes;
	}
	return value;
};

const getBaseRowProps = (rowData: any) => {
	if (typeof props.rowProps === "function") return props.rowProps(rowData) || {};
	return props.rowProps && typeof props.rowProps === "object" ? props.rowProps : {};
};

const getPharmacyRowProps = (rowData: any) => {
	const item = resolveRowItem(rowData);
	const itemCode = String(item?.item_code || "");
	const highlighted = Boolean(itemCode && itemCode === String(props.highlightedItemCode || ""));
	const explicitIndex = Number(rowData?.index);
	const rowIndex = Number.isInteger(explicitIndex)
		? explicitIndex
		: tableItems.value.findIndex((candidate) => candidate?.item_code === itemCode);
	const baseProps = getBaseRowProps(rowData);
	return {
		...baseProps,
		id: getPharmacyItemResultId(itemCode) || undefined,
		role: "row",
		tabindex: -1,
		"aria-rowindex": rowIndex >= 0 ? rowIndex + 2 : undefined,
		"aria-selected": highlighted ? "true" : "false",
		"data-item-code": itemCode,
		"data-row-reorder-id": itemCode,
		"data-pharmacy-active": highlighted ? "true" : "false",
		class: [stripHighlightClass(baseProps.class), { "item-row-highlighted": highlighted }],
	};
};
const searchFields = computed(() => [
	{ title: __("All fields"), value: "all" },
	{ title: __("Code"), value: "code" },
	{ title: __("Product"), value: "product" },
	{ title: __("Pack"), value: "pack" },
	{ title: __("Company"), value: "company" },
	{ title: __("Group"), value: "group" },
	{ title: __("Generic"), value: "generic" },
	{ title: __("Rack"), value: "rack" },
]);

const headers = computed(() => [
	{ title: __("Code"), key: "item_code", width: 104, sortable: false },
	{ title: __("Product Name"), key: "item_name", minWidth: 230, sortable: false },
	{ title: __("Pack"), key: "pack", width: 92, sortable: false },
	{ title: __("Company"), key: "company", width: 132, sortable: false },
	{ title: __("Group"), key: "item_group", width: 120, sortable: false },
	{ title: __("Generic"), key: "generic", width: 145, sortable: false },
	{ title: __("R.P"), key: "rate", width: 104, align: "end" as const, sortable: false },
	{ title: __("Rack"), key: "rack", width: 88, sortable: false },
	{
		title: __("Pack Stock"),
		key: "pack_stock",
		width: 92,
		align: "end" as const,
		sortable: false,
	},
	{
		title: __("Loose"),
		key: "loose_stock",
		width: 82,
		align: "end" as const,
		sortable: false,
	},
	...(props.mode === "alternates" && props.displayedItems.some((item: any) => item?.profit_display_allowed)
		? [
				{
					title: __("Profit"),
					key: "profit",
					width: 100,
					align: "end" as const,
					sortable: false,
				},
			]
		: []),
]);

const columnRoot = ref<HTMLElement | null>(null);
const columnOrder = useColumnOrder(columnRoot, headers, computed(() => columnOrderStorageKey(props.posProfile, props.preferenceUser, "selector:pharmacy")), { section: "selector", label: "Counter Grid search" });

const columnWidths = useColumnWidths(columnRoot, computed(() => columnOrderStorageKey(props.posProfile, props.preferenceUser, "selector:pharmacy")), { section: "selector", label: "Counter Grid search" });
const sizedHeaders = computed(() => columnWidths.apply(columnOrder.headers.value));
function handleColumnPointerDown(event: PointerEvent) { if (!columnWidths.onPointerDown(event)) columnOrder.onPointerDown(event); }
function handleColumnKeydown(event: KeyboardEvent) { if (!columnWidths.onKeydown(event)) columnOrder.onKeydown(event); }
const alternateEmptyText = computed(() => {
	if (props.alternateReason === "missing_generic") {
		return __("This item has no generic mapping.");
	}
	if (props.alternateReason === "no_same_generic_items") {
		return __("No other items share this generic.");
	}
	return __("No priced in-stock alternates are available.");
});

const activeResultAnnouncement = computed(() => {
	const query = String(props.searchTerm || "").trim();
	if (props.searchPending) return query ? `${__("Searching for")} ${query}` : __("Searching items");
	if (!tableItems.value.length) {
		return query ? `${__("No matching items for")} ${query}` : __("No matching items");
	}
	const index = tableItems.value.findIndex(
		(item) => String(item?.item_code || "") === String(props.highlightedItemCode || ""),
	);
	if (index < 0) return __("No item selected");
	const item = tableItems.value[index] || {};
	const stock = projectPackLooseStock(item);
	const name = cleanPharmacyText(item.item_name) || String(item.item_code || "");
	const pack = resolvePackLabel(item) || "-";
	const rate = props.formatCurrency(
		resolveRetailPrice(item),
		priceCurrency(item),
		props.ratePrecision(resolveRetailPrice(item)),
	);
	return `${index + 1} ${__("of")} ${tableItems.value.length}, ${name}, ${__("code")} ${item.item_code}, ${__("pack")} ${pack}, ${__("price")} ${rate}, ${__("available")} ${props.formatNumber(stock.availableQty, 4)} ${stock.uom}`;
});

const priceCurrency = (item: Record<string, any>) =>
	item?.original_currency ||
	item?.currency ||
	item?.price_list_currency ||
	props.selectedCurrency ||
	props.posProfile?.currency;

const packStockLabel = (item: Record<string, any>) => {
	const stock = projectPackLooseStock(item);
	return stock.canSplit
		? props.formatNumber(stock.packQty, 0)
		: `${props.formatNumber(stock.availableQty, 4)} ${stock.uom}`;
};

const looseStockLabel = (item: Record<string, any>) => {
	const stock = projectPackLooseStock(item);
	return stock.canSplit ? props.formatNumber(stock.looseQty, 4) : "-";
};

const availableStockTitle = (item: Record<string, any>) => {
	const stock = projectPackLooseStock(item);
	return `${props.formatNumber(stock.availableQty, 4)} ${stock.uom}`;
};

const handleRowClick = (event: MouseEvent, data: any) => emit("row-click", event, data);

const isSearchNavigationBoundary = (event: KeyboardEvent) => {
	if (props.mode === "alternates") return false;
	const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
	if (!direction || !tableItems.value.length) return false;
	const activeCode = String(props.highlightedItemCode || "");
	const activeIndex = tableItems.value.findIndex((item) => String(item?.item_code || "") === activeCode);
	if (activeIndex < 0) return false;
	return direction > 0 ? activeIndex === tableItems.value.length - 1 : activeIndex === 0;
};

const handleTableKeydown = (event: KeyboardEvent) => {
	if ((event.target as Element | null)?.closest("[data-row-reorder-key], [data-column-reorder-key], [data-column-width-key]")) return;
	if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) {
		if (isSearchNavigationBoundary(event)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			emit("navigation-boundary", event);
			return;
		}
		if (["PageDown", "PageUp", "Home", "End"].includes(event.key)) {
			(event.currentTarget as HTMLElement | null)?.focus?.({ preventScroll: true });
		}
		emit("navigation-key", event);
		return;
	}
	if (event.key !== "Enter" && event.key !== " ") return;
	const row = (event.target as HTMLElement | null)?.closest?.("[data-item-code]");
	const itemCode = row?.getAttribute("data-item-code");
	if (!itemCode) return;
	const item = tableItems.value.find((candidate) => candidate?.item_code === itemCode);
	if (!item) return;
	event.preventDefault();
	if (event.key === "Enter") {
		emit("select-highlighted", event);
		return;
	}
	emit("row-click", event, { item });
};

const getTableRoot = () => tableRef.value?.$el || tableRef.value;

const getTableScroller = (root: HTMLElement | null) =>
	root?.querySelector<HTMLElement>(".v-table__wrapper") || null;

const applyRenderedHighlight = (root: HTMLElement, activeCode: string) => {
	let activeRow: HTMLElement | null = null;
	root.querySelectorAll<HTMLElement>("[data-item-code]").forEach((row) => {
		const highlighted = Boolean(activeCode && row.getAttribute("data-item-code") === activeCode);
		row.classList.toggle("item-row-highlighted", highlighted);
		row.setAttribute("aria-selected", highlighted ? "true" : "false");
		row.setAttribute("data-pharmacy-active", highlighted ? "true" : "false");
		if (highlighted) activeRow = row;
	});
	return activeRow;
};

const keepRowInsideTableViewport = (root: HTMLElement, row: HTMLElement) => {
	const scroller = getTableScroller(root);
	if (!scroller) return;
	const scrollerRect = scroller.getBoundingClientRect();
	const headerHeight = root.querySelector<HTMLElement>("thead")?.getBoundingClientRect().height || 0;
	const visibleTop = scrollerRect.top + headerHeight;
	const visibleBottom = scrollerRect.bottom;
	const rowRect = row.getBoundingClientRect();
	let delta = 0;
	if (rowRect.top < visibleTop) {
		delta = rowRect.top - visibleTop;
	} else if (rowRect.bottom > visibleBottom) {
		delta = rowRect.bottom - visibleBottom;
	}
	if (Math.abs(delta) > 0.5) {
		scroller.scrollTop += delta;
	}
};

const waitForAnimationFrame = () =>
	new Promise<void>((resolve) => {
		if (typeof window === "undefined") {
			resolve();
			return;
		}
		window.requestAnimationFrame(() => resolve());
	});

let pendingHighlightFrame: number | null = null;
const syncRenderedHighlight = async () => {
	if (pendingHighlightFrame !== null && typeof window !== "undefined") {
		window.cancelAnimationFrame(pendingHighlightFrame);
		pendingHighlightFrame = null;
	}
	const activeCode = String(props.highlightedItemCode || "");
	const activeIndex = tableItems.value.findIndex((item) => String(item?.item_code || "") === activeCode);
	await nextTick();
	const root = getTableRoot() as HTMLElement | null;
	if (!root?.querySelectorAll) return;
	let activeRow = applyRenderedHighlight(root, activeCode);
	if (!activeRow && activeIndex >= 0) {
		tableRef.value?.scrollToIndex?.(activeIndex);
		await nextTick();
		await waitForAnimationFrame();
		activeRow = applyRenderedHighlight(root, activeCode);
	}
	if (activeRow) keepRowInsideTableViewport(root, activeRow);
};

const scheduleRenderedHighlight = () => {
	if (typeof window === "undefined") {
		void syncRenderedHighlight();
		return;
	}
	if (pendingHighlightFrame !== null) {
		window.cancelAnimationFrame(pendingHighlightFrame);
	}
	pendingHighlightFrame = window.requestAnimationFrame(() => {
		pendingHighlightFrame = null;
		void syncRenderedHighlight();
	});
};

const focusActiveResult = async () => {
	await syncRenderedHighlight();
	const root = getTableRoot() as HTMLElement | null;
	const activeRow = root?.querySelector<HTMLElement>('[data-pharmacy-active="true"]');
	activeRow?.focus?.({ preventScroll: true });
	return Boolean(activeRow);
};

watch([() => props.highlightedItemCode, tableItems], scheduleRenderedHighlight, {
	flush: "post",
});

onBeforeUnmount(() => {
	if (pendingHighlightFrame !== null && typeof window !== "undefined") {
		window.cancelAnimationFrame(pendingHighlightFrame);
	}
});

defineExpose({ tableRef, syncRenderedHighlight, focusActiveResult });
</script>

<style scoped>
.pharmacy-search-results {
	--counter-rugged-navy: #09253d;
	--counter-rugged-navy-raised: #174a70;
	--counter-rugged-blue: #0f70d7;
	--counter-rugged-cyan: #38bdf8;
	--counter-rugged-line: var(--pos-outline);
	--counter-rugged-soft-line: var(--pos-border);
	position: relative;
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 0;
	height: 100%;
}

.pharmacy-search-announcement {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.pharmacy-search-controls {
	display: flex;
	align-items: center;
	gap: 12px;
	min-height: 52px;
	padding: 6px 10px;
	border-bottom: 2px solid var(--counter-rugged-navy-raised);
	background: var(--pos-card-bg);
}

.pharmacy-search-controls :deep(.v-field) {
	border-radius: 3px;
	background: var(--pos-input-bg);
}

.pharmacy-search-controls :deep(.v-field__outline) {
	color: var(--counter-rugged-line);
	--v-field-border-opacity: 1;
}

.pharmacy-search-controls :deep(.v-label),
.pharmacy-search-controls :deep(.v-field-label) {
	color: var(--pos-text-secondary) !important;
	opacity: 1;
}

.pharmacy-search-controls__field {
	flex: 0 0 180px;
}

.pharmacy-search-controls__group {
	flex: 0 1 220px;
}

.pharmacy-search-controls__status {
	display: flex;
	align-items: center;
	gap: 14px;
	margin-inline-start: auto;
	color: var(--pos-text-secondary);
	font-size: 0.76rem;
	font-weight: 600;
}

.pharmacy-alternate-context {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.pharmacy-alternate-context > div {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.pharmacy-alternate-context strong {
	color: var(--counter-rugged-navy);
	font-size: 0.86rem;
}

.pharmacy-alternate-context span {
	overflow: hidden;
	color: var(--pos-text-secondary);
	font-size: 0.72rem;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pharmacy-results-table {
	flex: 1 1 auto;
	min-height: 0;
	border: 0;
	border-radius: 0;
	background: var(--pos-card-bg);
}

.pharmacy-results-keyboard-boundary {
	display: flex;
	flex: 1 1 auto;
	min-height: 0;
}

.pharmacy-alternate-empty {
	position: absolute;
	inset: 52px 0 0;
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	gap: 8px;
	padding: 24px;
	background: var(--pos-surface-muted);
	color: var(--pos-text-secondary);
	text-align: center;
}

.pharmacy-results-table :deep(.v-table__wrapper) {
	overflow: auto;
	overflow-anchor: none;
	overscroll-behavior: contain;
	scroll-behavior: auto !important;
}

.pharmacy-results-table :deep(table) {
	min-width: 1180px;
}

.pharmacy-results-table :deep(th) {
	height: 40px !important;
	padding: 0 8px !important;
	border-right: 1px solid #b5c9d8 !important;
	border-bottom: 2px solid var(--counter-rugged-navy-raised) !important;
	background: var(--pos-table-header-bg) !important;
	color: var(--pos-text-primary) !important;
	font-size: 0.72rem;
	font-weight: 800 !important;
	text-transform: uppercase;
}

.pharmacy-results-table :deep(td) {
	height: 40px !important;
	padding: 2px 8px !important;
	border-right: 1px solid var(--counter-rugged-soft-line) !important;
	border-bottom: 1px solid var(--counter-rugged-line) !important;
	background: var(--pos-card-bg);
	color: var(--pos-text-primary);
	font-size: 0.78rem;
	font-weight: 520;
	font-variant-numeric: tabular-nums;
	line-height: 1.2;
}

.pharmacy-results-table :deep(tbody tr) {
	cursor: pointer;
	animation: none !important;
	transition: none !important;
}

.pharmacy-results-table :deep(tbody tr > td) {
	animation: none !important;
	transition: none !important;
}

.pharmacy-results-table :deep(tbody tr:nth-child(even):not(.item-row-highlighted) > td) {
	background: var(--pos-surface-muted);
}

.pharmacy-results-table :deep(tbody tr:not(.item-row-highlighted):hover > td) {
	background: var(--pos-hover-bg) !important;
}

.pharmacy-results-table :deep(tbody tr.item-row-highlighted > td),
.pharmacy-results-table :deep(tbody tr[aria-selected="true"] > td) {
	background: var(--counter-rugged-blue) !important;
	color: #ffffff !important;
	font-weight: 650;
}

.pharmacy-results-table :deep(tbody tr.item-row-highlighted > td:first-child),
.pharmacy-results-table :deep(tbody tr[aria-selected="true"] > td:first-child) {
	box-shadow: inset 5px 0 0 var(--counter-rugged-cyan);
}

.pharmacy-results-table :deep(tbody tr.item-row-highlighted .pharmacy-product-cell strong),
.pharmacy-results-table :deep(tbody tr.item-row-highlighted .pharmacy-product-cell span),
.pharmacy-results-table :deep(tbody tr.item-row-highlighted .pharmacy-rate-cell),
.pharmacy-results-table :deep(tbody tr[aria-selected="true"] .pharmacy-product-cell strong),
.pharmacy-results-table :deep(tbody tr[aria-selected="true"] .pharmacy-product-cell span),
.pharmacy-results-table :deep(tbody tr[aria-selected="true"] .pharmacy-rate-cell) {
	color: #ffffff !important;
}

.pharmacy-product-cell {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.pharmacy-product-cell strong,
.pharmacy-product-cell span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pharmacy-product-cell strong {
	font-size: 0.79rem;
	color: var(--pos-text-primary);
}

.pharmacy-product-cell span {
	color: var(--pos-text-secondary);
	font-size: 0.68rem;
}

.pharmacy-rate-cell {
	font-weight: 700;
	color: var(--pos-text-primary);
}

@media (max-width: 1100px) {
	.pharmacy-search-controls__status span:not(:first-child) {
		display: none;
	}
}
</style>
