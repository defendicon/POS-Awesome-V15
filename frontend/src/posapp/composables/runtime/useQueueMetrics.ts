import { ref } from "vue";

type CacheUsage = {
	percentage?: number;
	total?: number;
	indexedDB?: number;
	localStorage?: number;
};

type ToastStoreLike = {
	show?: (options: Record<string, any>) => void;
};

type SyncStoreLike = {
	updatePendingCount?: () => void | Promise<void>;
};

type UseQueueMetricsOptions = {
	getCacheUsageEstimate: () => Promise<CacheUsage>;
	getPendingOfflineInvoiceCount?: () => number;
	getPendingOfflineCashMovementCount?: () => number;
	syncOfflineInvoices?: () => Promise<any>;
	syncOfflineCashMovements?: () => Promise<any>;
	isOffline?: () => boolean;
	syncStore?: SyncStoreLike;
	toastStore?: ToastStoreLike;
	translate?: (message: string, args?: any[]) => string;
};

export function useQueueMetrics(options: UseQueueMetricsOptions) {
	const cacheUsage = ref(0);
	const cacheUsageLoading = ref(false);
	const cacheUsageDetails = ref({ total: 0, indexedDB: 0, localStorage: 0 });
	const syncTotals = ref({ pending: 0, synced: 0, drafted: 0 });
	const __ = options.translate || ((message: string) => message);

	async function refreshCacheUsage() {
		cacheUsageLoading.value = true;
		try {
			const usage = await options.getCacheUsageEstimate();
			cacheUsage.value = usage.percentage || 0;
			cacheUsageDetails.value = {
				total: usage.total || 0,
				indexedDB: usage.indexedDB || 0,
				localStorage: usage.localStorage || 0,
			};
		} catch (error) {
			console.error("Failed to refresh cache usage", error);
		} finally {
			cacheUsageLoading.value = false;
		}
	}

	async function syncQueues() {
		const pending = options.getPendingOfflineInvoiceCount?.() || 0;
		const pendingCashMovements =
			options.getPendingOfflineCashMovementCount?.() || 0;
		if (pending) {
			options.toastStore?.show?.({
				title: `${pending} invoice${pending > 1 ? "s" : ""} pending for sync`,
				color: "warning",
			});
		}
		if (pendingCashMovements) {
			options.toastStore?.show?.({
				title: `${pendingCashMovements} cash movement${pendingCashMovements > 1 ? "s" : ""} pending for sync`,
				color: "warning",
			});
		}
		if (options.isOffline?.()) {
			return;
		}

		const result = await options.syncOfflineInvoices?.();
		const cashMovementResult = await options.syncOfflineCashMovements?.();
		if (result && (result.synced || result.drafted)) {
			if (result.synced) {
				options.toastStore?.show?.({
					title: `${result.synced} offline invoice${result.synced > 1 ? "s" : ""} synced`,
					color: "success",
				});
			}
			if (result.drafted) {
				options.toastStore?.show?.({
					title: `${result.drafted} offline invoice${result.drafted > 1 ? "s" : ""} saved as draft`,
					color: "warning",
				});
			}
		}
		if (cashMovementResult?.synced) {
			options.toastStore?.show?.({
				title: `${cashMovementResult.synced} offline cash movement${cashMovementResult.synced > 1 ? "s" : ""} synced`,
				color: "success",
			});
		}
		await options.syncStore?.updatePendingCount?.();
		syncTotals.value = result || syncTotals.value;
	}

	function formatDiagnosticsDetail(
		pendingInvoices: number,
		lastRunSummary: string,
	) {
		return `${__("Pending sales: {0} | Cache usage: {1}%", [
			pendingInvoices,
			Math.round(cacheUsage.value || 0),
		])}\n${lastRunSummary}`;
	}

	async function checkCacheCapacity(
		thresholdPercentage = 90,
		onNearCapacity?: () => void,
	) {
		try {
			const usage = await options.getCacheUsageEstimate();
			if ((usage.percentage || 0) > thresholdPercentage) {
				onNearCapacity?.();
			}
		} catch {
			// Cache estimates are best-effort status signals.
		}
	}

	return {
		cacheUsage,
		cacheUsageLoading,
		cacheUsageDetails,
		syncTotals,
		refreshCacheUsage,
		checkCacheCapacity,
		syncQueues,
		formatDiagnosticsDetail,
	};
}
