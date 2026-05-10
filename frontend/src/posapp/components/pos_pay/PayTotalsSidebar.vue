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

		<v-row v-if="totalSelectedPayments && selectedPaymentsDetail.length">
			<v-col cols="12">
				<h4 class="text-primary mb-1">{{ __("Selected Payments") }}</h4>
				<div
					v-for="(pay, idx) in selectedPaymentsDetail"
					:key="idx"
					class="selected-payment-block py-1 text-caption"
				>
					<div class="d-flex align-center mb-1">
						<span class="text-body-2 font-weight-medium">{{ __(pay.mode_of_payment) }}</span>
						<span v-if="pay.account" class="text-medium-emphasis ml-1 text-truncate" style="max-width: 40%">
							({{ pay.account }})
						</span>
					</div>
					<div class="d-flex align-center mb-1">
						<span class="text-medium-emphasis" style="min-width: 50%">{{ __("Paid (orig):") }}</span>
						<span class="font-weight-medium text-end" style="min-width: 50%">
							{{ currencySymbol(pay.currency) }}&nbsp;{{ formatCurrency(pay.paid_amount) }}
						</span>
					</div>
					<div class="d-flex align-center mb-1">
						<span class="text-medium-emphasis" style="min-width: 50%">{{ __("Source Rate:") }}</span>
						<span class="font-weight-medium text-end" style="min-width: 50%">{{ formatCurrency(pay.exchange_rate) }}</span>
					</div>
					<div class="d-flex align-center mb-1">
						<span class="text-medium-emphasis" style="min-width: 50%">{{ __("Unallocated:") }}</span>
						<span class="font-weight-medium text-end" style="min-width: 50%">
							{{ currencySymbol(pay.currency) }}&nbsp;{{ formatCurrency(pay.unallocated_amount) }}
						</span>
					</div>
					<div class="d-flex align-center mb-1">
						<span class="text-medium-emphasis" style="min-width: 50%">{{ __("Received:") }}</span>
						<span class="font-weight-medium text-end" style="min-width: 50%">
							{{ currencySymbol(companyCurrency) }}&nbsp;{{ formatCurrency(pay.received_amount) }}
						</span>
					</div>
					<div class="d-flex align-center mb-1">
						<span class="text-medium-emphasis" style="min-width: 50%">{{ __("Target Rate:") }}</span>
						<span class="font-weight-medium text-end" style="min-width: 50%">{{ formatCurrency(pay.exchange_rate) }}</span>
					</div>
					<v-divider v-if="idx < selectedPaymentsDetail.length - 1" class="my-1"></v-divider>
				</div>
				<v-divider class="my-1"></v-divider>
				<div class="d-flex align-center py-1 font-weight-bold">
					<span class="text-body-2" style="min-width: 50%">{{ __("Total") }}</span>
					<span class="text-body-2 text-end" style="min-width: 50%">
						{{ currencySymbol(paymentTotalCurrency) }}&nbsp;{{ formatCurrency(totalSelectedPayments) }}
					</span>
				</div>
			</v-col>
		</v-row>
		<v-row v-else-if="totalSelectedPayments">
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
			<h4 class="text-primary">{{ __("Make New Payment") }}</h4>
			<template v-if="filteredPaymentMethods.length">
				<v-select
					v-model="selectedMopName"
					:items="mopOptions"
					:label="__('Mode of Payment')"
					density="compact"
					variant="outlined"
					hide-details
					class="mb-3"
					clearable
				></v-select>
				<template v-if="selectedMop">
					<div class="new-payment-card pa-3 mb-2">
						<div class="d-flex align-center mb-2">
							<span class="text-body-2 font-weight-medium">{{ __(selectedMop.mode_of_payment) }}</span>
							<v-chip
								v-if="getPaymentMethodAccount(selectedMop.mode_of_payment)?.account_type"
								size="x-small"
								color="primary"
								variant="outlined"
								class="ml-1"
							>
								{{ getPaymentMethodAccount(selectedMop.mode_of_payment).account_type }}
							</v-chip>
						</div>
						<div class="d-flex align-center mb-1">
							<span class="text-caption text-medium-emphasis mr-1">{{ paymentType === "Pay" ? __("Paid:") : __("Recv:") }}</span>
							<span class="text-h6 font-weight-bold mr-2">
								{{ currencySymbol(getPaymentMethodCurrency(selectedMop.mode_of_payment)) }}
							</span>
							<v-text-field
								class="paid-amount-input amount-field"
								density="compact"
								color="primary"
								hide-details
								v-model="selectedMop.amount"
								type="number"
								flat
								variant="outlined"
							></v-text-field>
						</div>
						<div v-if="flt(selectedMop.amount) > 0" class="text-caption text-medium-emphasis mt-1">
							{{ __("Base:") }} {{ currencySymbol(companyCurrency) }}&nbsp;{{
								formatCurrency(
									flt(selectedMop.amount) * flt(selectedMopRate)
								)
							}}
							<template v-if="flt(selectedMopRate) !== 1">
								&nbsp;@ {{ formatCurrency(selectedMopRate) }}
							</template>
						</div>
					</div>
					<div v-if="partyAccount && getPaymentMethodAccount(selectedMop.mode_of_payment)" class="text-caption mb-2">
						<div class="d-flex align-center mb-1">
							<span class="text-medium-emphasis" style="min-width: 50px">{{ __("From:") }}</span>
							<template v-if="paymentType === 'Pay' && bankAccountOptions.length">
								<v-select
									:model-value="selectedMop.bank_account || ''"
									:items="bankAccountOptions"
									item-title="label"
									item-value="value"
									density="compact"
									variant="outlined"
									hide-details
									class="flex-grow-1 ml-1"
									@update:model-value="onBankAccountChange($event)"
								>
									<template #item="{ props, item }">
										<v-list-item v-bind="props" density="compact">
											<template #append>
												<v-chip size="x-small" color="primary" variant="tonal">{{ item.raw.currency }}</v-chip>
												<v-chip size="x-small" color="secondary" variant="tonal" class="ml-1">{{ item.raw.accountType }}</v-chip>
											</template>
										</v-list-item>
									</template>
								</v-select>
							</template>
							<template v-else>
								<span class="ml-1 text-truncate">{{ partyAccount.account }}</span>
								<v-chip size="x-small" color="primary" variant="tonal" class="ml-auto">{{ partyAccount.currency }}</v-chip>
							</template>
						</div>
						<div class="d-flex align-center">
							<span class="text-medium-emphasis" style="min-width: 50px">{{ __("To:") }}</span>
							<template v-if="paymentType === 'Receive' && bankAccountOptions.length">
								<v-select
									:model-value="selectedMop.bank_account || ''"
									:items="bankAccountOptions"
									item-title="label"
									item-value="value"
									density="compact"
									variant="outlined"
									hide-details
									class="flex-grow-1 ml-1"
									@update:model-value="onBankAccountChange($event)"
								>
									<template #item="{ props, item }">
										<v-list-item v-bind="props" density="compact">
											<template #append>
												<v-chip size="x-small" color="primary" variant="tonal">{{ item.raw.currency }}</v-chip>
												<v-chip size="x-small" color="secondary" variant="tonal" class="ml-1">{{ item.raw.accountType }}</v-chip>
											</template>
										</v-list-item>
									</template>
								</v-select>
							</template>
							<template v-else>
								<span class="ml-1 text-truncate">{{ getPaymentMethodAccount(selectedMop.mode_of_payment).account }}</span>
								<v-chip size="x-small" color="primary" variant="tonal" class="ml-auto">{{ getPaymentMethodAccount(selectedMop.mode_of_payment).account_currency }}</v-chip>
							</template>
						</div>
					</div>
					<template v-if="flt(selectedMop.amount) > 0 && newPaymentFields[selectedMop.row_id]">
						<v-divider class="my-1"></v-divider>
						<div class="text-caption">
							<div class="d-flex align-center mb-1">
								<span class="text-medium-emphasis" style="min-width: 50%">{{ __("Source Ex. Rate:") }}</span>
								<span class="font-weight-medium text-end" style="min-width: 50%">{{ formatCurrency(newPaymentFields[selectedMop.row_id].sourceRate) }}</span>
							</div>
							<div class="d-flex align-center mb-1">
								<span class="text-medium-emphasis" style="min-width: 50%">{{ __("Base Paid Amt:") }}</span>
								<span class="font-weight-medium text-end" style="min-width: 50%">
									{{ currencySymbol(companyCurrency) }}&nbsp;{{ formatCurrency(newPaymentFields[selectedMop.row_id].basePaidAmount) }}
								</span>
							</div>
							<div class="d-flex align-center mb-1">
								<span class="text-medium-emphasis" style="min-width: 50%">{{ __("Target Ex. Rate:") }}</span>
								<span class="font-weight-medium text-end" style="min-width: 50%">{{ formatCurrency(newPaymentFields[selectedMop.row_id].targetRate) }}</span>
							</div>
							<div class="d-flex align-center mb-1">
								<span class="text-medium-emphasis" style="min-width: 50%">{{ __("Base Recv Amt:") }}</span>
								<span class="font-weight-medium text-end" style="min-width: 50%">
									{{ currencySymbol(companyCurrency) }}&nbsp;{{ formatCurrency(newPaymentFields[selectedMop.row_id].baseReceivedAmount) }}
								</span>
							</div>
						</div>
					</template>
				</template>
				<div v-if="enteredPayments.length" class="mt-2">
					<v-divider class="mb-1"></v-divider>
					<div class="text-caption">
						<div
							v-for="entry in enteredPayments"
							:key="entry.row_id"
							class="d-flex align-center py-1"
						>
							<span class="font-weight-medium" style="min-width: 40%">{{ __(entry.mode_of_payment) }}</span>
							<span class="text-end" style="min-width: 30%">
								{{ currencySymbol(getPaymentMethodCurrency(entry.mode_of_payment)) }}&nbsp;{{ formatCurrency(entry.amount) }}
							</span>
							<span class="text-medium-emphasis text-end" style="min-width: 30%">
								({{ currencySymbol(companyCurrency) }}&nbsp;{{ formatCurrency(entry.baseAmount) }})
							</span>
						</div>
					</div>
					<v-divider class="my-1"></v-divider>
					<div class="d-flex align-center font-weight-bold text-body-2">
						<span style="min-width: 40%">{{ __("Total") }}</span>
						<span class="text-end" style="min-width: 30%">
							{{ currencySymbol(invoiceTotalCurrency) }}&nbsp;{{ formatCurrency(totalNewPayments) }}
						</span>
						<span class="text-end" style="min-width: 30%">
							({{ currencySymbol(companyCurrency) }}&nbsp;{{ formatCurrency(totalNewPaymentsBase) }})
						</span>
					</div>
				</div>
			</template>
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

		<v-divider></v-divider>
		<h4 class="text-primary">{{ __("Transaction ID") }}</h4>
		<v-row>
			<v-col md="6" cols="12">
				<v-text-field
					density="compact"
					variant="outlined"
					hide-details
					class="pos-themed-input"
					v-model="internalReferenceNo"
					:label="__('Cheque/Reference No')"
				></v-text-field>
			</v-col>
			<v-col md="6" cols="12">
				<VueDatePicker
					:model-value="referenceDateDisplay"
					model-type="format"
					format="dd-MM-yyyy"
					auto-apply
					teleport
					text-input
					:enable-time-picker="false"
					class="sleek-field pos-themed-input pay-reference-date"
					:placeholder="__('Cheque/Reference Date')"
					data-test="reference-date-input"
					@update:model-value="updateReferenceDate"
				/>
			</v-col>
		</v-row>
		<v-row class="mt-2">
			<v-col cols="12">
				<v-switch
					:model-value="internalAutoAllocatePaymentAmount"
					color="primary"
					hide-details
					inset
					:label="__('Auto Allocate Payment Amount')"
					data-test="auto-allocate-payment-toggle"
					@update:model-value="emit('update:autoAllocatePaymentAmount', Boolean($event))"
				/>
				<small class="text-caption text-medium-emphasis">
					{{ __("Unselected payments stay unallocated first, then auto reconcile after submit.") }}
				</small>
			</v-col>
		</v-row>
	</div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import VueDatePicker from "@vuepic/vue-datepicker";
