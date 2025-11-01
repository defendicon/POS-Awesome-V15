// OpenCV Web Worker for non-blocking image processing
let cv = null;
let initialized = false;
let barcodeDetector = null;

// Load OpenCV.js from local bundle
async function initializeOpenCV() {
	if (initialized && cv) {
		return cv;
	}

	try {
		console.log("🔄 Setting up OpenCV.js initialization...");

		// Wait for OpenCV to be ready
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("OpenCV initialization timeout"));
			}, 30000); // 30 second timeout

			const handleOpenCVReady = () => {
				clearTimeout(timeout);
				initialized = true;
				// Initialize native barcode detector if available
				initializeBarcodeDetector();
				console.log("✅ OpenCV.js fully initialized in Web Worker");
				resolve(cv);
			};

			// Set up Module configuration before loading OpenCV
			self.Module = {
				onRuntimeInitialized: () => {
					console.log("📋 OpenCV runtime initialization callback triggered");
					// Give OpenCV a moment to set up the cv object
					setTimeout(() => {
						if (typeof cv !== "undefined" && cv && cv.Mat) {
							handleOpenCVReady();
						} else if (typeof self.cv !== "undefined" && self.cv && self.cv.Mat) {
							cv = self.cv;
							handleOpenCVReady();
						} else {
							console.warn("OpenCV runtime initialized but cv object not found, polling...");
							const checkCV = () => {
								if (typeof cv !== "undefined" && cv && cv.Mat) {
									handleOpenCVReady();
								} else if (typeof self.cv !== "undefined" && self.cv && self.cv.Mat) {
									cv = self.cv;
									handleOpenCVReady();
								} else {
									setTimeout(checkCV, 50);
								}
							};
							checkCV();
						}
					}, 100);
				},
			};

			// Load OpenCV.js from local bundle using importScripts
			importScripts("/assets/posawesome/dist/js/libs/opencv.js");
			console.log("📁 OpenCV.js script loaded successfully");
		});
	} catch (error) {
		console.error("Failed to load OpenCV.js from local bundle:", error);
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

	return new ImageData(new Uint8ClampedArray(mat.data), mat.cols, mat.rows);
}

// Initialize OpenCV native barcode detector
function initializeBarcodeDetector() {
	try {
		// Check if OpenCV has barcode detection capabilities
		if (cv && cv.barcode && cv.barcode.BarcodeDetector) {
			barcodeDetector = new cv.barcode.BarcodeDetector();
			console.log("✅ OpenCV native BarcodeDetector initialized successfully");
			return true;
		} else {
			console.log(
				"ℹ️ OpenCV barcode module not available in this build - using fallback processing only",
			);
			barcodeDetector = null;
			return false;
		}
	} catch (error) {
		console.warn(
			"⚠️ Failed to initialize OpenCV BarcodeDetector (this is normal for most OpenCV.js builds):",
			error.message,
		);
		barcodeDetector = null;
		return false;
	}
}

// Detect and decode barcodes using OpenCV native detector
function detectAndDecodeBarcodes(mat) {
	if (!barcodeDetector || !cv) {
		console.log("ℹ️ Native barcode detection not available, will use fallback image processing");
		return {
			detected: false,
			barcodes: [],
			error: "BarcodeDetector not available",
			fallbackToProcessing: true,
		};
	}

	try {
		const decodeInfo = new cv.StringVector();
		const decodeType = new cv.StringVector();
		const corners = new cv.PointVector();

		// Use OpenCV's native detectAndDecodeWithType method
		const detected = barcodeDetector.detectAndDecodeWithType(mat, decodeInfo, decodeType, corners);

		const results = [];
		if (detected && decodeInfo.size() > 0) {
			for (let i = 0; i < decodeInfo.size(); i++) {
				const info = decodeInfo.get(i);
				const type = decodeType.size() > i ? decodeType.get(i) : "UNKNOWN";

				// Extract corner points for the barcode
				const barcodeCorners = [];
				const startIdx = i * 4; // Each barcode has 4 corner points
				for (let j = 0; j < 4 && startIdx + j < corners.size(); j++) {
					const point = corners.get(startIdx + j);
					barcodeCorners.push({ x: point.x, y: point.y });
				}

				results.push({
					data: info,
					type: type,
					corners: barcodeCorners,
					confidence: 1.0, // OpenCV doesn't provide confidence, assume high if detected
				});
			}
		}

		// Clean up
		decodeInfo.delete();
		decodeType.delete();
		corners.delete();

		return {
			detected: results.length > 0,
			barcodes: results,
			count: results.length,
		};
	} catch (error) {
		console.error("Error in OpenCV barcode detection:", error);
		return { detected: false, barcodes: [], error: error.message };
	}
}

