<template>
	<transition name="fade">
		<div v-if="isVisible" class="loading-overlay" role="status" aria-live="polite">
			<div class="loading-overlay__panel">
				<div class="loading-overlay__eyebrow">
					<span>{{ __("POS Startup") }}</span>
					<span v-if="showPercentage" class="loading-overlay__percent">
						{{ displayProgress }}%
					</span>
				</div>
				<h2 class="loading-overlay__title">{{ displayMessage }}</h2>
				<p v-if="displayDetail" class="loading-overlay__detail">{{ displayDetail }}</p>
				<div
					class="loading-overlay__progress"
					:class="{ 'loading-overlay__progress--indeterminate': isIndeterminate }"
				>
					<div
						v-if="!isIndeterminate"
						class="loading-overlay__progress-bar"
						:style="{ width: `${displayProgress}%` }"
					></div>
				</div>
			</div>
		</div>
	</transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLoading } from "../../composables/core/useLoading";
import { loadingState } from "../../utils/loading";

defineOptions({
	name: "LoadingOverlay",
});

const __ =
	typeof window !== "undefined" && typeof (window as any).__ === "function"
		? (window as any).__
		: (value: string) => value;

interface Props {
	visible?: boolean;
	message?: string;
	detail?: string;
	progress?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
	message: "",
	detail: "",
	progress: null,
});

const { overlayVisible } = useLoading();

const isVisible = computed(() => {
	if (props.visible !== undefined) {
		return props.visible;
	}
	return overlayVisible.value || loadingState.active;
});

const displayMessage = computed(
	() => props.message || loadingState.message || __("Loading app data..."),
);

const displayDetail = computed(
	() => props.detail || loadingState.detail || "",
);

const displayProgress = computed(() => {
	if (typeof props.progress === "number" && Number.isFinite(props.progress)) {
		return Math.max(0, Math.min(100, Math.round(props.progress)));
	}

	if (loadingState.active) {
		return Math.max(0, Math.min(100, Math.round(loadingState.progress)));
	}

	return null;
});

const isIndeterminate = computed(() => displayProgress.value === null);
const showPercentage = computed(() => displayProgress.value !== null);
</script>

<style scoped>
.loading-overlay {
	position: fixed;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px;
	background:
		radial-gradient(circle at top, rgba(245, 158, 11, 0.14), transparent 32%),
		linear-gradient(180deg, rgba(15, 23, 42, 0.76), rgba(15, 23, 42, 0.9));
	backdrop-filter: blur(8px);
	pointer-events: all;
	z-index: 2000;
}

.loading-overlay__panel {
	width: min(100%, 460px);
	padding: 24px;
	border-radius: 20px;
	background: rgba(255, 255, 255, 0.96);
	box-shadow:
		0 24px 60px rgba(15, 23, 42, 0.28),
		inset 0 1px 0 rgba(255, 255, 255, 0.6);
	border: 1px solid rgba(148, 163, 184, 0.24);
}

.loading-overlay__eyebrow {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 12px;
	font-size: 0.8rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #92400e;
}

.loading-overlay__percent {
	font-size: 1.15rem;
	color: #0f172a;
	letter-spacing: normal;
}

.loading-overlay__title {
	margin: 0;
	font-size: clamp(1.2rem, 2vw, 1.55rem);
	line-height: 1.2;
	color: #0f172a;
}

.loading-overlay__detail {
	margin: 10px 0 18px;
	font-size: 0.95rem;
	line-height: 1.5;
	color: #475569;
}

.loading-overlay__progress {
	position: relative;
	overflow: hidden;
	height: 12px;
	border-radius: 999px;
	background:
		linear-gradient(90deg, rgba(148, 163, 184, 0.18), rgba(148, 163, 184, 0.28));
}

.loading-overlay__progress-bar {
	height: 100%;
	border-radius: inherit;
	background:
		linear-gradient(90deg, #f59e0b, #f97316 48%, #ea580c);
	box-shadow: 0 0 18px rgba(249, 115, 22, 0.34);
	transition: width 0.24s ease;
}

.loading-overlay__progress--indeterminate::before {
	content: "";
	position: absolute;
	inset: 0;
	width: 38%;
	border-radius: inherit;
	background:
		linear-gradient(90deg, rgba(245, 158, 11, 0.2), #f97316, rgba(245, 158, 11, 0.2));
	animation: overlay-indeterminate 1.1s ease-in-out infinite;
}

@keyframes overlay-indeterminate {
	0% {
		transform: translateX(-120%);
	}
	100% {
		transform: translateX(280%);
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

@media (max-width: 640px) {
	.loading-overlay {
		padding: 16px;
	}

	.loading-overlay__panel {
		padding: 20px;
		border-radius: 18px;
	}
}
</style>
