<template>
	<div ref="tableContainer" class="items-table-container">
		<v-data-table-virtual
			ref="tableRef"
			:headers="responsiveHeaders"
			:items="displayedItems"
			class="sleek-data-table overflow-y-auto"
			:style="{ height: '100%' }"
			item-key="item_code"
			fixed-header
			height="100%"
			:item-height="tableItemHeight"
			:header-props="headerProps"
			:no-data-text="noDataText"
			@click:row="handleRowClick"
			:item-class="itemClass"
			:row-props="rowProps"
			@scroll.passive="handleListScroll"
		>
			<template v-slot:item.item_name="{ item }">
				<div class="item-name-cell" :title="item.item_name">
					{{ item.item_name }}
				</div>
			</template>
			<template v-slot:item.item_code="{ item }">
				<div class="item-code-cell" :title="item.item_code">
					{{ item.item_code }}
				</div>
			</template>
			<template v-slot:item.rate="{ item }">
				<div v-if="context !== 'purchase'">
					<div class="text-primary rate-primary-line">
						{{
							currencySymbol(
								item.original_currency ||
									item.currency ||
									item.price_list_currency ||
									posProfile.currency,
							)
						}}
						{{
							formatCurrency(
								item.original_rate ?? item.rate ?? 0,
								item.original_currency ||
									item.currency ||
									item.price_list_currency ||
									posProfile.currency,
								ratePrecision(item.original_rate ?? item.rate ?? 0),
							)
						}}
					</div>
					<div
						v-if="showExtendedRateMeta && getLastInvoiceRate(item)"
						class="text-caption d-flex align-center last-rate-inline"
					>
						<v-icon size="14" class="mr-1" color="secondary">mdi-history</v-icon>
						<span class="mr-1">{{ __("Last") }}:</span>
						<span class="font-weight-medium">
							{{ currencySymbol(getLastInvoiceRate(item).currency || posProfile.currency) }}
							{{
								formatCurrency(
									getLastInvoiceRate(item).rate,
									getLastInvoiceRate(item).currency || posProfile.currency,
									ratePrecision(getLastInvoiceRate(item).rate || 0),
								)
							}}
							<span v-if="getLastInvoiceRate(item).uom" class="last-rate-uom">
								/{{ getLastInvoiceRate(item).uom }}
							</span>
						</span>
					</div>
					<div
						v-if="
							showExtendedRateMeta &&
							posProfile.posa_allow_multi_currency &&
							selectedCurrency &&
							selectedCurrency !==
								(item.original_currency ||
									item.currency ||
									item.price_list_currency ||
									posProfile.currency)
						"
						class="text-success"
					>
						{{ currencySymbol(selectedCurrency) }}
						{{ formatCurrency(item.rate, selectedCurrency, ratePrecision(item.rate)) }}
					</div>
				</div>
				<div v-else class="text-primary">
					{{ currencySymbol(posProfile.currency) }}
					{{
						formatCurrency(
							item.rate || item.standard_rate || 0,
							posProfile.currency,
							ratePrecision(item.rate || item.standard_rate || 0),
						)
					}}
				</div>
			</template>
			<template v-slot:item.actual_qty="{ item }">
				<span class="golden--text" :class="{ 'negative-number': isNegative(item.actual_qty) }">
					{{ formatActualQty(item.actual_qty) }}
				</span>
			</template>
		</v-data-table-virtual>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
	displayedItems: { type: Array, default: () => [] },
	headers: { type: Array, default: () => [] },
	headerProps: { type: Object, default: () => ({}) },
	context: { type: String, default: "pos" },
	posProfile: { type: Object, default: () => ({}) },
	selectedCurrency: { type: String, default: "" },
	hideQtyDecimals: { type: Boolean, default: false },
	currencySymbol: { type: Function, required: true },
	formatCurrency: { type: Function, required: true },
	formatNumber: { type: Function, required: true },
	ratePrecision: { type: Function, required: true },
	getLastInvoiceRate: { type: Function, required: true },
	isNegative: { type: Function, required: true },
	itemClass: { type: [String, Function], default: "" },
	rowProps: { type: [Object, Function], default: null },
	noDataText: { type: String, default: "" },
});

const emit = defineEmits(["row-click", "list-scroll"]);

