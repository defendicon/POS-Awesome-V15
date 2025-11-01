import { ref, onUnmounted } from "vue";

/**
 * Measures event-loop lag as a proxy for CPU load.
 * Returns a reactive ref (ms), a rolling history array, and a stop function.
 */
export function useCpuLoad(interval = 1000, windowSize = 60) {
	const cpuLag = ref(0);
	const history = ref([]);
	let timer = null;
	let last = performance.now();

	function measure() {
		const now = performance.now();
		const lag = now - last - interval;
		cpuLag.value = Math.max(0, lag);
		last = now;
		// Maintain rolling history
		history.value.push(cpuLag.value);
		if (history.value.length > windowSize) {
			history.value.shift();
		}
	}

	timer = window.setInterval(measure, interval);

	// Cleanup on unmount
	onUnmounted(() => {
		if (timer) clearInterval(timer);
	});

	return { cpuLag, history };
}
