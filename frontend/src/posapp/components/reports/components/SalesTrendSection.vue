<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Sales Trend Report") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabel }}
						</v-chip>
						<v-chip size="small" color="primary" variant="tonal">
							{{ __("Best Day") }}: {{ bestDayLabel }}
						</v-chip>
						<v-chip size="small" color="primary" variant="tonal">
							{{ __("Peak Hour") }}: {{ bestHourLabel }}
						</v-chip>
						<v-chip
							v-for="chip in growthChips"
							:key="chip.key"
							size="small"
							:color="chip.color"
							variant="tonal"
						>
							{{ chip.label }}: {{ chip.value }}
						</v-chip>
					</div>
				</div>

				<div class="trend-grid">
					<TrendPanel :title="__('Day-wise (MTD)')">
						<div v-if="dayPoints.length" class="list-stack trend-list">
							<InsightRow
								v-for="point in dayPoints"
								:key="`day-${point.date}`"
								:title="formatDate(point.date)"
								:value="formatMoney(Number(point.sales || 0))"
							>
								<template #meta>
									{{ __("Invoices") }}:
									{{ formatQuantity(Number(point.invoice_count || 0)) }}
								</template>
								<v-progress-linear
									:model-value="trendProgress(Number(point.sales || 0), dayMax)"
									color="primary"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No day-wise sales trend found.')" />
					</TrendPanel>

					<TrendPanel :title="__('Week-wise')">
						<div v-if="weekPoints.length" class="list-stack trend-list">
							<InsightRow
								v-for="point in weekPoints"
								:key="`week-${point.label}`"
								:title="point.label || '-'"
								:value="formatMoney(Number(point.sales || 0))"
							>
								<template #meta>
									{{ formatDate(point.week_start) }} -
									{{ formatDate(point.week_end) }}
								</template>
								<v-progress-linear
									:model-value="trendProgress(Number(point.sales || 0), weekMax)"
									color="info"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No week-wise sales trend found.')" />
					</TrendPanel>

					<TrendPanel :title="__('Month-wise')">
						<div v-if="monthPoints.length" class="list-stack trend-list">
							<InsightRow
								v-for="point in monthPoints"
								:key="`month-${point.month}`"
								:title="point.label || point.month || '-'"
								:value="formatMoney(Number(point.sales || 0))"
							>
								<template #meta>
									{{ __("Invoices") }}:
									{{ formatQuantity(Number(point.invoice_count || 0)) }}
								</template>
								<v-progress-linear
									:model-value="trendProgress(Number(point.sales || 0), monthMax)"
									color="success"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No month-wise sales trend found.')" />
					</TrendPanel>

					<TrendPanel :title="__('Hourly (Today)')">
						<div v-if="hourPoints.length" class="list-stack trend-list">
							<InsightRow
								v-for="point in hourPoints"
								:key="`hour-${point.hour}`"
								:title="point.label || '-'"
								:value="formatMoney(Number(point.sales || 0))"
							>
								<template #meta>
									{{ __("Invoices") }}:
									{{ formatQuantity(Number(point.invoice_count || 0)) }}
								</template>
								<v-progress-linear
									:model-value="trendProgress(Number(point.sales || 0), hourMax)"
									color="warning"
									height="5"
									rounded
								/>
							</InsightRow>
						</div>
						<EmptyState v-else :message="__('No hourly sales trend found for today.')" />
					</TrendPanel>
				</div>
			</v-card>
		</v-col>
	</v-row>
</template>

<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
import InsightRow from "./InsightRow.vue";
import TrendPanel from "./TrendPanel.vue";

type TrendPoint = Record<string, any>;

defineProps<{
	rangeLabel: string;
	bestDayLabel: string;
	bestHourLabel: string;
	growthChips: Array<{ key: string; label: string; value: string; color: string }>;
	dayPoints: TrendPoint[];
	weekPoints: TrendPoint[];
	monthPoints: TrendPoint[];
	hourPoints: TrendPoint[];
	dayMax: number;
	weekMax: number;
	monthMax: number;
	hourMax: number;
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	formatDate: (value?: string) => string;
	trendProgress: (value: number, maxValue: number) => number;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
