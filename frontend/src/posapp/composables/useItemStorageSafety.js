import { ref } from "vue";
import { checkDbHealth } from "../../offline/index.js";

/**
 * useItemStorageSafety
 * 
 * Manages performance-critical storage and worker state.
 * Handles IndexDB health checks and the item worker lifecycle.
 */
export function useItemStorageSafety() {
    const storageAvailable = ref(true);
    const itemWorker = ref(null);
    const isWorkerBusy = ref(false);
    const ctx = {
        posProfile: null
    };

    const registerContext = (newContext) => {
        Object.assign(ctx, newContext);
    };

    const checkStorageHealth = async () => {
        try {
            const isHealthy = await checkDbHealth();
            storageAvailable.value = isHealthy;
            return isHealthy;
        } catch (error) {
            console.error("Storage health check failed:", error);
            storageAvailable.value = false;
            return false;
        }
    };

    const initializeWorker = (workerScriptPath) => {
        if (typeof Worker !== "undefined" && !itemWorker.value) {
            try {
                itemWorker.value = new Worker(workerScriptPath);
                itemWorker.value.onmessage = (e) => {
                    isWorkerBusy.value = false;
                };
            } catch (error) {
                console.error("Failed to initialize item worker:", error);
            }
        }
    };

    const terminateWorker = () => {
        if (itemWorker.value) {
            itemWorker.value.terminate();
            itemWorker.value = null;
        }
    };

    return {
        storageAvailable,
        itemWorker,
        isWorkerBusy,
        registerContext,
        checkStorageHealth,
        initializeWorker,
        terminateWorker
    };
}
