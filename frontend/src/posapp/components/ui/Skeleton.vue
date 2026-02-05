<template>
	<div :class="['skeleton', { shimmer: !prefersReduced }]" :style="style"></div>
</template>

<script setup>
import { computed } from "vue";
import "../../styles/shimmer.css";

defineOptions({
	name: "Skeleton",
});

const props = defineProps({
	type: { type: String, default: "rect" },
	width: { type: [String, Number], default: "100%" },
	height: { type: [String, Number], default: "1rem" },
});

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const style = computed(() => ({
	width: typeof props.width === "number" ? `${props.width}px` : props.width,
	height: typeof props.height === "number" ? `${props.height}px` : props.height,
	borderRadius: props.type === "circle" ? "50%" : "4px",
}));
</script>

<style scoped>
.skeleton {
	background-color: var(--sk-bg, #e0e0e0);
	position: relative;
	overflow: hidden;
}
</style>
