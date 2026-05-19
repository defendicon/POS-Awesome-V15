<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Inventory Status Report") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabel }}
						</v-chip>
						<v-chip size="small" color="warning" variant="tonal">
							{{ __("Low Stock Threshold") }}:
							{{ threshold }}
						</v-chip>
					</div>
				</div>

				<div class="summary-grid">
					<SummaryMetric
						:label="__('Total Items')"
						:value="formatQuantity(Number(summary.total_items || 0))"
					/>
					<SummaryMetric
						:label="__('Total Stock Qty')"
						:value="formatQuantity(Number(summary.total_stock_qty || 0))"
					/>
					<SummaryMetric
						:label="__('Low Stock')"
						:value="formatQuantity(Number(summary.low_stock_count || 0))"
						value-class="summary-metric__value--danger"
					/>
					<SummaryMetric
						:label="__('Out of Stock')"
						:value="formatQuantity(Number(summary.out_of_stock_count || 0))"
						value-class="summary-metric__value--danger"
					/>
					<SummaryMetric
						:label="__('Negative Stock')"
						:value="formatQuantity(Number(summary.negative_stock_count || 0))"
						value-class="summary-metric__value--danger"
					/>
					<SummaryMetric
						:label="__('Slow Moving')"
						:value="formatQuantity(Number(summary.slow_moving_count || 0))"
					/>
					<SummaryMetric
						:label="__('Dead Stock')"
						:value="formatQuantity(Number(summary.dead_stock_count || 0))"
					/>
				</div>

				<div class="trend-grid">
					<TrendPanel :title="__('Low Stock Items')">
						<div v-if="lowStockItems.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in lowStockItems"
								:key="`inv-low-${row.item_code}`"
								:title="row.item_name || row.item_code || '-'"
								:value="formatQuantity(Number(row.actual_qty || 0))"
							>
								<template #meta>{{ row.item_code }}</template>
								<v-progress-linear
									:model-value="trendProgress(Number(row.actual_qty || 0), lowMax)"
									color="warning"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No low stock items.')" />
					</TrendPanel>

					<TrendPanel :title="__('Out of Stock Items')">
						<div v-if="outOfStockItems.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in outOfStockItems"
								:key="`inv-out-${row.item_code}`"
								:title="row.item_name || row.item_code || '-'"
							>
								<template #value>
									<v-chip size="x-small" color="error" variant="flat">0</v-chip>
								</template>
								<template #meta>{{ row.item_code }}</template>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No out-of-stock items.')" />
					</TrendPanel>

					<TrendPanel :title="__('Negative Stock Items')">
						<div v-if="negativeItems.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in negativeItems"
								:key="`inv-neg-${row.item_code}`"
								:title="row.item_name || row.item_code || '-'"
								:value="formatQuantity(Number(row.actual_qty || 0))"
								value-class="summary-metric__value--danger"
							>
								<template #meta>{{ row.item_code }}</template>
								<v-progress-linear
									:model-value="trendProgress(Number(row.actual_qty || 0), negativeMax)"
									color="error"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No negative stock items.')" />
					</TrendPanel>

					<TrendPanel :title="__('Slow Moving Items')">
						<div v-if="slowMovingItems.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in slowMovingItems"
								:key="`inv-slow-${row.item_code}`"
								:title="row.item_name || row.item_code || '-'"
								:value="formatDays(row.stock_cover_days)"
							>
								<template #meta>
									{{ __("Stock") }}:
									{{ formatQuantity(Number(row.actual_qty || 0)) }} .
									{{ __("Sold") }}:
									{{ formatQuantity(Number(row.sold_qty || 0)) }}
								</template>
								<v-progress-linear
									:model-value="trendProgress(Number(row.stock_cover_days || 0), slowMax)"
									color="info"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No slow moving items.')" />
					</TrendPanel>

					<TrendPanel :title="__('Dead Stock Items')">
						<div v-if="deadStockItems.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in deadStockItems"
								:key="`inv-dead-${row.item_code}`"
								:title="row.item_name || row.item_code || '-'"
								:value="formatQuantity(Number(row.actual_qty || 0))"
							>
								<template #meta>{{ row.item_code }}</template>
								<v-progress-linear
									:model-value="trendProgress(Number(row.actual_qty || 0), deadMax)"
									color="secondary"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No dead stock items.')" />
					</TrendPanel>
				</div>
			</v-card>
		</v-col>
	</v-row>
</template>

<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
import InsightRow from "./InsightRow.vue";
import SummaryMetric from "./SummaryMetric.vue";
import TrendPanel from "./TrendPanel.vue";

type DashboardRow = Record<string, any>;

defineProps<{
	rangeLabel: string;
	threshold: number | string;
	summary: DashboardRow;
	lowStockItems: DashboardRow[];
	outOfStockItems: DashboardRow[];
	negativeItems: DashboardRow[];
	slowMovingItems: DashboardRow[];
	deadStockItems: DashboardRow[];
	lowMax: number;
	negativeMax: number;
	slowMax: number;
	deadMax: number;
	formatQuantity: (value: number) => string;
	formatDays: (value?: number | null) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
