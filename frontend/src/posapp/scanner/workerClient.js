const WORKER_PATH = "/assets/posawesome/dist/js/posapp/workers/scannerWorker.js";

let worker = null;
const pendingFrames = new Map();
let workerReady = false;
let workerInitPromise = null;

function ensureWorker() {
	if (worker || workerInitPromise) {
		return workerInitPromise || Promise.resolve(workerReady);
	}
	workerInitPromise = new Promise((resolve) => {
		if (typeof Worker === "undefined") {
			resolve(false);
			return;
		}
		try {
			worker = new Worker(WORKER_PATH, { type: "classic" });
			worker.onmessage = handleMessage;
			worker.onerror = (error) => {
				console.error("Scanner worker error", error);
			};
			worker.onmessageerror = (error) => {
				console.error("Scanner worker message error", error);
			};
			workerReady = true;
			resolve(true);
		} catch (error) {
			console.error("Failed to initialize scanner worker", error);
			worker = null;
			workerReady = false;
			resolve(false);
		}
	});
	return workerInitPromise;
}

function handleMessage(event) {
	const data = event.data || {};
	if (data.type === "resolved") {
		const handler = pendingFrames.get(data.frameId);
		if (handler) {
			pendingFrames.delete(data.frameId);
			handler.resolve(data.result || {});
		}
	}
}

export async function initScannerWorker() {
	return ensureWorker();
}

export function terminateScannerWorker() {
	if (worker) {
		try {
			worker.terminate();
		} catch (error) {
			console.error("Failed to terminate scanner worker", error);
		}
		worker = null;
		workerInitPromise = null;
		workerReady = false;
	}
}

export async function seedScannerWorker(items = []) {
	const ready = await ensureWorker();
	if (!ready || !worker) {
		return;
	}
	const batchSize = 200;
	for (let i = 0; i < items.length; i += batchSize) {
		const slice = items.slice(i, i + batchSize);
		worker.postMessage({ type: "seed", items: slice });
	}
}

export async function configureScannerWorker(config = {}) {
	const ready = await ensureWorker();
	if (!ready || !worker) {
		return;
	}
	worker.postMessage({ type: "configure", config });
}

export async function clearScannerWorker() {
	const ready = await ensureWorker();
	if (!ready || !worker) {
		return;
	}
	worker.postMessage({ type: "clear" });
}

export async function parseFrameInWorker(frame, config = {}) {
	const ready = await ensureWorker();
	if (!ready || !worker) {
		return { frameId: frame.id, input: frame.code, candidates: [], segments: [], resolved: [] };
	}
	return new Promise((resolve) => {
		pendingFrames.set(frame.id, { resolve });
		worker.postMessage({ type: "parse", frame, config });
	});
}
