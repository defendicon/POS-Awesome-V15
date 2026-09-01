<template>
	<v-row v-if="invoice_doc" class="payment-summary-grid" dense>
		<v-col cols="12" sm="7" class="payment-summary-grid__paid">
			<v-text-field
				variant="solo"
				color="primary"
				:label="frappe._('Paid Amount')"
				class="sleek-field pos-themed-input"
				hide-details
				:model-value="total_payments_display"
				readonly
				:prefix="currencySymbol(invoice_doc.currency)"
				density="compact"
				@click="$emit('show-paid-amount')"
			></v-text-field>
		</v-col>
		<v-col cols="12" sm="5" class="payment-summary-grid__difference" :data-state="settlementState">
			<v-text-field
				variant="solo"
				color="primary"
				:label="diff_label"
				class="sleek-field pos-themed-input"
				hide-details
				:model-value="diff_payment_display"
				:prefix="currencySymbol(invoice_doc.currency)"
				density="compact"
				@focus="$emit('show-diff-payment')"
				persistent-placeholder
			></v-text-field>
		</v-col>

		<v-col v-if="baseCurrency" cols="12">
			<div
				class="payment-summary-base"
				:data-state="baseSettlementState"
				data-test="payment-base-settlement"
			>
				<div>
					<p class="payment-summary-base__label">{{ baseSettlementLabel }}</p>
					<p class="payment-summary-base__meta">
						{{ frappe._("Exact company-currency settlement") }}
					</p>
				</div>
				<strong class="payment-summary-base__amount">
					{{ currencySymbol(baseCurrency) }}
					{{ formatCurrency(Math.abs(baseSettlement?.difference || 0)) }}
				</strong>
			</div>
		</v-col>

		<v-col v-if="invoice_doc && giftCardAppliedAmount > 0" cols="12">
			<div class="payment-summary-pill payment-summary-pill--gift-card">
				<div class="payment-summary-pill__copy">
					<p class="payment-summary-pill__label">{{ frappe._("Gift Card Applied") }}</p>
					<h4 class="payment-summary-pill__amount">
						{{ formatCurrency(giftCardAppliedAmount) }}
					</h4>
					<p class="payment-summary-pill__meta">
						{{ giftCardCode || frappe._("Gift card") }}
						<span class="payment-summary-pill__dot">•</span>
						{{ frappe._("Included in settlement") }}
					</p>
				</div>
				<span class="payment-summary-pill__state">{{ frappe._("Applied") }}</span>
			</div>
		</v-col>

		<!-- Paid Change (if applicable) -->
		<v-col cols="12" sm="7" v-if="invoice_doc && change_due > 0 && !invoice_doc.is_return">
			<v-text-field
				variant="solo"
				color="primary"
				:label="frappe._('Paid Change')"
				class="sleek-field pos-themed-input"
				:model-value="formatCurrency(paid_change)"
				:prefix="currencySymbol(invoice_doc.currency)"
				:rules="paid_change_rules"
				density="compact"
				readonly
				type="text"
				@click="$emit('show-paid-change')"
			></v-text-field>
		</v-col>

		<!-- Credit Change (if applicable) -->
		<v-col cols="12" sm="5" v-if="invoice_doc && change_due > 0 && !invoice_doc.is_return">
			<v-text-field
				variant="solo"
				color="primary"
				:label="frappe._('Credit Change')"
				class="sleek-field pos-themed-input"
				:model-value="formatCurrency(Math.abs(credit_change))"
				:prefix="currencySymbol(invoice_doc.currency)"
				density="compact"
				type="text"
				@change="$emit('update-credit-change', $event)"
			></v-text-field>
		</v-col>
	</v-row>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
	invoice_doc: Object,
	total_payments_display: String,
	diff_payment_display: String,
	diff_label: String,
	diffPayment: {
		type: Number,
		default: 0,
	},
	change_due: Number,
	baseSettlement: Object,
	baseCurrency: String,
	paid_change: Number,
	credit_change: Number,
	paid_change_rules: Array,
	currencySymbol: Function,
	formatCurrency: Function,
	giftCardAppliedAmount: {
		type: Number,
		default: 0,
	},
	giftCardCode: {
		type: String,
		default: "",
	},
});

