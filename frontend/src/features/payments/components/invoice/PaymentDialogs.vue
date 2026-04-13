<template>
	<div class="payment-dialogs">
		<!-- Custom Days Dialog -->
		<v-dialog
			:model-value="customDaysDialog"
			max-width="300px"
			:retain-focus="false"
			@update:model-value="$emit('update:customDaysDialog', $event)"
		>
			<v-card>
				<v-card-title class="text-h6">
					{{ $__("Custom Due Days") }}
				</v-card-title>
				<v-card-text class="pa-0">
					<v-container>
						<v-text-field
							density="compact"
							variant="solo"
							type="number"
							min="0"
							max="365"
							class="sleek-field pos-themed-input"
							:model-value="customDaysValue"
							:label="$frappe._('Days')"
							hide-details
							@update:model-value="$emit('update:customDaysValue', parseFloat($event))"
						></v-text-field>
					</v-container>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="$emit('update:customDaysDialog', false)">
						{{ $__("Close") }}
					</v-btn>
					<v-btn color="primary" theme="dark" @click="$emit('apply-custom-days')">
						{{ $__("Apply") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Phone Payment Dialog -->
		<v-dialog
			:model-value="phoneDialog"
			max-width="400px"
			:retain-focus="false"
			@update:model-value="$emit('update:phoneDialog', $event)"
		>
			<v-card v-if="invoiceDoc">
				<v-card-title>
					<span class="text-h5 text-primary">{{ $__("Confirm Mobile Number") }}</span>
				</v-card-title>
				<v-card-text class="pa-0">
					<v-container>
						<v-text-field
							density="compact"
							variant="solo"
							color="primary"
							:label="$frappe._('Mobile Number')"
							class="sleek-field pos-themed-input"
							hide-details
							v-model="invoiceDoc.contact_mobile"
							type="number"
						></v-text-field>
					</v-container>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="$emit('update:phoneDialog', false)">
						{{ $__("Close") }}
					</v-btn>
					<v-btn color="primary" theme="dark" @click="$emit('request-payment')">
						{{ $__("Request") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup>
import { inject } from "vue";

defineProps({
	customDaysDialog: {
		type: Boolean,
		default: false,
	},
	customDaysValue: {
		type: Number,
		default: null,
	},
	phoneDialog: {
		type: Boolean,
		default: false,
	},
	invoiceDoc: {
		type: Object,
		required: true,
	},
});

defineEmits([
	"update:customDaysDialog",
	"update:customDaysValue",
	"apply-custom-days",
	"update:phoneDialog",
	"request-payment",
]);

const $frappe = inject("frappe", window.frappe);
const $__ = inject("__", window.__);
</script>

<style scoped>
.pos-themed-input :deep(.v-field__input) {
	font-weight: 500;
}
</style>
