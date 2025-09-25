import opencvWorkerManager from './opencvWorkerManager.js';

class OpenCVProcessor {
    constructor() {
        this.initialized = false;
        this.initPromise = null;
        this.workerManager = opencvWorkerManager;
    }

    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._doInit();
        return this.initPromise;
    }

    async _doInit() {
        try {
            await this.workerManager.initialize();
            this.initialized = true;
            console.log('OpenCV Processor with Web Worker initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize OpenCV Processor:', error);
            this.initialized = false;
            return false;
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            await this.init();
        }
        return this.initialized;
    }

    /**
     * Optimized preprocessing for fast and accurate real-time scanning using Web Worker
     */
    async quickProcess(imageData) {
        if (!await this.ensureInitialized()) {
            console.warn('OpenCV Worker not initialized, skipping processing');
            return imageData;
        }

        try {
            const processedImageData = await this.workerManager.processImage(imageData, {
                useGaussianBlur: true,
                useAdaptiveThreshold: true,
                useMorphological: true,
                useUnsharpMask: true
            });

            return processedImageData;
        } catch (error) {
            console.error('Error in OpenCV worker processing:', error);
            return imageData; // Return original on error
        }
    }

    /**
     * Full preprocessing pipeline for difficult barcodes using Web Worker
     */
    async fullProcess(imageData) {
        if (!await this.ensureInitialized()) {
            console.warn('OpenCV Worker not initialized, skipping processing');
            return imageData;
        }

        try {
            // Use same optimized processing for now
            const processedImageData = await this.workerManager.processImage(imageData, {
                useGaussianBlur: true,
                useAdaptiveThreshold: true,
                useMorphological: true,
                useUnsharpMask: true
            });

            return processedImageData;
        } catch (error) {
            console.error('Error in OpenCV worker processing:', error);
            return imageData; // Return original on error
        }
    }

    /**
     * Clean up resources
     */
    async destroy() {
        this.initialized = false;
        try {
            await this.workerManager.destroy();
        } catch (error) {
            console.warn('Error destroying OpenCV worker:', error);
        }
    }
}

// Create singleton instance
const opencvProcessor = new OpenCVProcessor();
export default opencvProcessor;