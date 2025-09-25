// OpenCV Web Worker for non-blocking image processing
let cv = null;
let initialized = false;

// Load OpenCV.js from local bundle
async function initializeOpenCV() {
    if (initialized && cv) {
        return cv;
    }

    try {
        // Load OpenCV.js from local bundle
        importScripts('/assets/posawesome/libs/opencv.js');

        // Wait for OpenCV to be ready
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('OpenCV initialization timeout'));
            }, 30000); // 30 second timeout

            const checkCV = () => {
                if (typeof cv !== 'undefined' && cv && cv.Mat) {
                    clearTimeout(timeout);
                    initialized = true;
                    console.log('OpenCV.js initialized in Web Worker from local bundle');
                    resolve(cv);
                } else if (typeof self.cv !== 'undefined' && self.cv && self.cv.Mat) {
                    cv = self.cv;
                    clearTimeout(timeout);
                    initialized = true;
                    console.log('OpenCV.js initialized in Web Worker from local bundle (global)');
                    resolve(cv);
                } else {
                    setTimeout(checkCV, 100);
                }
            };
            checkCV();
        });
    } catch (error) {
        console.error('Failed to load OpenCV.js from local bundle:', error);
        throw error;
    }
}

// Convert ImageData to OpenCV Mat
function imageDataToMat(imageData) {
    if (!cv) return null;

    const mat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
    mat.data.set(imageData.data);
    return mat;
}

// Convert OpenCV Mat to ImageData
function matToImageData(mat) {
    if (!cv) return null;

    return new ImageData(
        new Uint8ClampedArray(mat.data),
        mat.cols,
        mat.rows
    );
}

// Optimized processing pipeline for Web Worker
async function processImageData(imageData, options = {}) {
    if (!initialized || !cv) {
        throw new Error('OpenCV not initialized');
    }

    const {
        useGaussianBlur = true,
        useAdaptiveThreshold = true,
        useMorphological = true,
        useUnsharpMask = true
    } = options;

    let src = imageDataToMat(imageData);
    let processed = src.clone();

    try {
        // Convert to grayscale
        if (processed.channels() > 1) {
            const gray = new cv.Mat();
            cv.cvtColor(processed, gray, cv.COLOR_RGBA2GRAY);
            processed.delete();
            processed = gray;
        }

        // Step 1: Light Gaussian blur (3x3 kernel for speed)
        if (useGaussianBlur) {
            const blurred = new cv.Mat();
            const ksize = new cv.Size(3, 3);
            cv.GaussianBlur(processed, blurred, ksize, 0, 0);
            processed.delete();
            processed = blurred;
        }

        // Step 2: Unsharp masking for edge enhancement
        if (useUnsharpMask) {
            const blurredForMask = new cv.Mat();
            const mask = new cv.Mat();
            const sharpened = new cv.Mat();

            // Create gaussian blur
            const ksizeMask = new cv.Size(0, 0);
            cv.GaussianBlur(processed, blurredForMask, ksizeMask, 1.0, 1.0);

            // Create unsharp mask
            cv.subtract(processed, blurredForMask, mask);

            // Apply the mask
            cv.addWeighted(processed, 1.0 + 1.8, mask, -1.8, 0, sharpened);

            blurredForMask.delete();
            mask.delete();
            processed.delete();
            processed = sharpened;
        }

        // Step 3: Adaptive thresholding
        if (useAdaptiveThreshold) {
            const thresholded = new cv.Mat();
            cv.adaptiveThreshold(
                processed,
                thresholded,
                255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv.THRESH_BINARY,
                11, // block size
                3   // C constant
            );
            processed.delete();
            processed = thresholded;
        }

        // Step 4: Light morphological cleanup
        if (useMorphological) {
            const morphed = new cv.Mat();
            const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
            cv.morphologyEx(processed, morphed, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 1);
            kernel.delete();
            processed.delete();
            processed = morphed;
        }

        // Convert back to RGBA
        const rgba = new cv.Mat();
        cv.cvtColor(processed, rgba, cv.COLOR_GRAY2RGBA);

        const resultImageData = matToImageData(rgba);

        // Cleanup
        src.delete();
        processed.delete();
        rgba.delete();

        return resultImageData;

    } catch (error) {
        console.error('Error in OpenCV worker processing:', error);
        // Cleanup on error
        if (src) src.delete();
        if (processed) processed.delete();
        throw error;
    }
}

// Handle messages from main thread
self.onmessage = async function(e) {
    const { id, type, data } = e.data;

    try {
        switch (type) {
            case 'INIT':
                await initializeOpenCV();
                self.postMessage({ id, type: 'INIT_SUCCESS' });
                break;

            case 'PROCESS':
                const { imageData, options } = data;
                const processedImageData = await processImageData(imageData, options);
                self.postMessage({
                    id,
                    type: 'PROCESS_SUCCESS',
                    data: processedImageData
                });
                break;

            case 'CLEANUP':
                // Cleanup any remaining resources
                initialized = false;
                cv = null;
                self.postMessage({ id, type: 'CLEANUP_SUCCESS' });
                break;

            default:
                throw new Error(`Unknown message type: ${type}`);
        }
    } catch (error) {
        self.postMessage({
            id,
            type: 'ERROR',
            error: error.message
        });
    }
};