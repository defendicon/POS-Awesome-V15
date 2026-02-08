<template>
	<div class="items-table-container">
		<v-data-table-virtual
			ref="tableRef"
			:headers="headers"
			:items="displayedItems"
			class="sleek-data-table overflow-y-auto"
			:style="{ height: 'calc(100% - 80px)' }"
			item-key="item_code"
			fixed-header
			height="100%"
			:header-props="headerProps"
			:no-data-text="noDataText"
			@click:row="handleRowClick"
			:item-class="itemClass"
			:row-props="rowProps"
			@scroll.passive="handleListScroll"
		>
			<template v-slot:item.rate="{ item }">
				<div v-if="context !== 'purchase'">
					<div class="text-primary">
						{{ currencySymbol(item.original_currency || posProfile.currency) }}
						{{
							formatCurrency(
								item.original_rate ?? item.rate ?? 0,
								item.original_currency || posProfile.currency,
								ratePrecision(item.original_rate ?? item.rate ?? 0),
							)
						}}
					</div>
					<div
						v-if="getLastInvoiceRate(item)"
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
							posProfile.posa_allow_multi_currency && selectedCurrency !== posProfile.currency
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
					{{ formatNumber(item.actual_qty, hideQtyDecimals ? 0 : 4) }}
				</span>
			</template>
		</v-data-table-virtual>
	</div>
</template>

<script setup>
import { ref } from "vue";

defineProps({
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

const handleRowClick = (event, data) => {
	emit("row-click", event, data);
};

const handleListScroll = (event) => {
	emit("list-scroll", event);
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
</script>

<style scoped>
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

:deep(.v-theme--dark) .last-rate-inline {
	color: rgba(var(--v-theme-on-surface), 0.75);
}

.sleek-data-table {
	margin: 0;
	background-color: transparent;
	border-radius: 0;
	overflow: hidden;
	border: none;
	height: 100%;
	display: flex;
	flex-direction: column;
	transition: all 0.3s ease;
}

.sleek-data-table:hover {
	box-shadow: 0 4px 12px rgba(var(--v-theme-on-surface), 0.15) !important;
}

.sleek-data-table :deep(th) {
	font-weight: 700;
	font-size: 0.875rem;
	text-transform: uppercase;
	letter-spacing: 1px;
	padding: 16px 20px;
	transition: all 0.3s ease;
	border-bottom: 3px solid rgb(var(--v-theme-primary));
	background: linear-gradient(
		135deg,
		rgb(var(--v-theme-surface)) 0%,
		rgb(var(--v-theme-surface-variant)) 50%,
		rgb(var(--v-theme-surface)) 100%
	);
	color: rgb(var(--v-theme-on-surface));
	position: sticky !important;
	top: 0 !important;
	z-index: 10 !important;
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	box-shadow: 0 2px 8px rgba(var(--v-theme-on-surface), 0.1);
	text-shadow: 0 1px 2px rgba(var(--v-theme-on-surface), 0.2);
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
	background: linear-gradient(
		135deg,
		rgb(var(--v-theme-surface)) 0%,
		rgb(var(--v-theme-surface-variant)) 50%,
		rgb(var(--v-theme-surface)) 100%
	) !important;
	border-bottom: 3px solid rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-on-surface));
	text-shadow: 0 1px 2px rgba(var(--v-theme-on-surface), 0.35);
	box-shadow: 0 2px 8px rgba(var(--v-theme-on-surface), 0.3);
}

.sleek-data-table :deep(.v-data-table__wrapper),
.sleek-data-table :deep(.v-table__wrapper) {
	border-radius: var(--border-radius-sm);
	height: 100%;
	overflow-y: auto;
	scrollbar-width: thin;
	position: relative;
}

.sleek-data-table :deep(.v-data-table) {
	height: 100%;
	display: flex;
	flex-direction: column;
}

.sleek-data-table :deep(.v-data-table__wrapper tbody) {
	overflow-y: auto;
	max-height: calc(100% - 60px);
}

.sleek-data-table :deep(tr) {
	transition: all 0.2s ease;
	border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
	background-color: rgb(var(--v-theme-surface));
}

.sleek-data-table :deep(tr:hover) {
	background-color: rgba(var(--v-theme-on-surface), 0.06);
	transform: translateY(-1px);
	box-shadow: 0 2px 5px rgba(var(--v-theme-on-surface), 0.1);
}

.sleek-data-table :deep(td) {
	padding: 12px 16px;
	vertical-align: middle;
	color: rgb(var(--v-theme-on-surface));
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
</style>
