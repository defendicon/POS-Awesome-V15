import { ref, onUnmounted } from "vue";

declare const frappe: any;

export function useDatabaseStats(pollInterval = 10000, windowSize = 60) {
	const dbStats = ref<any>(null);
	const history = ref<any[]>([]);
	const loading = ref(true);
	const error = ref<string | null>(null);
	let timer: number | null = null;

	async function fetchDatabaseStats() {
		loading.value = true;
		error.value = null;
		try {
			const res = await frappe.call({
				method: "posawesome.posawesome.api.utilities.get_database_usage",
			});
			if (res && res.message) {
				dbStats.value = res.message;
				history.value.push(res.message);
				if (history.value.length > windowSize) history.value.shift();
			} else {
				error.value = "No data from server";
			}
		} catch (e: any) {
			error.value = e.message || e;
		} finally {
			loading.value = false;
		}
	}

	fetchDatabaseStats();
	timer = window.setInterval(fetchDatabaseStats, pollInterval);

	onUnmounted(() => {
		if (timer) clearInterval(timer);
	});

	return { dbStats, history, loading, error };
}
