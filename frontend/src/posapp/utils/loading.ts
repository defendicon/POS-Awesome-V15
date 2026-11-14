import { reactive } from "vue";
import {
	startBootstrapLoading,
	stopBootstrapLoading,
	setScopeMeta,
} from "../composables/core/useLoading";

/**
 * Interface representing the global loading state.
 */
export interface LoadingState {
	active: boolean;
	progress: number;
	sources: Record<string, number>;
	releasedSources: Record<string, boolean>;
	message: string;
	sourceMessages: Record<string, string>;
}

// Internal tracking variables
let sourceCount = 0;
let completedSum = 0;
let isCompleting = false;
const sourceReleaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearAllSourceReleaseTimers(): void {
	sourceReleaseTimers.forEach((timer) => clearTimeout(timer));
	sourceReleaseTimers.clear();
}

/**
 * Reactive loading state used by the UI.
 */
export const loadingState = reactive<LoadingState>({
	active: false,
	progress: 0,
	sources: {},
	releasedSources: {},
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
	clearAllSourceReleaseTimers();
	loadingState.sources = {};
	loadingState.releasedSources = {};
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
	startBootstrapLoading();
	setScopeMeta("bootstrap", {
		kind: "bootstrap",
		blocking: true,
		message: loadingState.message,
		progress: 0,
	});
}

/**
 * Sets the progress of a specific source.
 * @param name The source name
 * @param value Progress value (0-100)
 */
export function setSourceProgress(name: string, value: number): void {
	// Safety checks
	if (
		!(name in loadingState.sources) ||
		loadingState.releasedSources[name] ||
		isCompleting ||
		sourceCount === 0
	)
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
	setScopeMeta("bootstrap", {
		message: loadingState.message,
		progress: loadingState.progress,
	});

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
		setScopeMeta("bootstrap", {
			message: loadingState.message,
			progress: loadingState.progress,
		});
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
	loadingState.message = Object.keys(loadingState.releasedSources).length
		? __("Startup continuing with limited data")
		: __("Setup complete!");
	setScopeMeta("bootstrap", {
		message: loadingState.message,
		progress: 100,
	});

	// Brief completion phase, then show ready
	setTimeout(() => {
		if (!loadingState.active) return; // Check if still active
		loadingState.message = Object.keys(loadingState.releasedSources).length
			? __("Background loading continues")
			: __("Ready!");
		setScopeMeta("bootstrap", {
			message: loadingState.message,
			progress: 100,
		});

		// Hide after showing ready message
		setTimeout(() => {
			loadingState.active = false;
			loadingState.message = __("Loading app data...");
			stopBootstrapLoading();
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
	clearSourceRelease(name);
	setSourceProgress(name, 100);
}

function releaseSource(name: string): void {
	if (!(name in loadingState.sources) || loadingState.releasedSources[name])
		return;
	const existingProgress = loadingState.sources[name] || 0;
	loadingState.releasedSources[name] = true;
	completedSum = Math.max(0, completedSum - existingProgress);
	sourceCount = Math.max(0, sourceCount - 1);
	loadingState.message = __(`Continuing while ${name} loads...`);
	if (sourceCount === 0 || Math.round(completedSum / sourceCount) >= 100) {
		completeLoading();
	}
}

/**
 * Stops a slow, non-critical source from holding the startup progress surface
 * forever. The underlying load continues and remains authoritative.
 */
export function scheduleSourceRelease(
	name: string,
	timeoutMs: number,
	onRelease?: () => void,
): void {
	clearSourceRelease(name);
	if (!(name in loadingState.sources)) return;

	const timer = setTimeout(
		() => {
			sourceReleaseTimers.delete(name);
			if (
				!(name in loadingState.sources) ||
				(loadingState.sources[name] ?? 0) >= 100
			) {
				return;
			}
			try {
				onRelease?.();
			} finally {
				releaseSource(name);
			}
		},
		Math.max(1, Number(timeoutMs) || 1),
	);
	sourceReleaseTimers.set(name, timer);
}

export function clearSourceRelease(name: string): void {
	const timer = sourceReleaseTimers.get(name);
	if (timer) {
		clearTimeout(timer);
		sourceReleaseTimers.delete(name);
	}
}

/**
 * Manually resets the loading state.
 */
export function resetLoadingState(): void {
	clearAllSourceReleaseTimers();
	loadingState.active = false;
	loadingState.progress = 0;
	loadingState.message = __("Loading app data...");
	loadingState.sources = {};
	loadingState.releasedSources = {};
	sourceCount = 0;
	completedSum = 0;
	isCompleting = false;
	stopBootstrapLoading();
}

/**
 * Gets current loading status for debugging.
 */
export function getLoadingStatus() {
	return {
		active: loadingState.active,
		progress: loadingState.progress,
		sources: { ...loadingState.sources },
		releasedSources: { ...loadingState.releasedSources },
		sourceCount,
		completedSum,
		isCompleting,
	};
}
