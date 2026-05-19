<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">
						{{ __("Reorder / Purchase Suggestions") }}
					</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabel }}
						</v-chip>
						<v-chip size="small" color="error" variant="tonal">
							{{ __("Critical") }}:
							{{ formatQuantity(Number(summary.critical_count || 0)) }}
						</v-chip>
						<v-chip size="small" color="warning" variant="tonal">
							{{ __("High") }}:
							{{ formatQuantity(Number(summary.high_count || 0)) }}
						</v-chip>
						<v-chip size="small" color="success" variant="tonal">
							{{ __("Suggested Qty") }}:
							{{ formatQuantity(Number(summary.total_suggested_qty || 0)) }}
						</v-chip>
						<v-chip size="small" color="primary" variant="tonal">
							{{ __("Est. Purchase") }}:
							{{ formatMoney(Number(summary.estimated_purchase_value || 0)) }}
						</v-chip>
					</div>
				</div>

				<div v-if="suggestions.length" class="list-stack">
					<InsightRow
						v-for="row in suggestions"
						:key="`reorder-${row.item_code}`"
						:title="row.item_name || row.item_code || '-'"
					>
						<template #value>
							<v-chip size="x-small" :color="urgencyColor(row.urgency)" variant="flat">
								{{ urgencyLabel(row.urgency) }}
							</v-chip>
						</template>
						<template #meta>
							{{ row.item_code }} . {{ __("Current") }}:
							{{ formatQuantity(Number(row.current_qty || 0)) }} .
							{{ __("Suggested") }}:
							{{ formatQuantity(Number(row.suggested_qty || 0)) }}
						</template>
						<div class="insight-row__meta">
							{{ __("Daily Sales") }}:
							{{ formatQuantity(Number(row.avg_daily_sales || 0)) }} .
							{{ __("Lead Time") }}: {{ formatDays(row.lead_time_days) }} .
							{{ __("Cover") }}: {{ formatDays(row.stock_cover_days) }}
						</div>
						<div class="insight-row__meta">
							{{ __("Supplier") }}: {{ row.supplier || __("Not Set") }} .
							{{ __("Est. Value") }}:
							{{ formatMoney(Number(row.estimated_purchase_value || 0)) }}
						</div>
					</InsightRow>
				</div>
				<EmptyState v-else :message="__('No reorder suggestions right now.')" />
			</v-card>
		</v-col>
	</v-row>
</template>

<script setup lang="ts">
import EmptyState from "./EmptyState.vue";
import InsightRow from "./InsightRow.vue";

type DashboardRow = Record<string, any>;

defineProps<{
	rangeLabel: string;
	summary: DashboardRow;
	suggestions: DashboardRow[];
	formatMoney: (value: number) => string;
	formatQuantity: (value: number) => string;
	formatDays: (value?: number | null) => string;
	urgencyLabel: (value?: string) => string;
	urgencyColor: (value?: string) => string;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
