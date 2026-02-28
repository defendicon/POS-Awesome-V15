<template>
	<v-row v-if="invoice_doc" class="invoice-totals-grid">
		<v-col cols="6">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="frappe._('Net Total')"
				class="sleek-field pos-themed-input"
				:model-value="formatCurrency(invoice_doc.net_total, displayCurrency)"
				readonly
				:prefix="currencySymbol()"
				persistent-placeholder
			></v-text-field>
		</v-col>
		<v-col cols="6">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="frappe._('Tax and Charges')"
				class="sleek-field pos-themed-input"
				hide-details
				:model-value="formatCurrency(invoice_doc.total_taxes_and_charges, displayCurrency)"
				readonly
				:prefix="currencySymbol()"
				persistent-placeholder
			></v-text-field>
		</v-col>
		<v-col cols="6">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="frappe._('Total Amount')"
				class="sleek-field pos-themed-input"
				hide-details
				:model-value="formatCurrency(invoice_doc.total, displayCurrency)"
				readonly
				:prefix="currencySymbol()"
				persistent-placeholder
			></v-text-field>
		</v-col>
		<v-col cols="6">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="diff_label"
				class="sleek-field pos-themed-input"
				hide-details
				:model-value="
					formatCurrency(diff_payment < 0 ? -diff_payment : diff_payment, displayCurrency)
				"
				readonly
				:prefix="currencySymbol()"
				persistent-placeholder
			></v-text-field>
		</v-col>
		<v-col cols="6">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="frappe._('Discount Amount')"
				class="sleek-field pos-themed-input"
				hide-details
				:model-value="formatCurrency(invoice_doc.discount_amount)"
				readonly
				:prefix="currencySymbol(invoice_doc.currency)"
				persistent-placeholder
			></v-text-field>
		</v-col>
		<v-col cols="6">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="frappe._('Grand Total')"
				class="sleek-field pos-themed-input"
				hide-details
				:model-value="formatCurrency(invoice_doc.grand_total)"
				readonly
				:prefix="currencySymbol(invoice_doc.currency)"
				persistent-placeholder
			></v-text-field>
		</v-col>
		<v-col v-if="invoice_doc && invoice_doc.rounded_total" cols="6">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="frappe._('Rounded Total')"
				class="sleek-field pos-themed-input"
				hide-details
				:model-value="formatCurrency(invoice_doc.rounded_total)"
				readonly
				:prefix="currencySymbol(invoice_doc.currency)"
				persistent-placeholder
			></v-text-field>
		</v-col>
	</v-row>
</template>

<script setup>
defineProps({
	invoice_doc: Object,
	displayCurrency: String,
	diff_payment: Number,
	diff_label: String,
	currencySymbol: Function,
	formatCurrency: Function,
});

const frappe = window.frappe;
</script>

<style scoped>
.invoice-totals-grid {
	margin: 0;
	row-gap: var(--pos-space-2);
}

.invoice-totals-grid :deep(.v-col) {
	padding-top: 0;
	padding-bottom: 0;
}

.invoice-totals-grid :deep(.v-field) {
	border-radius: var(--pos-radius-sm);
	background: var(--pos-surface-raised);
}
</style>
