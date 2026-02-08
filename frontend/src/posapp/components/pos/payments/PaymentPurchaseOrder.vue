<template>
	<div v-if="invoiceDoc && posProfile.posa_allow_customer_purchase_order">
		<v-divider></v-divider>
		<v-row class="pa-1" justify="center" align="start">
			<v-col cols="6">
				<v-text-field
					v-model="invoiceDoc.po_no"
					:label="$frappe._('Purchase Order')"
					variant="solo"
					density="compact"
					class="sleek-field pos-themed-input"
					clearable
					color="primary"
					hide-details
				></v-text-field>
			</v-col>
			<v-col cols="6">
				<VueDatePicker
					:model-value="newPoDate"
					model-type="format"
					format="dd-MM-yyyy"
					:min-date="new Date()"
					auto-apply
					class="sleek-field pos-themed-input"
					@update:model-value="$emit('update:newPoDate', $event)"
				/>
				<v-text-field
					v-model="invoiceDoc.po_date"
					:label="$frappe._('Purchase Order Date')"
					readonly
					variant="solo"
					density="compact"
					hide-details
					color="primary"
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
	posProfile: {
		type: [Object, String],
		default: () => ({}),
	},
	newPoDate: {
		type: String,
		default: null,
	},
});

defineEmits(["update:newPoDate"]);

const $frappe = inject("frappe", window.frappe);
</script>

<style scoped>
.pos-themed-input :deep(.v-field__input) {
	font-weight: 500;
}
</style>
