<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Branch / Location-wise Report") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabel }}
						</v-chip>
						<v-chip size="small" color="primary" variant="tonal">
							{{ __("Locations") }}:
							{{ formatQuantity(Number(summary.location_count || 0)) }}
						</v-chip>
						<v-chip size="small" color="success" variant="tonal">
							{{ __("Sales") }}:
							{{ formatMoney(Number(summary.total_sales || 0)) }}
						</v-chip>
						<v-chip size="small" color="warning" variant="tonal">
							{{ __("Profit") }}:
							{{ formatMoney(Number(summary.total_profit || 0)) }}
						</v-chip>
					</div>
				</div>

				<div class="summary-grid">
					<SummaryMetric
						:label="__('Total Invoices')"
						:value="formatQuantity(Number(summary.total_invoices || 0))"
					/>
					<SummaryMetric
						:label="__('Total Stock Qty')"
						:value="formatQuantity(Number(summary.total_stock_qty || 0))"
					/>
					<SummaryMetric
						:label="__('Low Stock Total')"
						:value="formatQuantity(Number(summary.low_stock_total || 0))"
						value-class="summary-metric__value--danger"
					/>
					<SummaryMetric
						:label="__('Cashiers')"
						:value="formatQuantity(Number(summary.cashier_count || 0))"
					/>
				</div>

				<div class="trend-grid trend-grid--two">
					<TrendPanel :title="__('Location Performance')">
						<div v-if="locationRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in locationRows"
								:key="`branch-row-${row.profile}`"
								:title="row.profile || '-'"
								:value="formatMoney(Number(row.sales_amount || 0))"
							>
								<template #meta>
									{{ __("Warehouse") }}: {{ row.warehouse || "-" }} .
									{{ __("Invoices") }}:
									{{ formatQuantity(Number(row.invoice_count || 0)) }} .
									{{ __("Avg Bill") }}:
									{{ formatMoney(Number(row.average_bill || 0)) }}
								</template>
								<div class="insight-row__meta">
									{{ __("Profit") }}:
									{{ formatMoney(Number(row.profit_amount || 0)) }} .
									{{ __("Stock") }}:
									{{ formatQuantity(Number(row.stock_qty || 0)) }} .
									{{ __("Low Stock") }}:
									{{ formatQuantity(Number(row.low_stock_count || 0)) }}
								</div>
								<v-progress-linear
									:model-value="trendProgress(Number(row.sales_amount || 0), salesMax)"
									color="primary"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No branch/location data found.')" />
					</TrendPanel>

					<TrendPanel :title="__('Top Items by Location')">
						<div v-if="topItemsByLocation.length" class="list-stack trend-list">
							<InsightRow
								v-for="location in topItemsByLocation"
								:key="`branch-items-${location.profile}`"
								:title="location.profile || '-'"
								:value="location.warehouse || '-'"
							>
								<div
									v-for="item in location.items || []"
									:key="`branch-item-${location.profile}-${item.item_code}`"
									class="insight-row__meta"
								>
									{{ item.item_name || item.item_code || "-" }}:
									{{ formatMoney(Number(item.sales_amount || 0)) }}
								</div>
								<div v-if="!(location.items || []).length" class="insight-row__meta">
									{{ __("No top items found for this location.") }}
								</div>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No location-wise top item data found.')" />
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
	summary: DashboardRow;
	locationRows: DashboardRow[];
	topItemsByLocation: DashboardRow[];
	salesMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
