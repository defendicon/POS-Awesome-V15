import { ref, onUnmounted } from "vue";

/**
 * Measures event-loop lag as a proxy for CPU load.
 * Returns a reactive ref (ms) and a stop function.
 */
export function useCpuLoad(interval = 1000) {
    const cpuLag = ref(0);
    let timer: number | null = null;
    let last = performance.now();

    function measure() {
        const now = performance.now();
        const lag = now - last - interval;
        cpuLag.value = Math.max(0, lag);
        last = now;
    }

    timer = window.setInterval(measure, interval);

    // Cleanup on unmount
    onUnmounted(() => {
        if (timer) clearInterval(timer);
    });

    return { cpuLag };
} 