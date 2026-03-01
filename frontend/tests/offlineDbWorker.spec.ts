import { afterEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";

class FakeWorker {
	static instances: FakeWorker[] = [];
	listeners = new Map<string, Set<(event: unknown) => void>>();
	postMessage = vi.fn();
	terminate = vi.fn();

	constructor() {
		FakeWorker.instances.push(this);
	}

	addEventListener(type: string, listener: (event: unknown) => void) {
		const set = this.listeners.get(type) || new Set();
		set.add(listener);
		this.listeners.set(type, set);
	}

	removeEventListener(type: string, listener: (event: unknown) => void) {
		this.listeners.get(type)?.delete(listener);
	}

	emit(type: string, payload: unknown) {
		for (const listener of this.listeners.get(type) || []) {
			listener(payload);
		}
	}
}

describe("offline db worker fallback", () => {
	afterEach(() => {
		FakeWorker.instances = [];
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	it("disables the item worker after a fatal worker error", async () => {
		vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);

		const dbModule = await import("../src/offline/db");
		expect(dbModule.hasItemWorker()).toBe(true);

		const pending = dbModule.sendItemWorkerRequest("SEARCH_STORED_ITEMS", {});
		const worker = FakeWorker.instances[0];
		expect(worker).toBeTruthy();

		worker.emit("error", new Error("worker crashed"));

		await expect(pending).rejects.toThrow("worker crashed");
		expect(worker.terminate).toHaveBeenCalledTimes(1);
		expect(dbModule.hasItemWorker()).toBe(false);
	});
});
