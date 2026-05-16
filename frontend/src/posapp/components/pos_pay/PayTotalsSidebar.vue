<!-- eslint-disable vue/multi-word-component-names -->
<template>
	<div class="pay-sidebar" :dir="isRtl ? 'rtl' : 'ltr'">
		<!-- 1. Summary Cards -->
		<v-card variant="outlined" class="mb-2 section-card">
			<v-card-text class="py-2">
				<div class="d-flex justify-space-between align-center">
					<span class="text-body-1 font-weight-medium text-medium-emphasis">
						{{ __("Total Invoices") }}
					</span>
					<div class="text-end">
						<div class="text-subtitle-1 font-weight-bold text-primary">
							{{ currencySymbol(invoiceTotalCurrency) }}{{ formatCurrency(totalSelectedInvoices) }}
						</div>
						<div v-if="selectedInvoicesCount" class="text-caption text-medium-emphasis">
							{{ selectedInvoicesCount }} invoice(s)
						</div>
					</div>
				</div>
			</v-card-text>
		</v-card>

		<!-- 2. Selected Payments -->
		<v-card
			v-if="totalSelectedPayments && selectedPaymentsDetail.length"
			variant="outlined"
			class="mb-2 section-card"
		>
			<v-card-text class="py-2">
				<h4 class="text-primary text-body-1 font-weight-bold mb-1">
					{{ __("Selected Payments") }}
				</h4>
				<v-list density="compact" class="pa-0 bg-transparent">
					<v-list-item
						v-for="(pay, idx) in selectedPaymentsDetail"
						:key="idx"
						class="px-0 py-1"
					>
						<v-list-item-title class="d-flex justify-space-between align-center mb-1">
							<span class="font-weight-medium">{{ __(pay.mode_of_payment) }}</span>
							<span
								v-if="pay.account"
								class="text-caption text-medium-emphasis text-truncate"
								style="max-width: 140px"
							>
								({{ pay.account }})
							</span>
						</v-list-item-title>

						<v-list-item-subtitle>
							<div class="payment-detail-row">
								<span class="text-medium-emphasis">{{ __("Paid (orig):") }}</span>
								<span class="font-weight-medium">
									{{ currencySymbol(pay.currency) }}{{ formatCurrency(pay.paid_amount) }}
								</span>
							</div>
							<div class="payment-detail-row">
								<span class="text-medium-emphasis">{{ __("Source Rate:") }}</span>
								<span class="font-weight-medium">{{ formatCurrency(pay.exchange_rate) }}</span>
							</div>
							<div class="payment-detail-row">
								<span class="text-medium-emphasis">{{ __("Unallocated:") }}</span>
								<span class="font-weight-medium">
									{{ currencySymbol(pay.currency) }}{{ formatCurrency(pay.unallocated_amount) }}
								</span>
							</div>
							<div class="payment-detail-row">
								<span class="text-medium-emphasis">{{ __("Received:") }}</span>
								<span class="font-weight-medium">
									{{ currencySymbol(companyCurrency) }}{{ formatCurrency(pay.received_amount) }}
								</span>
							</div>
							<div class="payment-detail-row">
								<span class="text-medium-emphasis">{{ __("Target Rate:") }}</span>
								<span class="font-weight-medium">{{ formatCurrency(pay.exchange_rate) }}</span>
							</div>
						</v-list-item-subtitle>

						<v-divider v-if="idx < selectedPaymentsDetail.length - 1" class="mt-1" />
					</v-list-item>
			</v-list>
			
			<v-divider class="my-1" />
			<div class="d-flex justify-space-between align-center font-weight-bold text-body-2">
				<span>{{ __("Total") }}</span>
				<span>
					{{ currencySymbol(paymentTotalCurrency) }}{{ formatCurrency(totalSelectedPayments) }}
				</span>
			</div>
			</v-card-text>
		</v-card>

		<v-card
			v-else-if="totalSelectedPayments"
			variant="outlined"
			class="mb-2 section-card"
		>
			<v-card-text class="py-2 d-flex justify-space-between align-center">
				<span class="text-body-1 font-weight-medium text-medium-emphasis">
					{{ __("Total Payments") }}
				</span>
				<span class="text-h6 font-weight-bold text-primary">
					{{ currencySymbol(paymentTotalCurrency) }}{{ formatCurrency(totalSelectedPayments) }}
				</span>
			</v-card-text>
		</v-card>

		<!-- Total Mpesa -->
		<v-card
			v-if="totalSelectedMpesa"
			variant="outlined"
			class="mb-2 section-card"
		>
			<v-card-text class="py-2 d-flex justify-space-between align-center">
				<span class="text-body-1 font-weight-medium text-medium-emphasis">
					{{ __("Total Mpesa") }}
				</span>
				<span class="text-subtitle-1 font-weight-bold text-primary">
					{{ currencySymbol(mpesaTotalCurrency) }}{{ formatCurrency(totalSelectedMpesa) }}
				</span>
			</v-card-text>
		</v-card>

		<!-- 3. Make New Payment -->
		<v-card
			v-if="posProfile.posa_allow_make_new_payments && paymentMethods.length"
			variant="outlined"
			class="mb-2 section-card"
		>
			<v-card-text class="py-2">
				<h4 class="text-primary text-body-1 font-weight-bold mb-2">
					{{ __("Make New Payment") }}
				</h4>

				<div v-if="filteredPaymentMethods.length">
			<v-select
				v-model="selectedMopName"
				:items="mopOptions"
				:label="__('Mode of Payment')"
				density="compact"
				variant="outlined"
				hide-details
				class="mb-2"
				clearable
			/>

					<div v-if="selectedMop">
						<div class="new-payment-card pa-2 mb-2">
							<div class="d-flex align-center mb-2">
								<span class="text-body-2 font-weight-medium">{{ __(selectedMop.mode_of_payment) }}</span>
								<v-chip
									v-if="getPaymentMethodAccount(selectedMop.mode_of_payment)?.account_type"
									size="x-small"
									color="primary"
									variant="outlined"
									class="ml-2"
								>
									{{ getPaymentMethodAccount(selectedMop.mode_of_payment).account_type }}
								</v-chip>
							</div>

							<div class="d-flex align-center">
								<span class="text-caption text-medium-emphasis mr-2">
									{{ paymentType === "Pay" ? __("Paid:") : __("Recv:") }}
								</span>
								<v-text-field
									v-model="selectedMop.amount"
									type="number"
									variant="outlined"
									density="compact"
									hide-details
									class="payment-amount-input"
									flat
									:prefix="currencySymbol(getPaymentMethodCurrency(selectedMop.mode_of_payment))"
									placeholder="0.00"
									@wheel.prevent
								/>
							</div>

							<div
								v-if="flt(selectedMop.amount) > 0"
								class="text-caption text-medium-emphasis mt-2"
							>
								{{ __("Base:") }} {{ currencySymbol(companyCurrency) }}{{ formatCurrency(flt(selectedMop.amount) * flt(selectedMopRate)) }}
								<span v-if="flt(selectedMopRate) !== 1">
									&nbsp;@ {{ formatCurrency(selectedMopRate) }}
								</span>
							</div>
						</div>

						<!-- Accounts -->
						<div
							v-if="partyAccount && getPaymentMethodAccount(selectedMop.mode_of_payment)"
							class="mb-2"
						>
							<div class="account-row mb-1">
								<div class="d-flex align-center">
									<v-icon size="18" class="mr-2 text-medium-emphasis">mdi-account-arrow-right</v-icon>
									<span class="text-body-2 text-medium-emphasis">{{ __("Party Account") }}</span>
								</div>
								<div class="d-flex align-center ml-auto">
									<span class="text-truncate text-body-2 font-weight-medium">{{ partyAccount.account }}</span>
									<v-chip size="x-small" color="primary" variant="tonal" class="ml-2">{{ partyAccount.currency }}</v-chip>
								</div>
							</div>

							<div class="account-row">
								<div class="d-flex align-center">
									<v-icon size="18" class="mr-2 text-medium-emphasis">mdi-bank</v-icon>
									<span class="text-body-2 text-medium-emphasis">{{ __("Payment Account") }}</span>
								</div>
								<div
									v-if="paymentType === 'Pay' || paymentType === 'Receive'"
									class="d-flex align-center ml-auto"
								>
									<div
										v-if="bankAccountOptions.length"
										class="account-selector-card"
										@click="openAccountDialog"
									>
										<div class="d-flex align-center">
											<span class="text-truncate text-body-2 font-weight-medium">
												{{ isCustomAccount ? selectedMop.bank_account : defaultBankAccount }}
											</span>
											<v-chip
												v-if="isCustomAccount"
												size="x-small"
												color="warning"
												variant="tonal"
												class="ml-2"
											>
												{{ __("Custom") }}
											</v-chip>
										</div>
										<div class="d-flex align-center mt-1">
											<v-chip
												size="x-small"
												:color="getAccountTypeColor(getCurrentSelectedAccountType())"
												variant="tonal"
											>
												<v-icon start size="12">{{ getAccountTypeIcon(getCurrentSelectedAccountType()) }}</v-icon>
												{{ getCurrentSelectedAccountType() }}
											</v-chip>
											<v-chip size="x-small" color="primary" variant="tonal" class="ml-1">
												{{ getCurrentSelectedCurrency() }}
											</v-chip>
											<v-icon size="18" class="ml-2 text-medium-emphasis">mdi-chevron-down</v-icon>
										</div>
									</div>
									<div v-else class="d-flex align-center ml-auto">
										<span class="text-truncate text-body-2 font-weight-medium">{{ getPaymentMethodAccount(selectedMop.mode_of_payment).account }}</span>
										<v-chip size="x-small" color="primary" variant="tonal" class="ml-2">{{ getPaymentMethodAccount(selectedMop.mode_of_payment).account_currency }}</v-chip>
									</div>
								</div>
							</div>
						</div>

						<!-- Payment Fields Summary -->
						<div
							v-if="flt(selectedMop.amount) > 0 && newPaymentFields[selectedMop.row_id]"
							class="text-caption mt-1"
						>
							<v-divider class="my-1" />
							<v-row dense class="compact-grid">
								<v-col cols="6" class="py-0">
									<div class="d-flex justify-space-between pr-1">
										<span class="text-medium-emphasis">{{ __("Source Ex. Rate:") }}</span>
										<span class="font-weight-medium">{{ formatCurrency(newPaymentFields[selectedMop.row_id].sourceRate) }}</span>
									</div>
								</v-col>
								<v-col cols="6" class="py-0">
									<div class="d-flex justify-space-between pl-1">
										<span class="text-medium-emphasis">{{ __("Target Ex. Rate:") }}</span>
										<span class="font-weight-medium">{{ formatCurrency(newPaymentFields[selectedMop.row_id].targetRate) }}</span>
									</div>
								</v-col>
								<v-col cols="6" class="py-0">
									<div class="d-flex justify-space-between pr-1">
										<span class="text-medium-emphasis">{{ __("Base Paid:") }}</span>
										<span class="font-weight-medium">
											{{ currencySymbol(companyCurrency) }}{{ formatCurrency(newPaymentFields[selectedMop.row_id].basePaidAmount) }}
										</span>
									</div>
								</v-col>
								<v-col cols="6" class="py-0">
									<div class="d-flex justify-space-between pl-1">
										<span class="text-medium-emphasis">{{ __("Base Recv:") }}</span>
										<span class="font-weight-medium">
											{{ currencySymbol(companyCurrency) }}{{ formatCurrency(newPaymentFields[selectedMop.row_id].baseReceivedAmount) }}
										</span>
									</div>
								</v-col>
							</v-row>
						</div>
					</div>
				</div>

			<!-- Entered Payments List -->
			<div v-if="enteredPayments.length" class="mt-1">
				<v-divider class="mb-1" />
				<div class="text-caption">
					<div
						v-for="entry in enteredPayments"
						:key="entry.row_id"
						class="d-flex justify-space-between align-center py-0"
					>
						<span class="font-weight-medium" style="min-width: 40%">{{ __(entry.mode_of_payment) }}</span>
						<span class="text-end" style="min-width: 30%">
							{{ currencySymbol(getPaymentMethodCurrency(entry.mode_of_payment)) }}{{ formatCurrency(entry.amount) }}
						</span>
						<span class="text-medium-emphasis text-end" style="min-width: 30%">
							({{ currencySymbol(companyCurrency) }}{{ formatCurrency(entry.baseAmount) }})
						</span>
					</div>
				</div>
				<v-divider class="my-1" />
				<div class="d-flex justify-space-between align-center font-weight-bold text-caption">
					<span style="min-width: 40%">{{ __("Total") }}</span>
					<span class="text-end" style="min-width: 30%">
						{{ currencySymbol(invoiceTotalCurrency) }}{{ formatCurrency(totalNewPayments) }}
					</span>
					<span class="text-end" style="min-width: 30%">
						({{ currencySymbol(companyCurrency) }}{{ formatCurrency(totalNewPaymentsBase) }})
					</span>
				</div>
			</div>
			</v-card-text>
		</v-card>

		<!-- 4. Exchange Rate (Inline) -->
		<v-card
			v-if="requiresExchangeRate"
			variant="outlined"
			class="mb-2 section-card"
		>
			<v-card-text class="py-1">
				<div class="d-flex align-center">
					<v-icon size="14" class="mr-1 text-primary">mdi-swap-horizontal</v-icon>
					<span class="text-caption font-weight-medium text-medium-emphasis mr-1" style="white-space: nowrap;">{{ __("Exchange Rate") }}</span>
					<span class="text-caption text-medium-emphasis mr-1" style="white-space: nowrap;">1 {{ invoiceTotalCurrency }} =</span>
					<v-text-field
						v-model="internalExchangeRate"
						type="number"
						step="0.01"
						variant="plain"
						density="compact"
						hide-details
						class="exchange-rate-input"
						:loading="exchangeRateLoading"
						:error="!!exchangeRateError"
						:hint="exchangeRateError"
						persistent-hint
						@wheel.prevent
						@update:model-value="$emit('validate-exchange-rate')"
					/>
					<span class="text-caption font-weight-medium mr-1">{{ companyCurrency }}</span>
					<v-btn
						icon
						size="x-small"
						variant="text"
						color="primary"
						:loading="exchangeRateLoading"
						:title="__('Refresh Exchange Rate')"
						@click="$emit('fetch-exchange-rate')"
					>
						<v-icon size="14">mdi-refresh</v-icon>
					</v-btn>
				</div>
			</v-card-text>
		</v-card>

		<!-- 5. Difference (Prominent Status) -->
		<v-card
			:color="totalOfDiff === 0 ? 'success' : totalOfDiff > 0 ? 'warning' : 'error'"
			variant="tonal"
			class="mb-2 difference-card"
		>
			<v-card-text class="d-flex justify-space-between align-center py-2">
				<span class="font-weight-bold">{{ __("Difference") }}</span>
				<span class="text-subtitle-1 font-weight-bold">
					{{ currencySymbol(invoiceTotalCurrency) }}{{ formatCurrency(totalOfDiff) }}
				</span>
			</v-card-text>
		</v-card>

		<!-- 6. Transaction ID -->
		<v-card variant="outlined" class="mb-2 section-card">
			<v-card-text class="py-2">
				<h4 class="text-primary text-subtitle-1 font-weight-bold mb-2">
					{{ __("Transaction ID") }}
				</h4>
				<v-row dense>
					<v-col md="6" cols="12">
						<v-text-field
							v-model="internalReferenceNo"
							density="compact"
							variant="outlined"
							hide-details
							:label="__('Cheque/Reference No')"
						/>
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
							class="sleek-field pay-reference-date"
							:placeholder="__('Cheque/Reference Date')"
							data-test="reference-date-input"
							@update:model-value="updateReferenceDate"
						/>
					</v-col>
				</v-row>
			</v-card-text>
		</v-card>

		<!-- 7. Auto Allocate -->
		<v-card variant="outlined" class="section-card">
			<v-card-text class="py-3">
				<v-switch
					:model-value="internalAutoAllocatePaymentAmount"
					color="primary"
					hide-details
					inset
					:label="__('Auto Allocate Payment Amount')"
					data-test="auto-allocate-payment-toggle"
					@update:model-value="emit('update:autoAllocatePaymentAmount', Boolean($event))"
				/>
				<div class="text-caption text-medium-emphasis mt-1">
					{{ __("Unselected payments stay unallocated first, then auto reconcile after submit.") }}
				</div>
			</v-card-text>
		</v-card>

		<!-- Account Dialog -->
		<v-dialog v-model="accountDialogOpen" max-width="500" :scrim="true" class="account-dialog">
			<v-card class="account-dialog-card">
				<v-card-title class="d-flex align-center pa-4">
					<v-icon class="mr-2">mdi-bank</v-icon>
					<span>{{ __("Select Payment Account") }}</span>
					<v-spacer></v-spacer>
					<v-btn icon variant="text" size="small" @click="accountDialogOpen = false">
						<v-icon>mdi-close</v-icon>
					</v-btn>
				</v-card-title>
				<v-divider />
				<v-card-text class="pa-4">
					<v-autocomplete
						v-model="selectedAccountTemp"
						:items="bankAccountOptions"
						item-title="label"
						item-value="value"
						variant="outlined"
						density="comfortable"
						:label="__('Search Account')"
						prepend-inner-icon="mdi-magnify"
						hide-no-data
						return-object
						clearable
					>
						<template #item="{ props, item }">
							<v-list-item v-bind="props" class="account-list-item">
								<template #prepend>
									<v-icon :color="getAccountTypeColor(item.raw.accountType)">
										{{ getAccountTypeIcon(item.raw.accountType) }}
									</v-icon>
								</template>
								<v-list-item-subtitle>
									<div class="d-flex align-center">
										<span class="font-weight-medium">{{ item.raw.label }}</span>
									</div>
								</v-list-item-subtitle>
								<template #append>
									<div class="d-flex align-center">
										<v-chip size="small" :color="getAccountTypeColor(item.raw.accountType)" variant="tonal">
											{{ item.raw.accountType }}
										</v-chip>
										<v-chip size="small" color="primary" variant="tonal" class="ml-1">
											{{ item.raw.currency }}
										</v-chip>
									</div>
								</template>
							</v-list-item>
						</template>
						<template #selection="{ item }">
							<div class="d-flex align-center">
								<v-icon :color="getAccountTypeColor(item.raw.accountType)" class="mr-2">
									{{ getAccountTypeIcon(item.raw.accountType) }}
								</v-icon>
								<span>{{ item.raw.label }}</span>
								<v-chip size="small" :color="getAccountTypeColor(item.raw.accountType)" variant="tonal" class="ml-2">
									{{ item.raw.accountType }}
								</v-chip>
								<v-chip size="small" color="primary" variant="tonal" class="ml-1">
									{{ item.raw.currency }}
								</v-chip>
							</div>
						</template>
					</v-autocomplete>
					<div class="d-flex align-center mt-3">
						<v-btn
							variant="tonal"
							color="warning"
							size="small"
							prepend-icon="mdi-refresh"
							@click="resetToDefault"
						>
							{{ __("Reset to Default") }}
						</v-btn>
						<v-spacer></v-spacer>
						<span class="text-caption text-medium-emphasis">
							{{ __("Default:") }} {{ defaultBankAccount }}
						</span>
					</div>
				</v-card-text>
				<v-divider />
				<v-card-actions class="pa-4">
					<v-btn variant="text" @click="accountDialogOpen = false">
						{{ __("Cancel") }}
					</v-btn>
					<v-spacer></v-spacer>
					<v-btn color="primary" variant="flat" @click="confirmAccountSelection">
						{{ __("Confirm") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import VueDatePicker from "@vuepic/vue-datepicker";
import { normalizeDateForBackend } from "../../format";
import { useRtl } from "../../composables/core/useRtl";

const { isRtl } = useRtl();

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

const accountDialogOpen = ref(false);
const selectedAccountTemp = ref(null);

const currentEditableAccount = computed(() => {
	if (!selectedMop.value || !props.paymentMethodAccounts) return null;
	if (props.paymentType === "Receive") {
		return props.paymentMethodAccounts[selectedMop.value.mode_of_payment];
	} else {
		return props.paymentMethodAccounts[selectedMop.value.mode_of_payment];
	}
});

const defaultBankAccount = computed(() => {
	return currentEditableAccount.value?.account || null;
});

const isCustomAccount = computed(() => {
	if (!selectedMop.value) return false;
	return selectedMop.value.bank_account && selectedMop.value.bank_account !== defaultBankAccount.value;
});

const openAccountDialog = () => {
	if (!selectedMop.value || !bankAccountOptions.value.length) return;
	selectedAccountTemp.value = selectedMop.value.bank_account || defaultBankAccount.value || null;
	accountDialogOpen.value = true;
};

const confirmAccountSelection = () => {
	if (selectedAccountTemp.value !== null && selectedAccountTemp.value !== "") {
		emit("update:bankAccount", selectedMopName.value, selectedAccountTemp.value);
	}
	accountDialogOpen.value = false;
};

const resetToDefault = () => {
	selectedAccountTemp.value = defaultBankAccount.value;
};

const getAccountTypeColor = (type) => {
	if (type === "Bank") return "info";
	if (type === "Cash") return "success";
	return "secondary";
};

const getAccountTypeIcon = (type) => {
	if (type === "Bank") return "mdi-bank";
	if (type === "Cash") return "mdi-cash";
	return "mdi-account";
};

const getCurrentSelectedAccountType = () => {
	const account = selectedMop.value?.bank_account || defaultBankAccount.value;
	if (!account || !bankAccountOptions.value.length) {
		return currentEditableAccount.value?.account_type || "";
	}
	const found = bankAccountOptions.value.find((a) => a.value === account);
	return found?.accountType || currentEditableAccount.value?.account_type || "";
};

const getCurrentSelectedCurrency = () => {
	const account = selectedMop.value?.bank_account || defaultBankAccount.value;
	if (!account || !bankAccountOptions.value.length) {
		return currentEditableAccount.value?.account_currency || "";
	}
	const found = bankAccountOptions.value.find((a) => a.value === account);
	return found?.currency || currentEditableAccount.value?.account_currency || "";
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
.pay-sidebar {
	padding: 8px;
	height: 100%;
	overflow-y: auto;
	overflow-x: hidden;
}

.section-card {
	border-color: rgba(var(--v-border-color), 0.12);
	background: rgb(var(--v-theme-surface));
	border-radius: 12px;
}

.payment-detail-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 2px;
}

.payment-detail-row:last-child {
	margin-bottom: 0;
}

.compact-grid .v-col {
	padding-top: 1px;
	padding-bottom: 1px;
}

.exchange-rate-input {
	max-width: 90px;
	min-width: 70px;
}
.exchange-rate-input :deep(.v-field) {
	background: transparent !important;
	box-shadow: none !important;
	border-bottom: 1px dashed rgba(var(--v-border-color), 0.3);
	border-radius: 0;
}
.exchange-rate-input :deep(.v-field__input) {
	font-size: 0.825rem;
	font-weight: 600;
	text-align: center;
	padding: 2px 4px;
	min-height: 28px;
}
.exchange-rate-input :deep(.v-field__overlay) {
	display: none;
}

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

/* RTL: datepicker component root — cascades to input + icon siblings */
.pay-sidebar[dir="rtl"] :deep(.pay-reference-date) {
	--dp-direction: rtl;
}

/* RTL: datepicker input text alignment */
.pay-sidebar[dir="rtl"] .pay-reference-date :deep(.dp__input) {
	direction: rtl;
	text-align: right;
}
.pay-sidebar[dir="rtl"] .pay-reference-date :deep(.dp__input_icon) {
	left: 8px;
	right: auto;
}
.pay-sidebar[dir="rtl"] .pay-reference-date :deep(.dp__input_icon_pad) {
	padding-left: 30px;
	padding-right: 12px;
}
.pay-sidebar[dir="rtl"] .pay-reference-date :deep(.dp__clear_icon) {
	left: 30px;
	right: auto;
}

/* RTL: text field input alignment */
.pay-sidebar[dir="rtl"] :deep(.v-field__input) {
	text-align: right;
}

.new-payment-card {
	border: 1px solid rgba(var(--v-border-color), 0.25);
	border-radius: 10px;
	background: rgba(var(--v-theme-surface), 0.6);
}

.payment-amount-input :deep(.v-field__input) {
	font-size: 1.25rem;
	font-weight: 700;
	text-align: right;
	font-variant-numeric: tabular-nums;
}

.payment-amount-input :deep(.v-field__prefix) {
	font-size: 1.1rem;
	font-weight: 600;
	color: rgb(var(--v-theme-primary));
	padding-right: 4px;
}

.text-truncate {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.account-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 8px 12px;
	background: rgba(var(--v-theme-surface), 0.5);
	border-radius: 8px;
	border: 1px solid rgba(var(--v-border-color), 0.15);
}

.account-selector-card {
	display: flex;
	flex-direction: column;
	padding: 10px 14px;
	background: rgba(var(--v-theme-primary), 0.06);
	border: 1px solid rgba(var(--v-theme-primary), 0.2);
	border-left: 3px solid rgb(var(--v-theme-primary));
	border-radius: 8px;
	cursor: pointer;
	transition: all 0.2s ease;
	min-width: 200px;
	max-width: 280px;
}

.account-selector-card:hover {
	background: rgba(var(--v-theme-primary), 0.1);
	border-color: rgba(var(--v-theme-primary), 0.35);
}

.difference-card {
	border-radius: 10px;
}

.account-dialog-card {
	border-radius: 16px;
	overflow: hidden;
}

.account-dialog-card .v-card-title {
	background: rgba(var(--v-theme-primary), 0.05);
	font-weight: 600;
}

.account-list-item {
	border-radius: 8px;
	margin: 4px 0;
	transition: background 0.15s ease;
}

.account-list-item:hover {
	background: rgba(var(--v-theme-primary), 0.08);
}

.account-dialog-card :deep(.v-autocomplete) {
	border-radius: 10px;
}

/* Custom scrollbar styling */
.pay-sidebar::-webkit-scrollbar {
	width: 6px;
}
.pay-sidebar::-webkit-scrollbar-track {
	background: transparent;
}
.pay-sidebar::-webkit-scrollbar-thumb {
	background: rgba(var(--v-border-color), 0.3);
	border-radius: 3px;
}

@media (max-width: 600px) {
	.account-row {
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
	}

	.account-selector-card {
		width: 100%;
		max-width: none;
	}
}
</style>

<style>
/* Unscoped: RTL support for teleported datepicker menu (appended to body) */
.rtl-layout .dp__menu {
	direction: rtl;
	--dp-direction: rtl;
}
</style>
