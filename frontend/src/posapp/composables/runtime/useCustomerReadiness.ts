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
	setProfile: (profile: CustomerProfile | null) => void;
	load: () => Promise<void>;
	onProfileReady?: (profile: CustomerProfile) => void | Promise<void>;
	ensureCustomersReady?: typeof defaultEnsureCustomersReady;
};

export function useCustomerReadiness(options: UseCustomerReadinessOptions) {
	let stopWatcher: (() => void) | null = null;

	function start() {
		if (stopWatcher) {
			return;
		}
		stopWatcher = watch(
			options.profile,
			(newProfile) => {
				if (!newProfile?.name) {
					return;
				}
				void options.onProfileReady?.(newProfile);
				void (
					options.ensureCustomersReady || defaultEnsureCustomersReady
				)({
					profile: newProfile,
					online: options.isOnline(),
					manualOffline: options.isManualOffline(),
					setProfile: options.setProfile,
					load: options.load,
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
	}

	return {
		start,
		stop,
	};
}
