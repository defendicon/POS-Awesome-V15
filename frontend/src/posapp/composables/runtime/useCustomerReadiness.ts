import type { Ref } from "vue";
import { watch } from "vue";
import { ensureCustomersReady as defaultEnsureCustomersReady } from "../../modules/customers/customerLoadingCoordinator";

type CustomerProfile = {
	name?: string | null;
	modified?: string | null;
};

type UseCustomerReadinessOptions = {
	profile: Ref<CustomerProfile | null | undefined>;
	isOnline: () => boolean;
	isManualOffline: () => boolean;
	setProfile: (_profile: CustomerProfile | null) => void;
	load: (localOnly?: boolean) => Promise<void>;
	isReady?: () => boolean;
	onProfileReady?: (_profile: CustomerProfile) => void | Promise<void>;
	ensureCustomersReady?: typeof defaultEnsureCustomersReady;
};

export function useCustomerReadiness(options: UseCustomerReadinessOptions) {
	let stopWatcher: (() => void) | null = null;
	let lastReadyKey = "";

	function start() {
		if (stopWatcher) {
			return;
		}
		stopWatcher = watch(
			[options.profile, options.isOnline, options.isManualOffline],
			([newProfile, online, manualOffline]) => {
				if (!newProfile?.name) {
					return;
				}
				const readyKey = `${String(newProfile.name || "").trim()}::${String(newProfile.modified || "").trim()}`;
				if (readyKey && readyKey !== lastReadyKey) {
					lastReadyKey = readyKey;
					void options.onProfileReady?.(newProfile);
				}
				void (
					options.ensureCustomersReady || defaultEnsureCustomersReady
				)({
					profile: newProfile,
					online,
					manualOffline,
					setProfile: options.setProfile,
					load: options.load,
					isReady: options.isReady,
				}).catch((error) => {
					console.warn("Unable to load the POS customer database", error);
				});
			},
			{ deep: true, immediate: true },
		);
	}

	function stop() {
		if (!stopWatcher) {
			return;
		}
		stopWatcher();
		stopWatcher = null;
		lastReadyKey = "";
	}

	return {
		start,
		stop,
	};
}
