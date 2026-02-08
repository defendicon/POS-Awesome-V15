import { ref, onUnmounted } from "vue";

const API_URL =
	"/api/method/posawesome.posawesome.api.utilities.get_server_usage";

export interface ServerUsage {
	cpu: number | null;
	memory: number | null;
	memoryTotal: number | null;
	memoryUsed: number | null;
	memoryAvailable: number | null;
	uptime: number | null;
}

export function useServerCpu(pollInterval = 10000, windowSize = 60) {
	const cpu = ref<number | null>(null);
	const memory = ref<number | null>(null);
	const memoryTotal = ref<number | null>(null);
	const memoryUsed = ref<number | null>(null);
	const memoryAvailable = ref<number | null>(null);
	const history = ref<ServerUsage[]>([]);
	const loading = ref(true);
	const error = ref<string | null>(null);
	let timer: number | null = null;

	async function fetchServerCpu() {
		loading.value = true;
		error.value = null;
		try {
			const res = await fetch(API_URL);
			const data = await res.json();
			if (data && data.message) {
				cpu.value = data.message.cpu_percent;
				memory.value = data.message.memory_percent;
				memoryTotal.value = data.message.memory_total;
				memoryUsed.value = data.message.memory_used;
				memoryAvailable.value = data.message.memory_available;
				const uptime = data.message.uptime;
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
			error.value = e.message;
		} finally {
			loading.value = false;
		}
	}

	fetchServerCpu();
	timer = window.setInterval(fetchServerCpu, pollInterval);

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
