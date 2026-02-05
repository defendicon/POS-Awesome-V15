<template>
	<div :class="['skeleton', { shimmer: !prefersReduced }]" :style="style"></div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import "../../styles/shimmer.css";

defineOptions({
	name: "Skeleton",
});

interface Props {
	type?: "rect" | "circle";
	width?: string | number;
	height?: string | number;
}

const props = withDefaults(defineProps<Props>(), {
	type: "rect",
	width: "100%",
	height: "1rem",
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
