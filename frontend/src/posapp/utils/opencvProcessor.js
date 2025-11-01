import opencvWorkerManager from "./opencvWorkerManager.js";

class OpenCVProcessor {
	constructor() {
		this.initialized = false;
		this.initPromise = null;
		this.workerManager = opencvWorkerManager;
		this.lastQualityAssessment = null;
		this.fallbackMode = false;
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
			console.log("✅ OpenCV Processor with Web Worker initialized successfully");
			return true;
		} catch (error) {
			console.error("❌ Failed to initialize OpenCV Processor:", error);
			console.log("🔄 Falling back to non-worker mode (image processing disabled)");
			this.initialized = false;
			// Set a flag to indicate fallback mode
			this.fallbackMode = true;
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
		if (!(await this.ensureInitialized()) || this.fallbackMode) {
			console.warn("📷 OpenCV Worker not available, returning original image");
			return imageData;
		}

		try {
			const processedImageData = await this.workerManager.processImage(imageData, {
				useGaussianBlur: false, // Skip for speed
				useAdaptiveThreshold: true,
				useMorphological: true,
				useUnsharpMask: true,
				useCLAHE: false, // Skip for speed
				useDeblur: false, // Skip for speed
				useNoiseReduction: false, // Skip for speed
				useEdgeEnhancement: false, // Skip for speed
				qualityLevel: "medium",
			});

			return processedImageData;
		} catch (error) {
			console.error("Error in OpenCV worker processing:", error);
			return imageData; // Return original on error
		}
	}

	/**
	 * Full preprocessing pipeline for difficult barcodes using Web Worker
	 */
	async fullProcess(imageData) {
		if (!(await this.ensureInitialized()) || this.fallbackMode) {
			console.warn("📷 OpenCV Worker not available, returning original image");
			return imageData;
		}

		try {
			// Use enhanced processing with all advanced algorithms
			const processedImageData = await this.workerManager.processImage(imageData, {
				useGaussianBlur: false, // Skip basic blur in favor of advanced algorithms
				useAdaptiveThreshold: true,
				useMorphological: true,
				useUnsharpMask: true,
				useCLAHE: true,
				useDeblur: true,
				useNoiseReduction: true,
				useEdgeEnhancement: true,
				qualityLevel: "high",
			});

			return processedImageData;
		} catch (error) {
			console.error("Error in OpenCV worker processing:", error);
			return imageData; // Return original on error
		}
	}

	/**
	 * Extreme processing for very poor quality images
	 */
	async extremeProcess(imageData) {
		if (!(await this.ensureInitialized()) || this.fallbackMode) {
			console.warn("📷 OpenCV Worker not available, returning original image");
			return imageData;
		}

		try {
			console.log("Applying extreme processing for very poor quality image");
			const processedImageData = await this.workerManager.processImageExtreme(imageData);
			return processedImageData;
		} catch (error) {
			console.error("Error in extreme OpenCV worker processing:", error);
			return imageData; // Return original on error
		}
	}

	/**
	 * Intelligent processing with automatic magnification detection
	 */
	async intelligentProcess(imageData) {
		if (!(await this.ensureInitialized()) || this.fallbackMode) {
			console.warn("📷 OpenCV Worker not available, returning original image");
			// Still do a basic quality assessment for display purposes
			this.lastQualityAssessment = this.assessImageQuality(imageData);
			return imageData;
		}

		try {
			// Enhanced quality assessment with barcode size detection
			const quality = this.assessImageQuality(imageData);
			this.lastQualityAssessment = quality;

			console.log("Enhanced image quality assessment:", quality);

			// Apply smart processing based on barcode size and quality
			if (quality.needsMagnification) {
				console.log(
					`Small barcode detected (${quality.estimatedBarcodeSize}), applying magnification processing`,
				);
				return await this.smartMagnificationProcess(imageData, quality);
			} else if (quality.level === "very_poor") {
				console.log("Using extreme processing for very poor quality image");
				return await this.extremeProcess(imageData);
			} else if (quality.level === "poor") {
				console.log("Using full processing for poor quality image");
				return await this.fullProcess(imageData);
			} else {
				console.log("Using quick processing for acceptable quality image");
				return await this.quickProcess(imageData);
			}
		} catch (error) {
			console.error("Error in intelligent OpenCV processing:", error);
			return imageData;
		}
	}

