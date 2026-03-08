<template>
	<v-card class="cards mb-0 mt-3 dynamic-padding resizable" style="resize: vertical; overflow: auto">
		<v-row no-gutters align="center" justify="center" class="dynamic-spacing-sm">
			<v-col cols="12" class="mb-2">
				<v-select
					:items="itemsGroup"
					:label="frappe._('Items Group')"
					density="compact"
					variant="solo"
					hide-details
					:model-value="modelValue"
					@update:model-value="$emit('update:modelValue', $event)"
				></v-select>
			</v-col>
			<v-col cols="12" class="mb-2" v-if="posProfile.posa_enable_price_list_dropdown !== false">
				<v-text-field
					density="compact"
					variant="solo"
					color="primary"
					:label="frappe._('Price List')"
					hide-details
					:model-value="activePriceList"
					readonly
				></v-text-field>
			</v-col>
			<v-col cols="12" sm="4" class="dynamic-margin-xs">
				<v-btn-toggle
					:model-value="itemsView"
					@update:model-value="$emit('update:itemsView', $event)"
					color="primary"
					group
					density="compact"
					rounded
					class="view-toggle-btn"
				>
					<v-btn value="list">{{ __("List") }}</v-btn>
					<v-btn value="card">{{ __("Card") }}</v-btn>
				</v-btn-toggle>
			</v-col>
			<v-col cols="12" sm="4" class="dynamic-margin-xs">
				<v-btn
					block
					color="warning"
					variant="text"
					@click="$emit('open-offers')"
					class="action-btn-consistent"
				>
					{{ offersCount }} {{ __("Offers") }}
				</v-btn>
			</v-col>
			<v-col cols="12" sm="4" class="dynamic-margin-xs">
				<v-btn
					block
					color="primary"
					variant="text"
					@click="$emit('open-coupons')"
					class="action-btn-consistent"
				>
					{{ couponsCount }} {{ __("Coupons") }}
				</v-btn>
			</v-col>
		</v-row>
	</v-card>
</template>

<script setup>
const __ = window.__;
const frappe = window.frappe;

defineProps({
	modelValue: { type: String, default: "ALL" }, // item_group
	itemsGroup: { type: Array, default: () => [] },
	itemsView: { type: String, default: "card" },
	posProfile: { type: Object, required: true },
	activePriceList: { type: String, default: "" },
	offersCount: { type: Number, default: 0 },
	couponsCount: { type: Number, default: 0 },
});

defineEmits(["update:modelValue", "update:itemsView", "open-offers", "open-coupons"]);
</script>

<style scoped>
.action-btn-consistent {
	min-height: 44px !important;
	margin-top: var(--dynamic-xs) !important;
	padding: var(--pos-space-2) var(--pos-space-3) !important;
	transition: var(--transition-normal) !important;
	border-radius: var(--pos-radius-sm) !important;
	text-transform: none !important;
	font-weight: 600 !important;
}

.action-btn-consistent:hover {
	background-color: rgba(var(--v-theme-primary), 0.1) !important;
	transform: none !important;
}

.view-toggle-btn {
	min-height: 44px;
	border: 1px solid var(--pos-border-light);
	border-radius: var(--pos-radius-sm);
	width: 100%;
}

.view-toggle-btn :deep(.v-btn) {
	min-height: 40px !important;
	flex: 1 1 0;
}

.dynamic-padding {
	padding: var(--dynamic-sm);
}

.dynamic-spacing-sm {
	padding: var(--dynamic-sm) !important;
}

.cards {
	background-color: var(--pos-surface-muted) !important;
	margin-top: var(--dynamic-sm) !important;
	padding: var(--dynamic-sm) !important;
	border: 1px solid var(--pos-border-light);
	border-radius: var(--pos-radius-md) !important;
	box-shadow: none !important;
}

@media (max-width: 768px) {
	.dynamic-padding {
		padding: var(--dynamic-xs);
	}

	.dynamic-spacing-sm {
		padding: var(--dynamic-xs) !important;
	}

	.action-btn-consistent {
		padding: var(--dynamic-xs) !important;
		font-size: 0.875rem !important;
		min-height: 44px !important;
	}
}

@media (max-width: 480px) {
	.cards {
		padding: var(--dynamic-xs) !important;
	}
}
</style>
