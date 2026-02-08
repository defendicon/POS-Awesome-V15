import { reactive } from "vue";
import {
	start as startGlobalLoading,
	stop as stopGlobalLoading,
} from "../composables/core/useLoading";

/**
 * Interface representing the global loading state.
 */
export interface LoadingState {
	active: boolean;
	progress: number;
	sources: Record<string, number>;
	message: string;
	sourceMessages: Record<string, string>;
}

// Internal tracking variables
let sourceCount = 0;
let completedSum = 0;
let isCompleting = false;

/**
 * Reactive loading state used by the UI.
 */
export const loadingState = reactive<LoadingState>({
	active: false,
	progress: 0,
	sources: {},
	message: __("Loading app data..."),
	sourceMessages: {
		init: __("Initializing application..."),
		items: __("Loading product catalog..."),
		customers: __("Loading customer database..."),
	},
});

/**
 * Initializes the loading sources.
 * @param list List of source names to track
 */
export function initLoadingSources(list: string[]): void {
	// Reset state
	loadingState.sources = {};
	sourceCount = list.length;
	completedSum = 0;
	isCompleting = false;

	// Validate input
	if (!list || list.length === 0) {
		console.warn("No loading sources provided");
		return;
	}

	list.forEach((name) => {
		loadingState.sources[name] = 0;
	});

	loadingState.progress = 0;
	loadingState.active = true;
	startGlobalLoading();
}

/**
 * Sets the progress of a specific source.
 * @param name The source name
 * @param value Progress value (0-100)
 */
export function setSourceProgress(name: string, value: number): void {
	// Safety checks
	if (!(name in loadingState.sources) || isCompleting || sourceCount === 0)
		return;

	// Clamp value between 0 and 100 and prevent regressions
	const clampedValue = Math.max(0, Math.min(100, value));
	const oldValue = loadingState.sources[name] || 0;
	const newValue = Math.max(oldValue, clampedValue);

	loadingState.sources[name] = newValue;

	// Update message only if it changed
	const newMessage =
		loadingState.sourceMessages[name] || __(`Loading ${name}...`);
	if (loadingState.message !== newMessage) {
		loadingState.message = newMessage;
	}

	// Only update totals when progress increases
	if (newValue > oldValue) {
		completedSum += newValue - oldValue;
		const newProgress = Math.round(completedSum / sourceCount);

		// Only animate if progress actually changed
		if (newProgress !== loadingState.progress && newProgress <= 100) {
			animateProgress(loadingState.progress, newProgress);
		}

		if (newProgress >= 100 && !isCompleting) {
			completeLoading();
		}
	}
}

/**
 * Animates the progress bar from one value to another.
 */
function animateProgress(from: number, to: number): void {
	if (from === to) return;

	const startTime = performance.now();
	const duration = 300;

	function updateProgress(currentTime: number) {
		const elapsed = currentTime - startTime;
		const progress = Math.min(elapsed / duration, 1);

		// Use easing function for smoother animation
		const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
		loadingState.progress = Math.round(from + (to - from) * eased);

		if (progress < 1) {
			requestAnimationFrame(updateProgress);
		} else {
			loadingState.progress = to;
		}
	}

	requestAnimationFrame(updateProgress);
}

/**
 * Finalizes the loading process.
 */
function completeLoading(): void {
	// Prevent multiple completion calls
	if (isCompleting) return;
	isCompleting = true;

	loadingState.progress = 100;
	loadingState.message = __("Setup complete!");

	// Brief completion phase, then show ready
	setTimeout(() => {
		if (!loadingState.active) return; // Check if still active
		loadingState.message = __("Ready!");

		// Hide after showing ready message
		setTimeout(() => {
			loadingState.active = false;
			loadingState.message = __("Loading app data...");
			stopGlobalLoading();
			// Reset for next use
			sourceCount = 0;
			completedSum = 0;
			isCompleting = false;
		}, 600);
	}, 400);
}

/**
 * Marks a specific source as 100% loaded.
 */
export function markSourceLoaded(name: string): void {
	setSourceProgress(name, 100);
}

/**
 * Manually resets the loading state.
 */
export function resetLoadingState(): void {
	loadingState.active = false;
	loadingState.progress = 0;
	loadingState.message = __("Loading app data...");
	loadingState.sources = {};
	sourceCount = 0;
	completedSum = 0;
	isCompleting = false;
	stopGlobalLoading();
}

/**
 * Gets current loading status for debugging.
 */
export function getLoadingStatus() {
	return {
		active: loadingState.active,
		progress: loadingState.progress,
		sources: { ...loadingState.sources },
		sourceCount,
		completedSum,
		isCompleting,
	};
}
