<template>
	<div class="items-card-container">
		<div v-if="isLoadingOrSyncing" class="items-card-grid">
			<Skeleton v-for="n in 8" :key="n" class="mb-4" height="120" />
		</div>
		<div
			v-else-if="displayedItems.length === 0"
			class="d-flex flex-column align-center justify-center text-center fill-height pa-4"
			style="height: 100%; min-height: 200px"
		>
			<v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-package-variant-closed</v-icon>
			<div class="text-h6 text-medium-emphasis mb-1">
				{{ __("No items found") }}
			</div>
			<div class="text-body-2 text-medium-emphasis">
				{{ __("Try adjusting your search or filters") }}
			</div>
			<v-btn
				v-if="showClearSearch"
				variant="text"
				color="primary"
				class="mt-4"
				@click="emit('clear-search')"
			>
				{{ __("Clear Search") }}
			</v-btn>
		</div>
		<RecycleScroller
			v-else
			ref="itemsContainer"
			class="virtual-scroller"
			:list-class="['items-virtual-list', { 'item-container': isOverflowing }]"
			:items="displayedItems"
			key-field="item_code"
			:item-size="cardSlotHeight"
			:grid-items="cardColumns"
			:item-secondary-size="cardSlotWidth"
			:buffer="virtualScrollBuffer"
			:emit-update="true"
			@update="onVirtualRangeUpdate"
		>
			<!-- Benchmark note: keep grid sizing/buffer aligned with perf traces from POS devices. -->
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
					@click="(event, selectedItem) => emit('select-item', event, selectedItem)"
					@dragstart="(event, selectedItem) => emit('dragstart', event, selectedItem)"
					@dragend="(event) => emit('dragend', event)"
				/>
			</template>
		</RecycleScroller>
	</div>
</template>

<script setup>
import { ref } from "vue";
import ItemCard from "./ItemCard.vue";
import Skeleton from "../ui/Skeleton.vue";
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

defineProps({
	displayedItems: { type: Array, default: () => [] },
	isLoadingOrSyncing: { type: Boolean, default: false },
	isOverflowing: { type: Boolean, default: false },
	cardSlotHeight: { type: Number, required: true },
	cardColumns: { type: Number, required: true },
	cardSlotWidth: { type: Number, required: true },
	cardColumnWidth: { type: Number, required: true },
	cardRowHeight: { type: Number, required: true },
	virtualScrollBuffer: { type: Number, default: 200 },
	posProfile: { type: Object, required: true },
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
	showClearSearch: { type: Boolean, default: false },
});

const emit = defineEmits(["clear-search", "virtual-range-update", "select-item", "dragstart", "dragend"]);

const itemsContainer = ref(null);

const onVirtualRangeUpdate = (...args) => {
	emit("virtual-range-update", ...args);
};

defineExpose({
	itemsContainer,
});
</script>
