import { nextTick, ref } from "vue";

type ScanCallback<T> = (scan: T) => void;

export function useScanQueue<T = string>() {
        const queue: T[] = [];
        const callbacks = new Set<ScanCallback<T>>();
        const sizeRef = ref(0);
        let active = false;
        let processing = false;

        async function processQueue() {
                if (processing) {
                        return;
                }
                processing = true;
                try {
                        while (active && queue.length > 0) {
                                const scan = queue.shift();
                                sizeRef.value = queue.length;
                                if (typeof scan === "undefined") {
                                        continue;
                                }

                                callbacks.forEach((callback) => {
                                        try {
                                                callback(scan);
                                        } catch (error) {
                                                console.error("useScanQueue callback failed", error);
                                        }
                                });

                                if (queue.length > 0) {
                                        await nextTick();
                                }
                        }
                } finally {
                        processing = false;
                        if (active && queue.length > 0) {
                                void processQueue();
                        }
                }
        }

        function enqueue(scan: T) {
                queue.push(scan);
                sizeRef.value = queue.length;
                if (active) {
                        void processQueue();
                }
        }

        function onDequeue(callback: ScanCallback<T>) {
                callbacks.add(callback);
                return () => {
                        callbacks.delete(callback);
                };
        }

        function start() {
                if (!active) {
                        active = true;
                        if (queue.length > 0) {
                                void processQueue();
                        }
                }
        }

        function stop() {
                active = false;
        }

        function size() {
                return sizeRef.value;
        }

        return {
                enqueue,
                onDequeue,
                start,
                stop,
                size,
        };
}
