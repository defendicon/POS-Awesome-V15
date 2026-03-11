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
					:aria-label="__('Close scanner dialog')"
				></v-btn>
			</v-card-title>

			<v-card-text class="pa-0">
				<div v-if="!cameraPermissionDenied">
					<!-- Scanner container -->
					<div class="scanner-container" v-if="scannerDialog">
						<qrcode-stream
							:formats="readerFormats"
							:torch="torchActive"
							:constraints="cameraConstraints"
							:paused="!isScanning"
							:track="trackFunctionOptions"
							@detect="onDetect"
							@error="onError"
							@camera-on="onCameraReady"
							@camera-off="onCameraOff"
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
						v-if="isScanning && torchSupported"
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

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { QrcodeStream } from "vue-qrcode-reader";
import opencvProcessor from "../../../utils/opencvProcessor";

const __ = typeof window !== "undefined" && window.__ ? window.__ : (text) => text;

const props = defineProps({
	scanType: {
		type: String,
		default: "Both", // 'QR Code', 'Barcode', 'Both'
	},
	// optional: auto close dialog after a successful scan
	autoCloseOnScan: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["barcode-scanned", "scanner-opened", "scanner-closed"]);

// State
const scannerDialog = ref(false);
const scanResult = ref("");
const scanFormat = ref("");
const errorMessage = ref("");
const cameraPermissionDenied = ref(false);
const isScanning = ref(false);
const torchActive = ref(false);
const selectedDeviceId = ref(null);
const cameras = ref([]);
const cameraCapabilities = ref({});
const useBasicConstraints = ref(false);

// OpenCV controls
const openCVEnabled = ref(true);
const openCVReady = ref(false);
const openCVLoading = ref(false);
const isProcessing = ref(false);
const frameSkipCounter = ref(0);

// Timers
let scanResetTimeoutId = null;
let dialogCloseTimeoutId = null;
const scannerLockedExternally = ref(false);

// Computed
const cameraConstraints = computed(() => {
	const constraints = useBasicConstraints.value
		? {
				width: { ideal: 1280 },
				height: { ideal: 720 },
				facingMode: { ideal: "environment" },
			}
		: {
				width: { ideal: 1920, min: 640 },
				height: { ideal: 1080, min: 480 },
				aspectRatio: { ideal: 16 / 9 },
				facingMode: { ideal: "environment" },
			};

	if (selectedDeviceId.value) {
		return {
			...constraints,
			deviceId: { exact: selectedDeviceId.value },
		};
	}

	return constraints;
});

const torchSupported = computed(() => Boolean(cameraCapabilities.value?.torch));

const readerFormats = computed(() => {
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
	if (props.scanType === "QR Code") return ["qr_code"];
	if (props.scanType === "Barcode") return availableFormats.filter((f) => f !== "qr_code");
	return availableFormats;
});

// Implementation of opencvTrackFunction before it's used in computed
const opencvTrackFunction = (detectedCodes, ctx) => {
	if (isProcessing.value) return Promise.resolve(detectedCodes);
	isProcessing.value = true;

	return new Promise((resolve) => {
		const processFrame = async () => {
			try {
				const canvas = ctx.canvas;

				if (frameSkipCounter.value > 0) {
					frameSkipCounter.value--;
					resolve(detectedCodes);
					return;
				}
				frameSkipCounter.value = 2; // process every 3rd frame

				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
				const processedImageData = await opencvProcessor.quickProcess(imageData);
				ctx.putImageData(processedImageData, 0, 0);
				resolve(detectedCodes);
			} catch (error) {
				console.warn("OpenCV processing failed:", error);
				resolve(detectedCodes);
			} finally {
				isProcessing.value = false;
			}
		};

		processFrame();
	});
};

const trackFunctionOptions = computed(() => {
	return openCVEnabled.value && openCVReady.value ? opencvTrackFunction : null;
});

const initializeOpenCV = async ({ showAlertOnFailure = false } = {}) => {
	if (!openCVEnabled.value || openCVReady.value || openCVLoading.value) {
		return openCVReady.value;
	}

	openCVLoading.value = true;
	try {
		const isReady = await opencvProcessor.ensureInitialized();
		openCVReady.value = Boolean(isReady);
		if (!isReady) {
			openCVEnabled.value = false;
			if (showAlertOnFailure && typeof frappe !== "undefined" && frappe.show_alert) {
				frappe.show_alert(
					{
						message: __("OpenCV image processing unavailable on this device"),
						indicator: "orange",
					},
					3,
				);
			}
		}
		return openCVReady.value;
	} catch (error) {
		console.warn("OpenCV initialization failed:", error);
		openCVEnabled.value = false;
		openCVReady.value = false;
		if (showAlertOnFailure && typeof frappe !== "undefined" && frappe.show_alert) {
			frappe.show_alert(
				{
					message: __("OpenCV image processing unavailable on this device"),
					indicator: "orange",
				},
				3,
			);
		}
		return false;
	} finally {
		openCVLoading.value = false;
	}
};

// Methods
const listCameras = async () => {
	try {
		if (!navigator.mediaDevices?.enumerateDevices) {
			console.warn("MediaDevices API not supported.");
			cameras.value = [];
			return;
		}
		const devices = await navigator.mediaDevices.enumerateDevices();
		cameras.value = devices.filter((d) => d.kind === "videoinput");
		if (cameras.value.length > 0 && !selectedDeviceId.value) {
			const rear = cameras.value.find((c) => /back|rear|environment/i.test(c.label));
			selectedDeviceId.value = rear ? rear.deviceId : cameras.value[0].deviceId;
		}
	} catch (e) {
		console.error("Error listing cameras:", e);
		cameras.value = [];
	}
};

const startScanning = async () => {
	scannerLockedExternally.value = false;
	scannerDialog.value = true;
	errorMessage.value = "";
	scanResult.value = "";
	scanFormat.value = "";
	cameraPermissionDenied.value = false;
	cameraCapabilities.value = {};
	torchActive.value = false;
	useBasicConstraints.value = false;
	await nextTick();
	await listCameras();
	isScanning.value = true;
	if (openCVEnabled.value && !openCVReady.value) {
		void initializeOpenCV();
	}
};

const onCameraReady = (capabilities = {}) => {
	cameraCapabilities.value = capabilities || {};
	errorMessage.value = "";
	cameraPermissionDenied.value = false;
	isScanning.value = true;
	console.log("Camera ready for scanning", {
		deviceId: selectedDeviceId.value,
		torch: Boolean(cameraCapabilities.value?.torch),
		basicMode: useBasicConstraints.value,
	});
};

const stopScanning = () => {
	scannerLockedExternally.value = false;
	if (scanResetTimeoutId) clearTimeout(scanResetTimeoutId);
	if (dialogCloseTimeoutId) clearTimeout(dialogCloseTimeoutId);
	scanResetTimeoutId = null;
	dialogCloseTimeoutId = null;

	isScanning.value = false;
	scannerDialog.value = false;
	scanResult.value = "";
	scanFormat.value = "";
	errorMessage.value = "";
	torchActive.value = false;
	cameraCapabilities.value = {};
	useBasicConstraints.value = false;
	emit("scanner-closed");
};

const onCameraOff = () => {
	torchActive.value = false;
	isScanning.value = false;
};

const handleScannedCode = (rawValue, formatLabel = "", options = {}) => {
	const {
		pauseCamera = true,
		resetDelay = 1000,
		closeDialog = props.autoCloseOnScan,
		closeDelay,
	} = options;

	const code = (rawValue ?? "").toString().trim();
	if (!code) return;

	scanResult.value = code;
	scanFormat.value = formatLabel || "";
	errorMessage.value = "";

	emit("barcode-scanned", code);

	if (typeof frappe !== "undefined" && frappe.show_alert) {
		const formatSuffix = scanFormat.value ? ` (${scanFormat.value})` : "";
		frappe.show_alert({ message: __("Code scanned successfully") + formatSuffix, indicator: "green" }, 3);
	}

	const shouldPause = pauseCamera && isScanning.value;
	if (shouldPause) isScanning.value = false;

	// clear timers
	if (scanResetTimeoutId) clearTimeout(scanResetTimeoutId);
	if (dialogCloseTimeoutId) clearTimeout(dialogCloseTimeoutId);
	scanResetTimeoutId = null;
	dialogCloseTimeoutId = null;

	if (closeDialog) {
		const effectiveDelay = Math.max(
			0,
			typeof closeDelay === "number" ? closeDelay : Math.min(resetDelay, 250),
		);
		dialogCloseTimeoutId = setTimeout(() => {
			dialogCloseTimeoutId = null;
			stopScanning();
		}, effectiveDelay);
		return;
	}

	scanResetTimeoutId = setTimeout(
		() => {
			scanResult.value = "";
			scanFormat.value = "";
			if (shouldPause && scannerDialog.value && !scannerLockedExternally.value) {
				isScanning.value = true;
			}
			scanResetTimeoutId = null;
		},
		Math.max(0, resetDelay),
	);
};

const onDetect = (detectedCodes) => {
	if (detectedCodes && detectedCodes.length > 0) {
		const first = detectedCodes[0];
		handleScannedCode(first.rawValue, first.format);
	}
};

const onError = (error) => {
	errorMessage.value = error.name || "Unknown error";
	console.error("Camera error:", error);

	if (error.name === "NotAllowedError") {
		cameraPermissionDenied.value = true;
		errorMessage.value = __(
			"Camera permission denied. Please allow camera access in your browser settings and refresh the page.",
		);
	} else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
		errorMessage.value = __(
			"No camera found on this device. Please ensure your device has a working camera.",
		);
	} else if (error.name === "NotReadableError") {
		errorMessage.value = __(
			"Camera is busy or blocked by another app/tab. Close other camera apps and try again.",
		);
	} else if (error.name === "StreamLoadTimeoutError") {
		errorMessage.value = __(
			"Camera started but the video stream did not load in time. Please try again.",
		);
	} else if (error.name === "InsecureContextError") {
		errorMessage.value = __(
			"Secure context (HTTPS or localhost) is required for camera access.",
		);
	} else if (error.name === "NotSupportedError") {
		errorMessage.value = __(
			"Secure context (HTTPS) required for camera access. Please use HTTPS to access the camera.",
		);
	} else if (error.name === "AbortError") {
		errorMessage.value = __("Camera access was aborted. Please try again.");
	} else if (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError") {
		errorMessage.value = __(
			"Camera constraints not supported by your device. Trying fallback settings...",
		);
		tryFallbackCamera();
		return;
	} else {
		errorMessage.value =
			__("Error accessing camera:") + ` ${error.message}. Please try refreshing the page.`;
	}
	isScanning.value = false;
};

