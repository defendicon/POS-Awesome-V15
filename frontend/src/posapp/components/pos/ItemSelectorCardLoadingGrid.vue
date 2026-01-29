<template>
	<div class="items-card-grid">
		<Skeleton v-for="n in count" :key="n" class="mb-4" height="120" />
	</div>
</template>

<script setup>
import Skeleton from "../ui/Skeleton.vue";

defineProps({
	count: { type: Number, default: 8 },
});
</script>
