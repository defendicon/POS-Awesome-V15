<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Discount / Void / Return Report") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabel }}
						</v-chip>
						<v-chip size="small" color="warning" variant="tonal">
							{{ __("Discount") }}:
							{{ formatMoney(Number(totals.discount_amount || 0)) }}
						</v-chip>
						<v-chip size="small" color="primary" variant="tonal">
							{{ __("Returns") }}:
							{{ formatMoney(Number(totals.return_amount || 0)) }}
						</v-chip>
						<v-chip size="small" color="error" variant="tonal">
							{{ __("Voids") }}:
							{{ formatMoney(Number(totals.void_amount || 0)) }}
						</v-chip>
					</div>
				</div>

				<div class="summary-grid">
					<SummaryMetric
						:label="__('Discounted Invoices')"
						:value="formatQuantity(Number(totals.discounted_invoice_count || 0))"
					/>
					<SummaryMetric
						:label="__('Return Count')"
						:value="formatQuantity(Number(totals.return_count || 0))"
					/>
					<SummaryMetric
						:label="__('Void Count')"
						:value="formatQuantity(Number(totals.void_count || 0))"
						value-class="summary-metric__value--danger"
					/>
					<SummaryMetric
						:label="__('Discount Amount')"
						:value="formatMoney(Number(totals.discount_amount || 0))"
					/>
					<SummaryMetric
						:label="__('Return Amount')"
						:value="formatMoney(Number(totals.return_amount || 0))"
					/>
					<SummaryMetric
						:label="__('Void Amount')"
						:value="formatMoney(Number(totals.void_amount || 0))"
						value-class="summary-metric__value--danger"
					/>
				</div>

				<div class="trend-grid">
					<TrendPanel :title="__('Cashier-wise')">
						<div v-if="cashierRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in cashierRows"
								:key="`dvr-cashier-${row.cashier}`"
								:title="row.cashier || __('Unknown')"
								:value="formatMoney(Number(row.void_amount || 0) + Number(row.return_amount || 0))"
							>
								<template #meta>
									{{ __("Discount") }}:
									{{ formatMoney(Number(row.discount_amount || 0)) }} .
									{{ __("Returns") }}:
									{{ formatQuantity(Number(row.return_count || 0)) }} .
									{{ __("Voids") }}:
									{{ formatQuantity(Number(row.void_count || 0)) }}
								</template>
								<v-progress-linear
									:model-value="
										trendProgress(
											Number(row.discount_amount || 0) +
												Number(row.return_amount || 0) +
												Number(row.void_amount || 0),
											cashierMax,
										)
									"
									color="error"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No cashier-wise discount/void/return activity.')" />
					</TrendPanel>

					<TrendPanel :title="__('Top Return Items')">
						<div v-if="topReturnItems.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in topReturnItems"
								:key="`dvr-item-${row.item_code || row.item_name}`"
								:title="row.item_name || row.item_code || '-'"
								:value="formatMoney(Number(row.return_amount || 0))"
							>
								<template #meta>
									{{ row.item_code || "-" }} . {{ __("Qty") }}:
									{{ formatQuantity(Number(row.return_qty || 0)) }}
									{{ row.stock_uom || "" }} . {{ __("Invoices") }}:
									{{ formatQuantity(Number(row.return_invoice_count || 0)) }}
								</template>
								<v-progress-linear
									:model-value="trendProgress(Number(row.return_amount || 0), returnItemMax)"
									color="primary"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No return item trend found.')" />
					</TrendPanel>

					<TrendPanel :title="__('Last 14 Days Activity')">
						<div v-if="dayRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in dayRows"
								:key="`dvr-day-${row.date}`"
								:title="formatDate(row.date)"
								:value="
									formatMoney(
										Number(row.discount_amount || 0) +
											Number(row.return_amount || 0) +
											Number(row.void_amount || 0),
									)
								"
							>
								<template #meta>
									{{ __("Discount") }}:
									{{ formatMoney(Number(row.discount_amount || 0)) }} .
									{{ __("Returns") }}:
									{{ formatQuantity(Number(row.return_count || 0)) }} .
									{{ __("Voids") }}:
									{{ formatQuantity(Number(row.void_count || 0)) }}
								</template>
								<v-progress-linear
									:model-value="
										trendProgress(
											Number(row.discount_amount || 0) +
												Number(row.return_amount || 0) +
												Number(row.void_amount || 0),
											dayMax,
										)
									"
									color="warning"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No day-wise discount/void/return trend.')" />
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
	totals: DashboardRow;
	cashierRows: DashboardRow[];
	topReturnItems: DashboardRow[];
	dayRows: DashboardRow[];
	cashierMax: number;
	returnItemMax: number;
	dayMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	formatDate: (value?: string) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