// Enhanced barcode detection combining preprocessing + native detection
function detectBarcodesWithPreprocessing(imageData, options = {}) {
	if (!initialized || !cv) {
		throw new Error("OpenCV not initialized");
	}

	const src = imageDataToMat(imageData);
	let processed = src.clone();
	const results = [];

	try {
		// First try: Native detection on original image
		console.log("Attempting native barcode detection on original image");
		let detection = detectAndDecodeBarcodes(src);
		if (detection.detected) {
			console.log("Native detection successful on original image:", detection.count, "barcodes found");
			results.push(...detection.barcodes.map((b) => ({ ...b, method: "native_original" })));
		}

		// Second try: Detection after basic preprocessing
		if (results.length === 0 || options.forcePreprocessing) {
			console.log("Applying preprocessing for barcode detection");

			// Convert to grayscale if needed
			if (processed.channels() > 1) {
				const gray = new cv.Mat();
				cv.cvtColor(processed, gray, cv.COLOR_RGBA2GRAY);
				processed.delete();
				processed = gray;
			}

			// Apply CLAHE for contrast enhancement
			const clahe = cv.createCLAHE(3.0, new cv.Size(8, 8));
			const enhanced = new cv.Mat();
			clahe.apply(processed, enhanced);
			clahe.delete();
			processed.delete();
			processed = enhanced;

			// Try detection on preprocessed image
			detection = detectAndDecodeBarcodes(processed);
			if (detection.detected) {
				console.log(
					"Native detection successful after preprocessing:",
					detection.count,
					"barcodes found",
				);
				results.push(...detection.barcodes.map((b) => ({ ...b, method: "native_preprocessed" })));
			}
		}

		// Third try: Extreme preprocessing for very poor quality
		if (results.length === 0 && options.useExtremePreprocessing) {
			console.log("Applying extreme preprocessing for barcode detection");
			const extremeProcessed = processVeryPoorImage(imageData);
			const extremeMat = imageDataToMat(extremeProcessed);

			if (extremeMat.channels() > 1) {
				const gray = new cv.Mat();
				cv.cvtColor(extremeMat, gray, cv.COLOR_RGBA2GRAY);
				extremeMat.delete();
				const extremeDetection = detectAndDecodeBarcodes(gray);
				if (extremeDetection.detected) {
					console.log(
						"Native detection successful after extreme preprocessing:",
						extremeDetection.count,
						"barcodes found",
					);
					results.push(
						...extremeDetection.barcodes.map((b) => ({ ...b, method: "native_extreme" })),
					);
				}
				gray.delete();
			} else {
				const extremeDetection = detectAndDecodeBarcodes(extremeMat);
				if (extremeDetection.detected) {
					console.log(
						"Native detection successful after extreme preprocessing:",
						extremeDetection.count,
						"barcodes found",
					);
					results.push(
						...extremeDetection.barcodes.map((b) => ({ ...b, method: "native_extreme" })),
					);
				}
				extremeMat.delete();
			}
		}

		// Clean up
		src.delete();
		if (processed) processed.delete();

		return {
			detected: results.length > 0,
			barcodes: results,
			count: results.length,
			detectorAvailable: barcodeDetector !== null,
		};
	} catch (error) {
		console.error("Error in barcode detection with preprocessing:", error);
		// Clean up on error
		if (src) src.delete();
		if (processed) processed.delete();
		throw error;
	}
}

