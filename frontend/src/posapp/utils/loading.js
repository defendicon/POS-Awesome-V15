/* global __ */
import { reactive } from "vue";
import { start as startGlobalLoading, stop as stopGlobalLoading } from "../composables/useLoading.js";

// Loading state variables
let sourceCount = 0;
let completedSum = 0;
let isCompleting = false;

export const loadingState = reactive({
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

export function initLoadingSources(list) {
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

export function setSourceProgress(name, value) {
	// Safety checks
	if (!(name in loadingState.sources) || isCompleting || sourceCount === 0) return;

	// Clamp value between 0 and 100 and prevent regressions
	const clampedValue = Math.max(0, Math.min(100, value));
	const oldValue = loadingState.sources[name];
	const newValue = Math.max(oldValue, clampedValue);

	loadingState.sources[name] = newValue;

	// Update message only if it changed
	const newMessage = loadingState.sourceMessages[name] || __(`Loading ${name}...`);
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

function animateProgress(from, to) {
	// Use requestAnimationFrame for better performance than setInterval
	if (from === to) return;

	const startTime = performance.now();
	const duration = 300;

	function updateProgress(currentTime) {
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

function completeLoading() {
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

export function markSourceLoaded(name) {
	console.log(`Loading source marked as loaded: ${name}`);
	setSourceProgress(name, 100);
}

// Utility function to manually reset loading state
export function resetLoadingState() {
	loadingState.active = false;
	loadingState.progress = 0;
	loadingState.message = __("Loading app data...");
	loadingState.sources = {};
	sourceCount = 0;
	completedSum = 0;
	isCompleting = false;
	stopGlobalLoading();
}

// Get current loading status for debugging
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
