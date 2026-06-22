<template>
	<div class="items-table-container">
		<v-data-table-virtual
			ref="tableRef"
			:headers="effectiveHeaders"
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
			<template v-if="multiSelect" v-slot:item.item-select="{ item }">
				<v-checkbox-btn
					:model-value="isItemSelected(item)"
					@click.stop="emit('toggle-selection', item)"
				/>
			</template>
			<template v-if="multiSelect" v-slot:header.item-select>
				<v-checkbox-btn
					:model-value="allSelected"
					@click.stop="emit('select-all', !allSelected)"
				/>
			</template>
			<template v-slot:item.rate="{ item }">
				<div v-if="context !== 'purchase'">
					<div class="text-primary rate-cell-primary">
						<div>
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
						<ItemRateInfoMenu
							v-if="showRateInfo"
							:rate-info="getItemRateInfo(item)"
							:currency-symbol="currencySymbol"
							:format-currency="formatCurrency"
							:rate-precision="ratePrecision"
						/>
					</div>
					<div
						v-if="
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
						{{
							formatCurrency(
								secondaryRate(item),
								selectedCurrency,
								ratePrecision(secondaryRate(item)),
							)
						}}
					</div>
				</div>
				<div v-else>
					<div class="text-primary rate-cell-primary">
						<div>
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
									item.original_rate ?? item.rate ?? item.standard_rate ?? 0,
									item.original_currency ||
										item.currency ||
										item.price_list_currency ||
										posProfile.currency,
									ratePrecision(item.original_rate ?? item.rate ?? item.standard_rate ?? 0),
								)
							}}
						</div>
						<ItemRateInfoMenu
							v-if="showRateInfo"
							:rate-info="getItemRateInfo(item)"
							:currency-symbol="currencySymbol"
							:format-currency="formatCurrency"
							:rate-precision="ratePrecision"
						/>
					</div>
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
import { ref, computed } from "vue";
import ItemRateInfoMenu from "./ItemRateInfoMenu.vue";
import { priceListToSelectedCurrency } from "../../../utils/erpnextCurrency";

const props = defineProps({
	displayedItems: { type: Array, default: () => [] },
	headers: { type: Array, default: () => [] },
	headerProps: { type: Object, default: () => ({}) },
	context: { type: String, default: "pos" },
	posProfile: { type: Object, default: () => ({}) },
	selectedCurrency: { type: String, default: "" },
	selectedExchangeRate: { type: Number, default: 1 },
	selectedConversionRate: { type: Number, default: 1 },
	hideQtyDecimals: { type: Boolean, default: false },
	showRateInfo: { type: Boolean, default: true },
	currencySymbol: { type: Function, required: true },
	formatCurrency: { type: Function, required: true },
	formatNumber: { type: Function, required: true },
	ratePrecision: { type: Function, required: true },
	getItemRateInfo: { type: Function, required: true },
	isNegative: { type: Function, required: true },
	itemClass: { type: [String, Function], default: "" },
	rowProps: { type: [Object, Function], default: null },
	noDataText: { type: String, default: "" },
	multiSelect: { type: Boolean, default: false },
	selectedKeys: { type: Set, default: () => new Set() },
});

const emit = defineEmits(["row-click", "list-scroll", "toggle-selection", "select-all"]);

const effectiveHeaders = computed(() => {
	if (!props.multiSelect) return props.headers;
	return [
		{ key: "item-select", title: "", sortable: false, width: "48px" },
		...props.headers,
	];
});

function isItemSelected(item) {
	const key = item?.item_code || item?.name;
	return key ? props.selectedKeys.has(key) : false;
}

const allSelected = computed(() => {
	if (!props.displayedItems.length) return false;
	return props.displayedItems.every((item) => {
		const key = item?.item_code || item?.name;
		return key ? props.selectedKeys.has(key) : false;
	});
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

const priceListCurrency = (item) =>
	item.original_currency ||
	item.currency ||
	item.price_list_currency ||
	props.posProfile.currency;

const primaryRate = (item) => item.original_rate ?? item.rate ?? 0;

const secondaryRate = (item) =>
	priceListToSelectedCurrency(
		{
			pos_profile: props.posProfile,
			price_list_currency: priceListCurrency(item),
			selected_currency: props.selectedCurrency || props.posProfile.currency,
			exchange_rate: props.selectedExchangeRate,
			conversion_rate: props.selectedConversionRate,
		},
		primaryRate(item),
	);

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

.rate-cell-primary {
	display: inline-flex;
	align-items: center;
	gap: 4px;
}

.sleek-data-table {
	margin: 0;
	background-color: transparent;
	border-radius: var(--pos-radius-md);
	overflow: hidden;
	border: 1px solid var(--pos-border-light);
	height: 100%;
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
	border-bottom: 1px solid var(--pos-border-light);
	background-color: var(--pos-surface-raised);
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
