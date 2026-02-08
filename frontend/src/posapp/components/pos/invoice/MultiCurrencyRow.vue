<template>
	<v-row align="center" class="items px-3 py-2 mt-0" v-if="pos_profile.posa_allow_multi_currency">
		<v-col cols="12" sm="4" class="pb-2">
			<v-select
				density="compact"
				variant="solo"
				color="primary"
				:label="currencyLabel"
				class="pos-themed-input sleek-field"
				hide-details
				v-model="internal_selected_currency"
				:items="available_currencies"
				@update:model-value="onCurrencyUpdate"
			></v-select>
		</v-col>
		<v-col cols="12" sm="4" class="pb-2">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="priceListLabel"
				class="pos-themed-input sleek-field"
				hide-details
				v-model="internal_plc_rate"
				:rules="[isNumber]"
				@change="onPlcRateChange"
			></v-text-field>
		</v-col>
		<v-col cols="12" sm="4" class="pb-2">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="conversionRateLabel"
				class="pos-themed-input sleek-field"
				hide-details
				v-model="internal_conversion_rate"
				:rules="[isNumber]"
				@change="onConversionChange"
			></v-text-field>
		</v-col>
	</v-row>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { POSProfile } from "../../../types/models";

interface Props {
	pos_profile: POSProfile | any;
	selected_currency?: string;
	plc_conversion_rate?: number;
	conversion_rate?: number;
	available_currencies?: string[];
	isNumber: (_val: any) => boolean | string;
	price_list_currency?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(_e: "update:selected_currency", _val: string): void;
	(_e: "update:plc_conversion_rate", _val: number | undefined): void;
	(_e: "update:conversion_rate", _val: number | undefined): void;
}>();

const internal_selected_currency = ref(props.selected_currency);
const internal_plc_rate = ref(props.plc_conversion_rate);
const internal_conversion_rate = ref(props.conversion_rate);

const currencyLabel = computed(() => frappe._("Currency"));
const conversionRateLabel = computed(() => frappe._("Conversion Rate"));
const priceListLabel = computed(
	() => "Price List " + props.price_list_currency + " to " + internal_selected_currency.value,
);

watch(
	() => props.selected_currency,
	(val) => {
		internal_selected_currency.value = val;
	},
);

watch(
	() => props.plc_conversion_rate,
	(val) => {
		internal_plc_rate.value = val;
	},
);

watch(
	() => props.conversion_rate,
	(val) => {
		internal_conversion_rate.value = val;
	},
);

const onCurrencyUpdate = (val: any) => {
	emit("update:selected_currency", val);
};

const onPlcRateChange = () => {
	emit("update:plc_conversion_rate", internal_plc_rate.value);
};

const onConversionChange = () => {
	emit("update:conversion_rate", internal_conversion_rate.value);
};
</script>

<style scoped></style>