const tableContainer = ref(null);
const containerWidth = ref(0);
let resizeObserver = null;

const breakpoint = computed(() => {
	if (containerWidth.value < 460) return "xs";
	if (containerWidth.value < 680) return "sm";
	if (containerWidth.value < 860) return "md";
	if (containerWidth.value < 1080) return "lg";
	return "xl";
});

const tableItemHeight = computed(() => {
	if (breakpoint.value === "xs") return 52;
	if (breakpoint.value === "sm") return 56;
	if (breakpoint.value === "md") return 60;
	return 68;
});

const showExtendedRateMeta = computed(() => {
	return breakpoint.value === "lg" || breakpoint.value === "xl";
});

const responsiveHeaders = computed(() => {
	const sourceHeaders = props.headers || [];
	if (sourceHeaders.length === 0) {
		return [];
	}

	const visibleKeysByBreakpoint = {
		xs: ["item_name", "actual_qty"],
		sm: ["item_name", "actual_qty", "rate"],
		md: ["item_name", "actual_qty", "rate", "stock_uom"],
		lg: ["item_name", "item_code", "actual_qty", "rate", "stock_uom"],
		xl: ["item_name", "item_code", "actual_qty", "rate", "stock_uom"],
	};

	const widthMaps = {
		xs: {
			item_name: "72%",
			actual_qty: "28%",
		},
		sm: {
			item_name: "50%",
			actual_qty: "20%",
			rate: "30%",
		},
		md: {
			item_name: "42%",
			actual_qty: "18%",
			rate: "24%",
			stock_uom: "16%",
		},
		lg: {
			item_name: "32%",
			item_code: "24%",
			actual_qty: "14%",
			rate: "20%",
			stock_uom: "10%",
		},
		xl: {
			item_name: "30%",
			item_code: "24%",
			actual_qty: "14%",
			rate: "20%",
			stock_uom: "12%",
		},
	};

	const activeBreakpoint = breakpoint.value;
	const visibleKeys = visibleKeysByBreakpoint[activeBreakpoint] || visibleKeysByBreakpoint.xl;
	const widthMap = widthMaps[activeBreakpoint] || widthMaps.xl;

	return sourceHeaders
		.filter((header) => visibleKeys.includes(header?.key))
		.map((header) => ({
			...header,
			width: widthMap[header?.key] || header?.width || "16%",
		}));
});

const handleRowClick = (event, data) => {
	emit("row-click", event, data);
};

const handleListScroll = (event) => {
	emit("list-scroll", event);
};

const formatActualQty = (value) => {
	const numericQty = Number(value ?? 0);
	if (!Number.isFinite(numericQty)) {
		return 0;
	}
	if (props.hideQtyDecimals) {
		return props.formatNumber(Math.round(numericQty), 0);
	}
	return props.formatNumber(numericQty, 4);
};

const tableRef = ref(null);

const getTableElement = () => {
	const ref = tableRef.value;
	return ref?.$el || ref;
};

const scrollToIndex = (index) => {
	const ref = tableRef.value;
	const scrollToIndexFn = ref?.scrollToIndex || ref?.$?.exposed?.scrollToIndex;
	if (scrollToIndexFn) {
		scrollToIndexFn(index);
		return true;
	}

	const tableEl = getTableElement();
	const wrapper = tableEl?.querySelector?.(".v-table__wrapper");
	const rows = tableEl?.querySelectorAll?.("tbody tr");
	if (wrapper && rows && rows.length > 0) {
		const targetRow = rows[index];
		if (targetRow) {
			wrapper.scrollTop = targetRow.offsetTop;
		}
		return true;
	}
	return false;
};

defineExpose({ scrollToIndex, getTableElement, tableRef });

const updateContainerWidth = () => {
	const el = tableContainer.value;
	if (!el) return;
	const nextWidth = Math.floor(el.clientWidth || el.getBoundingClientRect().width || 0);
	if (nextWidth > 0) {
		containerWidth.value = nextWidth;
	}
};

onMounted(() => {
	updateContainerWidth();
	if (tableContainer.value && typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(() => {
			updateContainerWidth();
		});
		resizeObserver.observe(tableContainer.value);
	}
});

onBeforeUnmount(() => {
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
});
</script>

