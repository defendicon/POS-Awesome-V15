import type { SyncTrigger } from "./types";

type ScheduleFrame = (callback: () => void | Promise<void>) => number;
type ScheduleInterval = (
	callback: () => void | Promise<void>,
	intervalMs: number,
) => number | ReturnType<typeof setInterval>;
type ClearIntervalHandle = (
	handle: number | ReturnType<typeof setInterval>,
) => void;
type ScheduleTimeout = (
	callback: () => void | Promise<void>,
	delayMs: number,
) => number | ReturnType<typeof setTimeout>;
type ClearTimeoutHandle = (
	handle: number | ReturnType<typeof setTimeout>,
) => void;

type OfflineSyncRuntimeOptions = {
	canSync: () => boolean;
	canRunTimerSync?: () => boolean;
	runTrigger: (trigger: SyncTrigger) => Promise<void>;
	scheduleFrame?: ScheduleFrame;
	scheduleInterval?: ScheduleInterval;
	clearScheduledInterval?: ClearIntervalHandle;
	scheduleTimeout?: ScheduleTimeout;
	clearScheduledTimeout?: ClearTimeoutHandle;
	timerIntervalMs?: number;
	foregroundTimerIntervalMs?: number;
	backgroundTimerIntervalMs?: number;
	ineligibleTimerIntervalMs?: number;
	isDocumentHidden?: () => boolean;
	addVisibilityListener?: (listener: () => void) => (() => void) | void;
};

function defaultScheduleFrame(callback: () => void | Promise<void>) {
	if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
		return window.requestAnimationFrame(() => {
			void callback();
		});
	}
	return window.setTimeout(() => {
		void callback();
	}, 0);
}

export function createOfflineSyncRuntime(options: OfflineSyncRuntimeOptions) {
	let bootPromise: Promise<boolean> | null = null;
	let onlineResumePromise: Promise<boolean> | null = null;
	let timerPromise: Promise<boolean> | null = null;
	let userActionPromise: Promise<boolean> | null = null;
	let timerHandle: number | ReturnType<typeof setTimeout> | null = null;
	let removeVisibilityListener: (() => void) | null = null;
	const scheduleFrame = options.scheduleFrame || defaultScheduleFrame;
	const scheduleTimeout =
		options.scheduleTimeout ||
		((callback, delayMs) =>
			globalThis.setTimeout(() => {
				void callback();
			}, delayMs));
	const clearScheduledTimeout =
		options.clearScheduledTimeout ||
		((handle) => {
			globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
		});
	const foregroundTimerIntervalMs = Math.max(
		5_000,
		options.foregroundTimerIntervalMs || options.timerIntervalMs || 60_000,
	);
	const backgroundTimerIntervalMs = Math.max(
		foregroundTimerIntervalMs,
		options.backgroundTimerIntervalMs || 5 * 60_000,
	);
	const ineligibleTimerIntervalMs = Math.max(
		5_000,
		options.ineligibleTimerIntervalMs || 2 * 60_000,
	);
	const isDocumentHidden =
		options.isDocumentHidden ||
		(() =>
			typeof document !== "undefined" ? document.hidden : false);
	const canRunTimerSync = options.canRunTimerSync || options.canSync;
	const addVisibilityListener =
		options.addVisibilityListener ||
		((listener) => {
			if (typeof document === "undefined") {
				return () => undefined;
			}
			document.addEventListener("visibilitychange", listener);
			return () => {
				document.removeEventListener("visibilitychange", listener);
			};
		});

	function getNextTimerDelay(isEligible: boolean) {
		if (!isEligible) {
			return ineligibleTimerIntervalMs;
		}
		return isDocumentHidden()
			? backgroundTimerIntervalMs
			: foregroundTimerIntervalMs;
	}

	function clearPendingTimer() {
		if (timerHandle === null) {
			return;
		}
		clearScheduledTimeout(timerHandle);
		timerHandle = null;
	}

	function scheduleNextTimer(delayMs = getNextTimerDelay(canRunTimerSync())) {
		clearPendingTimer();
		timerHandle = scheduleTimeout(async () => {
			const didRun = await triggerTimerSync();
			scheduleNextTimer(getNextTimerDelay(didRun ? canRunTimerSync() : false));
		}, delayMs);
		return timerHandle;
	}

	function scheduleBootWarmSync() {
		if (bootPromise) {
			return bootPromise;
		}
		if (!options.canSync()) {
			return Promise.resolve(false);
		}

		bootPromise = new Promise<boolean>((resolve, reject) => {
			scheduleFrame(async () => {
				try {
					if (!options.canSync()) {
						resolve(false);
						return;
					}
					await options.runTrigger("boot");
					resolve(true);
				} catch (error) {
					reject(error);
				} finally {
					bootPromise = null;
				}
			});
		});

		return bootPromise;
	}

	function triggerOnlineResumeSync() {
		if (onlineResumePromise) {
			return onlineResumePromise;
		}
		if (!options.canSync()) {
			return Promise.resolve(false);
		}

		onlineResumePromise = (async () => {
			try {
				await options.runTrigger("online_resume");
				return true;
			} finally {
				onlineResumePromise = null;
			}
		})();

		return onlineResumePromise;
	}

	function triggerTimerSync() {
		if (timerPromise) {
			return timerPromise;
		}
		if (!canRunTimerSync()) {
			return Promise.resolve(false);
		}

		timerPromise = (async () => {
			try {
				await options.runTrigger("timer");
				return true;
			} finally {
				timerPromise = null;
			}
		})();

		return timerPromise;
	}

	function triggerUserActionSync() {
		if (userActionPromise) {
			return userActionPromise;
		}
		if (!options.canSync()) {
			return Promise.resolve(false);
		}

		userActionPromise = (async () => {
			try {
				await options.runTrigger("user_action");
				return true;
			} finally {
				userActionPromise = null;
			}
		})();

		return userActionPromise;
	}

	async function triggerOperatorRefreshSync(options: {
		includeBootSync?: boolean;
	} = {}) {
		const { includeBootSync = false } = options;
		let didRun = false;

		if (includeBootSync) {
			didRun = (await scheduleBootWarmSync()) || didRun;
		}

		return (await triggerUserActionSync()) || didRun;
	}

	function startTimerSync() {
		if (timerHandle !== null) {
			return timerHandle;
		}
		if (!removeVisibilityListener) {
			removeVisibilityListener =
				addVisibilityListener?.(() => {
					if (timerHandle === null) {
						return;
					}
					scheduleNextTimer();
				}) || null;
		}
		return scheduleNextTimer();
	}

	function stopTimerSync() {
		clearPendingTimer();
		if (removeVisibilityListener) {
			removeVisibilityListener();
			removeVisibilityListener = null;
		}
	}

	return {
		scheduleBootWarmSync,
		triggerOnlineResumeSync,
		triggerTimerSync,
		triggerUserActionSync,
		triggerOperatorRefreshSync,
		startTimerSync,
		stopTimerSync,
	};
}
