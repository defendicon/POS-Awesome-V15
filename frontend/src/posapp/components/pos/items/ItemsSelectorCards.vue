<template>
	<div class="items-card-container">
		<div v-if="isLoading" class="items-card-grid">
			<Skeleton v-for="n in 8" :key="n" class="mb-4" height="120" />
		</div>
		<div
			v-else-if="displayedItems.length === 0"
			class="d-flex flex-column align-center justify-center text-center fill-height pa-4"
			style="height: 100%; min-height: 200px"
		>
			<v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-package-variant-closed</v-icon>
			<div class="text-h6 text-medium-emphasis mb-1">
				{{ noItemsTitle }}
			</div>
			<div class="text-body-2 text-medium-emphasis">
				{{ noItemsSubtitle }}
			</div>
			<v-btn
				v-if="showClearButton"
				variant="text"
				color="primary"
				class="mt-4"
				@click="handleClearSearch"
			>
				{{ clearSearchLabel }}
			</v-btn>
		</div>
		<RecycleScroller
			v-else
			ref="scrollerRef"
			class="virtual-scroller"
			:list-class="['items-virtual-list', { 'item-container': isOverflowing }]"
			:items="displayedItems"
			key-field="item_code"
			:item-size="cardSlotHeight"
			:grid-items="cardColumns"
			:item-secondary-size="cardSlotWidth"
			:buffer="virtualScrollBuffer"
			:emit-update="true"
			@update="handleRangeUpdate"
		>
			<template #default="{ item }">
				<ItemCard
					v-if="item"
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
					:style="{
						width: cardColumnWidth + 'px',
						height: cardRowHeight + 'px',
					}"
					@click="handleItemClick"
					@dragstart="handleDragStart"
					@dragend="handleDragEnd"
				/>
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
	emit("virtual-range-update", ...args);
};

const handleClearSearch = () => {
	emit("clear-search");
};

const scrollerRef = ref(null);

const scrollToItem = (index) => {
	scrollerRef.value?.scrollToItem?.(index);
};

const getScrollerElement = () => {
	const ref = scrollerRef.value;
	return ref?.$el || ref;
};

defineExpose({ scrollToItem, getScrollerElement, scrollerRef });
</script>

<style scoped>
.item-container {
	overflow-y: auto;
	scrollbar-gutter: stable;
}

.items-card-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 16px;
	padding: 16px;
	height: calc(100% - 80px);
	overflow-y: auto;
	scrollbar-width: thin;
	scrollbar-color: rgba(var(--v-theme-on-surface), 0.2) transparent;
	contain: layout style;
	will-change: scroll-position;
	transform: translate3d(0, 0, 0);
}

.virtual-scroller {
	height: calc(100% - 80px);
	overflow-y: auto;
	position: relative;
}

.virtual-scroller .items-card-grid {
	height: auto;
	overflow: visible;
}

.virtual-scroller .vue-recycle-scroller__item-wrapper {
	display: contents;
}

.items-card-grid::-webkit-scrollbar {
	width: 8px;
}

.items-card-grid::-webkit-scrollbar-track {
	background: transparent;
}

.items-card-grid::-webkit-scrollbar-thumb {
	background-color: rgba(var(--v-theme-on-surface), 0.2);
	border-radius: 4px;
}

.virtual-scroller :deep(.items-virtual-list) {
	padding: 16px;
	contain: layout style;
	box-sizing: border-box;
}

@media (max-width: 1200px) {
	.virtual-scroller :deep(.items-virtual-list) {
		padding: 12px;
	}
}

@media (max-width: 768px) {
	.virtual-scroller :deep(.items-virtual-list) {
		padding: 10px;
	}
}
</style>
