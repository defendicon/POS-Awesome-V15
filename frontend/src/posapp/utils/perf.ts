/**
 * Performance profiling utilities for the POS application.
 */

const hasWindow = typeof window !== "undefined";
const hasPerformance = typeof performance !== "undefined";

/**
 * Checks if performance profiling is enabled.
 */
export function isPerfEnabled(): boolean {
	return hasWindow && Boolean((window as any).__PROF__);
}

/**
 * Generates a mark name with a suffix.
 */
function markName(label: string, suffix: string): string {
	return `${label}-${suffix}`;
}

/**
 * Marks the start of a performance measurement.
 */
export function perfMarkStart(label: string): string | null {
	if (!isPerfEnabled() || !hasPerformance || !performance.mark) {
		return null;
	}
	const start = markName(label, "start");
	try {
		performance.mark(start);
	} catch (err) {
		console.warn("PERF start mark failed", label, err);
	}
	return start;
}

/**
 * Marks the end of a performance measurement.
 */
export function perfMarkEnd(label: string, startMark?: string | null): void {
	if (
		!isPerfEnabled() ||
		!hasPerformance ||
		!performance.mark ||
		!performance.measure
	) {
		return;
	}
	const end = markName(label, "end");
	try {
		performance.mark(end);
		if (startMark) {
			performance.measure(label, startMark, end);
		} else {
			performance.measure(label);
		}
	} catch (err) {
		console.warn("PERF end mark failed", label, err);
	} finally {
		if (performance.clearMarks) {
			if (startMark) performance.clearMarks(startMark);
			performance.clearMarks(end);
		}
	}
}

/**
 * Wraps a function with performance measurement.
 */
export function withPerf<T extends (..._args: any[]) => any>(
	label: string,
	fn: T,
): T {
	return function withPerfWrapper(this: any, ...args: any[]) {
		const start = perfMarkStart(label);
		const result = fn.apply(this, args);
		if (result && typeof result.then === "function") {
			return result.finally(() => perfMarkEnd(label, start));
		}
		perfMarkEnd(label, start);
		return result;
	} as T;
}

/**
 * Schedules a callback to run on the next animation frame.
 */
export function scheduleFrame(callback?: () => void): Promise<void> {
	return new Promise((resolve) => {
		const scheduler =
			typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (cb: FrameRequestCallback) => setTimeout(cb, 16);
		scheduler(() => {
			if (callback) {
				try {
					callback();
				} catch (e) {
					console.error(e);
				}
			}
			resolve();
		});
	});
}

let longTaskCleanup: (() => void) | null = null;

/**
 * Initializes a performance observer for long tasks.
 */
export function initLongTaskObserver(
	label: string = "pos-long-task",
): () => void {
	if (!isPerfEnabled() || typeof PerformanceObserver === "undefined") {
		return () => {};
	}
	if (longTaskCleanup) {
		return longTaskCleanup;
	}
	try {
		const observer = new PerformanceObserver((list) => {
			list.getEntries().forEach((entry) => {
				console.warn(
					`%c[PERF][LongTask] ${label}: ${entry.duration.toFixed(1)}ms`,
					"color:#d97706",
					entry,
				);
			});
		});
		observer.observe({ entryTypes: ["longtask"] });
		longTaskCleanup = () => observer.disconnect();
	} catch (err) {
		console.warn("PERF long task observer failed", err);
		longTaskCleanup = () => {};
	}
	return longTaskCleanup;
}

/**
 * Logs component render information for profiling.
 */
export function logComponentRender(
	vm: any,
	componentName: string,
	phase: string,
	details: Record<string, any> = {},
): void {
	if (!isPerfEnabled() || !vm) {
		return;
	}
	const key = "__perfRenderCount";
	if (!vm[key]) {
		vm[key] = { mounted: 0, updates: 0 };
	}
	if (phase === "mounted") {
		vm[key].mounted += 1;
		vm[key].updates = 0;
	} else {
		vm[key].updates += 1;
	}
	const count = phase === "mounted" ? vm[key].mounted : vm[key].updates;
	console.info(
		`%c[PERF][render] ${componentName} ${phase} #${count}`,
		"color:#2563eb",
		{
			time: hasPerformance ? performance.now() : Date.now(),
			...details,
		},
	);
}

/**
 * Attaches profiler helper functions to the global window object.
 */
export function attachProfilerHelpers(): void {
	if (!hasWindow) {
		return;
	}
	(window as any).__POS_PROFILER__ = (window as any).__POS_PROFILER__ || {
		enable() {
			(window as any).__PROF__ = true;
			return initLongTaskObserver();
		},
		disable() {
			(window as any).__PROF__ = false;
			if (longTaskCleanup) {
				longTaskCleanup();
				longTaskCleanup = null;
			}
		},
		initLongTaskObserver,
	};
}
