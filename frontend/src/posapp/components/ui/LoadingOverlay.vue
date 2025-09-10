<template>
	<transition name="fade">
		<div v-if="isVisible" class="loading-overlay" role="status" aria-live="polite">
			<div class="spinner" :class="{ reduce: prefersReduced }"></div>
			<p v-if="message" class="message">{{ message }}</p>
		</div>
	</transition>
</template>

<script>
import { computed } from "vue";
import { useLoading } from "../../composables/useLoading.js";

export default {
	name: "LoadingOverlay",
	props: {
		visible: { type: Boolean, default: undefined },
		message: { type: String, default: "" },
	},
	setup(props) {
		const { overlayVisible } = useLoading();
		const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const isVisible = computed(() =>
			props.visible !== undefined ? props.visible : overlayVisible.value,
		);
		return { isVisible, prefersReduced };
	},
};
</script>

<style scoped>
.loading-overlay {
	position: fixed;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	background: var(--overlay-bg, rgba(0, 0, 0, 0.4));
	pointer-events: all;
	z-index: 2000;
}
.spinner {
	width: 48px;
	height: 48px;
	border: 4px solid var(--spinner-fg, #fff);
	border-bottom-color: transparent;
	border-radius: 50%;
	animation: spin var(--loading-duration, 0.6s) linear infinite;
}
.spinner.reduce {
	animation-duration: 0.001s;
	animation-iteration-count: 1;
}
@keyframes spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
.message {
	margin-top: 8px;
	color: var(--spinner-fg, #fff);
}
</style>