// Extreme quality enhancement for very poor images
async function processVeryPoorImage(imageData) {
	if (!initialized || !cv) {
		throw new Error("OpenCV not initialized");
	}

	let src = imageDataToMat(imageData);
	let processed = src.clone();

	try {
		console.log("Applying extreme quality enhancement for very poor image");

		// Convert to LAB color space for better processing
		if (processed.channels() > 1) {
			const lab = new cv.Mat();
			const labChannels = new cv.MatVector();
			cv.cvtColor(processed, lab, cv.COLOR_RGBA2LAB);
			cv.split(lab, labChannels);
			processed.delete();
			processed = labChannels.get(0).clone();
			lab.delete();
			for (let i = 0; i < labChannels.size(); i++) {
				labChannels.get(i).delete();
			}
			labChannels.delete();
		}

		// Step 1: Extreme CLAHE for very poor contrast
		const clahe = cv.createCLAHE(5.0, new cv.Size(4, 4));
		const enhanced = new cv.Mat();
		clahe.apply(processed, enhanced);
		clahe.delete();
		processed.delete();
		processed = enhanced;

		// Step 2: Heavy noise reduction
		const denoised = new cv.Mat();
		cv.fastNlMeansDenoising(processed, denoised, 15, 7, 21);
		processed.delete();
		processed = denoised;

		// Step 3: Aggressive deblurring
		const deblurred = new cv.Mat();
		const sharpKernel = new cv.Mat();
		const sharpData = [0, -1, 0, -1, 8, -1, 0, -1, 0];
		sharpKernel.create(3, 3, cv.CV_32FC1);
		sharpKernel.data32F.set(sharpData);
		cv.filter2D(processed, deblurred, cv.CV_8UC1, sharpKernel);
		sharpKernel.delete();
		processed.delete();
		processed = deblurred;

		// Step 4: Multi-pass unsharp masking
		for (let pass = 0; pass < 2; pass++) {
			const blurred = new cv.Mat();
			const mask = new cv.Mat();
			const sharpened = new cv.Mat();

			cv.bilateralFilter(processed, blurred, 9, 80, 80);
			cv.subtract(processed, blurred, mask);
			cv.addWeighted(processed, 1.0 + 3.0, mask, -3.0, 0, sharpened);

			blurred.delete();
			mask.delete();
			processed.delete();
			processed = sharpened;
		}

		// Step 5: Triple adaptive thresholding
		const thresh1 = new cv.Mat();
		const thresh2 = new cv.Mat();
		const thresh3 = new cv.Mat();
		const combined = new cv.Mat();
		const final = new cv.Mat();

		cv.adaptiveThreshold(
			processed,
			thresh1,
			255,
			cv.ADAPTIVE_THRESH_GAUSSIAN_C,
			cv.THRESH_BINARY,
			21,
			12,
		);
		cv.adaptiveThreshold(processed, thresh2, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 31, 15);
		cv.adaptiveThreshold(processed, thresh3, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 15, 8);

		cv.bitwise_and(thresh1, thresh2, combined);
		cv.bitwise_and(combined, thresh3, final);

		thresh1.delete();
		thresh2.delete();
		thresh3.delete();
		combined.delete();
		processed.delete();
		processed = final;

		// Step 6: Advanced barcode-specific morphology
		const temp1 = new cv.Mat();
		const temp2 = new cv.Mat();
		const morphed = new cv.Mat();

		// Extra wide horizontal kernel for barcode enhancement
		const hKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 1));
		cv.morphologyEx(processed, temp1, cv.MORPH_CLOSE, hKernel, new cv.Point(-1, -1), 2);

		// Remove small vertical artifacts
		const vKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 5));
		cv.morphologyEx(temp1, temp2, cv.MORPH_OPEN, vKernel, new cv.Point(-1, -1), 1);

		// Final cleanup
		const cleanKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
		cv.morphologyEx(temp2, morphed, cv.MORPH_CLOSE, cleanKernel, new cv.Point(-1, -1), 2);

		hKernel.delete();
		vKernel.delete();
		cleanKernel.delete();
		temp1.delete();
		temp2.delete();
		processed.delete();
		processed = morphed;

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
		console.error("Error in extreme quality processing:", error);
		if (src) src.delete();
		if (processed) processed.delete();
		throw error;
	}
}

