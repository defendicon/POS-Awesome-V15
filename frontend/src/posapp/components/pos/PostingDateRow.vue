<template>
	<v-row align="center" class="items px-3 py-2 mt-0" v-if="pos_profile.posa_allow_change_posting_date">
		<v-col cols="12" sm="4" class="pb-2">
			<VueDatePicker
				v-model="internal_posting_date_display"
				model-type="format"
				format="dd-MM-yyyy"
				auto-apply
				:placeholder="frappe._('Posting Date')"
				class="sleek-field posting-date-input pos-themed-input"
				@update:model-value="onUpdate"
			/>
		</v-col>
		<v-col
			v-if="pos_profile.posa_enable_price_list_dropdown"
			cols="12"
			sm="6"
			class="pb-2 d-flex align-center"
		>
			<v-select
				density="comfortable"
				variant="solo"
				color="primary"
				:items="priceLists"
				:label="frappe._('Price List')"
				v-model="internal_price_list"
				hide-details
				class="flex-grow-1 sleek-field"
				@update:model-value="onPriceListUpdate"
			/>
			<div v-if="pos_profile.posa_show_customer_balance" class="balance-field ml-3">
				<strong>{{ __("Customer Balance") }}:</strong>
				<span class="balance-value">{{ formatCurrency(customer_balance) }}</span>
			</div>
		</v-col>
		<v-col
			v-else-if="pos_profile.posa_show_customer_balance"
			cols="12"
			sm="8"
			class="pb-2 d-flex align-center"
		>
			<div class="balance-field">
				<strong>{{ __("Customer Balance") }}:</strong>
				<span class="balance-value">{{ formatCurrency(customer_balance) }}</span>
			</div>
		</v-col>
	</v-row>
</template>

<script>
export default {
	props: {
		pos_profile: Object,
		posting_date_display: String,
		customer_balance: Number,
		formatCurrency: Function,
		priceList: String,
		priceLists: Array,
	},
	data() {
		return {
			internal_posting_date_display: this.posting_date_display,
			internal_price_list: this.priceList,
		};
	},
	computed: {},
	watch: {
		posting_date_display(val) {
			this.internal_posting_date_display = val;
		},
		priceList(val) {
			this.internal_price_list = val;
		},
	},
	methods: {
		onUpdate(val) {
			this.$emit("update:posting_date_display", val);
		},
		onPriceListUpdate(val) {
			this.$emit("update:priceList", val);
		},
	},
};
</script>

<style scoped>
/* Theme-aware input styling */
.posting-date-input :deep(.v-field__input),
.posting-date-input :deep(input),
.posting-date-input :deep(.v-label) {
	color: var(--pos-text-primary) !important;
}

.posting-date-input :deep(.v-field__overlay) {
	background-color: var(--pos-input-bg) !important;
}

/* Theme-aware date picker elements */
:deep(.dp__input) {
	background-color: var(--pos-input-bg) !important;
	color: var(--pos-text-primary) !important;
}

:deep(.dp__menu) {
	background-color: var(--pos-card-bg) !important;
	color: var(--pos-text-primary) !important;
}

/* Ensure calendar numbers remain visible across themes */
.posting-date-input :deep(.dp__calendar_header_item),
.posting-date-input :deep(.dp__cell_inner) {
	color: var(--pos-text-primary) !important;
}

/* Sleek design for VueDatePicker */
:deep(.sleek-field) .dp__input_wrap {
	width: 100%;
	box-sizing: border-box;
}

:deep(.sleek-field) .dp__input {
	width: 100%;
	border-radius: 12px;
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
	transition: box-shadow 0.3s ease;
	background-color: var(--field-bg);
	color: var(--text-primary);
	padding: 10px 12px;
}

:deep(.sleek-field:hover) .dp__input {
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

/* Align calendar icon to the right, before the clear icon */
.posting-date-input :deep(.dp__input_icon) {
	inset-inline-start: auto;
	inset-inline-end: 30px;
}

/* Remove extra left padding added for left icon placement */
.posting-date-input :deep(.dp__input_icon_pad) {
	padding-inline-start: 12px;
}

/* Increase right padding to accommodate both icons */
.posting-date-input :deep(.dp__input) {
	padding-right: calc(30px + var(--dp-input-icon-padding));
}
</style>
