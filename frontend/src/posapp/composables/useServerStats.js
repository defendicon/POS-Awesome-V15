import { ref, onUnmounted } from "vue";

export function useServerStats(pollInterval = 10000, windowSize = 60) {
	const cpu = ref(null);
	const memory = ref(null);
	const memoryTotal = ref(null);
	const memoryUsed = ref(null);
	const memoryAvailable = ref(null);
	const history = ref([]);
	const loading = ref(true);
	const error = ref(null);
	let timer = null;

	async function fetchServerStats() {
		loading.value = true;
		error.value = null;
		try {
			const res = await frappe.call({
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
		} catch (e) {
			error.value = e.message || e;
		} finally {
			loading.value = false;
		}
	}

	fetchServerStats();
	timer = window.setInterval(fetchServerStats, pollInterval);

	onUnmounted(() => {
		if (timer) clearInterval(timer);
	});

	return { cpu, memory, memoryTotal, memoryUsed, memoryAvailable, history, loading, error };
}
