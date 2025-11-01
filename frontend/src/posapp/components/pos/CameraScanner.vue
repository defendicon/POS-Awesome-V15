<template>
	<v-dialog
		v-model="scannerDialog"
		max-width="520px"
		persistent="false"
		:scrim="false"
		:retain-focus="false"
		location="top right"
		content-class="camera-scanner-dialog"
	>
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
							<!-- Overlay -->
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
							{{ __("Successfully scanned:") }} <strong>{{ scanResult }}</strong>
							<br />
							<small>Format: {{ scanFormat }}</small>
						</v-alert>

						<v-alert
							v-if="!scanResult && !errorMessage && isScanning && scannerDialog"
							type="info"
							variant="tonal"
						>
							{{ __("Position the QR code or barcode within the scanning area") }}<br />
							<small>{{ __("Detecting formats:") }} {{ readerFormats.join(", ") }}</small>
							<div v-if="openCVEnabled" class="mt-2">
								<small class="text-success">
									<v-icon size="small">mdi-eye-plus</v-icon>
									{{ __("OpenCV image processing enabled - Enhanced barcode detection") }}
								</small>
							</div>
						</v-alert>
					</div>
				</div>

				<!-- Camera permission denied message -->
				<div v-else class="pa-4 text-center">
					<v-icon size="64" color="error">mdi-camera-off</v-icon>
					<h3 class="mt-2">{{ __("Camera Access Required") }}</h3>
					<p class="mt-2">{{ __("Please allow camera access to scan codes") }}</p>
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
	inset: 0;
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
	animation: scan-enhanced 2s linear infinite;
	box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
}
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
	animation: pulse-corners 2s ease-in-out infinite;
	box-shadow: 0 0 5px rgba(76, 175, 80, 0.3);
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
.camera-scanner-dialog {
	align-self: flex-start;
	justify-self: flex-end;
	margin: 16px;
}
.scanner-container:hover .scanning-overlay {
	opacity: 0.9;
}
.scanner-container .scanning-overlay {
	transition: opacity 0.3s ease;
}
</style>

<script>
/* global frappe */
import { QrcodeStream } from "vue-qrcode-reader";
import opencvProcessor from "../../utils/opencvProcessor.js";