	/**
	 * Smart magnification processing for small barcodes
	 */
	async smartMagnificationProcess(imageData, qualityAssessment) {
		if (!(await this.ensureInitialized()) || this.fallbackMode) {
			console.warn("📷 OpenCV Worker not available, returning original image");
			return imageData;
		}

		try {
			console.log("Applying smart magnification processing for small barcodes");

			// Determine magnification factor based on estimated barcode size
			let magnificationFactor = 2.0; // Default
			if (qualityAssessment.estimatedBarcodeSize === "small") {
				magnificationFactor = 3.0; // Higher magnification for very small barcodes
			} else if (qualityAssessment.estimatedBarcodeSize === "medium") {
				magnificationFactor = 2.0; // Moderate magnification
			}

			// Create processing options for magnified processing
			const magnificationOptions = {
				useMagnification: true,
				magnificationFactor: magnificationFactor,
				useAdaptiveThreshold: true,
				useMorphological: true,
				useUnsharpMask: true,
				useCLAHE: true,
				useDeblur: qualityAssessment.level === "poor" || qualityAssessment.level === "very_poor",
				useNoiseReduction:
					qualityAssessment.level === "poor" || qualityAssessment.level === "very_poor",
				useEdgeEnhancement: true,
				qualityLevel: "high",
				// Region of Interest processing if we have barcode location hints
				useROIProcessing: qualityAssessment.potentialBarcodeCount > 0,
				barcodePattern: qualityAssessment.barcodePattern,
			};

			console.log(`Applying ${magnificationFactor}x magnification with enhanced processing`);
			const processedImageData = await this.workerManager.processImage(imageData, magnificationOptions);
			return processedImageData;
		} catch (error) {
			console.error("Error in smart magnification processing:", error);
			// Fallback to regular full processing
			return await this.fullProcess(imageData);
		}
	}

	/**
	 * Multi-scale processing for challenging barcodes
	 */
	async multiScaleProcess(imageData) {
		if (!(await this.ensureInitialized()) || this.fallbackMode) {
			console.warn("📷 OpenCV Worker not available, returning original image");
			return imageData;
		}

		try {
			console.log("Applying multi-scale processing for challenging barcode detection");

			const multiScaleOptions = {
				useMultiScale: true,
				scales: [1.0, 1.5, 2.0, 2.5], // Multiple processing scales
				useAdaptiveThreshold: true,
				useMorphological: true,
				useUnsharpMask: true,
				useCLAHE: true,
				useDeblur: true,
				useNoiseReduction: true,
				useEdgeEnhancement: true,
				qualityLevel: "extreme",
			};

			const processedImageData = await this.workerManager.processImage(imageData, multiScaleOptions);
			return processedImageData;
		} catch (error) {
			console.error("Error in multi-scale processing:", error);
			return await this.extremeProcess(imageData);
		}
	}

