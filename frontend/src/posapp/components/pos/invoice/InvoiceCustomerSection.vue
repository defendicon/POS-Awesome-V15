<template>
	<v-row align="center" class="items px-3 py-2" :class="{ 'invoice-customer-section--compact': compact }">
		<v-col :cols="pos_profile.posa_allow_sales_order ? 9 : 12" class="pb-0 pr-0">
			<!-- Customer selection component -->
			<Customer ref="customerComponent" />
		</v-col>
		<!-- Invoice Type Selection (Only shown if sales orders are allowed) -->
		<v-col v-if="pos_profile.posa_allow_sales_order" cols="3" class="pb-4">
			<v-select
				density="compact"
				hide-details
				variant="solo"
				color="primary"
				class="sleek-field pos-themed-input"
				:items="invoiceTypes"
				:label="frappe._('Type')"
				:model-value="modelValue"
				@update:model-value="$emit('update:modelValue', $event)"
				:disabled="modelValue == 'Return'"
			></v-select>
		</v-col>
	</v-row>
</template>

<script setup>
import { ref } from "vue";
import Customer from "../customer/Customer.vue";

defineProps({
	compact: Boolean,
	pos_profile: {
		type: Object,
		required: true,
		default: () => ({}),
	},
	invoiceTypes: {
		type: Array,
		default: () => ["Invoice", "Order", "Quotation"],
	},
	modelValue: {
		type: String,
		default: "Invoice",
	},
});

defineEmits(["update:modelValue"]);
const customerComponent = ref(null);

// Expose focus method for parent
const focusCustomerSearch = () => {
	if (customerComponent.value && typeof customerComponent.value.focusCustomerSearch === "function") {
		customerComponent.value.focusCustomerSearch();
	}
};

const selectFirstCustomer = () => {
	if (customerComponent.value && typeof customerComponent.value.selectFirstCustomer === "function") {
		customerComponent.value.selectFirstCustomer();
	}
};

const openNewCustomer = () => {
	if (customerComponent.value && typeof customerComponent.value.openNewCustomer === "function") {
		customerComponent.value.openNewCustomer();
	}
};

defineExpose({
	focusCustomerSearch,
	selectFirstCustomer,
	openNewCustomer,
});

const frappe = window.frappe;
</script>

<style scoped>
.invoice-customer-section--compact {
	display: flex;
	flex-wrap: nowrap;
	gap: 6px;
	margin: 0 !important;
	padding: 0 !important;
}
.invoice-customer-section--compact > :first-child {
	flex: 1 1 0 !important;
	max-width: 100% !important;
	min-width: 0;
	padding: 0 !important;
}
.invoice-customer-section--compact > :nth-child(2) {
	flex: 0 0 108px !important;
	max-width: 108px !important;
	min-width: 0;
	padding: 0 !important;
}
@container invoice-card (max-width: 280px) {
	.invoice-customer-section--compact { flex-wrap: wrap; }
	.invoice-customer-section--compact > :nth-child(2) { flex-basis: 100% !important; max-width: 100% !important; }
}
</style>
