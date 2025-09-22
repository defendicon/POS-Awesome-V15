import { computed, ref } from "vue";

export function useScanQueue() {
	const queue = [];
	const processing = ref(false);
	const current = ref(null);
	let processor = null;

	async function drain() {
		if (processing.value || !processor) {
			return;
		}
		processing.value = true;
		try {
			while (queue.length && processor) {
				const next = queue.shift();
				current.value = next;
				try {
					await processor(next);
				} catch (error) {
					console.error("Scan queue processor failed", error);
				}
			}
		} finally {
			current.value = null;
			processing.value = false;
		}
	}

	function enqueue(frame) {
		queue.push(frame);
		drain();
	}

	function processWith(handler) {
		processor = typeof handler === "function" ? handler : null;
		drain();
	}

	function clear() {
		queue.length = 0;
	}

	const depth = computed(() => queue.length + (processing.value && current.value ? 1 : 0));

	return {
		enqueue,
		processWith,
		clear,
		depth,
		isProcessing: processing,
		current,
	};
}
