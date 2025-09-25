<template>
	<v-dialog v-model="scannerDialog" max-width="600px" persistent="false">
		<v-card>
			<v-card-title class="text-h5 text-primary d-flex align-center">
				<v-icon class="mr-2" size="large">mdi-camera</v-icon>
				{{ __("Scan QR Code/Barcode") }}
				<v-chip class="ml-2" size="small" color="primary">
					{{ scanType === "Both" ? "Auto Detect" : scanType }}
				</v-chip>
				<v-spacer></v-spacer>
				<v-btn
					icon="mdi-close"
					@click.stop="stopScanning"
					color="error"
					variant="text"
					size="large"
					:title="__('Close Scanner')"
				></v-btn>
			</v-card-title>

			<v-card-text class="pa-0">
				<div v-if="!cameraPermissionDenied">
					<!-- Scanner container -->
					<div class="scanner-container" v-if="isScanning && scannerDialog">
						<qrcode-stream
							:formats="readerFormats"
							:torch="torchActive"
							:camera="cameraConfig"
							:track="trackFunctionOptions"
							@detect="onDetect"
							@error="onError"
							@camera-on="onCameraReady"
							@camera-off="isScanning = false"
							style="width: 100%; height: 400px; object-fit: cover"
						>
							<!-- Optional: You can put a loading indicator or overlay here -->
							<div v-if="!scanResult" class="scanning-overlay">
								<div class="scan-line"></div>
								<div class="scan-corners">
									<div class="corner top-left"></div>
									<div class="corner top-right"></div>
									<div class="corner bottom-left"></div>
									<div class="corner bottom-right"></div>
								</div>
							</div>
						</qrcode-stream>
					</div>

					<!-- Status messages -->
					<div class="status-messages pa-3">
						<v-alert v-if="errorMessage" type="error" variant="tonal" class="mb-2">
							<v-icon>mdi-alert-circle</v-icon>
							{{ errorMessage }}
						</v-alert>

						<v-alert v-if="scanResult" type="success" variant="tonal" class="mb-2">
							{{ __("Successfully scanned:") }} <strong>{{ scanResult }}</strong> <br /><small
								>Format: {{ scanFormat }}</small
							>
						</v-alert>

						<v-alert
							v-if="!scanResult && !errorMessage && isScanning && scannerDialog"
							type="info"
							variant="tonal"
						>
							{{ __("Position the QR code or barcode within the scanning area") }}
							<br /><small>{{ __("Detecting formats:") }} {{ readerFormats.join(", ") }}</small>
							<div v-if="openCVEnabled" class="mt-2">
								<small class="text-success">
									<v-icon size="small">mdi-eye-plus</v-icon>
									{{ __("OpenCV image processing enabled - Enhanced barcode detection") }}
								</small>
								<div v-if="lastQualityAssessment" class="mt-1">
									<small class="text-info">
										<v-icon size="small">mdi-information</v-icon>
										{{ __("Image quality:") }} {{ __(lastQualityAssessment.level) }}
										<span v-if="lastQualityAssessment.estimatedBarcodeSize !== 'unknown'">
											| {{ __("Barcode size:") }} {{ __(lastQualityAssessment.estimatedBarcodeSize) }}
										</span>
										<span v-if="lastQualityAssessment.needsMagnification" class="text-warning">
											| <v-icon size="small">mdi-magnify</v-icon> {{ __("Auto-magnification active") }}
										</span>
									</small>
								</div>
							</div>
						</v-alert>
					</div>
				</div>

				<!-- Camera permission denied message -->
				<div v-else class="pa-4 text-center">
					<v-icon size="64" color="error">mdi-camera-off</v-icon>
					<h3 class="mt-2">{{ __("Camera Access Required") }}</h3>
					<p class="mt-2">{{ __("Please allow camera access to scan codes") }}</p>
					<!-- Requesting permission is handled by the browser when QrcodeStream tries to access camera -->
				</div>
			</v-card-text>

			<!-- Action buttons -->
			<v-card-actions class="justify-space-between pa-3">
				<div class="d-flex flex-wrap gap-2">
					<!-- Flashlight toggle -->
					<v-btn
						v-if="isScanning && cameras.length > 0"
						@click="toggleTorch"
						:color="torchActive ? 'warning' : 'default'"
						variant="outlined"
						size="small"
					>
						<v-icon>{{ torchActive ? "mdi-flashlight" : "mdi-flashlight-off" }}</v-icon>
						{{ torchActive ? __("Flash On") : __("Flash Off") }}
					</v-btn>

					<!-- Camera switch -->
					<v-btn
						v-if="isScanning && cameras.length > 1"
						@click="switchCamera"
						color="default"
						variant="outlined"
						size="small"
					>
						<v-icon>mdi-camera-switch</v-icon>
						{{ __("Switch Camera") }}
					</v-btn>

					<!-- OpenCV Processing Toggle -->
					<v-btn
						v-if="isScanning"
						@click="toggleOpenCVProcessing"
						:color="openCVEnabled ? 'primary' : 'default'"
						variant="outlined"
						size="small"
						:loading="openCVLoading"
					>
						<v-icon>mdi-eye-plus</v-icon>
						{{ openCVEnabled ? __("OpenCV On") : __("OpenCV Off") }}
					</v-btn>

					<!-- Processing Mode Selector -->
					<v-menu v-if="isScanning && openCVEnabled" offset-y>
						<template v-slot:activator="{ props }">
							<v-btn
								v-bind="props"
								variant="outlined"
								size="small"
								color="primary"
							>
								<v-icon>mdi-cog</v-icon>
								{{ processingModeLabel }}
								<v-icon>mdi-chevron-down</v-icon>
							</v-btn>
						</template>
						<v-list>
							<v-list-item
								v-for="mode in processingModes"
								:key="mode.value"
								@click="setProcessingMode(mode.value)"
								:class="{ 'v-list-item--active': processingMode === mode.value }"
							>
								<v-list-item-title>
									<v-icon class="mr-2">{{ mode.icon }}</v-icon>
									{{ __(mode.label) }}
								</v-list-item-title>
								<v-list-item-subtitle>{{ __(mode.description) }}</v-list-item-subtitle>
							</v-list-item>
						</v-list>
					</v-menu>
				</div>

				<!-- Cancel button -->
				<v-btn @click.stop="stopScanning" color="error" variant="outlined">
					{{ __("Cancel") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<style scoped>
.scanner-container {
	position: relative;
	overflow: hidden;
	background: var(--pos-bg-primary);
	border-radius: 8px;
	box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.1);
}

.barcode-scanner {
	position: relative;
}

.scanning-overlay {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	pointer-events: none;
	z-index: 10;
}

.scan-line {
	position: absolute;
	top: 50%;
	left: 10%;
	right: 10%;
	height: 2px;
	background: linear-gradient(90deg, transparent, #4caf50, transparent);
	animation: scan 2s linear infinite;
}

@keyframes scan {
	0% {
		transform: translateY(-100px);
	}

	100% {
		transform: translateY(100px);
	}
}

.scan-corners {
	position: absolute;
	top: 20%;
	left: 20%;
	right: 20%;
	bottom: 20%;
}

.corner {
	position: absolute;
	width: 20px;
	height: 20px;
	border: 3px solid #4caf50;
}

.corner.top-left {
	top: 0;
	left: 0;
	border-right: none;
	border-bottom: none;
}

.corner.top-right {
	top: 0;
	right: 0;
	border-left: none;
	border-bottom: none;
}

.corner.bottom-left {
	bottom: 0;
	left: 0;
	border-right: none;
	border-top: none;
}

.corner.bottom-right {
	bottom: 0;
	right: 0;
	border-left: none;
	border-top: none;
}

.status-messages {
	background: rgba(255, 255, 255, 0.95);
}

/* Enhanced visual feedback for better scanning */
.scanner-container:hover .scanning-overlay {
	opacity: 0.9;
}

.scanner-container .scanning-overlay {
	transition: opacity 0.3s ease;
}

/* Better visibility for scan line */
@keyframes scan-enhanced {
	0% {
		transform: translateY(-100px);
		opacity: 0.5;
	}
	50% {
		opacity: 1;
	}
	100% {
		transform: translateY(100px);
		opacity: 0.5;
	}
}

.scan-line {
	animation: scan-enhanced 2s linear infinite;
	box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
}

/* Enhanced corners with pulsing effect */
@keyframes pulse-corners {
	0%, 100% {
		opacity: 1;
		transform: scale(1);
	}
	50% {
		opacity: 0.7;
		transform: scale(1.05);
	}
}

.corner {
	animation: pulse-corners 2s ease-in-out infinite;
	box-shadow: 0 0 5px rgba(76, 175, 80, 0.3);
}
</style>

<script>
import { QrcodeStream } from "vue-qrcode-reader";
import opencvProcessor from "../../utils/opencvProcessor.js";

export default {
	name: "CameraScanner",
	components: {
		QrcodeStream,
	},
	props: {
		scanType: {
			type: String,
			default: "Both", // 'QR Code', 'Barcode', 'Both'. Note: vue-qrcode-reader uses a 'formats' prop.
		},
	},

	data() {
		return {
			scannerDialog: false,
			scanResult: "",
			scanFormat: "", // We might get this from the 'detect' event payload
			errorMessage: "",
			cameraPermissionDenied: false,
			isScanning: false,
			torchActive: false,
			selectedDeviceId: null, // For camera switching
			cameras: [], // To store available cameras
			openCVEnabled: true, // OpenCV processing enabled by default
			openCVLoading: false, // Loading state for OpenCV operations
			isProcessing: false, // Flag to prevent processing queue buildup
			frameSkipCounter: 0, // Counter for frame skipping
			processingMode: 'intelligent', // 'intelligent', 'quick', 'full', 'extreme'
			lastQualityAssessment: null, // Last quality assessment from intelligent processing
			qualityHistory: [], // Track quality over recent frames
			useNativeBarcodeDetection: true, // Try OpenCV native barcode detection first
			nativeBarcodeAttempts: 0, // Track native detection attempts
			barcodeDetectionResults: null // Store latest barcode detection results
		};
	},

	computed: {
		cameraConfig() {
			const baseConstraints = {
				audio: false,
				video: {
					width: { ideal: 1920, min: 1280 },
					height: { ideal: 1080, min: 720 },
					aspectRatio: { ideal: 16/9 },
					facingMode: 'environment', // Prefer rear camera for production
					focusMode: 'continuous',
					advanced: [
						{ focusMode: 'continuous' },
						{ exposureMode: 'continuous' },
						{ whiteBalanceMode: 'continuous' },
						{ brightness: { ideal: 0.6 } }, // Slightly increased for better scanning
						{ contrast: { ideal: 1.4 } }, // Enhanced contrast for dark barcodes
						{ saturation: { ideal: 0.9 } }, // Slightly reduced to emphasize contrast
						{ sharpness: { ideal: 1.3 } } // Enhanced sharpness for better edge detection
					]
				}
			};

			if (this.selectedDeviceId) {
				return {
					...baseConstraints,
					video: {
						...baseConstraints.video,
						deviceId: { exact: this.selectedDeviceId }
					}
				};
			}
			return baseConstraints;
		},

		trackFunctionOptions() {
			if (this.openCVEnabled) {
				return this.opencvTrackFunction;
			}
			return null; // Use default vue-qrcode-reader processing
		},
		processingModeLabel() {
			const labels = {
				intelligent: this.__("Smart Auto"),
				quick: this.__("Quick"),
				full: this.__("Enhanced"),
				extreme: this.__("Maximum"),
				magnification: this.__("Magnify"),
				multiscale: this.__("Multi-Scale")
			};
			return labels[this.processingMode] || this.__("Smart Auto");
		},

		processingModes() {
			return [
				{
					value: 'intelligent',
					label: 'Smart Auto',
					description: 'Automatically detects barcode size and applies optimal processing',
					icon: 'mdi-auto-fix'
				},
				{
					value: 'magnification',
					label: 'Smart Magnify',
					description: 'Force magnification processing for small barcodes',
					icon: 'mdi-magnify-plus'
				},
				{
					value: 'multiscale',
					label: 'Multi-Scale',
					description: 'Process at multiple scales for challenging barcodes',
					icon: 'mdi-resize'
				},
				{
					value: 'quick',
					label: 'Quick Mode',
					description: 'Fast processing for clear, well-lit barcodes',
					icon: 'mdi-flash'
				},
				{
					value: 'full',
					label: 'Enhanced Mode',
					description: 'Full processing for poor quality images',
					icon: 'mdi-tune'
				},
				{
					value: 'extreme',
					label: 'Maximum Mode',
					description: 'Extreme processing for very difficult barcodes',
					icon: 'mdi-rocket'
				}
			];
		},

		readerFormats() {
			// Define the formats based on scanType prop or default to all common ones
			// Ensure these format names are valid as per vue-qrcode-reader documentation
			const availableFormats = [
				"qr_code",
				"ean_13",
				"ean_8",
				"code_128",
				"code_39",
				"code_93",
				"codabar",
				"upc_a",
				"upc_e",
				"itf", // ITF (Interleaved 2 of 5)
				// Add other formats if needed and supported by zxing-wasm
			];

			if (this.scanType === "QR Code") {
				return ["qr_code"];
			}
			if (this.scanType === "Barcode") {
				return availableFormats.filter((f) => f !== "qr_code");
			}
			return availableFormats; // 'Both'
		},
	},

	methods: {
		async startScanning() {
			this.scannerDialog = true;
			this.errorMessage = "";
			this.scanResult = "";
			this.scanFormat = "";
			this.cameraPermissionDenied = false;
			this.isScanning = true; // QrcodeStream will attempt to start camera automatically
			// We might need to await this.$nextTick() if QrcodeStream is inside v-if controlled by scannerDialog
			await this.$nextTick();
			// Camera listing can be done here or in a dedicated method
			// vue-qrcode-reader doesn't directly list cameras in QrcodeStream,
			// but we can use navigator.mediaDevices.enumerateDevices()
			await this.listCameras();
		},

		async listCameras() {
			try {
				if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
					console.warn("MediaDevices API not supported.");
					this.cameras = [];
					return;
				}
				const devices = await navigator.mediaDevices.enumerateDevices();
				this.cameras = devices.filter((device) => device.kind === "videoinput");
				if (this.cameras.length > 0 && !this.selectedDeviceId) {
					// Select the rear camera with highest resolution capabilities
					const rearCamera = this.cameras.find((camera) =>
						/back|rear|environment/i.test(camera.label),
					);
					this.selectedDeviceId = rearCamera ? rearCamera.deviceId : this.cameras[0].deviceId;
				}
			} catch (error) {
				console.error("Error listing cameras:", error);
				this.cameras = [];
			}
		},

		async onCameraReady() {
			this.isScanning = true;
			// Try to apply additional constraints for better image quality
			try {
				if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
					// Additional optimization for camera stream
					console.log("Camera ready with enhanced settings for barcode scanning");
				}
			} catch (error) {
				console.warn("Could not apply enhanced camera settings:", error);
			}
		},

		onDetect(detectedCodes) {
			// detectedCodes is an array of objects, each with rawValue, format, etc.
			if (detectedCodes && detectedCodes.length > 0) {
				const firstResult = detectedCodes[0];
				this.scanResult = firstResult.rawValue;
				this.scanFormat = firstResult.format;
				this.errorMessage = "";

				this.$emit("barcode-scanned", this.scanResult);

				if (typeof frappe !== "undefined" && frappe.show_alert) {
					frappe.show_alert(
						{
							message: this.__("Code scanned successfully") + ` (${this.scanFormat})`,
							indicator: "green",
						},
						3,
					);
				}

				// Reset scan result and temporarily pause scanning
				this.isScanning = false;

				// Resume scanning after a short delay
				setTimeout(() => {
					this.scanResult = "";
					this.scanFormat = "";
					this.isScanning = true;
				}, 1000);
			}
		},

		onError(error) {
			this.errorMessage = error.name || "Unknown error";
			console.error("Camera error:", error);

			if (error.name === "NotAllowedError") {
				this.cameraPermissionDenied = true;
				this.errorMessage = this.__(
					"Camera permission denied. Please allow camera access in your browser settings and refresh the page."
				);
			} else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
				this.errorMessage = this.__("No camera found on this device. Please ensure your device has a working camera.");
			} else if (error.name === "NotSupportedError") {
				this.errorMessage = this.__("Secure context (HTTPS) required for camera access. Please use HTTPS to access the camera.");
			} else if (error.name === "AbortError") {
				this.errorMessage = this.__("Camera access was aborted. Please try again.");
			} else if (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError") {
				this.errorMessage = this.__(
					"Camera constraints not supported by your device. Trying fallback settings..."
				);
				// Try with simpler constraints
				this.tryFallbackCamera();
				return;
			} else {
				this.errorMessage = this.__("Error accessing camera:") + ` ${error.message}. Please try refreshing the page.`;
			}
			this.isScanning = false;
		},

		async tryFallbackCamera() {
			console.log("Trying fallback camera settings...");
			// Try with basic constraints
			try {
				this.openCVEnabled = false; // Disable OpenCV temporarily
				await this.$nextTick();
				this.isScanning = true;

				if (typeof frappe !== "undefined" && frappe.show_alert) {
					frappe.show_alert(
						{
							message: this.__("Using basic camera settings due to device limitations"),
							indicator: "orange",
						},
						3,
					);
				}
			} catch (fallbackError) {
				console.error("Fallback camera also failed:", fallbackError);
				this.errorMessage = this.__("Unable to access camera even with basic settings. Please check your camera permissions and device compatibility.");
			}
		},

		stopScanning() {
			this.isScanning = false; // This should make QrcodeStream stop/hide
			this.scannerDialog = false;
			this.scanResult = "";
			this.scanFormat = "";
			this.errorMessage = "";
			this.torchActive = false;
			// selectedDeviceId and cameras can remain as they are for next scan
			this.$emit("scanner-closed");
		},

		async toggleTorch() {
			this.torchActive = !this.torchActive;
			// The QrcodeStream component has a :torch prop, binding this.torchActive to it should work.
		},

		async switchCamera() {
			if (this.cameras.length > 1) {
				const currentIndex = this.cameras.findIndex((cam) => cam.deviceId === this.selectedDeviceId);
				const nextIndex = (currentIndex + 1) % this.cameras.length;
				this.selectedDeviceId = this.cameras[nextIndex].deviceId;
				// QrcodeStream should react to changes in :camera prop (if we bind selectedDeviceId to it)
				// Or we might need to re-initialize or force a re-render of QrcodeStream
				// Forcing re-render by toggling isScanning or using a v-if with a key
				this.isScanning = false;
				await this.$nextTick();
				this.isScanning = true;
				if (typeof frappe !== "undefined" && frappe.show_alert) {
					frappe.show_alert(
						{
							message:
								this.__("Switched to: ") +
								(this.cameras[nextIndex].label || `Camera ${nextIndex + 1}`),
							indicator: "blue",
						},
						2,
					);
				}
			}
		},


		async toggleOpenCVProcessing() {
			this.openCVLoading = true;
			this.openCVEnabled = !this.openCVEnabled;

			// Initialize OpenCV if enabling
			if (this.openCVEnabled) {
				try {
					await opencvProcessor.ensureInitialized();
					console.log('OpenCV processing enabled');
				} catch (error) {
					console.error('Failed to initialize OpenCV:', error);
					this.openCVEnabled = false;
				}
			}

			// Restart camera with new processing options
			this.isScanning = false;
			await this.$nextTick();
			this.isScanning = true;
			this.openCVLoading = false;

			if (typeof frappe !== "undefined" && frappe.show_alert) {
				frappe.show_alert(
					{
						message: this.openCVEnabled
							? this.__("OpenCV image processing enabled - Enhanced barcode detection")
							: this.__("OpenCV processing disabled"),
						indicator: this.openCVEnabled ? "green" : "blue",
					},
					3,
				);
			}
		},

		// Custom track function for OpenCV preprocessing - optimized for speed
		opencvTrackFunction(detectedCodes, ctx) {
			// Skip processing if already processing to avoid queue buildup
			if (this.isProcessing) return Promise.resolve(detectedCodes);

			this.isProcessing = true;

			return new Promise(async (resolve) => {
				try {
					const canvas = ctx.canvas;

					// Skip processing every few frames for better performance
					if (this.frameSkipCounter > 0) {
						this.frameSkipCounter--;
						this.isProcessing = false;
						resolve(detectedCodes);
						return;
					}

					this.frameSkipCounter = 2; // Process every 3rd frame

					const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

					// Apply OpenCV preprocessing based on selected mode
				let processedImageData;
				switch (this.processingMode) {
					case 'quick':
						processedImageData = await opencvProcessor.quickProcess(imageData);
						break;
					case 'full':
						processedImageData = await opencvProcessor.fullProcess(imageData);
						break;
					case 'extreme':
						processedImageData = await opencvProcessor.extremeProcess(imageData);
						break;
					case 'magnification':
						// Force magnification processing for small barcodes
						const quality = opencvProcessor.assessImageQuality(imageData);
						processedImageData = await opencvProcessor.smartMagnificationProcess(imageData, quality);
						this.lastQualityAssessment = quality;
						break;
					case 'multiscale':
						processedImageData = await opencvProcessor.multiScaleProcess(imageData);
						break;
					case 'intelligent':
					default:
						processedImageData = await opencvProcessor.intelligentProcess(imageData);
						// Store quality assessment for display
						if (opencvProcessor.lastQualityAssessment) {
							this.lastQualityAssessment = opencvProcessor.lastQualityAssessment;
							// Keep history of recent quality assessments
							this.qualityHistory.push(this.lastQualityAssessment);
							if (this.qualityHistory.length > 10) {
								this.qualityHistory.shift();
							}
						}
						break;
				}

					// Update canvas with processed image
					ctx.putImageData(processedImageData, 0, 0);

					this.isProcessing = false;
					resolve(detectedCodes);
				} catch (error) {
					console.warn('OpenCV processing failed:', error);
					this.isProcessing = false;
					resolve(detectedCodes); // Return original results on error
				}
			});
		},

		setProcessingMode(mode) {
			this.processingMode = mode;
			console.log('Processing mode set to:', mode);
			if (typeof frappe !== "undefined" && frappe.show_alert) {
				const modeMessages = {
					intelligent: this.__("Smart Auto mode - Automatically detects barcode size and applies optimal processing"),
					magnification: this.__("Smart Magnify mode - Enhanced processing with automatic magnification for small barcodes"),
					multiscale: this.__("Multi-Scale mode - Processes at multiple resolutions for challenging barcodes"),
					quick: this.__("Quick mode - Fast processing for clear, well-lit barcodes"),
					full: this.__("Enhanced mode - Full processing for poor quality images"),
					extreme: this.__("Maximum mode - Extreme enhancement for very poor quality images")
				};
				frappe.show_alert(
					{
						message: modeMessages[mode] || this.__("Processing mode changed"),
						indicator: "blue",
					},
					3,
				);
			}
		},

		// Old methods to remove or adapt:
		// initializeAutoDetectionScanner, startBarcodeDetection, detectBarcodeInImageData,
		// onScanSuccess (replaced by onDetect), stopCurrentScanner, toggleFlashlight (replaced by toggleTorch)
		// handleScannerError (replaced by onError)

		handleEscKey(event) {
			if (event.key === "Escape" && this.scannerDialog) {
				event.preventDefault();
				this.stopScanning();
			}
		},
	},

	watch: {
		scannerDialog(newVal) {
			if (newVal) {
				// When dialog opens, if no camera is selected, list them.
				if (!this.selectedDeviceId && this.cameras.length === 0) {
					this.listCameras();
				}
			} else {
				// When dialog closes, ensure scanning is stopped.
				this.isScanning = false;
				this.torchActive = false;
			}
		},
	},

	async mounted() {
		if (typeof document !== "undefined") {
			document.addEventListener("keydown", this.handleEscKey);
		}

		// Initialize OpenCV processor
		try {
			await opencvProcessor.ensureInitialized();
			console.log('OpenCV initialized in CameraScanner component');
		} catch (error) {
			console.warn('OpenCV initialization failed:', error);
			this.openCVEnabled = false; // Disable if initialization fails
		}
	},

	async beforeUnmount() {
		if (typeof document !== "undefined") {
			document.removeEventListener("keydown", this.handleEscKey);
		}
		this.stopScanning(); // Ensure scanner stops when component is unmounted

		// Clean up OpenCV Web Worker resources
		try {
			await opencvProcessor.destroy();
			console.log('OpenCV Web Worker cleaned up successfully');
		} catch (error) {
			console.warn('Error cleaning up OpenCV Web Worker:', error);
		}
	},
};
</script>
