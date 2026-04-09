import type { SyncTrigger } from "./types";

type ScheduleFrame = (callback: () => void | Promise<void>) => number;

type OfflineSyncRuntimeOptions = {
	canSync: () => boolean;
	runTrigger: (trigger: SyncTrigger) => Promise<void>;
	scheduleFrame?: ScheduleFrame;
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
	const scheduleFrame = options.scheduleFrame || defaultScheduleFrame;

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

	return {
		scheduleBootWarmSync,
		triggerOnlineResumeSync,
	};
}