import { normalizeDateForBackend } from "../../format";

const flt = (value, precision) => {
	const num = parseFloat(String(value ?? 0).replace(/,/g, ""));
	return isNaN(num) ? 0 : precision != null ? parseFloat(num.toFixed(precision)) : num;
};

const props = defineProps({
	posProfile: Object,
	totalSelectedInvoices: Number,
	selectedInvoicesCount: Number,
	totalSelectedPayments: Number,
	totalSelectedMpesa: Number,
	paymentMethods: Array,
	filteredPaymentMethods: Array,
	selectedPaymentsDetail: {
		type: Array,
		default: () => [],
	},
	newPaymentsDetail: {
		type: Array,
		default: () => [],
	},
	invoiceTotalCurrency: String,
	paymentTotalCurrency: String,
	mpesaTotalCurrency: String,
	companyCurrency: String,
	exchangeRate: Number,
	exchangeRateLoading: Boolean,
	exchangeRateError: String,
	requiresExchangeRate: Boolean,
	totalOfDiff: Number,
	autoAllocatePaymentAmount: {
		type: Boolean,
		default: true,
	},
	currencySymbol: Function,
	formatCurrency: Function,
	getPaymentMethodCurrency: Function,
	referenceNo: String,
	referenceDate: String,
	partyAccount: {
		type: Object,
		default: null,
	},
	paymentMethodAccounts: {
		type: Object,
		default: () => ({}),
	},
	availableBankAccounts: {
		type: Object,
		default: () => ({}),
	},
	paymentType: {
		type: String,
		default: "Receive",
	},
	invoiceConversionRate: {
		type: Number,
		default: null,
	},
});

