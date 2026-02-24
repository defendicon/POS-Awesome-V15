<template>
	<div v-if="invoiceDoc">
		<!-- Switches for Write Off and Credit Sale -->
		<v-row class="pa-1" align="start" no-gutters>
			<v-col
				cols="12"
				sm="6"
				v-if="posProfile.posa_allow_write_off_change && diffPayment > 0 && !invoiceDoc.is_return"
			>
				<v-switch
					:model-value="isWriteOffChange"
					flat
					:label="$frappe._('Write Off Difference Amount')"
					class="my-0 pa-1"
					@update:model-value="$emit('update:isWriteOffChange', $event)"
				></v-switch>
			</v-col>
			<v-col cols="12" sm="6" v-if="posProfile.posa_allow_credit_sale && !invoiceDoc.is_return">
				<v-switch
					:model-value="isCreditSale"
					:label="$frappe._('Credit Sale?')"
					@update:model-value="$emit('update:isCreditSale', $event)"
				></v-switch>
			</v-col>
			<v-col cols="12" sm="6" v-if="invoiceDoc.is_return && posProfile.use_cashback">
				<v-switch
					:model-value="isCashback"
					flat
					:label="$frappe._('Cashback?')"
					class="my-0 pa-1"
					@update:model-value="$emit('update:isCashback', $event)"
				></v-switch>
			</v-col>
			<v-col cols="12" sm="6" v-if="invoiceDoc.is_return">
				<v-switch
					:model-value="isCreditReturn"
					flat
					:label="$frappe._('Credit Return?')"
					class="my-0 pa-1"
					@update:model-value="$emit('update:isCreditReturn', $event)"
				></v-switch>
			</v-col>
			<v-col cols="12" v-if="isCreditSale">
				<VueDatePicker
					:model-value="newCreditDueDate"
					model-type="format"
					format="dd-MM-yyyy"
					:min-date="new Date()"
					auto-apply
					class="sleek-field pos-themed-input"
					@update:model-value="$emit('update:newCreditDueDate', $event)"
				/>
				<v-text-field
					class="mt-2 sleek-field"
					density="compact"
					variant="solo"
					type="number"
					min="0"
					max="365"
					:model-value="creditDueDays"
					:label="$frappe._('Days until due')"
					hide-details
					@update:model-value="$emit('update:creditDueDays', parseFloat($event))"
					@change="$emit('apply-due-preset', creditDueDays)"
				></v-text-field>
				<div class="mt-1">
					<v-chip
						v-for="d in creditDuePresets"
						:key="d"
						size="small"
						class="ma-1"
						variant="solo"
						color="primary"
						@click="$emit('apply-due-preset', d)"
					>
						{{ d }} {{ $frappe._("days") }}
					</v-chip>
				</div>
			</v-col>
			<v-col cols="12" sm="6" v-if="!invoiceDoc.is_return && posProfile.use_customer_credit">
				<v-switch
					:model-value="redeemCustomerCredit"
					flat
					:label="$frappe._('Use Customer Credit')"
					class="my-0 pa-1"
					@update:model-value="handleRedeemCustomerCreditUpdate"
				></v-switch>
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
	creditChange: {
		type: Number,
		default: 0,
	},
	diffPayment: {
		type: Number,
		default: 0,
	},
	isWriteOffChange: {
		type: Boolean,
		default: false,
	},
	isCreditSale: {
		type: Boolean,
		default: false,
	},
	isCashback: {
		type: Boolean,
		default: false,
	},
	isCreditReturn: {
		type: Boolean,
		default: false,
	},
	newCreditDueDate: {
		type: String,
		default: null,
	},
	creditDueDays: {
		type: [Number, String],
		default: null,
	},
	creditDuePresets: {
		type: Array,
		default: () => [7, 14, 30],
	},
	redeemCustomerCredit: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits([
	"update:isWriteOffChange",
	"update:isCreditSale",
	"update:isCashback",
	"update:isCreditReturn",
	"update:newCreditDueDate",
	"update:creditDueDays",
	"update:redeemCustomerCredit",
	"apply-due-preset",
	"get-available-credit",
]);

const $frappe = inject("frappe", window.frappe);

const handleRedeemCustomerCreditUpdate = (val) => {
	emit("update:redeemCustomerCredit", val);
	emit("get-available-credit", val);
};
</script>

<style scoped>
.pos-themed-input :deep(.v-field__input) {
	font-weight: 500;
}
</style>
