<template>
	<div v-if="payments && payments.length">
		<v-row
			class="payments payment-method-row pa-1 ma-0"
			v-for="payment in payments"
			:key="payment.name"
			align="stretch"
		>
			<v-col cols="12" sm="6" v-if="!isMpesaC2bPayment(payment)" class="payment-input-col">
				<v-text-field
					density="compact"
					variant="solo"
					color="primary"
					:label="frappe._(payment.mode_of_payment)"
					class="sleek-field pos-themed-input"
					hide-details
					:model-value="formatCurrency(payment.amount)"
					@change="$emit('update-amount', payment, $event)"
					:rules="[isNumber]"
					:prefix="currencySymbol(currency)"
					@focus="$emit('set-rest-amount', payment)"
					:readonly="isReturn"
				></v-text-field>
			</v-col>
			<v-col cols="12" sm="6" v-if="!isMpesaC2bPayment(payment)" class="payment-button-col">
				<v-btn
					block
					color="primary"
					class="payment-method-btn"
					variant="outlined"
					@click="$emit('set-full-amount', payment)"
				>
					{{ payment.mode_of_payment }}
				</v-btn>
			</v-col>

			<!-- Cash Denomination Buttons -->
			<v-col
				cols="12"
				v-if="
					payment.default === 1 &&
					isCashLikePayment(payment) &&
					getVisibleDenominations(payment).length
				"
				class="py-0 px-2 mt-n1 mb-2"
			>
				<div class="d-flex flex-wrap gap-2">
					<v-btn
						v-for="d in getVisibleDenominations(payment)"
						:key="d"
						size="x-small"
						class="mr-1 mb-1"
						color="secondary"
						variant="tonal"
						@click="$emit('set-denomination', payment, d)"
					>
						{{ formatCurrency(d) }}
					</v-btn>
				</div>
			</v-col>

			<!-- M-Pesa Payment Button (if payment is M-Pesa) -->
			<v-col cols="12" v-if="isMpesaC2bPayment(payment)" class="pt-0">
				<v-btn
					block
					color="success"
					variant="outlined"
					class="payment-method-btn"
					@click="$emit('mpesa-dialog', payment)"
				>
					{{ __("Get Payments") }} {{ payment.mode_of_payment }}
				</v-btn>
			</v-col>

			<!-- Request Payment for Phone Type -->
			<v-col
				cols="12"
				sm="6"
				v-if="payment.type === 'Phone' && payment.amount > 0 && requestPaymentField"
				class="pt-0"
			>
				<v-btn
					block
					color="success"
					variant="outlined"
					class="payment-method-btn"
					:disabled="payment.amount === 0"
					@click="$emit('request-payment', payment)"
				>
					{{ __("Request") }}
				</v-btn>
			</v-col>
		</v-row>
	</div>
</template>

<script setup>
defineProps({
	payments: Array,
	currency: String,
	isReturn: Boolean,
	requestPaymentField: Boolean,
	currencySymbol: Function,
	formatCurrency: Function,
	isNumber: Function,
	getVisibleDenominations: Function,
	isCashLikePayment: Function,
	isMpesaC2bPayment: Function,
});

defineEmits([
	"update-amount",
	"set-full-amount",
	"set-denomination",
	"mpesa-dialog",
	"request-payment",
	"set-rest-amount",
]);

const frappe = window.frappe;
const __ = window.__;
</script>

<style scoped>
.payment-method-row {
	align-items: stretch;
	margin-bottom: 2px;
}

.payment-input-col,
.payment-button-col {
	display: flex;
	align-items: stretch;
}

.payment-input-col :deep(.v-input),
.payment-button-col :deep(.v-btn) {
	width: 100%;
}

.payment-input-col :deep(.v-field) {
	min-height: 56px;
	border: 1px solid var(--pos-border);
	border-radius: var(--posa-radius-sm);
}

.payment-button-col :deep(.v-btn) {
	height: 100%;
	min-height: 56px;
}

.payment-method-btn {
	height: 100%;
	min-height: 56px;
	border-width: 1px;
	border-color: var(--pos-border) !important;
	border-radius: var(--posa-radius-sm);
	font-weight: 600;
	text-transform: none;
	justify-content: center;
	transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.payment-method-btn:hover,
.payment-method-btn:focus-visible {
	border-color: rgb(var(--v-theme-primary)) !important;
	box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.35) inset;
}

@media (max-width: 600px) {
	.payment-method-row {
		margin-bottom: 6px;
	}

	.payment-button-col {
		padding-top: 4px;
	}

	.payment-button-col :deep(.v-btn),
	.payment-method-btn {
		min-height: 52px;
	}
}
</style>
