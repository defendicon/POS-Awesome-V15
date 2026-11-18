<template>
	<div class="column-selector-container invoice-items-toolbar">
		<v-text-field
			ref="itemSearchField"
			:model-value="itemSearch"
			@update:model-value="$emit('update:itemSearch', $event)"
			density="compact"
			variant="solo"
			color="primary"
			class="item-search-field pos-themed-input"
			:label="__('Search items or barcode')"
			prepend-inner-icon="mdi-magnify"
			hide-details
			clearable
			autocomplete="off"
			data-pos-arrow-enters-invoice-grid
		></v-text-field>
		<v-btn
			density="compact"
			variant="text"
			color="primary"
			prepend-icon="mdi-tune-variant"
			@click="workspaceCustomization.open('invoice')"
			class="column-selector-btn"
			:aria-label="__('Table options')"
		>
			<span class="invoice-items-toolbar__label">{{ __("Table options") }}</span>
		</v-btn>
	</div>
</template>

<script setup>
import { ref } from "vue";
import { workspaceCustomization } from "../../../composables/core/workspaceCustomization";
defineProps({ itemSearch: { type: String, default: "" } });
defineEmits(["update:itemSearch"]);
const itemSearchField = ref(null);
const focusSearch = () => itemSearchField.value?.focus?.();
const __ = window.__ || ((text) => text);
defineExpose({ focusSearch });
</script>
<style scoped>
.invoice-items-toolbar {
	display: flex;
	align-items: center;
	flex-wrap: nowrap;
	gap: 10px;
	padding: 12px 16px;
}
.invoice-items-toolbar .item-search-field {
	flex: 1 1 0;
	min-width: 0;
	max-width: none;
}
.invoice-items-toolbar .column-selector-btn {
	flex: 0 0 auto;
	font-size: 12px;
	font-weight: 600;
	letter-spacing: normal;
	text-transform: none;
	border-radius: 7px;
}
@media (max-width: 600px) {
	.invoice-items-toolbar {
		padding: 10px;
		gap: 6px;
	}
	.invoice-items-toolbar__label {
		display: none;
	}
	.invoice-items-toolbar .column-selector-btn {
		min-width: 34px;
		padding-inline: 8px;
	}
	.invoice-items-toolbar :deep(.v-btn__prepend) {
		margin-inline: 0;
	}
}
</style>
