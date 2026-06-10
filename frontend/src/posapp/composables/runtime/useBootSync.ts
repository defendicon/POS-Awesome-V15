type OfflineSyncRuntimeLike = {
	startTimerSync: () => unknown;
	stopTimerSync: () => void;
	scheduleBootWarmSync: () => Promise<boolean>;
	triggerOnlineResumeSync: () => Promise<boolean>;
	triggerOperatorRefreshSync: (_options?: {
		includeBootSync?: boolean;
	}) => Promise<boolean>;
};

type UseBootSyncOptions = {
	offlineSyncRuntime: OfflineSyncRuntimeLike;
	evaluateBootstrapSnapshot: (_options?: { allowPrompt?: boolean }) => void;
	getLastRunSummary?: () => unknown;
	onRefreshStateChange?: (_active: boolean) => void;
};

export function useBootSync(options: UseBootSyncOptions) {
	let started = false;

	function logFailure(message: string, error: unknown) {
		console.error(message, error, options.getLastRunSummary?.());
	}

	function start() {
		if (started) {
			return;
		}
		started = true;
		options.offlineSyncRuntime.startTimerSync();
	}

	function stop() {
		if (!started) {
			return;
		}
		started = false;
		options.offlineSyncRuntime.stopTimerSync();
	}

	function scheduleBootCriticalWarmSync() {
		return options.offlineSyncRuntime
			.scheduleBootWarmSync()
			.catch((error) => {
				logFailure("Failed to schedule offline sync", error);
				return false;
			})
			.finally(() => {
				options.evaluateBootstrapSnapshot({ allowPrompt: false });
			});
	}

	function triggerOnlineResumeSync() {
		return options.offlineSyncRuntime
			.triggerOnlineResumeSync()
			.catch((error) => {
				logFailure("Failed to trigger online resume sync", error);
				return false;
			})
			.finally(() => {
				options.evaluateBootstrapSnapshot({ allowPrompt: false });
			});
	}

	function triggerOperatorRefreshSync(refreshOptions = {}) {
		options.onRefreshStateChange?.(true);
		return Promise.resolve()
			.then(() =>
				options.offlineSyncRuntime.triggerOperatorRefreshSync(
					refreshOptions,
				),
			)
			.catch((error) => {
				logFailure("Failed to run operator offline refresh", error);
				return false;
			})
			.finally(() => {
				options.onRefreshStateChange?.(false);
				options.evaluateBootstrapSnapshot({ allowPrompt: false });
			});
	}

	return {
		start,
		stop,
		scheduleBootCriticalWarmSync,
		triggerOnlineResumeSync,
		triggerOperatorRefreshSync,
	};
}
