<template>
	<div class="items-card-container">
		<div v-if="isLoading" class="items-card-grid">
			<Skeleton v-for="n in 8" :key="n" class="mb-4" height="120" />
		</div>
		<div v-else-if="displayedItems.length === 0" class="items-empty-state">
			<div class="items-empty-state__panel">
				<div class="items-empty-state__icon-wrap">
					<v-icon size="36" class="items-empty-state__icon">mdi-package-variant-closed</v-icon>
				</div>
				<div class="items-empty-state__title">{{ noItemsTitle }}</div>
				<div class="items-empty-state__subtitle">{{ noItemsSubtitle }}</div>
				<div v-if="showClearButton" class="items-empty-state__meta">
					<v-chip v-if="searchInput" size="small" variant="tonal" color="primary" class="items-empty-state__chip">
						{{ searchInput }}
					</v-chip>
					<v-chip
						v-if="itemGroup && itemGroup !== 'ALL'"
						size="small"
						variant="tonal"
						color="secondary"
						class="items-empty-state__chip"
					>
						{{ itemGroup }}
					</v-chip>
				</div>
				<v-btn
					v-if="showClearButton"
					variant="flat"
					color="primary"
					class="items-empty-state__action"
					@click='emit("clear-search")'
				>
					{{ clearSearchLabel }}
				</v-btn>
			</div>
		</div>
		<RecycleScroller
			v-else
			ref="scrollerRef"
			:items="virtualRows"
			key-field="id"
			class="virtual-scroller"
			:class="{ 'item-container': isOverflowing }"
			list-class="items-virtual-list"
			:item-size="cardSlotHeight"
			:style="scrollerVars"
			:buffer="virtualScrollBuffer"
			:emit-update="true"
			@update="handleRangeUpdate"
		>
			<template #default="{ item: row }">
				<div class="items-card-row" :style="getRowStyle(row)">
					<ItemCard
						v-for="item in row.items"
						:key="item.item_code"
						:item="item"
						:pos-profile="posProfile"
						:context="context"
						:selected-currency="selectedCurrency"
						:hide-qty-decimals="hideQtyDecimals"
						:last-invoice-rate="getLastInvoiceRate(item)"
						:is-item-highlighted="isItemHighlighted(item)"
						:currency-symbol="currencySymbol"
						:format-currency="formatCurrency"
						:format-number="formatNumber"
						:rate-precision="ratePrecision"
						:is-negative="isNegative"
						:style="{ height: cardRowHeight + 'px' }"
						@click="handleItemClick"
						@dragstart="handleDragStart"
						@dragend="handleDragEnd"
					/>
				</div>
			</template>
		</RecycleScroller>
	</div>
</template>

<script setup>
import { computed, ref } from "vue";
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import ItemCard from "./ItemCard.vue";
import Skeleton from "../../ui/Skeleton.vue";

const props = defineProps({
	displayedItems: { type: Array, default: () => [] },
	isLoading: { type: Boolean, default: false },
	searchInput: { type: String, default: "" },
	itemGroup: { type: String, default: "ALL" },
	isOverflowing: { type: Boolean, default: false },
	cardSlotHeight: { type: Number, default: 0 },
	cardColumns: { type: Number, default: 1 },
	cardGap: { type: Number, default: 16 },
	cardPadding: { type: Number, default: 16 },
	cardSlotWidth: { type: Number, default: 0 },
	cardColumnWidth: { type: Number, default: 0 },
	cardRowHeight: { type: Number, default: 0 },
	virtualScrollBuffer: { type: Number, default: 200 },
	posProfile: { type: Object, default: () => ({}) },
	context: { type: String, default: "pos" },
	selectedCurrency: { type: String, default: "" },
	hideQtyDecimals: { type: Boolean, default: false },
	getLastInvoiceRate: { type: Function, required: true },
	isItemHighlighted: { type: Function, required: true },
	currencySymbol: { type: Function, required: true },
	formatCurrency: { type: Function, required: true },
	formatNumber: { type: Function, required: true },
	ratePrecision: { type: Function, required: true },
	isNegative: { type: Function, required: true },
	noItemsTitle: { type: String, default: "" },
	noItemsSubtitle: { type: String, default: "" },
	clearSearchLabel: { type: String, default: "" },
});

const emit = defineEmits(["select-item", "dragstart", "dragend", "virtual-range-update", "clear-search"]);

const showClearButton = computed(() => {
	return Boolean(props.searchInput) || (props.itemGroup && props.itemGroup !== "ALL");
});

