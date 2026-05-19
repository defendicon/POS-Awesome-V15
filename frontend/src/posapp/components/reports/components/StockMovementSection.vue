<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Stock Movement Report") }}
					</h2>
					<v-chip size="small" color="info" variant="tonal">
						{{ rangeLabel }}
					</v-chip>
				</div>

				<div class="summary-grid">
					<SummaryMetric
						:label="__('Movements')"
						:value="formatQuantity(Number(summary.movement_count || 0))"
					/>
					<SummaryMetric
						:label="__('Total Out')"
						:value="formatQuantity(Number(outgoingQty || 0))"
					/>
					<SummaryMetric
						:label="__('Total In')"
						:value="formatQuantity(Number(incomingQty || 0))"
						value-class="summary-metric__value--success"
					/>
					<SummaryMetric
						:label="__('Net Qty')"
						:value="formatSignedQuantity(Number(summary.net_qty || 0))"
					/>
					<SummaryMetric
						:label="__('Net Value')"
						:value="formatMoney(Number(summary.net_value || 0))"
					/>
				</div>

				<div class="trend-grid trend-grid--two">
					<TrendPanel :title="__('Day-wise Movement')">
						<div v-if="dayRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in dayRows"
								:key="`move-day-${row.date}`"
								:title="formatDate(row.date)"
							>
								<template #value>
									{{ __("Net") }}:
									{{ formatSignedQuantity(Number(row.net || 0)) }}
								</template>
								<template #meta>
									{{ __("In") }}:
									{{ formatQuantity(Number(row.incoming || 0)) }} .
									{{ __("Out") }}:
									{{ formatQuantity(Number(row.outgoing || 0)) }} .
									{{ __("Entries") }}:
									{{ formatQuantity(Number(row.movement_count || 0)) }}
								</template>
								<v-progress-linear
									:model-value="
										trendProgress(
											Number(row.incoming || 0) + Number(row.outgoing || 0),
											dayMax,
										)
									"
									color="primary"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No stock movement for this period.')" />
					</TrendPanel>

					<TrendPanel :title="__('Recent Movement Entries')">
						<div v-if="recentRows.length" class="list-stack trend-list">
							<InsightRow
								v-for="row in recentRows"
								:key="`move-row-${row.voucher_type}-${row.voucher_no}-${row.item_code}-${row.warehouse}`"
								:title="row.item_name || row.item_code || '-'"
								:value="formatSignedQuantity(Number(row.qty || 0))"
							>
								<template #meta>
									{{ formatDate(row.posting_date) }} .
									{{ formatMovementCategory(row.category) }} .
									{{ row.direction || "-" }}
								</template>
								<div class="insight-row__meta">
									{{ row.warehouse || "-" }} . {{ row.voucher_type || "-" }}
									{{ row.voucher_no || "-" }}
								</div>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No recent stock entries found.')" />
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
	incomingQty: number;
	outgoingQty: number;
	dayRows: DashboardRow[];
	recentRows: DashboardRow[];
	dayMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	formatSignedQuantity: (value: number) => string;
	formatDate: (value?: string) => string;
	formatMovementCategory: (value?: string) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
