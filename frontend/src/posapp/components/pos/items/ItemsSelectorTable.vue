<template>
	<div ref="tableContainer" class="items-table-container">
		<div v-if="displayedItems.length === 0" class="items-table-empty">
			{{ noDataText }}
		</div>
		<div v-else class="items-table-shell">
			<v-data-table-virtual
				ref="tableRef"
				:headers="responsiveHeaders"
				:items="displayedItems"
				item-value="item_code"
				:item-height="56"
				density="compact"
				fixed-header
				height="100%"
				hide-default-footer
				class="items-table"
				:style="tableStyles"
				:header-props="headerProps"
				:no-data-text="noDataText"
				:item-class="itemClass"
				:row-props="rowProps"
				@click:row="handleRowClick"
				@scroll.passive="handleListScroll"
			>
				<template #item.item_name="{ item }">
					<div class="item-name-cell" :title="item.item_name">{{ item.item_name }}</div>
				</template>
				<template #item.item_code="{ item }">
					<div class="item-code-cell" :title="item.item_code">{{ item.item_code }}</div>
				</template>
				<template #item.rate="{ item }">
					<div class="rate-primary-line">
						{{ currencySymbol(item.original_currency || item.currency || item.price_list_currency || posProfile.currency) }}
						{{ formatCurrency(item.original_rate ?? item.rate ?? 0, item.original_currency || item.currency || item.price_list_currency || posProfile.currency, ratePrecision(item.original_rate ?? item.rate ?? 0)) }}
					</div>
				</template>
				<template #item.actual_qty="{ item }">
					<span class="golden--text" :class="{ 'negative-number': isNegative(item.actual_qty) }">
						{{ formatActualQty(item.actual_qty) }}
					</span>
				</template>
				<template #item.stock_uom="{ item }">
					{{ item.stock_uom || "" }}
				</template>
			</v-data-table-virtual>
		</div>
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
const tableRef = ref(null);
const viewportWidth = ref(typeof window !== "undefined" ? window.innerWidth : 1280);
const containerWidth = ref(viewportWidth.value);
let resizeObserver = null;

const effectiveWidth = computed(() => {
	const measuredWidth = Number(containerWidth.value || 0);
	const screenWidth = Number(viewportWidth.value || 0);
	if (measuredWidth > 0 && screenWidth > 0) {
		return Math.min(measuredWidth, screenWidth);
	}
	return measuredWidth || screenWidth || 1280;
});

const responsiveWidth = computed(() => {
	if (viewportWidth.value >= 1024) {
		return viewportWidth.value;
	}
	return effectiveWidth.value;
});

const responsiveHeaders = computed(() => {
	const sourceHeaders = props.headers || [];
	if (sourceHeaders.length === 0) return [];

	const widthMaps = {
		item_name: { width: "260px", minWidth: 180 },
		item_code: { width: "150px", minWidth: 120 },
		actual_qty: { width: "110px", minWidth: 96 },
		rate: { width: "140px", minWidth: 112 },
		stock_uom: { width: "84px", minWidth: 72 },
	};

	return sourceHeaders
		.map((header) => ({
			...header,
			width: widthMaps[header?.key]?.width || header?.width || "160px",
			minWidth: widthMaps[header?.key]?.minWidth || 120,
		}));
});

const tableMinWidth = computed(() => {
	const totalWidth = responsiveHeaders.value.reduce((sum, header) => {
		const explicitWidth = Number.parseInt(String(header?.width || ""), 10);
		if (Number.isFinite(explicitWidth)) {
			return sum + explicitWidth;
		}
		return sum + Number(header?.minWidth || 120);
	}, 0);

	return Math.max(totalWidth + 24, Math.min(Math.max(responsiveWidth.value, 0), totalWidth + 24));
});

const tableStyles = computed(() => ({
	minWidth: `${tableMinWidth.value}px`,
	width: "100%",
}));

