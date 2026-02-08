import { ref, computed } from "vue";
// @ts-ignore
import config from "../../config/loading";

const loaders = ref(new Map<string, number>());
const overlayVisible = ref(false);
let delayTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let startTime = 0;

function manageOverlay() {
	const any = loaders.value.size > 0;
	const { delay, minVisible } = config.overlay;
	if (any) {
		if (!overlayVisible.value) {
			if (hideTimer) clearTimeout(hideTimer);
			delayTimer = setTimeout(() => {
				overlayVisible.value = true;
				startTime = Date.now();
			}, delay);
		}
	} else {
		if (delayTimer) clearTimeout(delayTimer);
		if (overlayVisible.value) {
			const elapsed = Date.now() - startTime;
			const remaining = Math.max(minVisible - elapsed, 0);
			hideTimer = setTimeout(() => {
				overlayVisible.value = false;
			}, remaining);
		}
	}
}

export function start(id = "global") {
	const count = loaders.value.get(id) || 0;
	loaders.value.set(id, count + 1);
	if (id === "global") manageOverlay();
}

export function stop(id = "global") {
	const count = loaders.value.get(id) || 0;
	if (count <= 1) loaders.value.delete(id);
	else loaders.value.set(id, count - 1);
	if (id === "global") manageOverlay();
}

export function withLoading<T>(
	fn: () => T | Promise<T>,
	id = "global",
): Promise<T> {
	start(id);
	return Promise.resolve()
		.then(fn)
		.finally(() => stop(id));
}

export function useLoading() {
	const isLoading = (id = "global") => computed(() => loaders.value.has(id));
	const isAnyLoading = computed(() => loaders.value.size > 0);
	return {
		start,
		stop,
		withLoading,
		isLoading,
		isAnyLoading,
		overlayVisible,
	};
}

export const isAnyLoading = computed(() => loaders.value.size > 0);
