<template>
	<v-row class="dashboard-grid mb-2">
			<v-col cols="12">
				<v-card class="dashboard-card" elevation="2">
					<div class="dashboard-card__header">
						<h2 class="text-subtitle-1 font-weight-bold mb-0">
							{{ __("Profitability Report") }}
						</h2>
						<div class="dashboard-chip-row">
							<v-chip size="small" color="info" variant="tonal">
								{{ profitabilityRangeLabel }}
							</v-chip>
							<v-chip size="small" color="success" variant="tonal">
								{{ __("Top Profit Item") }}: {{ topProfitItemLabel }}
							</v-chip>
							<v-chip size="small" color="warning" variant="tonal">
								{{ __("Lowest Margin") }}: {{ lowestMarginItemLabel }}
							</v-chip>
						</div>
					</div>

					<div class="summary-grid">
						<SummaryMetric
							:label="__('Revenue')"
							:value="formatMoney(Number(profitabilitySummary.revenue || 0))"
						/>
						<SummaryMetric
							:label="__('COGS')"
							:value="formatMoney(Number(profitabilitySummary.cogs || 0))"
						/>
						<SummaryMetric
							:label="__('Gross Profit')"
							:value="formatMoney(Number(profitabilitySummary.gross_profit || 0))"
							:value-class="
								Number(profitabilitySummary.gross_profit || 0) < 0
									? 'summary-metric__value--danger'
									: ''
							"
						/>
						<SummaryMetric
							:label="__('Gross Margin')"
							:value="formatPercent(profitabilitySummary.gross_margin_pct, 1)"
						/>
						<SummaryMetric
							:label="__('Invoices')"
							:value="formatQuantity(Number(profitabilitySummary.invoice_count || 0))"
						/>
						<SummaryMetric
							:label="__('Avg Invoice Profit')"
							:value="
								formatMoney(Number(profitabilitySummary.average_invoice_profit || 0))
							"
						/>
					</div>

					<div class="trend-grid">
						<TrendPanel :title="__('Item-wise Profitability')">
							<div v-if="profitabilityItemRows.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in profitabilityItemRows"
									:key="`profit-item-${row.item_code}`"
									:title="row.item_name || row.item_code || '-'"
									:value="formatMoney(Number(row.gross_profit || 0))"
								>
									<template #meta>
										{{ __("Revenue") }}:
										{{ formatMoney(Number(row.revenue || 0)) }} . {{ __("COGS") }}:
										{{ formatMoney(Number(row.cogs || 0)) }} . {{ __("Margin") }}:
										{{ formatPercent(row.gross_margin_pct, 1) }}
									</template>
									<v-progress-linear
										:model-value="
											trendProgress(Number(row.gross_profit || 0), profitabilityItemMax)
										"
										color="success"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No item profitability data found.')" />
						</TrendPanel>

						<TrendPanel :title="__('Category-wise Margin')">
							<div v-if="profitabilityCategoryRows.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in profitabilityCategoryRows"
									:key="`profit-cat-${row.category || row.label}`"
									:title="row.label || row.category || '-'"
									:value="formatMoney(Number(row.gross_profit || 0))"
								>
									<template #meta>
										{{ __("Revenue") }}:
										{{ formatMoney(Number(row.revenue || 0)) }} . {{ __("Margin") }}:
										{{ formatPercent(row.gross_margin_pct, 1) }} . {{ __("Items") }}:
										{{ formatQuantity(Number(row.item_count || 0)) }}
									</template>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No category profitability data found.')" />
						</TrendPanel>

						<TrendPanel :title="__('Last 14 Days Gross Profit')">
							<div v-if="profitabilityDayRows.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in profitabilityDayRows"
									:key="`profit-day-${row.date}`"
									:title="formatDate(row.date)"
									:value="formatMoney(Number(row.gross_profit || 0))"
								>
									<template #meta>
										{{ __("Revenue") }}:
										{{ formatMoney(Number(row.revenue || 0)) }} . {{ __("COGS") }}:
										{{ formatMoney(Number(row.cogs || 0)) }} . {{ __("Invoices") }}:
										{{ formatQuantity(Number(row.invoice_count || 0)) }}
									</template>
									<v-progress-linear
										:model-value="
											trendProgress(Number(row.gross_profit || 0), profitabilityDayMax)
										"
										color="primary"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No day-wise profitability trend found.')" />
						</TrendPanel>
					</div>
				</v-card>
			</v-col>
	</v-row>

	<v-row class="dashboard-grid mb-2">
			<v-col cols="12">
				<v-card class="dashboard-card" elevation="2">
					<div class="dashboard-card__header">
						<h2 class="text-subtitle-1 font-weight-bold mb-0">
							{{ __("Tax / Charges Report") }}
						</h2>
						<div class="dashboard-chip-row">
							<v-chip size="small" color="info" variant="tonal">
								{{ taxChargesRangeLabel }}
							</v-chip>
							<v-chip size="small" color="primary" variant="tonal">
								{{ __("Top Tax Head") }}: {{ topTaxHeadLabel }}
							</v-chip>
							<v-chip size="small" color="warning" variant="tonal">
								{{ __("Top Charge Head") }}: {{ topChargeHeadLabel }}
							</v-chip>
						</div>
					</div>

					<div class="summary-grid">
						<SummaryMetric
							:label="__('Invoices')"
							:value="formatQuantity(Number(taxChargesTotals.invoice_count || 0))"
						/>
						<SummaryMetric
							:label="__('Returns')"
							:value="formatQuantity(Number(taxChargesTotals.return_invoice_count || 0))"
						/>
						<SummaryMetric
							:label="__('Taxable Amount')"
							:value="formatMoney(Number(taxChargesTotals.taxable_amount || 0))"
						/>
						<SummaryMetric
							:label="__('Tax')"
							:value="formatMoney(Number(taxChargesTotals.tax_amount || 0))"
						/>
						<SummaryMetric
							:label="__('Service Charges')"
							:value="formatMoney(Number(taxChargesTotals.service_charge_amount || 0))"
						/>
						<SummaryMetric
							:label="__('Fees')"
							:value="formatMoney(Number(taxChargesTotals.fee_amount || 0))"
						/>
						<SummaryMetric
							:label="__('Round Off')"
							:value="formatMoney(Number(taxChargesTotals.round_off_amount || 0))"
						/>
						<SummaryMetric
							:label="__('Invoice Adjustments')"
							:value="formatMoney(Number(taxChargesTotals.invoice_adjustment_amount || 0))"
						/>
						<SummaryMetric
							:label="__('Total Charges')"
							:value="formatMoney(Number(taxChargesTotals.total_charge_amount || 0))"
						/>
					</div>

					<div class="trend-grid">
						<TrendPanel :title="__('Tax Heads')">
							<div v-if="taxHeadRows.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in taxHeadRows"
									:key="`tax-head-${row.label}`"
									:title="row.label || '-'"
									:value="formatMoney(Number(row.amount || 0))"
								>
									<template #meta>
										{{ __("Invoices") }}:
										{{ formatQuantity(Number(row.invoice_count || 0)) }} .
										{{ __("Share") }}: {{ formatPercent(row.share_pct, 1) }}
									</template>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No tax head breakdown found.')" />
						</TrendPanel>

						<TrendPanel :title="__('Charge Heads')">
							<div v-if="chargeHeadRows.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in chargeHeadRows"
									:key="`charge-head-${row.label}`"
									:title="row.label || '-'"
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
							<EmptyState v-else :message="__('No charge head breakdown found.')" />
						</TrendPanel>

						<TrendPanel :title="__('Last 14 Days Tax/Charges')">
							<div v-if="taxChargesDayRows.length" class="list-stack trend-list">
								<InsightRow
									v-for="row in taxChargesDayRows"
									:key="`tax-day-${row.date}`"
									:title="formatDate(row.date)"
									:value="formatMoney(Number(row.total_charge_amount || 0))"
								>
									<template #meta>
										{{ __("Tax") }}:
										{{ formatMoney(Number(row.tax_amount || 0)) }} .
										{{ __("Charges") }}:
										{{
											formatMoney(
												Number(row.service_charge_amount || 0) +
													Number(row.fee_amount || 0) +
													Number(row.other_charge_amount || 0),
											)
										}}
										. {{ __("Invoices") }}:
										{{ formatQuantity(Number(row.invoice_count || 0)) }}
									</template>
									<v-progress-linear
										:model-value="
											trendProgress(Number(row.total_charge_amount || 0), taxDayMax)
										"
										color="warning"
										height="5"
										rounded
									/>
								</InsightRow>
							</div>
							<EmptyState v-else :message="__('No day-wise tax/charges trend found.')" />
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
	profitabilityRangeLabel: string;
	topProfitItemLabel: string;
	lowestMarginItemLabel: string;
	profitabilitySummary: DashboardRow;
	profitabilityItemRows: DashboardRow[];
	profitabilityCategoryRows: DashboardRow[];
	profitabilityDayRows: DashboardRow[];
	profitabilityItemMax: number;
	profitabilityDayMax: number;
	taxChargesRangeLabel: string;
	topTaxHeadLabel: string;
	topChargeHeadLabel: string;
	taxChargesTotals: DashboardRow;
	taxHeadRows: DashboardRow[];
	chargeHeadRows: DashboardRow[];
	taxChargesDayRows: DashboardRow[];
	taxDayMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	formatDate: (value?: string) => string;
	formatPercent: (value?: number | null, digits?: number) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