const formatActualQty = (value) => {
	const numericQty = Number(value ?? 0);
	if (!Number.isFinite(numericQty)) return 0;
	if (props.hideQtyDecimals) return props.formatNumber(Math.round(numericQty), 0);
	return props.formatNumber(numericQty, 4);
};

const handleRowClick = (event, data) => {
	emit("row-click", event, data);
};

const handleListScroll = (event) => {
	emit("list-scroll", event);
};

const updateContainerWidth = () => {
	const el = tableContainer.value;
	if (!el) {
		containerWidth.value = viewportWidth.value;
		return;
	}
	const nextWidth = Math.floor(el.clientWidth || el.getBoundingClientRect().width || 0);
	containerWidth.value = nextWidth > 0 ? nextWidth : viewportWidth.value;
};

const updateViewportWidth = () => {
	if (typeof window === "undefined") return;
	viewportWidth.value = window.innerWidth || 1280;
	updateContainerWidth();
};

onMounted(() => {
	updateViewportWidth();
	updateContainerWidth();
	if (tableContainer.value && typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(() => updateContainerWidth());
		resizeObserver.observe(tableContainer.value);
	}
	if (typeof window !== "undefined") {
		window.addEventListener("resize", updateViewportWidth);
	}
});

onBeforeUnmount(() => {
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
	if (typeof window !== "undefined") {
		window.removeEventListener("resize", updateViewportWidth);
	}
});

const getTableElement = () => {
	const refValue = tableRef.value;
	return refValue?.$el || refValue;
};

const scrollToIndex = (index) => {
	const refValue = tableRef.value;
	const scrollToIndexFn = refValue?.scrollToIndex || refValue?.$?.exposed?.scrollToIndex;
	if (typeof scrollToIndexFn === "function") {
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
.items-table-container {
	display: flex;
	flex: 1 1 auto;
	min-height: 0;
	width: 100%;
}

.items-table-shell {
	border: 1px solid var(--pos-border-light);
	border-radius: var(--pos-radius-md);
	overflow: auto;
	background: var(--pos-surface-raised);
	height: 100%;
	flex: 1 1 auto;
	min-height: 0;
}

.items-table {
	margin: 0;
	height: 100%;
	flex: 1 1 auto;
	min-height: 0;
	background: transparent;
}

:deep(.items-table .v-data-table),
:deep(.items-table .v-data-table-virtual),
:deep(.items-table .v-table) {
	height: 100%;
	display: flex;
	flex-direction: column;
	flex: 1 1 auto;
	min-height: 0;
}

:deep(.items-table .v-table__wrapper) {
	height: 100%;
	min-width: 100%;
	overflow-x: auto;
	overflow-y: auto;
}

:deep(.items-table th) {
	position: sticky;
	top: 0;
	z-index: 2;
	padding: 6px 8px;
	text-align: left;
	font-size: 0.72rem;
	font-weight: 700;
	color: var(--pos-text-secondary);
	background: var(--pos-surface-muted);
	border-bottom: 1px solid var(--pos-border-light);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

:deep(.items-table td) {
	padding: 6px 8px;
	border-bottom: 1px solid var(--pos-border-light);
	vertical-align: middle;
	overflow: hidden;
	height: 56px;
}

:deep(.items-table tbody tr:nth-child(even)) {
	background-color: rgba(var(--v-theme-on-surface), 0.015);
}

:deep(.items-table tbody tr:hover) {
	background-color: rgba(var(--v-theme-primary), 0.05);
}

.item-name-cell,
.item-code-cell,
.rate-primary-line {
	display: block;
	width: 100%;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.item-name-cell {
	font-weight: 600;
	font-size: 0.82rem;
}

.item-code-cell,
.rate-primary-line {
	font-size: 0.76rem;
}

.items-table-empty {
	padding: 24px 12px;
	text-align: center;
	color: var(--pos-text-secondary);
}

@media (min-width: 1024px) {
	.items-table-shell {
		scrollbar-gutter: stable both-edges;
	}
}
</style>
