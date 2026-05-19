<template>
	<v-row class="dashboard-grid mt-1">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Supplier Purchase Summary") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabel }}
						</v-chip>
						<v-chip size="small" color="primary" variant="tonal">
							{{ __("Top Supplier") }}: {{ topSupplierLabel }}
						</v-chip>
						<v-chip size="small" color="warning" variant="tonal">
							{{ __("Top Pending") }}: {{ topPendingSupplierLabel }}
						</v-chip>
					</div>
				</div>
				<div class="card-filters">
					<v-text-field
						:model-value="supplierSearch"
						:label="__('Search supplier')"
						density="compact"
						variant="outlined"
						hide-details
						clearable
						prepend-inner-icon="mdi-magnify"
						class="card-filter-input"
						@update:modelValue="emit('update:supplierSearch', String($event || ''))"
					/>
				</div>
				<div class="summary-grid">
					<SummaryMetric
						:label="__('Suppliers')"
						:value="formatQuantity(Number(summary.supplier_count || 0))"
					/>
					<SummaryMetric
						:label="__('Purchase Invoices')"
						:value="formatQuantity(Number(summary.purchase_count || 0))"
					/>
					<SummaryMetric
						:label="__('Purchase Amount')"
						:value="formatMoney(Number(summary.purchase_amount || 0))"
					/>
					<SummaryMetric
						:label="__('Paid Amount')"
						:value="formatMoney(Number(summary.paid_amount || 0))"
						value-class="summary-metric__value--success"
					/>
					<SummaryMetric
						:label="__('Pending Amount')"
						:value="formatMoney(Number(summary.pending_amount || 0))"
						value-class="summary-metric__value--danger"
					/>
					<SummaryMetric
						:label="__('Avg Invoice Value')"
						:value="formatMoney(Number(summary.avg_invoice_value || 0))"
					/>
					<SummaryMetric
						:label="__('Pending Ratio')"
						:value="formatPercent(Number(summary.pending_ratio_pct || 0), 1)"
					/>
				</div>

				<div v-if="loading" class="py-2">
					<v-skeleton-loader type="list-item-two-line" class="mb-2" />
					<v-skeleton-loader type="list-item-two-line" class="mb-2" />
					<v-skeleton-loader type="list-item-two-line" />
				</div>

				<div v-else-if="supplierRows.length" class="list-stack">
					<div class="trend-grid">
						<TrendPanel :title="__('Top Suppliers by Spend')">
							<div v-if="supplierRows.length" class="list-stack trend-list">
								<InsightRow
									v-for="supplier in supplierRows"
									:key="`supplier-top-${supplier.supplier}`"
									:title="supplier.supplier_name || supplier.supplier || '-'"
									:value="formatMoney(Number(supplier.purchase_amount || 0))"
								>
									<template #meta>
										{{ __("Invoices") }}:
										{{ formatQuantity(Number(supplier.purchase_count || 0)) }} .
										{{ __("Share") }}:
										{{ formatPercent(supplier.share_pct, 1) }}
									</template>
									<v-progress-linear
										:model-value="
											trendProgress(
												Number(supplier.purchase_amount || 0),
												purchaseMax,
											)
										"
										color="primary"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No suppliers found for this period.')" />
						</TrendPanel>

						<TrendPanel :title="__('Pending Exposure')">
							<div v-if="riskRows.length" class="list-stack trend-list">
								<InsightRow
									v-for="supplier in riskRows"
									:key="`supplier-risk-${supplier.supplier}`"
									:title="supplier.supplier_name || supplier.supplier || '-'"
									:value="formatMoney(Number(supplier.pending_amount || 0))"
								>
									<template #meta>
										{{ __("Pending Ratio") }}:
										{{ formatPercent(supplier.pending_ratio_pct, 1) }} .
										{{ __("Total Purchase") }}:
										{{ formatMoney(Number(supplier.purchase_amount || 0)) }}
									</template>
									<v-progress-linear
										:model-value="
											trendProgress(Number(supplier.pending_amount || 0), pendingMax)
										"
										color="error"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No pending balances in this period.')" />
						</TrendPanel>

						<TrendPanel :title="__('Last 14 Days Purchases')">
							<div v-if="dayRows.length" class="list-stack trend-list">
								<InsightRow
									v-for="day in dayRows"
									:key="`supplier-day-${day.date}`"
									:title="formatDate(day.date)"
									:value="formatMoney(Number(day.purchase_amount || 0))"
								>
									<template #meta>
										{{ __("Invoices") }}:
										{{ formatQuantity(Number(day.purchase_count || 0)) }} .
										{{ __("Pending") }}:
										{{ formatMoney(Number(day.pending_amount || 0)) }}
									</template>
									<v-progress-linear
										:model-value="
											trendProgress(Number(day.purchase_amount || 0), dayMax)
										"
										color="success"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No day-wise purchase data found.')" />
						</TrendPanel>
					</div>

					<div class="summary-metric__label mt-2">
						{{ __("Detailed Supplier Breakdown") }}
					</div>
					<div
						v-for="supplier in supplierRows"
						:key="supplier.supplier"
						class="supplier-row"
					>
						<div class="supplier-row__headline">
							<div class="supplier-row__name">
								{{ supplier.supplier_name || supplier.supplier }}
							</div>
							<div class="supplier-row__amount">
								{{ formatMoney(Number(supplier.purchase_amount || 0)) }}
							</div>
						</div>
						<div class="supplier-row__meta">
							{{ __("Invoices") }}:
							{{ formatQuantity(Number(supplier.purchase_count || 0)) }} .
							{{ __("Avg Invoice") }}:
							{{ formatMoney(Number(supplier.avg_invoice_value || 0)) }} .
							{{ __("Last") }}: {{ formatDate(supplier.last_purchase_date) }}
						</div>
						<div class="supplier-row__meta">
							{{ __("Paid") }}:
							{{ formatMoney(Number(supplier.paid_amount || 0)) }} .
							{{ __("Pending") }}:
							{{ formatMoney(Number(supplier.pending_amount || 0)) }} .
							{{ __("Pending Ratio") }}:
							{{ formatPercent(supplier.pending_ratio_pct, 1) }}
						</div>
					</div>
				</div>

				<EmptyState v-else :message="__('No supplier purchases found in this month.')" />
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
	loading: boolean;
	rangeLabel: string;
	topSupplierLabel: string;
	topPendingSupplierLabel: string;
	supplierSearch: string;
	summary: DashboardRow;
	supplierRows: DashboardRow[];
	riskRows: DashboardRow[];
	dayRows: DashboardRow[];
	purchaseMax: number;
	pendingMax: number;
	dayMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	formatPercent: (value?: number | null, digits?: number) => string;
	formatDate: (value?: string) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const emit = defineEmits<{
	(event: "update:supplierSearch", value: string): void;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
