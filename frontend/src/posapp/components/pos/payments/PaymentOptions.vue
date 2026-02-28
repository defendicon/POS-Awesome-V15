<template>
	<div v-if="invoiceDoc">
		<div class="payment-options-layout">
			<div class="payment-options-toggles">
				<v-row class="pa-1" align="start" no-gutters>
					<v-col cols="12" v-if="posProfile.posa_allow_credit_sale && !invoiceDoc.is_return">
						<v-switch
							:model-value="isCreditSale"
							color="primary"
							:label="$frappe._('Credit Sale?')"
							class="my-0 pa-1"
							@update:model-value="$emit('update:isCreditSale', $event)"
						></v-switch>
					</v-col>
					<v-col
						cols="12"
						v-if="posProfile.posa_allow_write_off_change && diffPayment > 0 && !invoiceDoc.is_return"
					>
						<v-switch
							:model-value="isWriteOffChange"
							color="primary"
							flat
							:label="$frappe._('Write Off Difference Amount')"
							class="my-0 pa-1"
							@update:model-value="$emit('update:isWriteOffChange', $event)"
						></v-switch>
					</v-col>
					<v-col cols="12" v-if="invoiceDoc.is_return && posProfile.use_cashback">
						<v-switch
							:model-value="isCashback"
							color="primary"
							flat
							:label="$frappe._('Cashback?')"
							class="my-0 pa-1"
							@update:model-value="$emit('update:isCashback', $event)"
						></v-switch>
					</v-col>
					<v-col cols="12" v-if="invoiceDoc.is_return">
						<v-switch
							:model-value="isCreditReturn"
							color="primary"
							flat
							:label="$frappe._('Credit Return?')"
							class="my-0 pa-1"
							@update:model-value="$emit('update:isCreditReturn', $event)"
						></v-switch>
					</v-col>
					<v-col cols="12" v-if="!invoiceDoc.is_return && posProfile.use_customer_credit">
						<v-switch
							:model-value="redeemCustomerCredit"
							color="primary"
							flat
							:label="$frappe._('Use Customer Credit')"
							class="my-0 pa-1"
							@update:model-value="handleRedeemCustomerCreditUpdate"
						></v-switch>
					</v-col>
				</v-row>
			</div>

			<div class="payment-options-panel">
				<div v-if="isCreditSale" class="payment-options-panel__content">
					<VueDatePicker
						:model-value="newCreditDueDate"
						model-type="format"
						format="dd-MM-yyyy"
						:min-date="new Date()"
						auto-apply
						teleport
						placeholder="Due Date"
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
					<div class="payment-options-panel__chips mt-1">
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
				</div>

				<div v-if="isWriteOffChange" class="payment-options-panel__content">
					<v-text-field
						class="sleek-field"
						density="compact"
						variant="solo"
						type="number"
						min="0"
						:max="writeOffEffectiveMax"
						:model-value="writeOffAmountDisplay"
						:label="$frappe._('Write Off Amount')"
						hide-details
						@update:model-value="$emit('update:writeOffAmount', $event)"
					></v-text-field>
					<p class="payment-options-panel__helper">
						{{ $frappe._("This amount will be written off on submission.") }}
					</p>
				</div>

				<div v-else-if="redeemCustomerCredit" class="payment-options-panel__note">
					<h4>{{ $frappe._("Customer Credit Enabled") }}</h4>
					<p>{{ $frappe._("Credit redemption details are shown below in this section.") }}</p>
				</div>

				<div v-else-if="invoiceDoc.is_return && isCreditReturn" class="payment-options-panel__note">
					<h4>{{ $frappe._("Credit Return Active") }}</h4>
					<p>{{ $frappe._("This return will be settled as customer credit instead of cashback.") }}</p>
				</div>

				<div v-else-if="invoiceDoc.is_return && isCashback" class="payment-options-panel__note">
					<h4>{{ $frappe._("Cashback Active") }}</h4>
					<p>{{ $frappe._("Return value will be settled back through payment methods.") }}</p>
				</div>

				<div v-else class="payment-options-panel__empty">
					{{ $frappe._("Select an option on the left to view its settings.") }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed, inject } from "vue";

const props = defineProps({
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
	writeOffAmount: {
		type: [Number, String],
		default: 0,
	},
	writeOffMaxAmount: {
		type: [Number, String],
		default: null,
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
	"update:writeOffAmount",
	"update:redeemCustomerCredit",
	"apply-due-preset",
	"get-available-credit",
]);

const $frappe = inject("frappe", window.frappe);

const hasPanelContent = computed(() => {
	return (
		props.isCreditSale ||
		props.redeemCustomerCredit ||
		props.isWriteOffChange ||
		(props.invoiceDoc?.is_return && props.isCreditReturn) ||
		(props.invoiceDoc?.is_return && props.isCashback)
	);
});

const handleRedeemCustomerCreditUpdate = (val) => {
	emit("update:redeemCustomerCredit", val);
	emit("get-available-credit", val);
};

const writeOffAmountDisplay = computed(() => {
	if (props.writeOffAmount === null || props.writeOffAmount === undefined || props.writeOffAmount === "") {
		return Math.max(props.diffPayment || 0, 0);
	}

	return props.writeOffAmount;
});

const writeOffEffectiveMax = computed(() => {
	const diffMax = Math.max(Number(props.diffPayment) || 0, 0);
	const profileCap = Number(props.writeOffMaxAmount);

	if (Number.isFinite(profileCap) && profileCap > 0) {
		return Math.min(diffMax, profileCap);
	}

	return diffMax;
});
</script>

<style scoped>
.pos-themed-input :deep(.v-field__input) {
	font-weight: 500;
}

:deep(.v-selection-control) {
	--v-selection-control-color: rgb(var(--v-theme-primary));
	--v-selection-control-disabled-color: rgba(var(--v-theme-on-surface), 0.38);
}

:deep(.v-switch .v-label) {
	color: var(--pos-text-primary);
}

.payment-options-layout {
	display: grid;
	grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
	gap: var(--pos-space-2);
	align-items: start;
}

.payment-options-toggles,
.payment-options-panel {
	min-width: 0;
}

.payment-options-panel {
	background: var(--pos-surface-raised);
	border: 1px solid var(--pos-border-light);
	border-radius: var(--pos-radius-sm);
	padding: var(--pos-space-2);
	min-height: 100%;
}

.payment-options-panel__content {
	display: flex;
	flex-direction: column;
	gap: var(--pos-space-2);
}

.payment-options-panel__chips {
	display: flex;
	flex-wrap: wrap;
}

.payment-options-panel__note h4 {
	margin: 0 0 6px;
	font-size: 0.9rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.payment-options-panel__note p,
.payment-options-panel__empty {
	margin: 0;
	font-size: 0.82rem;
	line-height: 1.45;
	color: var(--pos-text-secondary);
}

.payment-options-panel__helper {
	margin: 0;
	font-size: 0.82rem;
	line-height: 1.45;
	color: var(--pos-text-secondary);
}

@media (max-width: 768px) {
	.payment-options-layout {
		grid-template-columns: 1fr;
	}
}
</style>