const emit = defineEmits([
	"update:exchangeRate",
	"update:autoAllocatePaymentAmount",
	"update:referenceNo",
	"update:referenceDate",
	"update:bankAccount",
	"validate-exchange-rate",
	"fetch-exchange-rate",
]);

const internalExchangeRate = computed({
	get: () => props.exchangeRate,
	set: (val) => emit("update:exchangeRate", val),
});

const internalExchangeRateValue = computed(() => flt(props.exchangeRate || 1));

const internalAutoAllocatePaymentAmount = computed(() => props.autoAllocatePaymentAmount ?? true);

const getPaymentMethodAccount = (mode) => {
	if (!mode || !props.paymentMethodAccounts) return null;
	return props.paymentMethodAccounts[mode] || null;
};

const rateFromCurrencyToCompany = (currency) => {
	if (!currency || currency === props.companyCurrency) return 1;
	if (currency === props.invoiceTotalCurrency) {
		if (flt(props.exchangeRate) > 0) return flt(props.exchangeRate);
		if (flt(props.invoiceConversionRate) > 0) return flt(props.invoiceConversionRate);
	}
	// Fallback for third currencies: use invoice→company rate as best estimate
	if (flt(props.exchangeRate) > 0) return flt(props.exchangeRate);
	if (flt(props.invoiceConversionRate) > 0) return flt(props.invoiceConversionRate);
	return 1;
};

