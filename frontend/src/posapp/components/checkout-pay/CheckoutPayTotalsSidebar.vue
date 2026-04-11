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
                    1 {{ invoiceTotalCurrency }} = {{ formatCurrency(internalExchangeRate || 0) }} {{ companyCurrency }}
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
                    @update:model-value="
                        emit('update:autoAllocatePaymentAmount', Boolean($event))
                    "
                />
                <small class="text-caption text-medium-emphasis">
                    {{
                        __(
                            "Unselected payments stay unallocated first, then auto reconcile after submit.",
                        )
                    }}
                </small>
            </v-col>
        </v-row>
    </div>
</template>

<script setup>
import { computed } from 'vue';
import VueDatePicker from "@vuepic/vue-datepicker";
import { normalizeDateForBackend } from "../../format";

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
    autoAllocatePaymentAmount: {
        type: Boolean,
        default: true,
    },
    currencySymbol: Function,
    formatCurrency: Function,
    getPaymentMethodCurrency: Function,
    referenceNo: String,
    referenceDate: String,
});

const emit = defineEmits([
    'update:exchangeRate',
    'update:autoAllocatePaymentAmount',
    'update:referenceNo',
    'update:referenceDate',
    'validate-exchange-rate',
    'fetch-exchange-rate'
]);

const internalExchangeRate = computed({
    get: () => props.exchangeRate,
    set: (val) => emit('update:exchangeRate', val)
});

const internalAutoAllocatePaymentAmount = computed(
    () => props.autoAllocatePaymentAmount ?? true,
);

const internalReferenceNo = computed({
    get: () => props.referenceNo,
    set: (val) => emit('update:referenceNo', val),
});

const internalReferenceDate = computed({
    get: () => props.referenceDate,
    set: (val) => emit('update:referenceDate', val),
});

const formatReferenceDateForDisplay = (value) => {
    const normalized = normalizeDateForBackend(value);
    if (!normalized) return "";

    const [year, month, day] = normalized.split("-");
    return `${day}-${month}-${year}`;
};

const referenceDateDisplay = computed(() =>
    formatReferenceDateForDisplay(props.referenceDate),
);

const updateReferenceDate = (val) => {
    const normalized = normalizeDateForBackend(val);
    const resolvedValue = normalized || "";
    emit('update:referenceDate', resolvedValue);
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
</style>
