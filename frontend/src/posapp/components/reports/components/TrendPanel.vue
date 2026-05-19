<template>
	<div class="trend-panel">
		<div class="summary-metric__label">
			<slot name="title">{{ title }}</slot>
		</div>
		<slot />
	</div>
</template>

<script setup lang="ts">
defineProps<{
	title?: string;
}>();
</script>
