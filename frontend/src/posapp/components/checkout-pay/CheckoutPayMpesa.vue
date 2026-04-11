<!-- eslint-disable vue/multi-word-component-names -->
<template>
    <div v-if="posProfile.posa_allow_mpesa_reconcile_payments">
        <v-row>
            <v-col md="8" cols="12">
                <p>
                    <span
                        ><strong>{{ __("Search Mpesa Payments") }}</strong></span
                    >
                </p>
            </v-col>
            <v-col md="4" cols="12" v-if="totalSelected">
                <p class="golden--text text-end">
                    <span>{{ __("Total Selected :") }}</span>
                    <span>
                        {{ currencySymbol(posProfile.currency) }}
                        {{ formatCurrency(totalSelected) }}
                    </span>
                </p>
            </v-col>
        </v-row>
        <v-row align="center" no-gutters class="mb-1">
            <v-col md="4" cols="12" class="mr-1">
                <v-text-field
                    density="compact"
                    variant="outlined"
                    color="primary"
                    label="Search by Name"
                    class="pos-themed-input"
                    hide-details
                    v-model="internalSearchName"
                    clearable
                ></v-text-field>
            </v-col>
            <v-col md="4" cols="12" class="mr-1">
                <v-text-field
                    density="compact"
                    variant="outlined"
                    color="primary"
                    label="Search by Mobile"
                    class="pos-themed-input"
                    hide-details
                    v-model="internalSearchMobile"
                    clearable
                ></v-text-field>
            </v-col>
            <v-col> </v-col>
            <v-col md="3" cols="12">
                <v-btn
                    block
                    color="warning"
                    theme="dark"
                    @click="$emit('search')"
                    >{{ __("Search") }}</v-btn
                >
            </v-col>
        </v-row>
        <v-data-table
            :headers="headers"
            :items="payments"
            item-key="name"
            class="elevation-1 mt-0"
            show-select
            v-model="internalSelectedPayments"
            :loading="loading"
            checkbox-color="primary"
        >
            <template v-slot:item.amount="{ item }">
                <span class="text-primary">
                    {{ currencySymbol(item.currency) }}
                    {{ formatCurrency(item.amount) }}
                </span>
            </template>
        </v-data-table>
    </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
    payments: Array,
    selectedPayments: Array,
    searchName: String,
    searchMobile: String,
    totalSelected: Number,
    loading: Boolean,
    posProfile: Object,
    headers: Array,
    currencySymbol: Function,
    formatCurrency: Function
});

const emit = defineEmits(['update:selectedPayments', 'update:searchName', 'update:searchMobile', 'search']);

const internalSelectedPayments = computed({
    get: () => props.selectedPayments,
    set: (val) => emit('update:selectedPayments', val)
});

const internalSearchName = computed({
    get: () => props.searchName,
    set: (val) => emit('update:searchName', val)
});

const internalSearchMobile = computed({
    get: () => props.searchMobile,
    set: (val) => emit('update:searchMobile', val)
});
</script>
