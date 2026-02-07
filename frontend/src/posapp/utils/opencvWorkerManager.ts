/**
 * OpenCV Worker Manager - Handles Web Worker communication
 */

/**
 * Interface for worker message structure.
 */
interface WorkerMessage {
	id: number;
	type: string;
	data?: any;
	error?: string;
}

/**
 * Interface for pending message tracking.
 */
interface PendingMessage {
	resolve: (_value: any) => void;
	reject: (_reason?: any) => void;
	timeout: NodeJS.Timeout;
}

/**
 * Interface for image processing options.
 */
export interface ProcessOptions {
	[key: string]: any;
}

/**
 * OpenCV Worker Manager class for handling Web Worker communication.
 */
class OpenCVWorkerManager {
	private worker: Worker | null = null;
	private initialized: boolean = false;
	private messageId: number = 0;
	private pendingMessages: Map<number, PendingMessage> = new Map();
	private initPromise: Promise<any> | null = null;

	async initialize(): Promise<any> {
		if (this.initPromise) {
			return this.initPromise;
		}

		this.initPromise = this._doInitialize();
		return this.initPromise;
	}

	private async _doInitialize(): Promise<any> {
		try {
			// Create Web Worker using static URL to avoid build issues (non-module worker for importScripts compatibility)
			this.worker = new Worker(
				"/assets/posawesome/dist/js/posapp/workers/opencvWorker.js",
			);

			// Set up message handler
			this.worker.onmessage = (e: MessageEvent) => {
				this._handleWorkerMessage(e.data);
			};

			this.worker.onerror = (error: ErrorEvent) => {
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

	async processImage(
		imageData: ImageData,
		options: ProcessOptions = {},
	): Promise<any> {
		if (!this.initialized) {
			await this.initialize();
		}

		if (!this.worker) {
			throw new Error("OpenCV Worker not available");
		}

		try {
			const result = await this._sendMessage("PROCESS", {
				imageData,
				options,
			});
			return result;
		} catch (error) {
			console.error("Error processing image in worker:", error);
			throw error;
		}
	}

	async processImageExtreme(imageData: ImageData): Promise<any> {
		if (!this.initialized) {
			await this.initialize();
		}

		if (!this.worker) {
			throw new Error("OpenCV Worker not available");
		}

		try {
			const result = await this._sendMessage("PROCESS_EXTREME", {
				imageData,
			});
			return result;
		} catch (error) {
			console.error("Error in extreme image processing:", error);
			throw error;
		}
	}

	async detectBarcodes(
		imageData: ImageData,
		options: ProcessOptions = {},
	): Promise<any> {
		if (!this.initialized) {
			await this.initialize();
		}

		if (!this.worker) {
			throw new Error("OpenCV Worker not available");
		}

		try {
			const result = await this._sendMessage("DETECT_BARCODES", {
				imageData,
				options,
			});
			return result;
		} catch (error) {
			console.error("Error in barcode detection:", error);
			throw error;
		}
	}

	private _sendMessage(type: string, data: any = null): Promise<any> {
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

	private _handleWorkerMessage({
		id,
		type,
		data,
		error,
	}: WorkerMessage): void {
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

	private _rejectAllPendingMessages(error: any): void {
		for (const [, { reject, timeout }] of this.pendingMessages) {
			clearTimeout(timeout);
			reject(error);
		}
		this.pendingMessages.clear();
	}

	async destroy(): Promise<void> {
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

	isInitialized(): boolean {
		return this.initialized && this.worker !== null;
	}
}

// Create singleton instance
const opencvWorkerManager = new OpenCVWorkerManager();

export default opencvWorkerManager;
