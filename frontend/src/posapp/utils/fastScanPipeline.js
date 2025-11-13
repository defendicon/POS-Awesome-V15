/**
 * High-performance barcode scan processing pipeline.
 * Queues scan events and processes them sequentially without blocking the UI thread.
 */

const nextFrame = () =>
        new Promise((resolve) => {
                if (typeof requestAnimationFrame === "function") {
                        requestAnimationFrame(() => resolve());
                        return;
                }

                setTimeout(resolve, 0);
        });

const now = () => {
        if (typeof performance !== "undefined" && typeof performance.now === "function") {
                return performance.now();
        }

        return Date.now();
};

const isPromiseLike = (value) => value && typeof value.then === "function";

export class FastScanPipeline {
        constructor(options = {}) {
                this.queue = [];
                this.processing = false;
                this.destroyed = false;

                const {
                        handler,
                        onError,
                        frameBudget = 8,
                        maxBatch = 4,
                } = options || {};

                this.handler = typeof handler === "function" ? handler : async () => {};
                this.onError = typeof onError === "function" ? onError : () => {};
                this.frameBudget = Number.isFinite(frameBudget) && frameBudget >= 0 ? frameBudget : 8;
                this.maxBatch = Number.isFinite(maxBatch) && maxBatch >= 1 ? Math.floor(maxBatch) : 4;

                this.metrics = {
                        processed: 0,
                        errors: 0,
                        lastDuration: 0,
                        lastError: null,
                };
        }

        normalizeCode(code) {
                if (code === null || code === undefined) {
                        return "";
                }

                if (typeof code === "string") {
                        return code.trim();
                }

                if (typeof code === "number") {
                        if (Number.isNaN(code)) {
                                return "";
                        }
                        return String(code);
                }

                return String(code);
        }

        enqueue(code) {
                if (this.destroyed) {
                        return;
                }

                const normalized = this.normalizeCode(code);
                if (!normalized) {
                        return;
                }

                this.queue.push(normalized);

                if (!this.processing) {
                        this.processing = true;
                        void this.processQueue();
                }
        }

        async processQueue() {
                let batchCount = 0;

                while (!this.destroyed && this.queue.length) {
                        const code = this.queue.shift();
                        const start = now();

                        try {
                                const result = this.handler(code);
                                if (isPromiseLike(result)) {
                                        await result;
                                }
                                this.metrics.processed += 1;
                                this.metrics.lastError = null;
                        } catch (error) {
                                this.metrics.errors += 1;
                                this.metrics.lastError = error;
                                try {
                                        const handled = this.onError(code, error);
                                        if (isPromiseLike(handled)) {
                                                await handled;
                                        }
                                } catch (handlerError) {
                                        // Surface handler errors for visibility without interrupting the queue.
                                        console.error("FastScanPipeline error handler failure", handlerError);
                                }
                        } finally {
                                this.metrics.lastDuration = now() - start;
                        }

                        batchCount += 1;

                        const exceededBudget = this.metrics.lastDuration > this.frameBudget;
                        if (batchCount >= this.maxBatch || exceededBudget) {
                                batchCount = 0;
                                await nextFrame();
                        }
                }

                this.processing = false;

                if (!this.destroyed && this.queue.length) {
                        this.processing = true;
                        await nextFrame();
                        return this.processQueue();
                }

                return null;
        }

        flush() {
                if (!this.processing && this.queue.length) {
                        this.processing = true;
                        void this.processQueue();
                }
        }

        clear() {
                this.queue.length = 0;
        }

        destroy() {
                this.destroyed = true;
                this.clear();
                this.processing = false;
        }

        getMetrics() {
                return {
                        ...this.metrics,
                        queueLength: this.queue.length,
                        processing: this.processing,
                };
        }
}

export default FastScanPipeline;