	/**
	 * Enhanced image quality assessment with barcode size detection
	 */
	assessImageQuality(imageData) {
		const { data, width, height } = imageData;

		// Calculate basic statistics
		let sum = 0;
		let sumSquares = 0;
		let edgePixels = 0;
		let horizontalEdges = 0;
		let verticalEdges = 0;

		// Sample pixels (every 4th pixel for performance)
		const sampleRate = 4;
		let samples = 0;

		// Detect potential barcode regions
		const barcodeRegions = [];
		const minBarcodeWidth = 50; // Minimum pixels for a detectable barcode
		const minBarcodeHeight = 20;

		for (let i = 0; i < data.length; i += 4 * sampleRate) {
			// Convert to grayscale
			const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
			sum += gray;
			sumSquares += gray * gray;
			samples++;

			const x = (i / 4) % width;
			const y = Math.floor(i / 4 / width);

			// Horizontal edge detection (for barcode patterns)
			if (i + 4 * width < data.length) {
				const neighborGray =
					data[i + 4 * width] * 0.299 +
					data[i + 4 * width + 1] * 0.587 +
					data[i + 4 * width + 2] * 0.114;
				const edgeDiff = Math.abs(gray - neighborGray);
				if (edgeDiff > 30) {
					edgePixels++;
					horizontalEdges++;
				}
			}

			// Vertical edge detection (for barcode patterns)
			if (i + 4 < data.length && x < width - 1) {
				const rightGray = data[i + 4] * 0.299 + data[i + 5] * 0.587 + data[i + 6] * 0.114;
				const edgeDiff = Math.abs(gray - rightGray);
				if (edgeDiff > 40) {
					verticalEdges++;
					// Potential barcode region detection
					if (edgeDiff > 60) {
						barcodeRegions.push({ x, y, intensity: edgeDiff });
					}
				}
			}
		}

		const mean = sum / samples;
		const variance = sumSquares / samples - mean * mean;
		const contrast = Math.sqrt(variance) / 255; // Normalized contrast
		const edgeRatio = edgePixels / samples;
		const horizontalRatio = horizontalEdges / samples;
		const verticalRatio = verticalEdges / samples;

		// Barcode pattern detection
		const barcodePattern = verticalRatio > horizontalRatio * 2; // More vertical than horizontal edges
		const potentialBarcodeCount = barcodeRegions.length;

		// Estimate barcode size if detected
		let estimatedBarcodeSize = "unknown";
		let needsMagnification = false;

		if (barcodeRegions.length > 5) {
			// Cluster barcode regions to estimate size
			const clusteredRegions = this.clusterBarcodeRegions(barcodeRegions, width, height);
			if (clusteredRegions.length > 0) {
				const largestCluster = clusteredRegions.reduce((max, cluster) =>
					cluster.width * cluster.height > max.width * max.height ? cluster : max,
				);

				if (largestCluster.width < minBarcodeWidth || largestCluster.height < minBarcodeHeight) {
					estimatedBarcodeSize = "small";
					needsMagnification = true;
				} else if (
					largestCluster.width < minBarcodeWidth * 1.5 ||
					largestCluster.height < minBarcodeHeight * 1.5
				) {
					estimatedBarcodeSize = "medium";
					needsMagnification = largestCluster.width < minBarcodeWidth * 1.2;
				} else {
					estimatedBarcodeSize = "large";
				}
			}
		}

		// Enhanced quality assessment
		let level = "good";
		if (contrast < 0.15 && edgeRatio < 0.05) {
			level = "very_poor";
		} else if (contrast < 0.25 && edgeRatio < 0.1) {
			level = "poor";
		} else if (contrast < 0.35) {
			level = "fair";
		}

		// Adjust recommendation based on barcode size
		let recommendation =
			level === "very_poor"
				? "Use extreme processing"
				: level === "poor"
					? "Use full processing"
					: "Use quick processing";

		if (needsMagnification) {
			recommendation = "Use magnification + " + recommendation.toLowerCase();
		}

		return {
			level,
			contrast: contrast.toFixed(3),
			edgeRatio: edgeRatio.toFixed(3),
			horizontalRatio: horizontalRatio.toFixed(3),
			verticalRatio: verticalRatio.toFixed(3),
			mean: mean.toFixed(1),
			barcodePattern,
			estimatedBarcodeSize,
			needsMagnification,
			potentialBarcodeCount,
			recommendation,
		};
	}

