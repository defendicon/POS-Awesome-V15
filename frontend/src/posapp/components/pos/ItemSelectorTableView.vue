<template>
	<div class="items-table-container">
		<v-data-table-virtual
			ref="itemsTable"
			:headers="headers"
			:items="displayedItems"
			class="sleek-data-table overflow-y-auto"
			:style="{ height: 'calc(100% - 80px)' }"
			item-key="item_code"
			fixed-header
			height="100%"
			:header-props="headerProps"
			:no-data-text="__('No items found')"
			@click:row="(event, item) => emit('click-row', event, item)"
			:item-class="getItemRowClass"
			:row-props="getItemRowProps"
			@scroll.passive="(event) => emit('list-scroll', event)"
		>
			<template #item.rate="{ item }">
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
			<template #item.actual_qty="{ item }">
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
	headers: { type: Array, default: () => [] },
	displayedItems: { type: Array, default: () => [] },
	headerProps: { type: Object, default: () => ({}) },
	context: { type: String, default: "pos" },
	posProfile: { type: Object, required: true },
	selectedCurrency: { type: String, default: "" },
	currencySymbol: { type: Function, required: true },
	formatCurrency: { type: Function, required: true },
	formatNumber: { type: Function, required: true },
	ratePrecision: { type: Function, required: true },
	getLastInvoiceRate: { type: Function, required: true },
	hideQtyDecimals: { type: Boolean, default: false },
	isNegative: { type: Function, required: true },
	getItemRowClass: { type: Function, required: true },
	getItemRowProps: { type: Function, required: true },
});

const emit = defineEmits(["click-row", "list-scroll"]);

const itemsTable = ref(null);

defineExpose({
	itemsTable,
});
</script>