<style scoped>
.items-table-container {
	display: flex;
	flex: 1 1 auto;
	min-height: 0;
	width: 100%;
	overflow: hidden;
}

:deep(.item-row-highlighted) {
	background-color: rgba(var(--v-theme-primary), 0.32);
}

:deep(.item-row-highlighted td) {
	font-weight: 600;
	color: rgb(var(--v-theme-primary));
	background-color: rgba(var(--v-theme-primary), 0.32);
}

.last-rate-inline {
	color: rgba(var(--v-theme-on-surface), 0.6);
	white-space: nowrap;
}

.item-name-cell,
.item-code-cell {
	display: block;
	width: 100%;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.item-name-cell {
	font-weight: 600;
}

.rate-primary-line {
	display: block;
	width: 100%;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.item-name-cell,
.item-code-cell,
.last-rate-inline,
:deep(.text-primary),
:deep(.text-success),
:deep(.golden--text) {
	min-width: 0;
	max-width: 100%;
}

:deep(.v-theme--dark) .last-rate-inline {
	color: rgba(var(--v-theme-on-surface), 0.75);
}

.sleek-data-table {
	margin: 0;
	background-color: transparent;
	border-radius: var(--pos-radius-md);
	overflow: hidden;
	border: 1px solid var(--pos-border-light);
	height: 100%;
	flex: 1 1 auto;
	min-height: 0;
	display: flex;
	flex-direction: column;
	transition: all 0.3s ease;
}

.sleek-data-table:hover {
	box-shadow: 0 12px 24px var(--pos-shadow-light) !important;
}

.sleek-data-table :deep(th) {
	font-weight: 700;
	font-size: 0.8rem;
	text-transform: none;
	letter-spacing: 0.02em;
	padding: 14px 16px;
	transition: all 0.3s ease;
	border-bottom: 1px solid var(--pos-border-light);
	background: var(--pos-surface-muted);
	color: var(--pos-text-secondary);
	position: sticky !important;
	top: 0 !important;
	z-index: 10 !important;
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	box-shadow: none;
	text-shadow: none;
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

:deep([data-theme="dark"]) .sleek-data-table th,
:deep(.v-theme--dark) .sleek-data-table th {
	background: var(--pos-surface-muted) !important;
	border-bottom: 1px solid var(--pos-border-light);
	color: var(--pos-text-secondary);
	text-shadow: none;
	box-shadow: none;
}

.sleek-data-table :deep(.v-data-table__wrapper),
.sleek-data-table :deep(.v-table__wrapper) {
	border-radius: var(--pos-radius-md);
	height: 100%;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	overscroll-behavior: contain;
	scrollbar-width: thin;
	position: relative;
}

.sleek-data-table :deep(.v-data-table) {
	height: 100%;
	display: flex;
	flex-direction: column;
	flex: 1 1 auto;
	min-height: 0;
}

.sleek-data-table :deep(table) {
	table-layout: fixed !important;
	width: 100% !important;
}

.sleek-data-table :deep(.v-data-table-virtual),
.sleek-data-table :deep(.v-table) {
	height: 100%;
	display: flex;
	flex-direction: column;
	flex: 1 1 auto;
	min-height: 0;
}

.sleek-data-table :deep(.v-data-table__wrapper tbody) {
	overflow-y: auto;
	max-height: calc(100% - 60px);
}

.sleek-data-table :deep(tr) {
	transition: all 0.2s ease;
	border-bottom: 1px solid var(--pos-border-light);
	background-color: var(--pos-surface-raised);
	height: 68px;
}

.sleek-data-table :deep(tr:hover) {
	background-color: rgba(var(--v-theme-primary), 0.05);
	transform: none;
	box-shadow: none;
}

.sleek-data-table :deep(tbody tr:nth-child(even)) {
	background-color: rgba(var(--v-theme-on-surface), 0.015);
}

.sleek-data-table :deep(td) {
	padding: 14px 16px;
	vertical-align: middle;
	color: var(--pos-text-primary);
	overflow: hidden;
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	letter-spacing: 0.01em;
}

.sleek-data-table :deep(td > div) {
	min-width: 0;
}

.sleek-data-table :deep(th),
.sleek-data-table :deep(td) {
	min-width: 0;
	max-width: 0;
}

.sleek-data-table :deep(.v-data-table-header__content) {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
