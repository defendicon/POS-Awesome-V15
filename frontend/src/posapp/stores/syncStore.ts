/**
 * Lightweight Pinia store for the legacy offline invoice sync queue.
 *
 * This store wraps the offline invoice queue helpers (`syncOfflineInvoices`,
 * `getPendingOfflineInvoiceCount`) and exposes a reactive `pendingInvoicesCount`
 * for status-bar badges. It does **not** drive the full `SyncCoordinator` —
 * the coordinator manages background resource sync independently.
 *
 * **`syncPendingInvoices()`**
 * Reads the pending count, shows a warning toast if any are queued, and then
 * calls `syncOfflineInvoices()`. The sync is skipped entirely when `isOffline()`
 * returns true. On completion it shows success/draft toasts and refreshes the
 * count. Errors are caught and logged; the count is always updated in `finally`.
 *
 * **Options API style**
 * This store uses the Options API form of `defineStore` (with `state` /
 * `actions`) rather than the Setup API used by newer stores in this codebase.
 */
import { defineStore } from "pinia";
import {
	getPendingOfflineInvoiceCount,
	syncOfflineInvoices,
	isOffline,
} from "../../offline/index";
import { useToastStore } from "./toastStore.js";

export const useSyncStore = defineStore("sync", {
	state: () => ({
		pendingInvoicesCount: 0,
	}),
	actions: {
		async updatePendingCount() {
			try {
				const count = await getPendingOfflineInvoiceCount();
				this.pendingInvoicesCount = count;
			} catch (error) {
				console.error("Failed to update pending invoices count", error);
			}
		},
		setPendingCount(count: number) {
			this.pendingInvoicesCount = count;
		},
		async syncPendingInvoices() {
			const toastStore = useToastStore();
			const pending = await getPendingOfflineInvoiceCount();

			if (pending) {
				toastStore.show({
					title: `${pending} invoice${pending > 1 ? "s" : ""} pending for sync`,
					color: "warning",
				});
				this.updatePendingCount();
			}

			if (isOffline()) {
				return;
			}

			try {
				const result = await syncOfflineInvoices();
				if (result && (result.synced || result.drafted)) {
					if (result.synced) {
						toastStore.show({
							title: `${result.synced} offline invoice${result.synced > 1 ? "s" : ""} synced`,
							color: "success",
						});
					}
					if (result.drafted) {
						toastStore.show({
							title: `${result.drafted} offline invoice${result.drafted > 1 ? "s" : ""} saved as draft`,
							color: "warning",
						});
					}
				}
			} catch (error) {
				console.error("Sync failed", error);
			} finally {
				this.updatePendingCount();
			}
		},
	},
});