	/**
	 * Cluster nearby barcode regions to estimate barcode dimensions
	 */
	clusterBarcodeRegions(regions, imageWidth, imageHeight) {
		if (regions.length === 0) return [];

		const clusters = [];
		const visited = new Set();
		// Adaptive cluster distance based on image size
		const clusterDistance = Math.max(20, Math.min(imageWidth, imageHeight) * 0.05);

		for (let i = 0; i < regions.length; i++) {
			if (visited.has(i)) continue;

			const cluster = {
				regions: [regions[i]],
				minX: regions[i].x,
				maxX: regions[i].x,
				minY: regions[i].y,
				maxY: regions[i].y,
			};
			visited.add(i);

			// Find nearby regions
			for (let j = i + 1; j < regions.length; j++) {
				if (visited.has(j)) continue;

				const distance = Math.sqrt(
					Math.pow(regions[i].x - regions[j].x, 2) + Math.pow(regions[i].y - regions[j].y, 2),
				);

				if (distance <= clusterDistance) {
					cluster.regions.push(regions[j]);
					cluster.minX = Math.min(cluster.minX, regions[j].x);
					cluster.maxX = Math.max(cluster.maxX, regions[j].x);
					cluster.minY = Math.min(cluster.minY, regions[j].y);
					cluster.maxY = Math.max(cluster.maxY, regions[j].y);
					visited.add(j);
				}
			}

			cluster.width = cluster.maxX - cluster.minX;
			cluster.height = cluster.maxY - cluster.minY;
			cluster.centerX = (cluster.minX + cluster.maxX) / 2;
			cluster.centerY = (cluster.minY + cluster.maxY) / 2;
			cluster.density = cluster.regions.length / ((cluster.width || 1) * (cluster.height || 1));

			clusters.push(cluster);
		}

		return clusters.filter((cluster) => cluster.regions.length >= 3); // Minimum regions for valid cluster
	}

	/**
	 * Native OpenCV barcode detection with preprocessing
	 */
	async detectBarcodes(imageData, options = {}) {
		if (!(await this.ensureInitialized())) {
			console.warn("OpenCV Worker not initialized, skipping barcode detection");
			return { detected: false, barcodes: [], error: "OpenCV not initialized" };
		}

		try {
			console.log("Using OpenCV native barcode detection");
			const barcodeResults = await this.workerManager.detectBarcodes(imageData, {
				forcePreprocessing: options.forcePreprocessing || false,
				useExtremePreprocessing: options.useExtremePreprocessing || true,
				...options,
			});

			return barcodeResults;
		} catch (error) {
			console.error("Error in OpenCV native barcode detection:", error);
			return { detected: false, barcodes: [], error: error.message };
		}
	}

	/**
	 * Hybrid detection: Try native barcode detection first, fallback to enhanced processing + external detection
	 */
	async hybridBarcodeDetection(imageData, options = {}) {
		if (!(await this.ensureInitialized())) {
			console.warn("OpenCV Worker not initialized, skipping hybrid detection");
			return { detected: false, barcodes: [], method: "none" };
		}

		try {
			// First attempt: Native OpenCV barcode detection
			console.log("Attempting native OpenCV barcode detection...");
			const nativeResults = await this.detectBarcodes(imageData, options);

			if (nativeResults.detected && nativeResults.barcodes.length > 0) {
				console.log(
					"Native barcode detection successful:",
					nativeResults.barcodes.length,
					"barcodes found",
				);
				return {
					...nativeResults,
					method: "native_opencv",
					processedImageData: null, // Native detection doesn't return processed image
				};
			}

			// Fallback: Enhanced image processing for external barcode libraries
			console.log("Native detection failed, applying enhanced processing for external libraries...");
			const processedImageData = await this.intelligentProcess(imageData);

			return {
				detected: false,
				barcodes: [],
				method: "processed_for_external",
				processedImageData: processedImageData,
				nativeAttempted: true,
				nativeAvailable: nativeResults.detectorAvailable,
			};
		} catch (error) {
			console.error("Error in hybrid barcode detection:", error);
			return { detected: false, barcodes: [], method: "error", error: error.message };
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
			console.warn("Error destroying OpenCV worker:", error);
		}
	}
}

// Create singleton instance
const opencvProcessor = new OpenCVProcessor();
export default opencvProcessor;