const tryFallbackCamera = async () => {
	console.log("Trying fallback camera settings...");
	try {
		if (useBasicConstraints.value) {
			throw new Error("Fallback constraints already active");
		}
		useBasicConstraints.value = true;
		openCVEnabled.value = false; // reduce processing for weak devices
		openCVReady.value = false;
		isScanning.value = false;
		await nextTick();
		if (!scannerDialog.value) return;
		isScanning.value = true;
		if (typeof frappe !== "undefined" && frappe.show_alert) {
			frappe.show_alert(
				{
					message: __("Using basic camera settings due to device limitations"),
					indicator: "orange",
				},
				3,
			);
		}
	} catch (fallbackError) {
		console.error("Fallback camera also failed:", fallbackError);
		errorMessage.value = __(
			"Unable to access camera even with basic settings. Please check your camera permissions and device compatibility.",
		);
		isScanning.value = false;
	}
};

const toggleTorch = () => {
	torchActive.value = !torchActive.value;
};

const switchCamera = async () => {
	if (cameras.value.length > 1) {
		const currentIndex = cameras.value.findIndex((cam) => cam.deviceId === selectedDeviceId.value);
		const nextIndex = (currentIndex + 1) % cameras.value.length;
		selectedDeviceId.value = cameras.value[nextIndex].deviceId;
		torchActive.value = false;
		errorMessage.value = "";

		if (typeof frappe !== "undefined" && frappe.show_alert) {
			frappe.show_alert(
				{
					message:
						__("Switched to: ") + (cameras.value[nextIndex].label || `Camera ${nextIndex + 1}`),
					indicator: "blue",
				},
				2,
			);
		}
	}
};

