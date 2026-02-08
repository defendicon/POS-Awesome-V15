import { ref, onUnmounted } from "vue";

export interface ServerStats {
	cpu: number | null;
	memory: number | null;
	memoryTotal: number | null;
	memoryUsed: number | null;
	memoryAvailable: number | null;
	uptime: number | null;
}

export function useServerStats(pollInterval = 10000, windowSize = 60) {
	const cpu = ref<number | null>(null);
	const memory = ref<number | null>(null);
	const memoryTotal = ref<number | null>(null);
	const memoryUsed = ref<number | null>(null);
	const memoryAvailable = ref<number | null>(null);
	const history = ref<ServerStats[]>([]);
	const loading = ref(true);
	const error = ref<string | null>(null);
	let timer: number | null = null;

	async function fetchServerStats() {
		loading.value = true;
		error.value = null;
		try {
			const res = await (window as any).frappe.call({
				method: "posawesome.posawesome.api.utilities.get_server_usage",
			});
			if (res && res.message) {
				cpu.value = res.message.cpu_percent;
				memory.value = res.message.memory_percent;
				memoryTotal.value = res.message.memory_total;
				memoryUsed.value = res.message.memory_used;
				memoryAvailable.value = res.message.memory_available;
				const uptime = res.message.uptime;
				history.value.push({
					cpu: cpu.value,
					memory: memory.value,
					memoryTotal: memoryTotal.value,
					memoryUsed: memoryUsed.value,
					memoryAvailable: memoryAvailable.value,
					uptime: uptime,
				});
				if (history.value.length > windowSize) history.value.shift();
			} else {
				error.value = "No data from server";
			}
		} catch (e: any) {
			error.value = e.message || String(e);
		} finally {
			loading.value = false;
		}
	}

	fetchServerStats();
	timer = window.setInterval(fetchServerStats, pollInterval);

	onUnmounted(() => {
		if (timer) clearInterval(timer);
	});

	return {
		cpu,
		memory,
		memoryTotal,
		memoryUsed,
		memoryAvailable,
		history,
		loading,
		error,
	};
}
