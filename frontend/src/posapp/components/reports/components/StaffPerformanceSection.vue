<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Staff / Cashier Performance Report") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabel }}
						</v-chip>
						<v-chip size="small" color="success" variant="tonal">
							{{ __("Sales") }}:
							{{ formatMoney(Number(summary.sales_amount || 0)) }}
						</v-chip>
						<v-chip size="small" color="warning" variant="tonal">
							{{ __("Discounts") }}:
							{{ formatMoney(Number(summary.discount_amount || 0)) }}
						</v-chip>
						<v-chip size="small" color="error" variant="tonal">
							{{ __("Voids") }}:
							{{ formatQuantity(Number(summary.void_count || 0)) }}
						</v-chip>
					</div>
				</div>

				<div class="summary-grid">
					<SummaryMetric
						:label="__('Cashiers')"
						:value="formatQuantity(Number(summary.cashier_count || 0))"
					/>
					<SummaryMetric
						:label="__('Invoices')"
						:value="formatQuantity(Number(summary.invoice_count || 0))"
					/>
					<SummaryMetric
						:label="__('Items Sold')"
						:value="formatQuantity(Number(summary.items_sold || 0))"
					/>
					<SummaryMetric
						:label="__('Avg Bill')"
						:value="formatMoney(Number(summary.average_bill || 0))"
					/>
					<SummaryMetric
						:label="__('Returns')"
						:value="formatQuantity(Number(summary.return_count || 0))"
					/>
					<SummaryMetric
						:label="__('Voids')"
						:value="formatQuantity(Number(summary.void_count || 0))"
						value-class="summary-metric__value--danger"
					/>
				</div>

				<div class="trend-grid">
					<TrendPanel :title="__('Top Sales by Cashier')">
						<div v-if="cashierRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in cashierRows"
								:key="`staff-sales-${row.cashier}`"
								:title="row.cashier || __('Unknown')"
								:value="formatMoney(Number(row.sales_amount || 0))"
							>
								<template #meta>
									{{ __("Invoices") }}:
									{{ formatQuantity(Number(row.invoice_count || 0)) }} .
									{{ __("Items") }}:
									{{ formatQuantity(Number(row.items_sold || 0)) }} .
									{{ __("Avg Bill") }}:
									{{ formatMoney(Number(row.average_bill || 0)) }}
								</template>
								<v-progress-linear
									:model-value="trendProgress(Number(row.sales_amount || 0), salesMax)"
									color="success"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No staff sales activity found.')" />
					</TrendPanel>

					<TrendPanel :title="__('Most Active Cashiers')">
						<div v-if="invoiceRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in invoiceRows"
								:key="`staff-inv-${row.cashier}`"
								:title="row.cashier || __('Unknown')"
								:value="formatQuantity(Number(row.invoice_count || 0))"
							>
								<template #meta>
									{{ __("Sales") }}:
									{{ formatMoney(Number(row.sales_amount || 0)) }} .
									{{ __("Items/Invoice") }}:
									{{ Number(row.items_per_invoice || 0).toFixed(2) }}
								</template>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No invoice activity found.')" />
					</TrendPanel>

					<TrendPanel :title="__('Returns / Voids / Discounts')">
						<div v-if="riskRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in riskRows"
								:key="`staff-risk-${row.cashier}`"
								:title="row.cashier || __('Unknown')"
								:value="
									formatMoney(Number(row.void_amount || 0) + Number(row.return_amount || 0))
								"
							>
								<template #meta>
									{{ __("Returns") }}:
									{{ formatQuantity(Number(row.return_count || 0)) }} .
									{{ __("Voids") }}:
									{{ formatQuantity(Number(row.void_count || 0)) }} .
									{{ __("Discount") }}:
									{{ formatMoney(Number(row.discount_amount || 0)) }}
								</template>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No risk activity found.')" />
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
	cashierRows: DashboardRow[];
	invoiceRows: DashboardRow[];
	riskRows: DashboardRow[];
	salesMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