const toggleOpenCVProcessing = async () => {
	const nextEnabledState = !openCVEnabled.value;
	openCVEnabled.value = nextEnabledState;

	if (nextEnabledState) {
		const isReady = await initializeOpenCV({ showAlertOnFailure: true });
		if (isReady) {
			console.log("OpenCV processing enabled");
		}
	} else {
		openCVReady.value = false;
	}

	if (typeof frappe !== "undefined" && frappe.show_alert) {
		frappe.show_alert(
			{
				message: openCVEnabled.value && openCVReady.value
					? __("OpenCV image processing enabled - Enhanced barcode detection")
					: __("OpenCV processing disabled"),
				indicator: openCVEnabled.value && openCVReady.value ? "green" : "blue",
			},
			3,
		);
	}
};

const pauseForExternalLock = () => {
	scannerLockedExternally.value = true;
	if (scanResetTimeoutId) clearTimeout(scanResetTimeoutId);
	if (dialogCloseTimeoutId) clearTimeout(dialogCloseTimeoutId);
	if (isScanning.value) isScanning.value = false;
};

const resumeFromExternalLock = () => {
	if (!scannerDialog.value) {
		scannerLockedExternally.value = false;
		return;
	}
	scannerLockedExternally.value = false;
	if (!isScanning.value) {
		nextTick(() => {
			if (scannerDialog.value && !isScanning.value) isScanning.value = true;
		});
	}
};

const handleEscKey = (event) => {
	if (event.key === "Escape" && scannerDialog.value) {
		event.preventDefault();
		stopScanning();
	}
};

// Watchers
watch(scannerDialog, (newVal) => {
	if (newVal) {
		if (!selectedDeviceId.value && cameras.value.length === 0) listCameras();
		emit("scanner-opened");
	} else {
		isScanning.value = false;
		torchActive.value = false;
		emit("scanner-closed");
	}
});

// Lifecycle
onMounted(async () => {
	if (typeof document !== "undefined") {
		document.addEventListener("keydown", handleEscKey);
	}
});

onBeforeUnmount(async () => {
	if (typeof document !== "undefined") {
		document.removeEventListener("keydown", handleEscKey);
	}
	stopScanning();
	try {
		openCVReady.value = false;
		await opencvProcessor.destroy();
		console.log("OpenCV Web Worker cleaned up successfully");
	} catch (error) {
		console.warn("Error cleaning up OpenCV Web Worker:", error);
	}
});

// Expose public methods for parent components
defineExpose({
	startScanning,
	stopScanning,
	pauseForExternalLock,
	resumeFromExternalLock,
});
</script>
