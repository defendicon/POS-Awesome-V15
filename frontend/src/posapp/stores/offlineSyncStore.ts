import { defineStore } from "pinia";
import { computed, ref } from "vue";

import type { SyncResourceId, SyncResourceState } from "../../offline/sync/types";

export interface OfflineStatusSummary {
	networkOnline: boolean;
	serverOnline: boolean;
	serverConnecting: boolean;
	manualOffline: boolean;
	pendingInvoices: number;
	cacheUsage: number;
	cacheUsageDetails: {
		total: number;
		indexedDB: number;
		localStorage: number;
	};
}

export interface OfflineBootstrapWarning {
	active: boolean;
	title: string;
	messages: string[];
}

const RESOURCE_LABELS: Record<SyncResourceId, string> = {
	bootstrap_config: "Bootstrap Config",
	price_list_meta: "Price List Metadata",
	currency_matrix: "Currency Matrix",
	payment_method_currencies: "Payment Method Currencies",
	item_groups: "Item Groups",
	offers: "Offers",
	items: "Items",
	item_prices: "Item Prices",
	stock: "Stock",
	customers: "Customers",
	customer_addresses: "Customer Addresses",
	delivery_charges: "Delivery Charges",
};

function createDefaultSummary(): OfflineStatusSummary {
	return {
		networkOnline: false,
		serverOnline: false,
		serverConnecting: false,
		manualOffline: false,
		pendingInvoices: 0,
		cacheUsage: 0,
		cacheUsageDetails: {
			total: 0,
			indexedDB: 0,
			localStorage: 0,
		},
	};
}

function createDefaultWarning(): OfflineBootstrapWarning {
	return {
		active: false,
		title: "",
		messages: [],
	};
}

export function getSyncResourceLabel(resourceId: SyncResourceId) {
	return RESOURCE_LABELS[resourceId] || resourceId;
}

export const useOfflineSyncStore = defineStore("offlineSync", () => {
	const panelOpen = ref(false);
	const summary = ref<OfflineStatusSummary>(createDefaultSummary());
	const bootstrapWarning = ref<OfflineBootstrapWarning>(createDefaultWarning());
	const resourceStates = ref<SyncResourceState[]>([]);

	const syncingResourcesCount = computed(
		() =>
			resourceStates.value.filter((state) => state.status === "syncing").length,
	);

	const connectivityLabel = computed(() => {
		if (summary.value.serverConnecting) {
			return "Checking";
		}
		if (summary.value.manualOffline || !summary.value.networkOnline) {
			return "Offline";
		}
		if (summary.value.serverOnline) {
			return "Online";
		}
		return "Limited";
	});

	const connectivityTone = computed(() => {
		if (summary.value.serverConnecting) {
			return "warning";
		}
		if (summary.value.manualOffline || !summary.value.networkOnline) {
			return "danger";
		}
		if (summary.value.serverOnline) {
			return "success";
		}
		return "warning";
	});

	const attentionResources = computed(() =>
		resourceStates.value
			.filter((state) =>
				["stale", "error", "limited"].includes(state.status),
			)
			.map((state) => ({
				...state,
				label: getSyncResourceLabel(state.resourceId),
			})),
	);

	const sortedResources = computed(() => {
		const attentionMap = new Map(
			attentionResources.value.map((resource) => [resource.resourceId, resource]),
		);
		const remaining = resourceStates.value
			.filter((state) => !attentionMap.has(state.resourceId))
			.map((state) => ({
				...state,
				label: getSyncResourceLabel(state.resourceId),
			}));
		return [...attentionResources.value, ...remaining];
	});

	const summaryMessage = computed(() => {
		if (bootstrapWarning.value.active && bootstrapWarning.value.title) {
			return bootstrapWarning.value.title;
		}
		if (syncingResourcesCount.value) {
			return `Refreshing ${syncingResourcesCount.value} offline resource${syncingResourcesCount.value > 1 ? "s" : ""}.`;
		}
		if (attentionResources.value.length) {
			return `${attentionResources.value.length} offline resource${attentionResources.value.length > 1 ? "s" : ""} need attention.`;
		}
		if (summary.value.manualOffline) {
			return "Manual offline mode is active.";
		}
		return "Offline data is ready for this terminal.";
	});

	function setPanelOpen(value: boolean) {
		panelOpen.value = Boolean(value);
	}

	function togglePanel(force?: boolean) {
		panelOpen.value = typeof force === "boolean" ? force : !panelOpen.value;
	}

	function setSummary(nextSummary: Partial<OfflineStatusSummary>) {
		summary.value = {
			...summary.value,
			...nextSummary,
			cacheUsageDetails: {
				...summary.value.cacheUsageDetails,
				...(nextSummary.cacheUsageDetails || {}),
			},
		};
	}

	function setBootstrapWarning(nextWarning: Partial<OfflineBootstrapWarning>) {
		bootstrapWarning.value = {
			...bootstrapWarning.value,
			...nextWarning,
			messages: Array.isArray(nextWarning.messages)
				? nextWarning.messages.filter(Boolean)
				: bootstrapWarning.value.messages,
		};
	}

	function setResourceStates(nextStates: SyncResourceState[]) {
		resourceStates.value = Array.isArray(nextStates)
			? nextStates
					.filter(
						(state) =>
							!!state?.resourceId &&
							(state.status !== "idle" ||
								!!state.lastSyncedAt ||
								!!state.watermark ||
								!!state.lastError ||
								!!state.schemaVersion),
					)
					.map((state) => ({ ...state }))
			: [];
	}

	function reset() {
		panelOpen.value = false;
		summary.value = createDefaultSummary();
		bootstrapWarning.value = createDefaultWarning();
		resourceStates.value = [];
	}

	return {
		panelOpen,
		summary,
		bootstrapWarning,
		resourceStates,
		syncingResourcesCount,
		connectivityLabel,
		connectivityTone,
		attentionResources,
		sortedResources,
		summaryMessage,
		setPanelOpen,
		togglePanel,
		setSummary,
		setBootstrapWarning,
		setResourceStates,
		reset,
	};
});
