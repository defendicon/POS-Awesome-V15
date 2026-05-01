import type { Ref } from "vue";
import { watch } from "vue";

type EventBusLike = {
	emit?: (event: string, ...args: any[]) => void;
};

type RealtimeLike = {
	on?: (event: string, handler: (...args: any[]) => void) => void;
	off?: (event: string, handler?: (...args: any[]) => void) => void;
};

type UseNetworkLifecycleOptions = {
	networkOnline: Ref<boolean>;
	serverOnline: Ref<boolean>;
	serverConnecting: Ref<boolean>;
	internetReachable: Ref<boolean>;
	isIpHost?: Ref<boolean>;
	eventBus?: EventBusLike | null;
	realtime?: RealtimeLike | null;
	isManualOffline: () => boolean;
	onSyncInvoices?: () => void | Promise<void>;
	onConnectivityRecovered?: () => void | Promise<void>;
	onEvaluateBootstrap?: (options?: { allowPrompt?: boolean }) => void;
	onRefreshTaxInclusive?: () => void | Promise<void>;
	checkNetworkConnectivity?: (options?: {
		forceImmediate?: boolean;
	}) => Promise<void>;
};

export function useNetworkLifecycle(options: UseNetworkLifecycleOptions) {
	let started = false;
	let stopWatchers: Array<() => void> = [];
	const realtimeHandlers: Array<[string, (...args: any[]) => void]> = [];

	const networkProxy = {
		get networkOnline() {
			return options.networkOnline.value;
		},
		set networkOnline(value) {
			options.networkOnline.value = Boolean(value);
		},
		get serverOnline() {
			return options.serverOnline.value;
		},
		set serverOnline(value) {
			options.serverOnline.value = Boolean(value);
		},
		get serverConnecting() {
			return options.serverConnecting.value;
		},
		set serverConnecting(value) {
			options.serverConnecting.value = Boolean(value);
		},
		get internetReachable() {
			return options.internetReachable.value;
		},
		set internetReachable(value) {
			options.internetReachable.value = Boolean(value);
		},
		get isIpHost() {
			return options.isIpHost?.value || false;
		},
		set isIpHost(value) {
			if (options.isIpHost) {
				options.isIpHost.value = Boolean(value);
			}
		},
		onConnectivityRecovered: async () => {
			await options.onConnectivityRecovered?.();
		},
		$forceUpdate: () => {},
		checkNetworkConnectivity: async (checkOptions = {}) => {
			if (options.checkNetworkConnectivity) {
				await options.checkNetworkConnectivity(checkOptions);
				return;
			}
			const { checkNetworkConnectivity: utilsCheckNetworkConnectivity } =
				await import("../core/useNetwork");
			await utilsCheckNetworkConnectivity.call(
				networkProxy as any,
				checkOptions,
			);
		},
	};

	const handleOnline = () => {
		if (options.isManualOffline()) {
			return;
		}
		const wasOnline = options.networkOnline.value;
		options.networkOnline.value = true;
		options.internetReachable.value = true;
		void networkProxy.checkNetworkConnectivity();
		if (!wasOnline) {
			void options.onConnectivityRecovered?.();
		}
	};

	const handleOffline = () => {
		if (options.isManualOffline()) {
			return;
		}
		options.networkOnline.value = false;
		options.internetReachable.value = false;
		options.serverOnline.value = false;
		(window as any).serverOnline = false;
	};

	const handleVisibilityChange = () => {
		if (
			!document.hidden &&
			navigator.onLine &&
			!options.isManualOffline()
		) {
			void networkProxy.checkNetworkConnectivity();
		}
	};

	function registerRealtime(
		event: string,
		handler: (...args: any[]) => void,
	) {
		options.realtime?.on?.(event, handler);
		realtimeHandlers.push([event, handler]);
	}

	function start() {
		if (started) {
			return;
		}
		started = true;
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		document.addEventListener("visibilitychange", handleVisibilityChange);

		stopWatchers = [
			watch(options.networkOnline, (newVal, oldVal) => {
				if (newVal && !oldVal) {
					void options.onRefreshTaxInclusive?.();
					options.eventBus?.emit?.("network-online");
					void options.onSyncInvoices?.();
					options.onEvaluateBootstrap?.({ allowPrompt: false });
				}
			}),
			watch(options.serverOnline, (newVal, oldVal) => {
				if (newVal && !oldVal) {
					options.eventBus?.emit?.("server-online");
					void options.onSyncInvoices?.();
					options.onEvaluateBootstrap?.({ allowPrompt: false });
				}
			}),
		];

		registerRealtime("connect", () => {
			options.serverOnline.value = true;
			(window as any).serverOnline = true;
			options.serverConnecting.value = false;
		});
		registerRealtime("disconnect", () => {
			options.serverOnline.value = false;
			(window as any).serverOnline = false;
			options.serverConnecting.value = false;
		});
		registerRealtime("connecting", () => {
			options.serverConnecting.value = true;
		});
		registerRealtime("reconnect", () => {
			(window as any).serverOnline = true;
			void options.onConnectivityRecovered?.();
		});
	}

	function stop() {
		if (!started) {
			return;
		}
		started = false;
		window.removeEventListener("online", handleOnline);
		window.removeEventListener("offline", handleOffline);
		document.removeEventListener(
			"visibilitychange",
			handleVisibilityChange,
		);
		stopWatchers.forEach((stopWatcher) => stopWatcher());
		stopWatchers = [];
		realtimeHandlers.splice(0).forEach(([event, handler]) => {
			options.realtime?.off?.(event, handler);
		});
	}

	async function retry() {
		const { manualNetworkRetry } = await import("../core/useNetwork");
		await manualNetworkRetry(networkProxy as any);
	}

	return {
		start,
		stop,
		retry,
		networkProxy,
		options,
	};
}
