<template>
	<v-row align="center" class="items px-3 py-2 mt-0" v-if="pos_profile.posa_use_delivery_charges">
		<v-col cols="12" sm="8" class="pb-0 mb-0 pr-0 pt-0">
			<v-autocomplete
				density="compact"
				clearable
				auto-select-first
				variant="solo"
				color="primary"
				:label="frappe._('Delivery Charges')"
				v-model="internal_selected_delivery_charge"
				:items="delivery_charges"
				item-title="name"
				item-value="name"
				return-object
				:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
				class="dark-field sleek-field"
				:no-data-text="__('Charges not found')"
				hide-details
				:customFilter="deliveryChargesFilter"
				:disabled="readonly"
				@update:model-value="onUpdate"
			>
				<template v-slot:item="{ props, item }">
					<v-list-item v-bind="props">
						<v-list-item-title
							class="text-primary text-subtitle-1"
							v-html="item.raw.name"
						></v-list-item-title>
						<v-list-item-subtitle v-html="`Rate: ${item.raw.rate}`"></v-list-item-subtitle>
					</v-list-item>
				</template>
			</v-autocomplete>
		</v-col>
		<v-col cols="12" sm="4" class="pb-0 mb-0 pt-0">
			<v-text-field
				density="compact"
				variant="solo"
				color="primary"
				:label="frappe._('Delivery Charges Rate')"
				:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
				class="dark-field sleek-field"
				hide-details
				:model-value="formatCurrency(delivery_charges_rate)"
				:prefix="currencySymbol(pos_profile.currency)"
				disabled
			></v-text-field>
		</v-col>
	</v-row>
</template>

<script>
export default {
	props: {
		pos_profile: Object,
		delivery_charges: Array,
		selected_delivery_charge: [Object, String],
		delivery_charges_rate: Number,
		deliveryChargesFilter: Function,
		formatCurrency: Function,
		currencySymbol: Function,
		readonly: Boolean,
	},
	data() {
		return {
			internal_selected_delivery_charge: this.selected_delivery_charge,
		};
	},
	computed: {
		isDarkTheme() {
			return this.$theme?.current === "dark";
		},
	},
	watch: {
		selected_delivery_charge(val) {
			this.internal_selected_delivery_charge = val;
		},
	},
	methods: {
		onUpdate(val) {
			this.$emit("update:selected_delivery_charge", val);
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
