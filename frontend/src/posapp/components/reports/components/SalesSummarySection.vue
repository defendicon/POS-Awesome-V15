<template>
	<v-row class="dashboard-grid mb-2">
		<v-col cols="12">
			<v-card class="dashboard-card" elevation="2">
				<div class="dashboard-card__header">
					<h2 class="text-subtitle-1 font-weight-bold mb-0">{{ title }}</h2>
					<div class="dashboard-chip-row">
						<v-chip size="small" color="info" variant="tonal">
							{{ rangeLabelPrefix }}: {{ rangeLabel }}
						</v-chip>
						<v-chip size="small" :color="hasClosingSnapshot ? 'success' : 'warning'" variant="tonal">
							{{ hasClosingSnapshot ? closingSnapshotLabel : liveSnapshotLabel }}
						</v-chip>
					</div>
				</div>
				<div class="summary-grid">
					<SummaryMetric
						v-for="metric in metrics"
						:key="metric.key"
						:label="metric.label"
						:value="metric.value"
						:value-class="metric.valueClass"
					/>
				</div>
				<div v-if="paymentMethods.length" class="payment-breakdown">
					<div class="summary-metric__label">{{ __("Payment Methods") }}</div>
					<div class="payment-chip-list">
						<v-chip
							v-for="payment in paymentMethods"
							:key="payment.mode_of_payment"
							size="small"
							:color="paymentCategoryColor(payment.category)"
							variant="tonal"
						>
							{{ payment.mode_of_payment }}: {{ formatMoney(payment.amount) }}
						</v-chip>
					</div>
				</div>
			</v-card>
		</v-col>
	</v-row>
</template>

<script setup lang="ts">
import SummaryMetric from "./SummaryMetric.vue";

type PaymentMethod = {
	mode_of_payment: string;
	category?: string;
	amount: number;
};

defineProps<{
	title: string;
	rangeLabelPrefix: string;
	rangeLabel: string;
	hasClosingSnapshot: boolean;
	closingSnapshotLabel: string;
	liveSnapshotLabel: string;
	metrics: Array<{ key: string; label: string; value: string; valueClass?: string }>;
	paymentMethods: PaymentMethod[];
	formatMoney: (value: number) => string;
	paymentCategoryColor: (category?: string) => string;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
