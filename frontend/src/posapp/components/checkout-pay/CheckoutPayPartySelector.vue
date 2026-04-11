<template>
	<v-autocomplete
		:model-value="modelValue"
		@update:model-value="$emit('update:modelValue', $event)"
		:items="items"
		:item-title="itemTitle"
		item-value="name"
		:label="resolvedLabel"
		:placeholder="resolvedLabel"
		density="compact"
		variant="solo"
		color="primary"
		hide-details
		clearable
		:loading="loading"
		:custom-filter="() => true"
		:no-data-text="loading ? __('Loading...') : __('No records found')"
		class="sleek-field pos-themed-input"
		@update:search="$emit('search', $event)"
	/>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	modelValue: string | null;
	partyType: string;
	items: Array<Record<string, any>>;
	loading?: boolean;
}>();

defineEmits<{
	"update:modelValue": [value: string | null];
	search: [value: string];
}>();

const __ = (text: string) => (window.__ ? window.__(text) : text);

const itemTitle = computed(() => {
	if (props.partyType === "Supplier") return "supplier_name";
	if (props.partyType === "Employee") return "employee_name";
	return "customer_name";
});

const resolvedLabel = computed(() => __(props.partyType || "Party"));
</script>
