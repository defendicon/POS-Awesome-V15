import { describe, expect, it, vi } from "vitest";

import { OpenCVWorkerManager } from "../src/posapp/utils/opencvWorkerManager";

class FakeWorker {
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	readonly terminate = vi.fn(() => {
		this.onmessage = null;
		this.onerror = null;
	});
	readonly postedMessages: Array<{ id: number; type: string; data?: any }> = [];

	constructor(
		private readonly behavior: (
			worker: FakeWorker,
			message: { id: number; type: string; data?: any },
		) => void,
	) {}

	postMessage(message: { id: number; type: string; data?: any }) {
		this.postedMessages.push(message);
		this.behavior(this, message);
	}

	simulateMessage(data: { id: number; type: string; data?: any }) {
		this.onmessage?.({ data } as MessageEvent);
	}
}

describe("OpenCVWorkerManager", () => {
	it("resets a timed-out init and retries with a fresh worker", async () => {
		vi.useFakeTimers();
		try {
			const logger = {
				log: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			};
			const workers: FakeWorker[] = [];
			const behaviors = [
				() => {
					// Simulate a worker that never answers INIT.
				},
				(worker: FakeWorker, message: { id: number; type: string }) => {
					if (message.type === "INIT") {
						setTimeout(() => {
							worker.simulateMessage({ id: message.id, type: "INIT_SUCCESS" });
						}, 1);
					}
				},
			];

			const manager = new OpenCVWorkerManager({
				createWorker: () => {
					const worker = new FakeWorker(behaviors[workers.length] ?? (() => {}));
					workers.push(worker);
					return worker as unknown as Worker;
				},
				messageTimeoutMs: 5,
				logger,
			});

			const firstInitExpectation = expect(
				manager.initialize(),
			).rejects.toThrow("Worker message timeout for INIT");
			await vi.advanceTimersByTimeAsync(6);
			await firstInitExpectation;

			expect(workers).toHaveLength(1);
			expect(workers[0].terminate).toHaveBeenCalledTimes(1);
			expect(workers[0].onmessage).toBeNull();

			workers[0].simulateMessage({ id: 1, type: "INIT_SUCCESS" });
			expect(logger.warn).not.toHaveBeenCalled();

			const secondInit = manager.initialize();
			await vi.advanceTimersByTimeAsync(1);
			await expect(secondInit).resolves.toBe(true);

			expect(workers).toHaveLength(2);
			expect(workers[1].postedMessages[0]?.type).toBe("INIT");
			expect(manager.isInitialized()).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});
