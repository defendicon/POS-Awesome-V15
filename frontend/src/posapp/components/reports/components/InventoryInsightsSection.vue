<template>
	<v-row class="dashboard-grid">
		<v-col cols="12" lg="6">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Fast Moving Items") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ __("Age Bracket") }}: {{ fastMovingRangeLabel }}
						</v-chip>
						<v-chip size="small" color="success" variant="tonal">
							{{ __("Total") }}: {{ fastMovingTotalCount }}
						</v-chip>
					</div>
				</div>
				<div class="card-filters">
					<v-text-field
						:model-value="fastMovingSearchInput"
						:label="__('Search item')"
						density="compact"
						variant="outlined"
						hide-details
						clearable
						prepend-inner-icon="mdi-magnify"
						class="card-filter-input"
						@update:modelValue="emit('update:fastMovingSearchInput', String($event || ''))"
					/>
					<v-select
						:model-value="fastMovingPageSize"
						:items="fastMovingPageSizeItems"
						item-title="label"
						item-value="value"
						:label="__('Per Page')"
						density="compact"
						variant="outlined"
						hide-details
						class="card-filter-select"
						@update:modelValue="emit('update:fastMovingPageSize', Number($event || 10))"
					/>
				</div>

				<div v-if="loading" class="py-2">
					<v-skeleton-loader type="list-item-three-line" class="mb-2" />
					<v-skeleton-loader type="list-item-three-line" class="mb-2" />
					<v-skeleton-loader type="list-item-three-line" />
				</div>

				<div v-else-if="fastMovingItems.length" class="list-stack">
					<InsightRow
						v-for="item in fastMovingItems"
						:key="item.item_code"
						:title="item.item_name || item.item_code || '-'"
						:value="`${formatQuantity(Number(item.sold_qty || 0))} ${item.stock_uom || ''}`"
						:meta="item.item_code"
					>
						<v-progress-linear
							:model-value="progressFromQuantity(Number(item.sold_qty || 0))"
							color="success"
							height="6"
							rounded
						/>
					</InsightRow>
				</div>

				<div
					v-if="!loading && fastMovingItems.length && fastMovingTotalPages > 1"
					class="pagination-row"
				>
					<v-pagination
						:model-value="fastMovingPage"
						:length="fastMovingTotalPages"
						:total-visible="5"
						density="comfortable"
						@update:modelValue="emit('update:fastMovingPage', Number($event || 1))"
					/>
				</div>

				<EmptyState
					v-if="!loading && !fastMovingItems.length"
					:message="__('No sales activity found for this period.')"
				/>
			</v-card>
		</v-col>

		<v-col cols="12" lg="6">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Low Stock Alerts") }}
					</h2>
					<v-chip size="small" color="warning" variant="tonal">
						{{ __("Threshold") }}: {{ lowStockThreshold }}
					</v-chip>
				</div>
				<div class="card-filters">
					<v-text-field
						:model-value="lowStockSearch"
						:label="__('Search item / code')"
						density="compact"
						variant="outlined"
						hide-details
						clearable
						prepend-inner-icon="mdi-magnify"
						class="card-filter-input"
						@update:modelValue="emit('update:lowStockSearch', String($event || ''))"
					/>
					<v-select
						:model-value="lowStockWarehouseFilter"
						:items="lowStockWarehouseItems"
						item-title="label"
						item-value="value"
						:label="__('Warehouse')"
						density="compact"
						variant="outlined"
						hide-details
						class="card-filter-select"
						@update:modelValue="emit('update:lowStockWarehouseFilter', String($event || ''))"
					/>
				</div>

				<div v-if="loading" class="py-2">
					<v-skeleton-loader type="list-item-two-line" class="mb-2" />
					<v-skeleton-loader type="list-item-two-line" class="mb-2" />
					<v-skeleton-loader type="list-item-two-line" />
				</div>

				<div v-else-if="lowStockItems.length" class="list-stack">
					<InsightRow
						v-for="item in lowStockItems"
						:key="`${item.item_code}-${item.warehouse}`"
						:title="item.item_name || item.item_code || '-'"
					>
						<template #value>
							<v-chip
								size="x-small"
								:color="stockChipColor(Number(item.actual_qty || 0))"
								variant="flat"
							>
								{{ formatQuantity(Number(item.actual_qty || 0)) }}
								{{ item.stock_uom || "" }}
							</v-chip>
						</template>
						<template #meta>
							{{ item.item_code }} . {{ item.warehouse }}
						</template>
					</InsightRow>
				</div>

				<EmptyState v-else :message="__('No low stock alerts right now.')" />
			</v-card>
		</v-col>
	</v-row>
</template>

<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
import InsightRow from "./InsightRow.vue";

type DashboardRow = Record<string, any>;
type SelectItem = {
	label: string;
	value: string | number;
};

defineProps<{
	loading: boolean;
	fastMovingRangeLabel: string;
	fastMovingTotalCount: number;
	fastMovingSearchInput: string;
	fastMovingPageSize: number;
	fastMovingPageSizeItems: SelectItem[];
	fastMovingItems: DashboardRow[];
	fastMovingTotalPages: number;
	fastMovingPage: number;
	lowStockThreshold: number;
	lowStockSearch: string;
	lowStockWarehouseFilter: string;
	lowStockWarehouseItems: SelectItem[];
	lowStockItems: DashboardRow[];
	formatQuantity: (value: number) => string;
	progressFromQuantity: (quantity: number) => number;
	stockChipColor: (quantity: number) => string;
}>();

const emit = defineEmits<{
	(event: "update:fastMovingSearchInput", value: string): void;
	(event: "update:fastMovingPageSize", value: number): void;
	(event: "update:fastMovingPage", value: number): void;
	(event: "update:lowStockSearch", value: string): void;
	(event: "update:lowStockWarehouseFilter", value: string): void;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