// Advanced processing pipeline for poor quality images with magnification support
async function processImageData(imageData, options = {}) {
	if (!initialized || !cv) {
		throw new Error("OpenCV not initialized");
	}

	const {
		useAdaptiveThreshold = true,
		useMorphological = true,
		useUnsharpMask = true,
		useCLAHE = true,
		useDeblur = true,
		useNoiseReduction = true,
		useEdgeEnhancement = true,
		qualityLevel = "high", // 'low', 'medium', 'high'
		useMagnification = false,
		magnificationFactor = 2.0,
		useMultiScale = false,
		scales = [1.0, 1.5, 2.0],
		useROIProcessing = false,
		barcodePattern = false,
	} = options;

	let src = imageDataToMat(imageData);
	let processed = src.clone();

	console.log("Processing image with advanced algorithms:", {
		width: imageData.width,
		height: imageData.height,
		qualityLevel,
		useMagnification,
		magnificationFactor,
		useMultiScale,
		useROIProcessing,
		barcodePattern,
	});

	try {
		// Apply magnification first if requested for small barcodes
		if (useMagnification && magnificationFactor > 1.0) {
			console.log(`Applying ${magnificationFactor}x magnification for small barcode enhancement`);
			const magnified = new cv.Mat();
			const newSize = new cv.Size(
				Math.floor(processed.cols * magnificationFactor),
				Math.floor(processed.rows * magnificationFactor),
			);

			// Use INTER_CUBIC for better quality when upscaling
			cv.resize(processed, magnified, newSize, 0, 0, cv.INTER_CUBIC);
			processed.delete();
			processed = magnified;
		}

		// Multi-scale processing for challenging barcodes
		if (useMultiScale && scales.length > 1) {
			console.log("Applying multi-scale processing with scales:", scales);
			const results = [];

			for (const scale of scales) {
				if (scale === 1.0) {
					results.push(processed.clone());
				} else {
					const scaled = new cv.Mat();
					const scaledSize = new cv.Size(
						Math.floor(processed.cols * scale),
						Math.floor(processed.rows * scale),
					);
					cv.resize(processed, scaled, scaledSize, 0, 0, cv.INTER_CUBIC);
					results.push(scaled);
				}
			}

			// Process the best scale (largest for detail preservation)
			const bestResult = results[results.length - 1];
			results.forEach((result, idx) => {
				if (idx !== results.length - 1) result.delete();
			});
			processed.delete();
			processed = bestResult;
		}

		// Convert to grayscale with better color space conversion
		if (processed.channels() > 1) {
			const gray = new cv.Mat();
			const lab = new cv.Mat();
			const labChannels = new cv.MatVector();

			// Convert to LAB color space first for better luminance extraction
			cv.cvtColor(processed, lab, cv.COLOR_RGBA2LAB);
			cv.split(lab, labChannels);

			// Use L channel (luminance) which preserves contrast better
			gray.delete();
			processed.delete();
			processed = labChannels.get(0).clone();

			// Cleanup
			lab.delete();
			for (let i = 0; i < labChannels.size(); i++) {
				labChannels.get(i).delete();
			}
			labChannels.delete();
		}

		// Step 1: Advanced noise reduction for poor quality images
		if (useNoiseReduction) {
			const denoised = new cv.Mat();
			// Use Non-local Means Denoising - excellent for noisy/poor quality images
			cv.fastNlMeansDenoising(processed, denoised, 10, 7, 21);
			processed.delete();
			processed = denoised;
		}

		// Step 1.5: CLAHE (Contrast Limited Adaptive Histogram Equalization)
		if (useCLAHE) {
			const clahe = cv.createCLAHE(3.0, new cv.Size(8, 8));
			const enhanced = new cv.Mat();
			clahe.apply(processed, enhanced);
			clahe.delete();
			processed.delete();
			processed = enhanced;
		}

		// Step 2: Advanced deblurring for blurry images
		if (useDeblur && qualityLevel === "high") {
			const deblurred = new cv.Mat();
			const kernel = new cv.Mat();

			// Create a deblurring kernel (Laplacian-based)
			const kernelData = [0, -1, 0, -1, 5, -1, 0, -1, 0];
			kernel.create(3, 3, cv.CV_32FC1);
			kernel.data32F.set(kernelData);

			cv.filter2D(processed, deblurred, cv.CV_8UC1, kernel);
			kernel.delete();
			processed.delete();
			processed = deblurred;
		}

		// Step 2.5: Advanced unsharp masking with better parameters for poor quality
		if (useUnsharpMask) {
			const blurredForMask = new cv.Mat();
			const mask = new cv.Mat();
			const sharpened = new cv.Mat();

			// Use bilateral filter instead of Gaussian for edge-preserving blur
			cv.bilateralFilter(processed, blurredForMask, 9, 75, 75);

			// Create unsharp mask
			cv.subtract(processed, blurredForMask, mask);

			// Apply stronger unsharp masking for poor quality images
			const amount = qualityLevel === "high" ? 2.5 : 1.8;
			cv.addWeighted(processed, 1.0 + amount, mask, -amount, 0, sharpened);

			blurredForMask.delete();
			mask.delete();
			processed.delete();
			processed = sharpened;
		}

		// Step 3: Multi-level adaptive thresholding for poor quality
		if (useAdaptiveThreshold) {
			const thresholded1 = new cv.Mat();
			const thresholded2 = new cv.Mat();
			const combined = new cv.Mat();

			// First pass: Fine details
			cv.adaptiveThreshold(
				processed,
				thresholded1,
				255,
				cv.ADAPTIVE_THRESH_GAUSSIAN_C,
				cv.THRESH_BINARY,
				15, // larger block size for poor quality
				8, // higher C constant
			);

			// Second pass: Coarser details
			cv.adaptiveThreshold(
				processed,
				thresholded2,
				255,
				cv.ADAPTIVE_THRESH_MEAN_C,
				cv.THRESH_BINARY,
				25, // even larger block size
				12, // higher C constant
			);

			// Combine both thresholds using bitwise AND for better results
			cv.bitwise_and(thresholded1, thresholded2, combined);

			thresholded1.delete();
			thresholded2.delete();
			processed.delete();
			processed = combined;
		}

		// Step 4: Enhanced morphological operations for barcode cleanup
		if (useMorphological) {
			const temp1 = new cv.Mat();
			const temp2 = new cv.Mat();
			const temp3 = new cv.Mat();
			const morphed = new cv.Mat();

			// Adaptive kernel sizes based on image dimensions and magnification
			const baseKernelSize = useMagnification
				? Math.max(3, Math.floor(processed.cols / 400))
				: Math.max(2, Math.floor(processed.cols / 600));

			// Enhanced horizontal kernel for barcode pattern enhancement
			const horizontalKernel = cv.getStructuringElement(
				cv.MORPH_RECT,
				new cv.Size(Math.max(7, baseKernelSize * 3), 1),
			);

			// Vertical kernel for noise removal - smaller for precision
			const verticalKernel = cv.getStructuringElement(
				cv.MORPH_RECT,
				new cv.Size(1, Math.max(2, baseKernelSize)),
			);

			// Step 4a: Close horizontal gaps (crucial for barcodes)
			const iterations = barcodePattern ? 2 : 1;
			cv.morphologyEx(
				processed,
				temp1,
				cv.MORPH_CLOSE,
				horizontalKernel,
				new cv.Point(-1, -1),
				iterations,
			);

			// Step 4b: Remove small vertical artifacts that interfere with barcode reading
			cv.morphologyEx(temp1, temp2, cv.MORPH_OPEN, verticalKernel, new cv.Point(-1, -1), 1);

			// Step 4c: If magnified, apply additional barcode-specific morphology
			if (useMagnification) {
				// Extra wide horizontal kernel for magnified barcodes
				const wideHorizontalKernel = cv.getStructuringElement(
					cv.MORPH_RECT,
					new cv.Size(Math.floor(baseKernelSize * 4), 1),
				);
				cv.morphologyEx(temp2, temp3, cv.MORPH_CLOSE, wideHorizontalKernel, new cv.Point(-1, -1), 1);
				wideHorizontalKernel.delete();
				temp2.delete();
				processed.delete();
				processed = temp3;
			} else {
				// Final cleanup with small rectangular kernel
				const cleanupKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
				cv.morphologyEx(temp2, morphed, cv.MORPH_CLOSE, cleanupKernel, new cv.Point(-1, -1), 1);
				cleanupKernel.delete();
				temp2.delete();
				processed.delete();
				processed = morphed;
			}

			horizontalKernel.delete();
			verticalKernel.delete();
			temp1.delete();
			if (temp3 && !temp3.isDeleted()) temp3.delete();
			if (!processed.isDeleted() && morphed && !morphed.isDeleted() && processed !== morphed)
				morphed.delete();
		}

		// Step 5: Final edge enhancement for barcode detection
		if (useEdgeEnhancement) {
			const edges = new cv.Mat();
			const enhanced = new cv.Mat();

			// Apply Sobel edge detection
			const sobelX = new cv.Mat();
			const sobelY = new cv.Mat();
			cv.Sobel(processed, sobelX, cv.CV_8U, 1, 0, 3);
			cv.Sobel(processed, sobelY, cv.CV_8U, 0, 1, 3);

			// Combine both directions
			cv.addWeighted(sobelX, 0.7, sobelY, 0.3, 0, edges);

			// Enhance the original with edge information
			cv.addWeighted(processed, 0.8, edges, 0.2, 0, enhanced);

			sobelX.delete();
			sobelY.delete();
			edges.delete();
			processed.delete();
			processed = enhanced;
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
		console.error("Error in OpenCV worker processing:", error);
		// Cleanup on error
		if (src) src.delete();
		if (processed) processed.delete();
		throw error;
	}
}

// Handle messages from main thread
self.onmessage = async function (e) {
	const { id, type, data } = e.data;

	try {
		switch (type) {
			case "INIT":
				await initializeOpenCV();
				self.postMessage({ id, type: "INIT_SUCCESS" });
				break;

			case "PROCESS":
				const { imageData, options } = data;
				// Auto-detect quality level if not specified
				const enhancedOptions = {
					qualityLevel: "high", // Default to aggressive processing for poor quality
					useCLAHE: true,
					useDeblur: true,
					useNoiseReduction: true,
					useEdgeEnhancement: true,
					...options,
				};
				const processedImageData = await processImageData(imageData, enhancedOptions);
				self.postMessage({
					id,
					type: "PROCESS_SUCCESS",
					data: processedImageData,
				});
				break;

			case "PROCESS_EXTREME":
				// Use extreme processing for very poor quality images
				const { imageData: extremeImageData } = data;
				const extremeProcessedData = await processVeryPoorImage(extremeImageData);
				self.postMessage({
					id,
					type: "PROCESS_SUCCESS",
					data: extremeProcessedData,
				});
				break;

			case "DETECT_BARCODES":
				// Native OpenCV barcode detection
				const { imageData: barcodeImageData, options: barcodeOptions } = data;
				const barcodeResults = await detectBarcodesWithPreprocessing(
					barcodeImageData,
					barcodeOptions || {},
				);
				self.postMessage({
					id,
					type: "BARCODE_DETECTION_SUCCESS",
					data: barcodeResults,
				});
				break;

			case "CLEANUP":
				// Cleanup any remaining resources
				initialized = false;
				cv = null;
				self.postMessage({ id, type: "CLEANUP_SUCCESS" });
				break;

			default:
				throw new Error(`Unknown message type: ${type}`);
		}
	} catch (error) {
		self.postMessage({
			id,
			type: "ERROR",
			error: error.message,
		});
	}
};
