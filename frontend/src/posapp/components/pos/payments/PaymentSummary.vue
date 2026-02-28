<template>
	<v-row v-if="invoice_doc" class="payment-summary-grid" dense>
		<v-col cols="7">
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
		<v-col cols="5">
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

		<!-- Paid Change (if applicable) -->
		<v-col cols="7" v-if="invoice_doc && change_due > 0 && !invoice_doc.is_return">
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
		<v-col cols="5" v-if="invoice_doc && change_due > 0 && !invoice_doc.is_return">
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
defineProps({
	invoice_doc: Object,
	total_payments_display: String,
	diff_payment_display: String,
	diff_label: String,
	change_due: Number,
	paid_change: Number,
	credit_change: Number,
	paid_change_rules: Array,
	currencySymbol: Function,
	formatCurrency: Function,
});

defineEmits(["show-paid-amount", "show-diff-payment", "show-paid-change", "update-credit-change"]);

const frappe = window.frappe;
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
</style>
