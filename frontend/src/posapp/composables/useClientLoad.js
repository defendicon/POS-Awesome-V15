import { ref, reactive, onUnmounted } from 'vue';

export function useClientLoad(
    interval = 1_000,
    windowSize = 60
) {
    // Basic lag
    const cpuLag = ref(0);
    const history = ref([]);

    // Long‑tasks
    const longTasks = ref([]);

    // Memory (Chrome-only)
    const memoryUsage = ref(0);

    // Device info
    const device = reactive({
        cores: navigator.hardwareConcurrency || 1,
        gbMemory: navigator.deviceMemory || undefined,
    });

    let timerId = null;
    let last = performance.now();
    let perfObserver = null;

    function measureLag() {
        const now = performance.now();
        const lag = now - last - interval;
        cpuLag.value = Math.max(0, lag);
        last = now;

        history.value.push(cpuLag.value);
        if (history.value.length > windowSize) {
            history.value.shift();
        }
    }

    function sampleMemory() {
        // @ts-ignore: not standard, but supported in Chrome
        if (performance.memory) {
            memoryUsage.value = performance.memory.usedJSHeapSize;
        }
    }

    function start() {
        last = performance.now();
        timerId = window.setInterval(() => {
            measureLag();
            sampleMemory();
        }, interval);

        // Long‑task observer
        if (
            window.PerformanceObserver &&
            PerformanceObserver.supportedEntryTypes.includes('longtask')
        ) {
            perfObserver = new PerformanceObserver((list) => {
                longTasks.value.push(...list.getEntries());
                // keep history trim if desired
                if (longTasks.value.length > windowSize) {
                    longTasks.value.splice(0, longTasks.value.length - windowSize);
                }
            });
            perfObserver.observe({ entryTypes: ['longtask'] });
        }
    }

    function stop() {
        if (timerId !== null) {
            clearInterval(timerId);
            timerId = null;
        }
        if (perfObserver) {
            perfObserver.disconnect();
            perfObserver = null;
        }
    }

    // Pause/resume when hidden
    const onVisChange = () => {
        document.hidden ? stop() : start();
    };
    document.addEventListener('visibilitychange', onVisChange);

    onUnmounted(() => {
        stop();
        document.removeEventListener('visibilitychange', onVisChange);
    });

    // kick it off
    start();

    return {
        cpuLag,
        history,
        longTasks,
        memoryUsage,
        device,
        stop,
    };
}
