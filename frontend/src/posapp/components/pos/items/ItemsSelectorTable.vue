<template>
	<div ref="tableContainer" class="items-table-container">
		<div v-if="displayedItems.length === 0" class="items-table-empty">
			{{ noDataText }}
		</div>
		<div v-else class="items-table-shell">
			<table class="items-table" :style="tableStyles">
				<thead>
					<tr>
						<th v-for="header in responsiveHeaders" :key="header.key" :style="{ width: header.width }">
							{{ header.title }}
						</th>
					</tr>
				</thead>
				<tbody>
					<tr
						v-for="item in displayedItems"
						:key="item.item_code"
						:class="resolveRowClass(item)"
						v-bind="resolveRowProps(item)"
						@click="emit('row-click', $event, item)"
					>
						<td v-for="header in responsiveHeaders" :key="header.key">
							<template v-if="header.key === 'item_name'">
								<div class="item-name-cell" :title="item.item_name">{{ item.item_name }}</div>
							</template>
							<template v-else-if="header.key === 'item_code'">
								<div class="item-code-cell" :title="item.item_code">{{ item.item_code }}</div>
							</template>
							<template v-else-if="header.key === 'rate'">
								<div class="rate-primary-line">
									{{ currencySymbol(item.original_currency || item.currency || item.price_list_currency || posProfile.currency) }}
									{{ formatCurrency(item.original_rate ?? item.rate ?? 0, item.original_currency || item.currency || item.price_list_currency || posProfile.currency, ratePrecision(item.original_rate ?? item.rate ?? 0)) }}
								</div>
							</template>
							<template v-else-if="header.key === 'actual_qty'">
								<span class="golden--text" :class="{ 'negative-number': isNegative(item.actual_qty) }">
									{{ formatActualQty(item.actual_qty) }}
								</span>
							</template>
							<template v-else-if="header.key === 'stock_uom'">
								{{ item.stock_uom || "" }}
							</template>
						</td>
					</tr>
				</tbody>
			</table>
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

const emit = defineEmits(["row-click"]);

const tableContainer = ref(null);
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

const breakpoint = computed(() => {
	if (effectiveWidth.value >= 980) return "xl";
	if (effectiveWidth.value >= 820) return "lg";
	if (effectiveWidth.value >= 680) return "md";
	if (effectiveWidth.value >= 560) return "sm";
	if (effectiveWidth.value < 560) return "xs";
	return "xl";
});

const responsiveHeaders = computed(() => {
	const sourceHeaders = props.headers || [];
	if (sourceHeaders.length === 0) return [];

	const visibleKeysByBreakpoint = {
		xs: ["item_name", "rate"],
		sm: ["item_name", "rate"],
		md: ["item_name", "actual_qty", "rate"],
		lg: ["item_name", "item_code", "actual_qty", "rate"],
		xl: ["item_name", "item_code", "actual_qty", "rate", "stock_uom"],
	};

	const widthMaps = {
		xs: { item_name: "64%", rate: "36%" },
		sm: { item_name: "62%", rate: "38%" },
		md: { item_name: "52%", actual_qty: "18%", rate: "30%" },
		lg: { item_name: "38%", item_code: "24%", actual_qty: "14%", rate: "24%" },
		xl: { item_name: "32%", item_code: "22%", actual_qty: "14%", rate: "20%", stock_uom: "12%" },
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

const tableStyles = computed(() => ({
	minWidth: "100%",
}));

const formatActualQty = (value) => {
	const numericQty = Number(value ?? 0);
	if (!Number.isFinite(numericQty)) return 0;
	if (props.hideQtyDecimals) return props.formatNumber(Math.round(numericQty), 0);
	return props.formatNumber(numericQty, 4);
};

const resolveRowClass = (item) => {
	if (typeof props.itemClass === "function") return props.itemClass(item);
	return props.itemClass;
};

const resolveRowProps = (item) => {
	if (typeof props.rowProps === "function") return props.rowProps(item) || {};
	return props.rowProps || {};
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
</script>

<style scoped>
.items-table-container {
	display: block;
	width: 100%;
}

.items-table-shell {
	border: 1px solid var(--pos-border-light);
	border-radius: var(--pos-radius-md);
	overflow: auto;
	background: var(--pos-surface-raised);
}

.items-table {
	width: 100%;
	table-layout: fixed;
	border-collapse: collapse;
}

.items-table th {
	position: sticky;
	top: 0;
	z-index: 2;
	padding: 12px 14px;
	text-align: left;
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--pos-text-secondary);
	background: var(--pos-surface-muted);
	border-bottom: 1px solid var(--pos-border-light);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.items-table td {
	padding: 14px;
	border-bottom: 1px solid var(--pos-border-light);
	vertical-align: middle;
	overflow: hidden;
	height: 68px;
}

.items-table tbody tr:nth-child(even) {
	background-color: rgba(var(--v-theme-on-surface), 0.015);
}

.items-table tbody tr:hover {
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
