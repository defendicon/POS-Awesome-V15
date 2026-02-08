<template>
	<div v-if="invoiceDoc && availableCustomerCredit > 0 && !invoiceDoc.is_return && redeemCustomerCredit">
		<v-row v-for="(row, idx) in customerCreditDict" :key="idx">
			<v-col cols="4">
				<div class="pa-2 py-3">{{ creditSourceLabel(row) }}</div>
			</v-col>
			<v-col cols="4">
				<v-text-field
					density="compact"
					variant="solo"
					color="primary"
					:label="$frappe._('Available Credit')"
					class="sleek-field pos-themed-input"
					hide-details
					:model-value="formatCurrency(row.total_credit)"
					readonly
					:prefix="currencySymbol(invoiceDoc.currency)"
				></v-text-field>
			</v-col>
			<v-col cols="4">
				<v-text-field
					density="compact"
					variant="solo"
					color="primary"
					:label="$frappe._('Redeem Credit')"
					class="sleek-field pos-themed-input"
					hide-details
					type="text"
					:model-value="formatCurrency(row.credit_to_redeem)"
					@change="handleCreditToRedeemChange(row, $event)"
					:prefix="currencySymbol(invoiceDoc.currency)"
				></v-text-field>
			</v-col>
		</v-row>
	</div>
</template>

<script setup>
import { inject } from "vue";

defineProps({
	invoiceDoc: {
		type: Object,
		required: true,
	},
	availableCustomerCredit: {
		type: Number,
		default: 0,
	},
	redeemCustomerCredit: {
		type: Boolean,
		default: false,
	},
	customerCreditDict: {
		type: Array,
		default: () => [],
	},
	creditSourceLabel: {
		type: Function,
		required: true,
	},
	formatCurrency: {
		type: Function,
		required: true,
	},
	currencySymbol: {
		type: Function,
		required: true,
	},
});

const emit = defineEmits(["set-formatted-currency"]);

const $frappe = inject("frappe", window.frappe);

const handleCreditToRedeemChange = (row, event) => {
	emit("set-formatted-currency", {
		target: row,
		field: "credit_to_redeem",
		value: event.target.value,
	});
};
</script>

<style scoped>
.pos-themed-input :deep(.v-field__input) {
	font-weight: 500;
}
</style>
