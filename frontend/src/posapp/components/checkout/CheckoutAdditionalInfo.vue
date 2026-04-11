<template>
	<div v-if="invoiceDoc">
		<!-- Additional Invoice Information (Delivery, Address, Notes) -->
		<v-row class="pa-1">
			<!-- Delivery Date and Address (if applicable) -->
			<v-col cols="6" v-if="posProfile.posa_allow_sales_order && invoiceType === 'Order'">
				<VueDatePicker
					:model-value="newDeliveryDate"
					model-type="format"
					format="dd-MM-yyyy"
					:min-date="new Date()"
					auto-apply
					class="sleek-field pos-themed-input"
					@update:model-value="$emit('update:newDeliveryDate', $event)"
				/>
			</v-col>
			<v-col cols="6" v-if="returnValidityEnabled && !invoiceDoc.is_return">
				<VueDatePicker
					:model-value="returnValidUptoDate"
					model-type="format"
					format="dd-MM-yyyy"
					:min-date="returnValidityMinDate"
					:enable-time-picker="false"
					auto-apply
					class="sleek-field pos-themed-input"
					:placeholder="$frappe._('Return Valid Until')"
					@update:model-value="$emit('update:returnValidUptoDate', $event)"
				/>
			</v-col>
			<!-- Shipping Address Selection (if delivery date is set) -->
			<v-col cols="12" v-if="invoiceDoc.posa_delivery_date">
				<v-autocomplete
					density="compact"
					clearable
					auto-select-first
					variant="solo"
					color="primary"
					:label="$frappe._('Address')"
					v-model="invoiceDoc.shipping_address_name"
					:items="addresses"
					item-title="display_title"
					item-value="name"
					class="sleek-field pos-themed-input"
					:no-data-text="$__('Address not found')"
					hide-details
					:custom-filter="addressFilter"
					append-icon="mdi-plus"
					@click:append="$emit('new-address')"
				>
					<template v-slot:item="{ props, item }">
						<v-list-item v-bind="props">
							<v-list-item-title class="text-primary text-subtitle-1">
								<div
									v-html="(item?.raw && item.raw.address_title) || item.address_title"
								></div>
							</v-list-item-title>
							<v-list-item-subtitle>
								<div
									v-html="(item?.raw && item.raw.address_line1) || item.address_line1"
								></div>
							</v-list-item-subtitle>
							<v-list-item-subtitle
								v-if="(item?.raw && item.raw.address_line2) || item.address_line2"
							>
								<div
									v-html="(item?.raw && item.raw.address_line2) || item.address_line2"
								></div>
							</v-list-item-subtitle>
							<v-list-item-subtitle v-if="(item?.raw && item.raw.city) || item.city">
								<div v-html="(item?.raw && item.raw.city) || item.city"></div>
							</v-list-item-subtitle>
							<v-list-item-subtitle v-if="(item?.raw && item.raw.state) || item.state">
								<div v-html="(item?.raw && item.raw.state) || item.state"></div>
							</v-list-item-subtitle>
							<v-list-item-subtitle v-if="(item?.raw && item.raw.country) || item.country">
								<div v-html="(item?.raw && item.raw.country) || item.country"></div>
							</v-list-item-subtitle>
							<v-list-item-subtitle v-if="(item?.raw && item.raw.mobile_no) || item.mobile_no">
								<div v-html="(item?.raw && item.raw.mobile_no) || item.mobile_no"></div>
							</v-list-item-subtitle>
							<v-list-item-subtitle
								v-if="(item?.raw && item.raw.address_type) || item.address_type"
							>
								<div v-html="(item?.raw && item.raw.address_type) || item.address_type"></div>
							</v-list-item-subtitle>
						</v-list-item>
					</template>
				</v-autocomplete>
			</v-col>

			<!-- Additional Notes (if enabled in POS profile) -->
			<v-col cols="12" v-if="posProfile.posa_display_additional_notes">
				<v-textarea
					class="pa-0 sleek-field"
					variant="solo"
					density="compact"
					clearable
					color="primary"
					auto-grow
					rows="2"
					:label="$frappe._('Additional Notes')"
					v-model="invoiceDoc.posa_notes"
				></v-textarea>
			</v-col>
			<v-col cols="12" md="6" v-if="posProfile.posa_display_authorization_code">
				<v-text-field
					class="sleek-field pos-themed-input"
					variant="solo"
					density="compact"
					clearable
					color="primary"
					:label="$frappe._('Authorization Code')"
					v-model="invoiceDoc.posa_authorization_code"
					hide-details
					autocomplete="off"
					maxlength="32"
				></v-text-field>
			</v-col>
		</v-row>
	</div>
</template>

<script setup>
import { inject } from "vue";

defineProps({
	invoiceDoc: {
		type: Object,
		required: true,
	},
	posProfile: {
		type: [Object, String],
		default: () => ({}),
	},
	invoiceType: {
		type: String,
		default: "Invoice",
	},
	returnValidityEnabled: {
		type: Boolean,
		default: false,
	},
	returnValidityMinDate: {
		type: Date,
		default: () => new Date(),
	},
	addresses: {
		type: Array,
		default: () => [],
	},
	newDeliveryDate: {
		type: String,
		default: null,
	},
	returnValidUptoDate: {
		type: String,
		default: null,
	},
	addressFilter: {
		type: Function,
		default: () => true,
	},
});

defineEmits(["update:newDeliveryDate", "update:returnValidUptoDate", "new-address"]);

const $frappe = inject("frappe", window.frappe);
const $__ = inject("__", window.__);
</script>

<style scoped>
.pos-themed-input :deep(.v-field__input) {
	font-weight: 500;
}
</style>
