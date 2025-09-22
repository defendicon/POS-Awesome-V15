import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useScanQueue } from "../useScanQueue";

describe("useScanQueue", () => {
        it("processes enqueued scans sequentially without dropping any", async () => {
                const queue = useScanQueue();
                const processed: string[] = [];

                queue.onDequeue((scan) => {
                        processed.push(scan);
                });

                queue.start();

                const enqueued = Array.from({ length: 100 }, (_, index) => `scan-${index}`);
                enqueued.forEach((scan) => queue.enqueue(scan));

                let attempts = 0;
                while (processed.length < enqueued.length && attempts < 200) {
                        attempts += 1;
                        await nextTick();
                        await new Promise((resolve) => setTimeout(resolve, 0));
                }

                expect(processed).toEqual(enqueued);
                expect(queue.size()).toBe(0);
        });
});
