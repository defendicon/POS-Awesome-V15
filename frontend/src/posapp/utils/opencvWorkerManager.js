// OpenCV Worker Manager - Handles Web Worker communication
class OpenCVWorkerManager {
	constructor() {
		this.worker = null;
		this.initialized = false;
		this.messageId = 0;
		this.pendingMessages = new Map();
		this.initPromise = null;
	}

	async initialize() {
		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this._doInitialize();
		return this.initPromise;
	}

	async _doInitialize() {
		try {
			// Create Web Worker using static URL to avoid build issues (non-module worker for importScripts compatibility)
			this.worker = new Worker("/assets/posawesome/dist/js/posapp/workers/opencvWorker.js");

			// Set up message handler
			this.worker.onmessage = (e) => {
				this._handleWorkerMessage(e.data);
			};

			this.worker.onerror = (error) => {
				console.error("OpenCV Worker error details:", {
					message: error.message,
					filename: error.filename,
					lineno: error.lineno,
					colno: error.colno,
					error: error.error,
					type: error.type,
				});
				this._rejectAllPendingMessages(error);
			};

			// Initialize OpenCV in the worker
			const initResult = await this._sendMessage("INIT");
			this.initialized = true;
			console.log("OpenCV Worker Manager initialized successfully");

			return initResult;
		} catch (error) {
			console.error("Failed to initialize OpenCV Worker Manager:", error);
			this.initialized = false;
			throw error;
		}
	}

	async processImage(imageData, options = {}) {
		if (!this.initialized) {
			await this.initialize();
		}

		if (!this.worker) {
			throw new Error("OpenCV Worker not available");
		}

		try {
			const result = await this._sendMessage("PROCESS", { imageData, options });
			return result;
		} catch (error) {
			console.error("Error processing image in worker:", error);
			throw error;
		}
	}

	async processImageExtreme(imageData) {
		if (!this.initialized) {
			await this.initialize();
		}

		if (!this.worker) {
			throw new Error("OpenCV Worker not available");
		}

		try {
			const result = await this._sendMessage("PROCESS_EXTREME", { imageData });
			return result;
		} catch (error) {
			console.error("Error in extreme image processing:", error);
			throw error;
		}
	}

	async detectBarcodes(imageData, options = {}) {
		if (!this.initialized) {
			await this.initialize();
		}

		if (!this.worker) {
			throw new Error("OpenCV Worker not available");
		}

		try {
			const result = await this._sendMessage("DETECT_BARCODES", { imageData, options });
			return result;
		} catch (error) {
			console.error("Error in barcode detection:", error);
			throw error;
		}
	}

	_sendMessage(type, data = null) {
		return new Promise((resolve, reject) => {
			if (!this.worker) {
				reject(new Error("Worker not initialized"));
				return;
			}

			const id = ++this.messageId;
			const timeout = setTimeout(() => {
				this.pendingMessages.delete(id);
				reject(new Error(`Worker message timeout for ${type}`));
			}, 10000); // 10 second timeout

			this.pendingMessages.set(id, { resolve, reject, timeout });

			this.worker.postMessage({ id, type, data });
		});
	}

	_handleWorkerMessage({ id, type, data, error }) {
		const pending = this.pendingMessages.get(id);
		if (!pending) {
			console.warn("Received message for unknown ID:", id);
			return;
		}

		const { resolve, reject, timeout } = pending;
		clearTimeout(timeout);
		this.pendingMessages.delete(id);

		if (type === "ERROR") {
			reject(new Error(error));
		} else if (type.endsWith("_SUCCESS")) {
			resolve(data);
		} else {
			console.warn("Unknown worker message type:", type);
			reject(new Error(`Unknown message type: ${type}`));
		}
	}

	_rejectAllPendingMessages(error) {
		for (const [id, { reject, timeout }] of this.pendingMessages) {
			clearTimeout(timeout);
			reject(error);
		}
		this.pendingMessages.clear();
	}

	async destroy() {
		if (this.worker) {
			try {
				// Send cleanup message to worker
				await this._sendMessage("CLEANUP");
			} catch (error) {
				console.warn("Error during worker cleanup:", error);
			}

			// Terminate worker
			this.worker.terminate();
			this.worker = null;
		}

		this.initialized = false;
		this.initPromise = null;
		this._rejectAllPendingMessages(new Error("Worker destroyed"));
	}

	isInitialized() {
		return this.initialized && this.worker !== null;
	}
}

// Create singleton instance
const opencvWorkerManager = new OpenCVWorkerManager();

export default opencvWorkerManager;