const normalizedColumns = computed(() => Math.max(1, Number(props.cardColumns) || 1));

const virtualRows = computed(() => {
	const rows = [];
	for (let index = 0; index < props.displayedItems.length; index += normalizedColumns.value) {
		rows.push({
			id: `row-${Math.floor(index / normalizedColumns.value)}`,
			items: props.displayedItems.slice(index, index + normalizedColumns.value),
		});
	}
	return rows;
});

const scrollerVars = computed(() => ({
	"--card-gap": `${props.cardGap || 16}px`,
	"--card-padding": `${props.cardPadding || 16}px`,
}));

const handleItemClick = (event, item) => {
	emit("select-item", event, item);
};

const handleDragStart = (event, item) => {
	emit("dragstart", event, item);
};

const handleDragEnd = (event) => {
	emit("dragend", event);
};

const handleRangeUpdate = (...args) => {
	const [startRow, endRow, visibleStartRow, visibleEndRow] = args;
	const columns = normalizedColumns.value;
	const lastIndex = Math.max(props.displayedItems.length - 1, 0);
	const toStartIndex = (rowIndex) => Math.max(0, Number(rowIndex || 0) * columns);
	const toEndIndex = (rowIndex) =>
		Math.min(lastIndex, Math.max(0, (Number(rowIndex || 0) + 1) * columns - 1));

	emit(
		"virtual-range-update",
		toStartIndex(startRow),
		toEndIndex(endRow),
		toStartIndex(visibleStartRow),
		toEndIndex(visibleEndRow),
	);
};

const scrollerRef = ref(null);

const scrollToItem = (index) => {
	const rowIndex = Math.floor(Math.max(0, index) / normalizedColumns.value);
	scrollerRef.value?.scrollToItem?.(rowIndex);
};

const getScrollerElement = () => {
	const refValue = scrollerRef.value;
	return refValue?.$el || refValue;
};

const getRowStyle = (row) => ({
	gridTemplateColumns: `repeat(${normalizedColumns.value}, minmax(0, 1fr))`,
});

defineExpose({ scrollToItem, getScrollerElement, scrollerRef });
</script>

<style scoped>
.items-card-container {
	display: flex;
	flex: 1 1 auto;
	flex-direction: column;
	min-height: 0;
	width: 100%;
}

.item-container {
	overflow-y: auto;
	scrollbar-gutter: stable;
}

.items-card-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 16px;
	padding: 0;
}

.virtual-scroller {
	height: 100%;
	flex: 1 1 auto;
	min-height: 0;
	overflow-y: auto;
	position: relative;
}

.items-card-row {
	display: grid;
	gap: var(--card-gap);
	height: 100%;
	padding: 0 var(--card-padding);
	box-sizing: border-box;
	align-items: start;
}

.items-empty-state {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 240px;
	height: 100%;
	flex: 1 1 auto;
	padding: 20px 16px 28px;
}

.items-empty-state__panel {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	gap: 10px;
	width: min(420px, 100%);
	padding: 28px 24px;
	border-radius: 24px;
	border: 1px dashed rgba(var(--v-theme-on-surface), 0.16);
	background:
		radial-gradient(circle at top, rgba(var(--v-theme-primary), 0.08), transparent 58%),
		rgba(var(--v-theme-surface), 0.72);
}

.items-empty-state__icon-wrap {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 72px;
	height: 72px;
	border-radius: 22px;
	background: rgba(var(--v-theme-on-surface), 0.05);
}

.items-empty-state__icon {
	color: rgba(var(--v-theme-on-surface), 0.5);
}

.items-empty-state__title {
	font-size: 1.05rem;
	font-weight: 700;
	color: rgba(var(--v-theme-on-surface), 0.88);
}

.items-empty-state__subtitle {
	max-width: 34ch;
	font-size: 0.93rem;
	line-height: 1.5;
	color: rgba(var(--v-theme-on-surface), 0.68);
}

.items-empty-state__meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 8px;
}

.items-empty-state__chip {
	max-width: 100%;
}

.items-empty-state__action {
	margin-top: 4px;
	text-transform: none;
	font-weight: 700;
}

:deep(.items-virtual-list) {
	padding-top: var(--card-padding);
	box-sizing: border-box;
	contain: layout style;
}

.virtual-scroller :deep(.vue-recycle-scroller__item-wrapper) {
	width: 100%;
}

@media (max-width: 1200px) {
	.items-card-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
}

@media (max-width: 768px) {
	.items-card-grid {
		grid-template-columns: 1fr;
		gap: 10px;
	}
}
</style>
