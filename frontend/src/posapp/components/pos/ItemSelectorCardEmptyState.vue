<template>
	<div
		class="d-flex flex-column align-center justify-center text-center fill-height pa-4"
		style="height: 100%; min-height: 200px"
	>
		<v-icon size="64" color="grey-lighten-1" class="mb-4">mdi-package-variant-closed</v-icon>
		<div class="text-h6 text-medium-emphasis mb-1">
			{{ __("No items found") }}
		</div>
		<div class="text-body-2 text-medium-emphasis">
			{{ __("Try adjusting your search or filters") }}
		</div>
		<v-btn v-if="showClearSearch" variant="text" color="primary" class="mt-4" @click="emit('clear')">
			{{ __("Clear Search") }}
		</v-btn>
	</div>
</template>

<script setup>
defineProps({
	showClearSearch: { type: Boolean, default: false },
});

const emit = defineEmits(["clear"]);
</script>