export default {
	name: "CameraScanner",
	components: { QrcodeStream },

	props: {
		scanType: {
			type: String,
			default: "Both", // 'QR Code', 'Barcode', 'Both'
		},
		// optional: auto close dialog after a successful scan
		autoCloseOnScan: {
			type: Boolean,
			default: false,
		},
	},

	data() {
		return {
			scannerDialog: false,
			scanResult: "",
			scanFormat: "",
			errorMessage: "",
			cameraPermissionDenied: false,
			isScanning: false,
			torchActive: false,
			selectedDeviceId: null,
			cameras: [],
			// OpenCV controls
			openCVEnabled: true,
			openCVLoading: false,
			isProcessing: false,
			frameSkipCounter: 0,
			// timers + external lock
			scanResetTimeoutId: null,
			dialogCloseTimeoutId: null,
			scannerLockedExternally: false,
		};
	},

	computed: {
		cameraConfig() {
			const baseConstraints = {
				audio: false,
				video: {
					width: { ideal: 1920, min: 1280 },
					height: { ideal: 1080, min: 720 },
					aspectRatio: { ideal: 16 / 9 },
					facingMode: "environment",
					focusMode: "continuous",
					advanced: [
						{ focusMode: "continuous" },
						{ exposureMode: "continuous" },
						{ whiteBalanceMode: "continuous" },
						{ brightness: { ideal: 0.6 } },
						{ contrast: { ideal: 1.4 } },
						{ saturation: { ideal: 0.9 } },
						{ sharpness: { ideal: 1.3 } },
					],
				},
			};
			if (this.selectedDeviceId) {
				return {
					...baseConstraints,
					video: { ...baseConstraints.video, deviceId: { exact: this.selectedDeviceId } },
				};
			}
			return baseConstraints;
		},

		trackFunctionOptions() {
			return this.openCVEnabled ? this.opencvTrackFunction : null;
		},

		readerFormats() {
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
				"itf",
			];
			if (this.scanType === "QR Code") return ["qr_code"];
			if (this.scanType === "Barcode") return availableFormats.filter((f) => f !== "qr_code");
			return availableFormats;
		},
	},

	methods: {
		async startScanning() {
			this.scannerLockedExternally = false;
			this.scannerDialog = true;
			this.errorMessage = "";
			this.scanResult = "";
			this.scanFormat = "";
			this.cameraPermissionDenied = false;
			this.isScanning = true;
			await this.$nextTick();
			await this.listCameras();
		},

		async listCameras() {
			try {
				if (!navigator.mediaDevices?.enumerateDevices) {
					console.warn("MediaDevices API not supported.");
					this.cameras = [];
					return;
				}
				const devices = await navigator.mediaDevices.enumerateDevices();
				this.cameras = devices.filter((d) => d.kind === "videoinput");
				if (this.cameras.length > 0 && !this.selectedDeviceId) {
					const rear = this.cameras.find((c) => /back|rear|environment/i.test(c.label));
					this.selectedDeviceId = rear ? rear.deviceId : this.cameras[0].deviceId;
				}
			} catch (e) {
				console.error("Error listing cameras:", e);
				this.cameras = [];
			}
		},

		async onCameraReady() {
			this.isScanning = true;
			try {
				console.log("Camera ready with enhanced settings for barcode scanning");
			} catch (e) {
				console.warn("Could not apply enhanced camera settings:", e);
			}
		},

		// unified detect handler (auto-close + timers)
		onDetect(detectedCodes) {
			if (detectedCodes && detectedCodes.length > 0) {
				const first = detectedCodes[0];
				this.handleScannedCode(first.rawValue, first.format);
			}
		},

		handleScannedCode(rawValue, formatLabel = "", options = {}) {
			const {
				pauseCamera = true,
				resetDelay = 1000,
				closeDialog = this.autoCloseOnScan,
				closeDelay,
			} = options;

			const code = (rawValue ?? "").toString().trim();
			if (!code) return;

			this.scanResult = code;
			this.scanFormat = formatLabel || "";
			this.errorMessage = "";

			this.$emit("barcode-scanned", code);

			if (typeof frappe !== "undefined" && frappe.show_alert) {
				const formatSuffix = this.scanFormat ? ` (${this.scanFormat})` : "";
				frappe.show_alert(
					{ message: this.__("Code scanned successfully") + formatSuffix, indicator: "green" },
					3,
				);
			}

			const shouldPause = pauseCamera && this.isScanning;
			if (shouldPause) this.isScanning = false;

			// clear timers
			if (this.scanResetTimeoutId) clearTimeout(this.scanResetTimeoutId);
			if (this.dialogCloseTimeoutId) clearTimeout(this.dialogCloseTimeoutId);
			this.scanResetTimeoutId = null;
			this.dialogCloseTimeoutId = null;

			if (closeDialog) {
				const effectiveDelay = Math.max(
					0,
					typeof closeDelay === "number" ? closeDelay : Math.min(resetDelay, 250),
				);
				this.dialogCloseTimeoutId = setTimeout(() => {
					this.dialogCloseTimeoutId = null;
					this.stopScanning();
				}, effectiveDelay);
				return;
			}

			this.scanResetTimeoutId = setTimeout(
				() => {
					this.scanResult = "";
					this.scanFormat = "";
					if (shouldPause && this.scannerDialog && !this.scannerLockedExternally) {
						this.isScanning = true;
					}
					this.scanResetTimeoutId = null;
				},
				Math.max(0, resetDelay),
			);
		},

		onError(error) {
			this.errorMessage = error.name || "Unknown error";
			console.error("Camera error:", error);

			if (error.name === "NotAllowedError") {
				this.cameraPermissionDenied = true;
				this.errorMessage = this.__(
					"Camera permission denied. Please allow camera access in your browser settings and refresh the page.",
				);
			} else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
				this.errorMessage = this.__(
					"No camera found on this device. Please ensure your device has a working camera.",
				);
			} else if (error.name === "NotSupportedError") {
				this.errorMessage = this.__(
					"Secure context (HTTPS) required for camera access. Please use HTTPS to access the camera.",
				);
			} else if (error.name === "AbortError") {
				this.errorMessage = this.__("Camera access was aborted. Please try again.");
			} else if (
				error.name === "OverconstrainedError" ||
				error.name === "ConstraintNotSatisfiedError"
			) {
				this.errorMessage = this.__(
					"Camera constraints not supported by your device. Trying fallback settings...",
				);
				this.tryFallbackCamera();
				return;
			} else {
				this.errorMessage =
					this.__("Error accessing camera:") + ` ${error.message}. Please try refreshing the page.`;
			}
			this.isScanning = false;
		},

		async tryFallbackCamera() {
			console.log("Trying fallback camera settings...");
			try {
				this.openCVEnabled = false; // reduce processing for weak devices
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
				this.errorMessage = this.__(
					"Unable to access camera even with basic settings. Please check your camera permissions and device compatibility.",
				);
			}
		},

		stopScanning() {
			this.scannerLockedExternally = false;
			if (this.scanResetTimeoutId) clearTimeout(this.scanResetTimeoutId);
			if (this.dialogCloseTimeoutId) clearTimeout(this.dialogCloseTimeoutId);
			this.scanResetTimeoutId = null;
			this.dialogCloseTimeoutId = null;

			this.isScanning = false;
			this.scannerDialog = false;
			this.scanResult = "";
			this.scanFormat = "";
			this.errorMessage = "";
			this.torchActive = false;
			this.$emit("scanner-closed");
		},

		async toggleTorch() {
			this.torchActive = !this.torchActive;
		},

		async switchCamera() {
			if (this.cameras.length > 1) {
				const currentIndex = this.cameras.findIndex((cam) => cam.deviceId === this.selectedDeviceId);
				const nextIndex = (currentIndex + 1) % this.cameras.length;
				this.selectedDeviceId = this.cameras[nextIndex].deviceId;

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

			if (this.openCVEnabled) {
				try {
					await opencvProcessor.ensureInitialized();
					console.log("OpenCV processing enabled");
				} catch (error) {
					console.error("Failed to initialize OpenCV:", error);
					this.openCVEnabled = false;
				}
			}

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

		// OpenCV track function (lightweight; frame skipping)
		opencvTrackFunction(detectedCodes, ctx) {
			if (this.isProcessing) return Promise.resolve(detectedCodes);
			this.isProcessing = true;

			return new Promise(async (resolve) => {
				try {
					const canvas = ctx.canvas;

					if (this.frameSkipCounter > 0) {
						this.frameSkipCounter--;
						this.isProcessing = false;
						resolve(detectedCodes);
						return;
					}
					this.frameSkipCounter = 2; // process every 3rd frame

					const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
					const processedImageData = await opencvProcessor.quickProcess(imageData);
					ctx.putImageData(processedImageData, 0, 0);

					this.isProcessing = false;
					resolve(detectedCodes);
				} catch (error) {
					console.warn("OpenCV processing failed:", error);
					this.isProcessing = false;
					resolve(detectedCodes);
				}
			});
		},

		handleEscKey(event) {
			if (event.key === "Escape" && this.scannerDialog) {
				event.preventDefault();
				this.stopScanning();
			}
		},

		// external lock helpers
		pauseForExternalLock() {
			this.scannerLockedExternally = true;
			if (this.scanResetTimeoutId) clearTimeout(this.scanResetTimeoutId);
			if (this.dialogCloseTimeoutId) clearTimeout(this.dialogCloseTimeoutId);
			if (this.isScanning) this.isScanning = false;
		},

		resumeFromExternalLock() {
			if (!this.scannerDialog) {
				this.scannerLockedExternally = false;
				return;
			}
			this.scannerLockedExternally = false;
			if (!this.isScanning) {
				this.$nextTick(() => {
					if (this.scannerDialog && !this.isScanning) this.isScanning = true;
				});
			}
		},
	},

	watch: {
		scannerDialog(newVal) {
			if (newVal) {
				if (!this.selectedDeviceId && this.cameras.length === 0) this.listCameras();
				this.$emit("scanner-opened");
			} else {
				this.isScanning = false;
				this.torchActive = false;
				this.$emit("scanner-closed");
			}
		},
	},

	async mounted() {
		if (typeof document !== "undefined") {
			document.addEventListener("keydown", this.handleEscKey);
		}
		// Initialize OpenCV
		try {
			await opencvProcessor.ensureInitialized();
			console.log("OpenCV initialized in CameraScanner component");
		} catch (error) {
			console.warn("OpenCV initialization failed:", error);
			this.openCVEnabled = false;
		}
	},

	async beforeUnmount() {
		if (typeof document !== "undefined") {
			document.removeEventListener("keydown", this.handleEscKey);
		}
		this.stopScanning();
		try {
			await opencvProcessor.destroy();
			console.log("OpenCV Web Worker cleaned up successfully");
		} catch (error) {
			console.warn("Error cleaning up OpenCV Web Worker:", error);
		}
	},
};
</script>
