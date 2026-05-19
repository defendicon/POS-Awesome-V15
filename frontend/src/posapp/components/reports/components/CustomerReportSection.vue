<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Customer Report") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabel }}
						</v-chip>
						<v-chip size="small" color="primary" variant="tonal">
							{{ __("Repeat Rate") }}:
							{{ formatPercent(summary.repeat_customer_rate_pct, 1) }}
						</v-chip>
						<v-chip size="small" color="success" variant="tonal">
							{{ __("Sales") }}:
							{{ formatMoney(Number(summary.sales_amount || 0)) }}
						</v-chip>
					</div>
				</div>

				<div class="summary-grid">
					<SummaryMetric
						:label="__('Customers')"
						:value="formatQuantity(Number(summary.customer_count || 0))"
					/>
					<SummaryMetric
						:label="__('Repeat Customers')"
						:value="formatQuantity(Number(summary.repeat_customer_count || 0))"
					/>
					<SummaryMetric
						:label="__('Invoices')"
						:value="formatQuantity(Number(summary.invoice_count || 0))"
					/>
					<SummaryMetric
						:label="__('Average Basket')"
						:value="formatMoney(Number(summary.average_basket_size || 0))"
					/>
					<SummaryMetric
						:label="__('Avg Purchase Frequency')"
						:value="formatDays(summary.average_purchase_frequency_days)"
					/>
				</div>

				<div class="trend-grid">
					<TrendPanel :title="__('Top Customers')">
						<div v-if="topRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in topRows"
								:key="`cust-top-${row.customer}`"
								:title="row.customer_name || row.customer || '-'"
								:value="formatMoney(Number(row.sales_amount || 0))"
							>
								<template #meta>
									{{ row.customer || "-" }} . {{ __("Invoices") }}:
									{{ formatQuantity(Number(row.invoice_count || 0)) }} .
									{{ __("Avg Bill") }}:
									{{ formatMoney(Number(row.average_basket_size || 0)) }}
								</template>
								<v-progress-linear
									:model-value="trendProgress(Number(row.sales_amount || 0), salesMax)"
									color="primary"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No customer sales data found.')" />
					</TrendPanel>

					<TrendPanel :title="__('Repeat Customers')">
						<div v-if="repeatRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in repeatRows"
								:key="`cust-repeat-${row.customer}`"
								:title="row.customer_name || row.customer || '-'"
								:value="formatQuantity(Number(row.invoice_count || 0))"
							>
								<template #meta>
									{{ __("Sales") }}:
									{{ formatMoney(Number(row.sales_amount || 0)) }} .
									{{ __("Frequency") }}:
									{{ formatDays(row.purchase_frequency_days) }} .
									{{ __("Last") }}:
									{{ formatDate(row.last_purchase_date || undefined) }}
								</template>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No repeat customers in this period.')" />
					</TrendPanel>

					<TrendPanel :title="__('Recently Active Customers')">
						<div v-if="recentRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in recentRows"
								:key="`cust-recent-${row.customer}`"
								:title="row.customer_name || row.customer || '-'"
								:value="formatDate(row.last_purchase_date || undefined)"
							>
								<template #meta>
									{{ __("Invoices") }}:
									{{ formatQuantity(Number(row.invoice_count || 0)) }} .
									{{ __("Sales") }}:
									{{ formatMoney(Number(row.sales_amount || 0)) }} .
									{{ __("Returns") }}:
									{{ formatQuantity(Number(row.return_count || 0)) }}
								</template>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No recent customer activity found.')" />
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
	topRows: DashboardRow[];
	repeatRows: DashboardRow[];
	recentRows: DashboardRow[];
	salesMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	formatDate: (value?: string) => string;
	formatPercent: (value?: number | null, digits?: number) => string;
	formatDays: (value?: number | null) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
