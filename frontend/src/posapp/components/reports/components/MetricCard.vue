<template>
	<v-card class="metric-card" :class="styleClass" elevation="2">
		<div class="metric-card__header">
			<span class="metric-card__label">{{ label }}</span>
			<v-icon size="20">{{ icon }}</v-icon>
		</div>
		<div class="metric-card__value">{{ value }}</div>
	</v-card>
</template>

<script setup lang="ts">
defineProps<{
	label: string;
	value: string;
	icon: string;
	styleClass?: string;
}>();
</script>
