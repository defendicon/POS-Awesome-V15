import { ref, computed, reactive } from "vue";
import { getCacheUsageEstimate } from "../../../offline/index";

type CacheUsageEstimate = {
	percentage?: number;
	total?: number;
	indexedDB?: number;
	localStorage?: number;
};

type SyncTotals = {
	pending: number;
	synced: number;
	drafted: number;
};

export function useNavbar() {
	// State
	const drawer = ref(false);
	const mini = ref(true);
	const showAboutDialog = ref(false);
	const showOfflineInvoices = ref(false);
	const activeItem = ref(0);

	// Cache state
	const cacheState = reactive({
		usage: 0,
		loading: false,
		details: {
			total: 0,
			indexedDB: 0,
			localStorage: 0,
		},
	});

	// Status state
	const statusState = reactive({
		networkOnline: navigator.onLine,
		serverOnline: false,
		serverConnecting: false,
		syncTotals: {
			pending: 0,
			synced: 0,
			drafted: 0,
		},
	});

	// Actions
	const toggleDrawer = () => {
		drawer.value = !drawer.value;
	};

	const openAboutDialog = () => {
		showAboutDialog.value = true;
	};

	const closeAboutDialog = () => {
		showAboutDialog.value = false;
	};

	const openOfflineInvoices = () => {
		showOfflineInvoices.value = true;
	};

	const closeOfflineInvoices = () => {
		showOfflineInvoices.value = false;
	};

	const updateCacheUsage = async () => {
		cacheState.loading = true;
		try {
			const usageData =
				(await getCacheUsageEstimate()) as CacheUsageEstimate;
			cacheState.usage = usageData.percentage || 0;
			cacheState.details.total = usageData.total || 0;
			cacheState.details.localStorage = usageData.localStorage || 0;
			cacheState.details.indexedDB = usageData.indexedDB || 0;
		} catch (error) {
			console.error("Failed to calculate cache usage:", error);
		} finally {
			cacheState.loading = false;
		}
	};

	const updateSyncTotals = (totals: Partial<SyncTotals>) => {
		Object.assign(statusState.syncTotals, totals);
	};

	const updateNetworkStatus = (online: boolean) => {
		statusState.networkOnline = online;
	};

	const updateServerStatus = (online: boolean, connecting = false) => {
		statusState.serverOnline = online;
		statusState.serverConnecting = connecting;
	};

	// Computed
	const isOnline = computed(() => {
		return statusState.networkOnline && statusState.serverOnline;
	});

	const cacheUsageColor = computed(() => {
		if (cacheState.usage < 50) return "success";
		if (cacheState.usage < 80) return "warning";
		return "error";
	});

	return {
		// State
		drawer,
		mini,
		showAboutDialog,
		showOfflineInvoices,
		activeItem,
		cacheState,
		statusState,

		// Actions
		toggleDrawer,
		openAboutDialog,
		closeAboutDialog,
		openOfflineInvoices,
		closeOfflineInvoices,
		updateCacheUsage,
		updateSyncTotals,
		updateNetworkStatus,
		updateServerStatus,

		// Computed
		isOnline,
		cacheUsageColor,
	};
}
