<template>
	<div class="insight-row">
		<div class="insight-row__top">
			<div class="insight-row__title">
				<slot name="title">{{ title }}</slot>
			</div>
			<div class="insight-row__value" :class="valueClass">
				<slot name="value">{{ value }}</slot>
			</div>
		</div>
		<div v-if="$slots.meta || meta" class="insight-row__meta">
			<slot name="meta">{{ meta }}</slot>
		</div>
		<slot />
	</div>
</template>

<script setup lang="ts">
defineProps<{
	title?: string;
	value?: string;
	meta?: string;
	valueClass?: string;
}>();
</script>
