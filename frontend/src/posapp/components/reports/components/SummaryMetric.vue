<template>
	<div class="summary-metric">
		<div class="summary-metric__label">{{ label }}</div>
		<div class="summary-metric__value" :class="valueClass">
			{{ value }}
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	label: string;
	value: string;
	valueClass?: string;
}>();
</script>
