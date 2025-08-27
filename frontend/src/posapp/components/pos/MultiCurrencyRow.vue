<template>
	<v-row align="center" class="items px-3 py-2 mt-0" v-if="pos_profile.posa_allow_multi_currency">
		<v-col cols="12" sm="4" class="pb-2">
			<v-select
				density="compact"
				variant="solo"
				color="primary"
				:label="frappe._('Currency')"
				:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
				class="dark-field sleek-field"
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
				:label="'Price List ' + price_list_currency + ' to ' + internal_selected_currency"
				:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
				class="dark-field sleek-field"
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
				:label="frappe._('Conversion Rate')"
				:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
				class="dark-field sleek-field"
				hide-details
				v-model="internal_conversion_rate"
				:rules="[isNumber]"
				@change="onConversionChange"
			></v-text-field>
		</v-col>
	</v-row>
</template>

<script>
export default {
	props: {
		pos_profile: Object,
		selected_currency: String,
		plc_conversion_rate: Number,
		conversion_rate: Number,
		available_currencies: Array,
		isNumber: Function,
		price_list_currency: String,
	},
	data() {
		return {
			internal_selected_currency: this.selected_currency,
			internal_plc_rate: this.plc_conversion_rate,
			internal_conversion_rate: this.conversion_rate,
		};
	},
	computed: {
		isDarkTheme() {
			return this.$theme?.current === "dark";
		},
	},
	watch: {
		selected_currency(val) {
			this.internal_selected_currency = val;
		},
		plc_conversion_rate(val) {
			this.internal_plc_rate = val;
		},
		conversion_rate(val) {
			this.internal_conversion_rate = val;
		},
	},
	methods: {
		onCurrencyUpdate(val) {
			this.$emit("update:selected_currency", val);
		},
		onPlcRateChange() {
			this.$emit("update:plc_conversion_rate", this.internal_plc_rate);
		},
		onConversionChange() {
			this.$emit("update:conversion_rate", this.internal_conversion_rate);
		},
	},
};
</script>

<style scoped>
:deep([data-theme="dark"]) .dark-field,
:deep(.v-theme--dark) .dark-field,
::v-deep([data-theme="dark"]) .dark-field,
::v-deep(.v-theme--dark) .dark-field {
	background-color: #1e1e1e !important;
}

:deep([data-theme="dark"]) .dark-field :deep(.v-field__input),
:deep(.v-theme--dark) .dark-field :deep(.v-field__input),
:deep([data-theme="dark"]) .dark-field :deep(input),
:deep(.v-theme--dark) .dark-field :deep(input),
:deep([data-theme="dark"]) .dark-field :deep(.v-label),
:deep(.v-theme--dark) .dark-field :deep(.v-label),
::v-deep([data-theme="dark"]) .dark-field .v-field__input,
::v-deep(.v-theme--dark) .dark-field .v-field__input,
::v-deep([data-theme="dark"]) .dark-field input,
::v-deep(.v-theme--dark) .dark-field input,
::v-deep([data-theme="dark"]) .dark-field .v-label,
::v-deep(.v-theme--dark) .dark-field .v-label {
	color: #fff !important;
}

:deep([data-theme="dark"]) .dark-field :deep(.v-field__overlay),
:deep(.v-theme--dark) .dark-field :deep(.v-field__overlay),
::v-deep([data-theme="dark"]) .dark-field .v-field__overlay,
::v-deep(.v-theme--dark) .dark-field .v-field__overlay {
	background-color: #1e1e1e !important;
}
</style>
