<!-- eslint-disable vue/multi-word-component-names -->
<template>
	<div class="totals-wrapper">
		<h4 class="text-primary">Totals</h4>
		<v-row>
			<v-col md="7" class="mt-1">
				<span>{{ __("Total Invoices:") }}</span>
			</v-col>
			<v-col md="5">
				<v-text-field
					class="p-0 m-0 pos-themed-input"
					density="compact"
					color="primary"
					hide-details
					:model-value="formatCurrency(totalSelectedInvoices)"
					readonly
					flat
					:prefix="currencySymbol(invoiceTotalCurrency)"
				></v-text-field>
				<small v-if="selectedInvoicesCount" class="text-primary"
					>{{ selectedInvoicesCount }} invoice(s) selected</small
				>
			</v-col>
		</v-row>

		<v-row v-if="totalSelectedPayments">
			<v-col md="7" class="mt-1"
				><span>{{ __("Total Payments:") }}</span></v-col
			>
			<v-col md="5">
				<v-text-field
					class="p-0 m-0 pos-themed-input"
					density="compact"
					color="primary"
					hide-details
					:model-value="formatCurrency(totalSelectedPayments)"
					readonly
					flat
					:prefix="currencySymbol(paymentTotalCurrency)"
				></v-text-field>
			</v-col>
		</v-row>

		<v-row v-if="totalSelectedMpesa">
			<v-col md="7" class="mt-1"
				><span>{{ __("Total Mpesa:") }}</span></v-col
			>
			<v-col md="5">
				<v-text-field
					class="p-0 m-0 pos-themed-input"
					density="compact"
					color="primary"
					hide-details
					:model-value="formatCurrency(totalSelectedMpesa)"
					readonly
					flat
					:prefix="currencySymbol(mpesaTotalCurrency)"
				></v-text-field>
			</v-col>
		</v-row>

		<v-divider v-if="paymentMethods.length"></v-divider>
		<div v-if="posProfile.posa_allow_make_new_payments">
			<h4 class="text-primary">Make New Payment</h4>
			<v-row
				v-if="filteredPaymentMethods.length"
				v-for="method in filteredPaymentMethods"
				:key="method.row_id"
			>
				<v-col md="7"
					><span class="mt-1">{{ __(method.mode_of_payment) }}:</span>
				</v-col>
				<v-col md="5">
					<div class="d-flex align-center">
						<div class="mr-1 text-primary">
							{{ currencySymbol(getPaymentMethodCurrency(method.mode_of_payment)) }}
						</div>
						<v-text-field
							class="p-0 m-0 pos-themed-input"
							density="compact"
							color="primary"
							hide-details
							v-model="method.amount"
							type="number"
							flat
						></v-text-field>
					</div>
				</v-col>
			</v-row>
		</div>

		<v-divider v-if="requiresExchangeRate"></v-divider>
		<v-row v-if="requiresExchangeRate" class="mb-2">
			<v-col md="7" class="mt-1">
				<span class="text-primary">
					{{ __("Exchange Rate") }} (1 {{ invoiceTotalCurrency }} = ? {{ companyCurrency }}):
				</span>
			</v-col>
			<v-col md="5">
				<div class="d-flex align-center">
					<div class="mr-1 text-primary">
						{{ currencySymbol(companyCurrency) }}
					</div>
					<v-text-field
						class="p-0 m-0 pos-themed-input"
						density="compact"
						color="primary"
						hide-details
						v-model="internalExchangeRate"
						type="number"
						step="0.01"
						flat
						@update:model-value="$emit('validate-exchange-rate')"
						:loading="exchangeRateLoading"
						:error="!!exchangeRateError"
						:hint="exchangeRateError"
						persistent-hint
					></v-text-field>
					<v-btn
						icon
						size="small"
						variant="text"
						color="primary"
						@click="$emit('fetch-exchange-rate')"
						:loading="exchangeRateLoading"
						:title="__('Refresh Exchange Rate')"
					>
						<v-icon>mdi-refresh</v-icon>
					</v-btn>
				</div>
				<small class="text-caption text-medium-emphasis">
					1 {{ invoiceTotalCurrency }} = {{ formatCurrency(internalExchangeRate || 0) }}
					{{ companyCurrency }}
				</small>
			</v-col>
		</v-row>

		<v-divider></v-divider>
		<v-row>
			<v-col md="7">
				<h4 class="text-primary mt-1">{{ __("Difference:") }}</h4>
			</v-col>
			<v-col md="5">
				<v-text-field
					class="p-0 m-0 pos-themed-input"
					density="compact"
					color="primary"
					hide-details
					:model-value="formatCurrency(totalOfDiff)"
					readonly
					flat
					:prefix="currencySymbol(invoiceTotalCurrency)"
				></v-text-field>
			</v-col>
		</v-row>
	</div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
	posProfile: Object,
	totalSelectedInvoices: Number,
	selectedInvoicesCount: Number,
	totalSelectedPayments: Number,
	totalSelectedMpesa: Number,
	paymentMethods: Array,
	filteredPaymentMethods: Array,
	invoiceTotalCurrency: String,
	paymentTotalCurrency: String,
	mpesaTotalCurrency: String,
	companyCurrency: String,
	exchangeRate: Number,
	exchangeRateLoading: Boolean,
	exchangeRateError: String,
	requiresExchangeRate: Boolean,
	totalOfDiff: Number,
	currencySymbol: Function,
	formatCurrency: Function,
	getPaymentMethodCurrency: Function,
});

const emit = defineEmits(["update:exchangeRate", "validate-exchange-rate", "fetch-exchange-rate"]);

const internalExchangeRate = computed({
	get: () => props.exchangeRate,
	set: (val) => emit("update:exchangeRate", val),
});
</script>