defineEmits(["show-paid-amount", "show-diff-payment", "show-paid-change", "update-credit-change"]);

const frappe = window.frappe;

const baseSettlementState = computed(() => {
	const difference = Number(props.baseSettlement?.difference || 0);
	if (difference > 0) return "remaining";
	if (difference < 0) return "change";
	return "balanced";
});

const settlementState = computed(() => {
	const difference = Number(props.diffPayment || 0);
	if (difference > 0) return "remaining";
	if (difference < 0) return "change";
	return "balanced";
});

const baseSettlementLabel = computed(() => {
	if (baseSettlementState.value === "remaining") return frappe._("Base Remaining");
	if (baseSettlementState.value === "change") return frappe._("Base Change");
	return frappe._("Base Difference");
});
</script>

<style scoped>
.payment-summary-grid {
	margin: 0;
	row-gap: var(--pos-space-2);
}

.payment-summary-grid :deep(.v-col) {
	padding-top: 0;
	padding-bottom: 0;
}

.payment-summary-grid :deep(.v-field) {
	border-radius: var(--pos-radius-sm);
	background: var(--pos-surface-raised);
}

.payment-summary-grid__paid :deep(.v-field),
.payment-summary-grid__difference :deep(.v-field) {
	border: 1px solid var(--pos-border);
	box-shadow: none;
}

.payment-summary-grid__paid :deep(.v-field) {
	border-inline-start: 4px solid var(--pos-primary);
}

.payment-summary-grid__paid :deep(input),
.payment-summary-grid__difference :deep(input) {
	font-size: 1.05rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.payment-summary-grid__difference[data-state="remaining"] :deep(.v-field) {
	border-color: color-mix(in srgb, var(--pos-error) 58%, var(--pos-border));
	background: var(--pos-error-container);
}

.payment-summary-grid__difference[data-state="change"] :deep(.v-field) {
	border-color: color-mix(in srgb, var(--pos-warning) 58%, var(--pos-border));
	background: var(--pos-warning-container);
}

.payment-summary-grid__difference[data-state="balanced"] :deep(.v-field) {
	border-color: color-mix(in srgb, var(--pos-success) 58%, var(--pos-border));
	background: var(--pos-success-container);
}

.payment-summary-base {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--pos-space-3);
	padding: 10px 14px;
	border: 1px solid var(--pos-border);
	border-radius: var(--pos-radius-sm);
	background: var(--pos-surface-raised);
}

.payment-summary-base[data-state="change"] {
	border-color: rgba(var(--v-theme-warning), 0.35);
	background: rgba(var(--v-theme-warning), 0.08);
}

.payment-summary-base[data-state="remaining"] {
	border-color: rgba(var(--v-theme-error), 0.3);
	background: rgba(var(--v-theme-error), 0.06);
}

.payment-summary-base__label,
.payment-summary-base__meta {
	margin: 0;
}

.payment-summary-base__label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.payment-summary-base__meta {
	font-size: 0.72rem;
	color: var(--pos-text-secondary);
}

.payment-summary-base__amount {
	white-space: nowrap;
	color: var(--pos-text-primary);
}

.payment-summary-pill {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--pos-space-3);
	padding: 14px 16px;
	border-radius: var(--pos-radius-md);
	background:
		linear-gradient(
			180deg,
			rgba(var(--v-theme-success), 0.1) 0%,
			rgba(var(--v-theme-success), 0.04) 100%
		),
		var(--pos-surface-raised);
	border: 1px solid rgba(var(--v-theme-success), 0.18);
}

.payment-summary-pill__copy {
	min-width: 0;
}

.payment-summary-pill__label {
	margin: 0;
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.payment-summary-pill__amount {
	margin: 4px 0 0;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.payment-summary-pill__meta {
	margin: 6px 0 0;
	font-size: 0.82rem;
	color: var(--pos-text-secondary);
}

.payment-summary-pill__dot {
	margin: 0 6px;
}

.payment-summary-pill__state {
	display: inline-flex;
	align-items: center;
	padding: 6px 10px;
	border-radius: 999px;
	background: rgba(var(--v-theme-success), 0.12);
	color: rgb(var(--v-theme-success));
	font-size: 0.74rem;
	font-weight: 700;
}
</style>