const newPaymentFields = computed(() => {
	const fields = {};
	if (!props.filteredPaymentMethods) return fields;
	for (const method of props.filteredPaymentMethods) {
		const amt = flt(method.amount);
		const mopCurr = props.getPaymentMethodCurrency(method.mode_of_payment);
		const partyCurr = props.partyAccount?.currency || props.invoiceTotalCurrency;
		const isReceive = props.paymentType === "Receive";
		const fromCurr = isReceive ? partyCurr : mopCurr;
		const toCurr = isReceive ? mopCurr : partyCurr;
		const srcRate = rateFromCurrencyToCompany(fromCurr);
		const tgtRate = rateFromCurrencyToCompany(toCurr);
		let paidAmt, recvAmt;
		if (isReceive) {
			recvAmt = amt;
			paidAmt = tgtRate !== 0 ? recvAmt * tgtRate / (srcRate || 1) : 0;
		} else {
			paidAmt = amt;
			recvAmt = srcRate !== 0 ? paidAmt * srcRate / (tgtRate || 1) : 0;
		}
		fields[method.row_id] = {
			paidAmount: paidAmt,
			receivedAmount: recvAmt,
			sourceRate: srcRate,
			targetRate: tgtRate,
			basePaidAmount: paidAmt * srcRate,
			baseReceivedAmount: recvAmt * tgtRate,
			fromCurrency: fromCurr,
			toCurrency: toCurr,
		};
	}
	return fields;
});

