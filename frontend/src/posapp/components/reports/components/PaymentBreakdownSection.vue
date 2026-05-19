<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Payment Method Report") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabel }}
						</v-chip>
						<v-chip size="small" color="success" variant="tonal">
							{{ __("Collected") }}:
							{{ formatMoney(Number(totals.collected_amount || 0)) }}
						</v-chip>
						<v-chip size="small" color="warning" variant="tonal">
							{{ __("Pending") }}:
							{{ formatMoney(Number(totals.pending_amount || 0)) }}
						</v-chip>
						<v-chip size="small" color="primary" variant="tonal">
							{{ __("Split Invoices") }}:
							{{ formatQuantity(Number(totals.split_invoice_count || 0)) }}
						</v-chip>
					</div>
				</div>

				<div class="summary-grid">
					<SummaryMetric
						:label="__('Invoices')"
						:value="formatQuantity(Number(totals.invoice_count || 0))"
					/>
					<SummaryMetric
						:label="__('Pending Invoices')"
						:value="formatQuantity(Number(totals.pending_invoice_count || 0))"
						value-class="summary-metric__value--danger"
					/>
					<SummaryMetric
						:label="__('Partial')"
						:value="formatQuantity(Number(totals.partial_invoice_count || 0))"
					/>
					<SummaryMetric
						:label="__('Unpaid')"
						:value="formatQuantity(Number(totals.unpaid_invoice_count || 0))"
						value-class="summary-metric__value--danger"
					/>
					<SummaryMetric
						:label="__('Cash')"
						:value="formatMoney(Number(totals.cash_amount || 0))"
					/>
					<SummaryMetric
						:label="__('Card / Online')"
						:value="formatMoney(Number(totals.card_online_amount || 0))"
					/>
				</div>

				<div class="trend-grid trend-grid--two">
					<TrendPanel :title="__('Method-wise Collections')">
						<div v-if="methodRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in methodRows"
								:key="`pay-method-${row.mode_of_payment}`"
								:title="row.mode_of_payment"
								:value="formatMoney(Number(row.amount || 0))"
							>
								<template #meta>
									{{ __("Category") }}: {{ row.category || "-" }} .
									{{ __("Invoices") }}:
									{{ formatQuantity(Number(row.invoice_count || 0)) }} .
									{{ __("Share") }}: {{ formatPercent(row.share_pct, 1) }}
								</template>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No payment collection data found.')" />
					</TrendPanel>

					<TrendPanel :title="__('Last 14 Days (Paid vs Pending)')">
						<div v-if="dayRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in dayRows"
								:key="`pay-day-${row.date}`"
								:title="formatDate(row.date)"
								:value="formatMoney(Number(row.paid_amount || 0))"
							>
								<template #meta>
									{{ __("Pending") }}:
									{{ formatMoney(Number(row.pending_amount || 0)) }} .
									{{ __("Invoices") }}:
									{{ formatQuantity(Number(row.invoice_count || 0)) }}
								</template>
								<v-progress-linear
									:model-value="
										trendProgress(
											Number(row.paid_amount || 0) + Number(row.pending_amount || 0),
											dayMax,
										)
									"
									color="info"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No day-wise payment data found.')" />
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
	methodRows: DashboardRow[];
	dayRows: DashboardRow[];
	dayMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	formatDate: (value?: string) => string;
	formatPercent: (value?: number | null, digits?: number) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
