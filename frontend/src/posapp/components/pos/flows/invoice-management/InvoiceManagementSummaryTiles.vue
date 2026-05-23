<template>
	<div class="summary-grid mb-4">
		<div
			v-for="tile in tiles"
			:key="tile.key"
			:class="['summary-tile', tile.modifier]"
		>
			<div class="summary-tile__label">{{ tile.label }}</div>
			<div class="summary-tile__value">{{ tile.value }}</div>
			<div v-if="tile.meta" class="summary-tile__meta">{{ tile.meta }}</div>
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	tiles: Array<{
		key: string;
		modifier?: string;
		label: string;
		value: string | number;
		meta?: string;
	}>;
}>();
</script>
