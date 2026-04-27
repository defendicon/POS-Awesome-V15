import { watch, type Ref, type WatchStopHandle } from "vue";

import { memoryInitPromise } from "../../../../offline/index";
import { ensureItemsReady } from "../../../modules/items/itemLoadingCoordinator";

type PosProfileLike = {
	name?: string | null;
	currency?: string | null;
};

type ItemsIntegrationLike = {
	initializeStore: (
		_profile: PosProfileLike,
		_customer: unknown,
		_priceList: unknown,
	) => Promise<void>;
};

type UseItemsSelectorInitializationArgs = {
	uiPosProfile: Ref<PosProfileLike | null | undefined>;
	selectedCustomer: Ref<unknown>;
	customerPriceList: Ref<unknown>;
	selectedCurrency: Ref<string>;
	selectedExchangeRate: Ref<number>;
	selectedConversionRate: Ref<number>;
	isInitialized: Ref<boolean>;
	initTimeout: Ref<ReturnType<typeof setTimeout> | null>;
	initError: Ref<unknown>;
	itemsIntegration: ItemsIntegrationLike;
	startItemWorker: () => void;
	loadItemSettings: () => void;
	startBackgroundSyncScheduler: () => void;
	timeoutMs?: number;
};

function resolveErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message || error;
	}
	return error;
}

export function startItemsSelectorInitialization({
	uiPosProfile,
	selectedCustomer,
	customerPriceList,
	selectedCurrency,
	selectedExchangeRate,
	selectedConversionRate,
	isInitialized,
	initTimeout,
	initError,
	itemsIntegration,
	startItemWorker,
	loadItemSettings,
	startBackgroundSyncScheduler,
	timeoutMs = 10000,
}: UseItemsSelectorInitializationArgs): WatchStopHandle {
	return watch(
		uiPosProfile,
		async (newProfile) => {
			if (!newProfile?.name || isInitialized.value) {
				return;
			}

			if (initTimeout.value) clearTimeout(initTimeout.value);
			initTimeout.value = setTimeout(() => {
				if (!isInitialized.value) {
					console.warn(
						"ItemsSelector: Initialization taking too long, forcing isInitialized to true.",
					);
					isInitialized.value = true;
				}
			}, timeoutMs);

			try {
				await memoryInitPromise;

				selectedCurrency.value = newProfile.currency || "";
				selectedExchangeRate.value = 1;
				selectedConversionRate.value = 1;

				await ensureItemsReady({
					profile: newProfile,
					customer: selectedCustomer.value as string | null | undefined,
					priceList: customerPriceList.value as string | null | undefined,
					initialize: async () =>
						await itemsIntegration.initializeStore(
							newProfile,
							selectedCustomer.value,
							customerPriceList.value,
						),
				});

				isInitialized.value = true;
				startItemWorker();
				loadItemSettings();
				startBackgroundSyncScheduler();
			} catch (err: unknown) {
				console.error("ItemsSelector: Initialization failed", err);
				initError.value = resolveErrorMessage(err);
				isInitialized.value = true;
			} finally {
				if (initTimeout.value) {
					clearTimeout(initTimeout.value);
					initTimeout.value = null;
				}
			}
		},
		{ immediate: true },
	);
}