const selectedMopName = ref(null);

const mopOptions = computed(() => {
	if (!props.filteredPaymentMethods) return [];
	return props.filteredPaymentMethods.map((m) => ({
		title: __(m.mode_of_payment),
		value: m.mode_of_payment,
	}));
});

const selectedMop = computed(() => {
	if (!selectedMopName.value || !props.filteredPaymentMethods) return null;
	return props.filteredPaymentMethods.find((m) => m.mode_of_payment === selectedMopName.value) || null;
});

const selectedMopRate = computed(() => {
	if (!selectedMop.value) return 1;
	const mopCurr = props.getPaymentMethodCurrency(selectedMop.value.mode_of_payment);
	return rateFromCurrencyToCompany(mopCurr);
});

watch(
	() => props.invoiceTotalCurrency,
	(newCurrency) => {
		if (!props.filteredPaymentMethods?.length || !newCurrency) return;
		const match = props.filteredPaymentMethods.find(
			(m) => props.getPaymentMethodCurrency(m.mode_of_payment) === newCurrency,
		);
		if (match) {
			selectedMopName.value = match.mode_of_payment;
		}
	},
);

const bankAccountOptions = computed(() => {
	if (!selectedMopName.value || !props.availableBankAccounts) return [];
	const accounts = props.availableBankAccounts[selectedMopName.value];
	if (!accounts || !accounts.length) return [];
	return accounts.map((a) => ({
		label: `${a.account_name || a.account}  (${a.account_currency})`,
		value: a.account,
		currency: a.account_currency,
		accountType: a.account_type,
	}));
});

const onBankAccountChange = (account) => {
	emit("update:bankAccount", selectedMopName.value, account);
};

const enteredPayments = computed(() => {
	if (!props.filteredPaymentMethods) return [];
	return props.filteredPaymentMethods
		.filter((m) => flt(m.amount) > 0)
		.map((m) => {
			const fields = newPaymentFields.value[m.row_id] || {};
			return {
				row_id: m.row_id,
				mode_of_payment: m.mode_of_payment,
				amount: flt(m.amount),
				baseAmount: fields.basePaidAmount || fields.baseReceivedAmount || flt(m.amount),
			};
		});
});

const totalNewPayments = computed(() => {
	return enteredPayments.value.reduce((sum, e) => sum + e.amount, 0);
});

const totalNewPaymentsBase = computed(() => {
	return enteredPayments.value.reduce((sum, e) => sum + e.baseAmount, 0);
});

const internalReferenceNo = computed({
	get: () => props.referenceNo,
	set: (val) => emit("update:referenceNo", val),
});

const internalReferenceDate = computed({
	get: () => props.referenceDate,
	set: (val) => emit("update:referenceDate", val),
});

const formatReferenceDateForDisplay = (value) => {
	const normalized = normalizeDateForBackend(value);
	if (!normalized) return "";

	const [year, month, day] = normalized.split("-");
	return `${day}-${month}-${year}`;
};

const referenceDateDisplay = computed(() => formatReferenceDateForDisplay(props.referenceDate));

const updateReferenceDate = (val) => {
	const normalized = normalizeDateForBackend(val);
	const resolvedValue = normalized || "";
	emit("update:referenceDate", resolvedValue);
	return resolvedValue;
};

defineExpose({
	updateReferenceDate,
});
</script>

<style scoped>
.pay-reference-date :deep(.dp__input_wrap) {
	width: 100%;
}

.pay-reference-date :deep(.dp__input) {
	width: 100%;
	min-height: 40px;
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
	border-radius: 4px;
	background-color: rgb(var(--v-theme-surface));
	color: inherit;
	padding: 0 12px;
}

.selected-payment-block + .selected-payment-block {
	border-top: 1px solid rgba(var(--v-border-color), 0.3);
	margin-top: 2px;
	padding-top: 6px;
}

.new-payment-card {
	border: 1px solid rgba(var(--v-border-color), 0.25);
	border-radius: 8px;
	background: rgba(var(--v-theme-surface), 0.6);
}

.new-payment-card .amount-field :deep(.v-field__input) {
	font-size: 1rem;
	font-weight: 600;
}

.text-truncate {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
