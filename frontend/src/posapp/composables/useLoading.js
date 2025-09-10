import { ref, computed } from "vue";
import config from "../config/loading.js";

const loaders = ref(new Map());
const overlayVisible = ref(false);
let delayTimer = null;
let hideTimer = null;
let startTime = 0;

function manageOverlay() {
	const any = loaders.value.size > 0;
	const { delay, minVisible } = config.overlay;
	if (any) {
		if (!overlayVisible.value) {
			clearTimeout(hideTimer);
			delayTimer = setTimeout(() => {
				overlayVisible.value = true;
				startTime = Date.now();
			}, delay);
		}
	} else {
		clearTimeout(delayTimer);
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

export function withLoading(fn, id = "global") {
	start(id);
	return Promise.resolve()
		.then(fn)
		.finally(() => stop(id));
}

export function useLoading() {
	const isLoading = (id = "global") => computed(() => loaders.value.has(id));
	const isAnyLoading = computed(() => loaders.value.size > 0);
	return { start, stop, withLoading, isLoading, isAnyLoading, overlayVisible };
}

export const isAnyLoading = computed(() => loaders.value.size > 0);
