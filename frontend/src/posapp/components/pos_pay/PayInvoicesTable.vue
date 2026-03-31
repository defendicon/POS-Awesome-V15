<!-- eslint-disable vue/multi-word-component-names -->
<template>
	<div>
		<v-row>
			<v-col md="7" cols="12">
				<p>
					<strong>{{ resolvedSectionTitle }}</strong>
					<span v-if="totalOutstanding" class="text-primary"
						>{{ __("- Total Outstanding") }} :
						{{ currencySymbol(posProfile.currency) }}
						{{ formatCurrency(totalOutstanding) }}</span
					>
				</p>
			</v-col>
			<v-col md="5" cols="12">
				<p v-if="totalSelected" class="golden--text text-end">
					<span>{{ __("Total Selected :") }}</span>
					<span>
						{{ currencySymbol(posProfile.currency) }}
						{{ formatCurrency(totalSelected) }}
					</span>
					<small>({{ selectedCount }} invoice(s))</small>
				</p>
			</v-col>
		</v-row>
		<v-row align="center" no-gutters class="mb-1">
			<v-col md="4" cols="12">
				<v-select
					density="compact"
					variant="outlined"
					hide-details
					clearable
					class="pos-themed-input"
					v-model="internalPosProfileSearch"
					:items="normalizedPosProfiles"
					item-title="label"
					item-value="value"
					label="Filter Invoices by POS Profile"
				></v-select>
			</v-col>
			<v-col> </v-col>
			<v-col md="3" cols="12">
				<v-btn
					block
					color="warning"
					theme="dark"
					@click="$emit('search', internalPosProfileSearch)"
					>{{ __("Search") }}</v-btn
				>
			</v-col>
			<v-col md="3" cols="12">
				<v-btn
					v-if="selectedCount"
					block
					color="error"
					theme="dark"
					@click="$emit('clear-selection')"
					>{{ __("Clear") }}</v-btn
				>
			</v-col>
		</v-row>
		<v-row class="mb-2">
			<v-col md="4" cols="12">
				<v-select
					density="compact"
					variant="outlined"
					hide-details
					clearable
					v-model="internalCurrencyFilter"
					:items="['ALL', ...currencies]"
					label="Filter by Currency"
					class="pos-themed-input"
				></v-select>
			</v-col>
			<v-col md="8" cols="12">
				<div class="text-caption text-medium-emphasis mt-2">
					<span v-for="(data, key) in outstandingByCurrency" :key="key" class="mr-4">
						<strong>
							{{ formatCurrency(data.amount) }}
							{{ data.symbol }}
							{{ data.party_currency }}
							<span v-if="data.party_currency !== data.invoice_currency">
								({{ data.invoice_currency }})
							</span>
						</strong>
					</span>
				</div>
			</v-col>
		</v-row>

		<v-row v-if="posProfile.posa_allow_reconcile_payments && invoices.length && partyName" class="mb-2">
			<v-col md="4" cols="12" class="pb-1">
				<v-btn
					block
					color="primary"
					theme="dark"
					:loading="autoReconcileLoading"
					:disabled="autoReconcileLoading"
					@click="$emit('auto-reconcile', internalPosProfileSearch)"
				>
					{{ __("Auto Reconcile") }}
				</v-btn>
			</v-col>
			<v-col md="8" cols="12" v-if="autoReconcileSummary">
				<div class="text-caption text-medium-emphasis">
					{{ autoReconcileSummary }}
				</div>
			</v-col>
		</v-row>

		<v-data-table
			:headers="headers"
			:items="filteredInvoices"
			item-key="voucher_no"
			class="elevation-1 mt-0"
			:loading="loading"
			@click:row="(e, { item }) => $emit('select-row', item)"
			:row-props="invoiceRowProps"
		>
			<template v-slot:item.actions="{ item }">
				<v-checkbox
					:model-value="isInvoiceSelected(item)"
					color="primary"
					@click.stop="$emit('select-row', item)"
				>
				</v-checkbox>
			</template>
			<template v-slot:item.invoice_amount="{ item }">
				{{ currencySymbol(item.currency) }}
				{{ formatCurrency(item.invoice_amount) }}
			</template>
			<template v-slot:item.outstanding_amount="{ item }">
				<span class="text-primary"
					>{{
						currencySymbol(item?.party_account_currency || item?.currency || posProfile.currency)
					}}
					{{ formatCurrency(item?.outstanding_amount || 0) }}</span
				>
			</template>
		</v-data-table>
		<v-divider></v-divider>
	</div>
</template>

<script setup>
import { computed } from "vue";

const __ = (text) => (window.__ ? window.__(text) : text);

const props = defineProps({
	invoices: Array,
	filteredInvoices: Array,
	posProfile: Object,
	posProfilesList: Array,
	posProfileSearch: String,
	currencyFilter: String,
	currencies: Array,
	outstandingByCurrency: Object,
	totalOutstanding: Number,
	totalSelected: Number,
	selectedCount: Number,
	loading: Boolean,
	autoReconcileLoading: Boolean,
	autoReconcileSummary: String,
	partyName: String,
	sectionTitle: String,
	isInvoiceSelected: Function,
	itemClass: Function,
	currencySymbol: Function,
	formatCurrency: Function,
	headers: Array,
});

const emit = defineEmits([
	"update:posProfileSearch",
	"update:currencyFilter",
	"search",
	"clear-selection",
	"auto-reconcile",
	"select-row",
]);

const internalPosProfileSearch = computed({
	get: () => props.posProfileSearch,
	set: (val) => emit("update:posProfileSearch", val),
});

const internalCurrencyFilter = computed({
	get: () => props.currencyFilter,
	set: (val) => emit("update:currencyFilter", val),
});

const normalizedPosProfiles = computed(() =>
	(props.posProfilesList || [])
		.map((profile) => {
			if (typeof profile === "string") {
				return { label: profile, value: profile };
			}

			const name = typeof profile?.name === "string" ? profile.name.trim() : "";
			if (!name) {
				return null;
			}

			return { label: name, value: name };
		})
		.filter(Boolean),
);

const resolvedSectionTitle = computed(() => props.sectionTitle || __("Invoices"));

const invoiceRowProps = ({ item }) => {
	if (!props.itemClass) {
		return {};
	}
	const rowClass = props.itemClass(item);
	return rowClass ? { class: rowClass } : {};
};
</script>
