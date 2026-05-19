<template>
	<div class="empty-state">
		<slot>{{ message }}</slot>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	message?: string;
}>();
</script>
