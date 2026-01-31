import { ref, onUnmounted } from "vue";
import { checkDbHealth } from "../../offline/index.js";

/**
 * useItemStorageSafety Composable
 * 
 * Manages storage health checks (IndexedDB/LocalStorage) and the background item worker.
 * Ensuring storage is available before attempting heavy operations prevents crashes.
 */
export function useItemStorageSafety() {
    // State
    const storageAvailable = ref(true);
    const itemWorker = ref(null);

    /**
     * Checks if the database is healthy and actionable.
     * @returns {Promise<boolean>}
     */
    async function ensureStorageHealth() {
        // If we already know storage is broken, don't keep checking unless we want to implement retry logic.
        // For now, we assume if it failed once, it's safer to degrade gracefully.
        if (!storageAvailable.value) return false;

        const health = await checkDbHealth();
        if (!health.ok) {
            console.warn("Storage health check failed:", health.error);
            markStorageUnavailable({
                error: health.error,
                details: health.details
            });
            return false;
        }
        return true;
    }

    /**
     * Marks storage as unavailable and stops related workers.
     * @param {Object} args - Error details
     */
    function markStorageUnavailable(args = {}) {
        if (!storageAvailable.value) return; // Already marked

        console.error("Marking storage as unavailable", args);
        storageAvailable.value = false;

        // Terminate worker to prevent it from trying to access broken DB
        if (itemWorker.value) {
            console.log("Terminating item worker due to storage failure");
            itemWorker.value.terminate();
            itemWorker.value = null;
        }

        if (window.frappe) {
            frappe.show_alert({
                message: __("Local storage is unavailable. Switching to online-only mode."),
                indicator: "orange",
            });
        }
    }

    /**
     * Starts the background item worker if storage is available.
     */
    function startItemWorker() {
        if (!storageAvailable.value) {
            console.warn("Skipping worker start - storage unavailable");
            return;
        }

        if (itemWorker.value) {
            // Already running
            return;
        }

        try {
            // We assume the worker file is at the root or correctly served
            const workerUrl = "/assets/posawesome/js/posapp/item_worker.js";
            itemWorker.value = new Worker(workerUrl);

            itemWorker.value.onmessage = (e) => {
                // Handle generic worker messages if needed
                // Most worker comms might be request/response based, handled by specific managers
                // or just fire-and-forget syncs.
                if (e.data && e.data.type === 'error') {
                    console.error("Item worker error:", e.data.payload);
                }
            };

            itemWorker.value.onerror = (e) => {
                console.error("Item worker system error:", e);
                // If the worker crashes, we might not want to kill the whole storage flag
                // unless it's a persistent DB error.
            };

            console.log("Item Worker started");
        } catch (e) {
            console.error("Failed to start item worker", e);
        }
    }

    // Cleanup on unmount
    onUnmounted(() => {
        if (itemWorker.value) {
            itemWorker.value.terminate();
            itemWorker.value = null;
        }
    });

    return {
        // State
        storageAvailable,
        itemWorker,

        // Methods
        ensureStorageHealth,
        markStorageUnavailable,
        startItemWorker
    };
}
