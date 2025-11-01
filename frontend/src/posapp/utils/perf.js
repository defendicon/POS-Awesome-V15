const hasWindow = typeof window !== "undefined";
const hasPerformance = typeof performance !== "undefined";

export function isPerfEnabled() {
	return hasWindow && Boolean(window.__PROF__);
}

function markName(label, suffix) {
	return `${label}-${suffix}`;
}

export function perfMarkStart(label) {
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

export function perfMarkEnd(label, startMark) {
	if (!isPerfEnabled() || !hasPerformance || !performance.mark || !performance.measure) {
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
			performance.clearMarks(startMark);
			performance.clearMarks(end);
		}
	}
}

export function withPerf(label, fn) {
	return function withPerfWrapper(...args) {
		const start = perfMarkStart(label);
		const result = fn.apply(this, args);
		if (result && typeof result.then === "function") {
			return result.finally(() => perfMarkEnd(label, start));
		}
		perfMarkEnd(label, start);
		return result;
	};
}

export function scheduleFrame(callback) {
	const scheduler =
		typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
	return scheduler(callback);
}

let longTaskCleanup = null;

export function initLongTaskObserver(label = "pos-long-task") {
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

export function logComponentRender(vm, componentName, phase, details = {}) {
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
	console.info(`%c[PERF][render] ${componentName} ${phase} #${count}`, "color:#2563eb", {
		time: hasPerformance ? performance.now() : Date.now(),
		...details,
	});
}

export function attachProfilerHelpers() {
	if (!hasWindow) {
		return;
	}
	window.__POS_PROFILER__ = window.__POS_PROFILER__ || {
		enable() {
			window.__PROF__ = true;
			return initLongTaskObserver();
		},
		disable() {
			window.__PROF__ = false;
			if (longTaskCleanup) {
				longTaskCleanup();
				longTaskCleanup = null;
			}
		},
		initLongTaskObserver,
	};
}
