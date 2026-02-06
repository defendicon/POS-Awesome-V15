import { defineStore } from "pinia";
import {
	getPendingOfflineInvoiceCount,
	syncOfflineInvoices,
	isOffline,
} from "../../offline/index.js";
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
