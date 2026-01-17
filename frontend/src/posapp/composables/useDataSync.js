import { ref, onMounted, onUnmounted, computed } from "vue";
import { useItemsStore } from "../stores/itemsStore";

export function useDataSync(intervalSeconds = 30) {
	const itemsStore = useItemsStore();
	const lastSyncTime = ref(null);
	const lastSyncSize = ref(0);
	const totalSyncSize = ref(0);
	const syncHistory = ref([]); // Store { time: timestamp, size: bytes }
	const isSyncing = ref(false);
	let timer = null;

	const formatBytes = (bytes, decimals = 2) => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
	};

	const estimatedHourlyUsage = computed(() => {
		// Calculate usage based on history in the last hour
		const now = Date.now();
		const oneHourAgo = now - 60 * 60 * 1000;
		const recentHistory = syncHistory.value.filter((entry) => entry.time > oneHourAgo);

		const recentTotal = recentHistory.reduce((sum, entry) => sum + entry.size, 0);

		if (recentHistory.length === 0) return formatBytes(0);

		// If we have less than an hour of data, project it?
		// Or just show what we have so far in the last hour?
		// The user asked "1 hours me kitna internet use hoga calculate ho ske".
		// Simple projection if running for short time:
		// (total / duration) * 1 hour

		const firstEntry = recentHistory[0];
		const duration = now - firstEntry.time;

		// Avoid division by zero or tiny duration
		if (duration < 60 * 1000) {
			// less than a minute
			// Project based on current sample count if we assume interval is constant
			const projected = (recentTotal / recentHistory.length) * (3600 / intervalSeconds);
			return formatBytes(projected);
		}

		const projected = (recentTotal / duration) * 3600 * 1000;
		return formatBytes(projected);
	});

	const performSync = async () => {
		if (isSyncing.value) return;
		// Check if online
		if (!navigator.onLine) return;

		isSyncing.value = true;
		try {
			const { size, count } = await itemsStore.refreshModifiedItems();

			const now = Date.now();
			lastSyncTime.value = new Date();
			lastSyncSize.value = size;
			totalSyncSize.value += size;

			syncHistory.value.push({ time: now, size });

			// Cleanup old history (older than 1 hour)
			const oneHourAgo = now - 60 * 60 * 1000;
			if (syncHistory.value.length > 0 && syncHistory.value[0].time < oneHourAgo) {
				syncHistory.value = syncHistory.value.filter((entry) => entry.time > oneHourAgo);
			}
		} catch (error) {
			console.error("Data sync failed:", error);
		} finally {
			isSyncing.value = false;
		}
	};

	const startSync = () => {
		if (timer) clearInterval(timer);
		performSync(); // Initial sync
		timer = setInterval(performSync, intervalSeconds * 1000);
	};

	const stopSync = () => {
		if (timer) clearInterval(timer);
		timer = null;
	};

	onMounted(() => {
		startSync();
	});

	onUnmounted(() => {
		stopSync();
	});

	return {
		lastSyncTime,
		formattedLastSyncTime: computed(() => {
			if (!lastSyncTime.value) return "Never";
			return lastSyncTime.value.toLocaleTimeString();
		}),
		lastSyncSize: computed(() => formatBytes(lastSyncSize.value)),
		totalSyncSize: computed(() => formatBytes(totalSyncSize.value)),
		estimatedHourlyUsage,
		performSync,
		isSyncing,
	};
}
