type UpdateStoreLike = {
	initializeFromStorage: () => void;
	setCurrentVersion: (version: string) => void;
	checkForUpdates: (force?: boolean) => unknown;
};

type UseUpdateChecksOptions = {
	updateStore: UpdateStoreLike;
	buildVersion?: string | null;
	intervalMs?: number;
};

const DEFAULT_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function useUpdateChecks({
	updateStore,
	buildVersion,
	intervalMs = DEFAULT_UPDATE_INTERVAL_MS,
}: UseUpdateChecksOptions) {
	let intervalHandle: number | ReturnType<typeof setInterval> | null = null;
	let started = false;

	function start() {
		if (started) {
			return;
		}
		started = true;
		updateStore.initializeFromStorage();
		if (buildVersion) {
			updateStore.setCurrentVersion(buildVersion);
		}
		void updateStore.checkForUpdates(true);
		intervalHandle = window.setInterval(() => {
			void updateStore.checkForUpdates();
		}, intervalMs);
	}

	function stop() {
		if (!started) {
			return;
		}
		started = false;
		if (intervalHandle !== null) {
			window.clearInterval(intervalHandle);
			intervalHandle = null;
		}
	}

	return {
		start,
		stop,
	};
}
