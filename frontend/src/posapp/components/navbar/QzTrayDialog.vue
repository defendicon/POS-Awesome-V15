<template>
	<v-dialog v-model="dialogModel" max-width="760">
		<v-card class="qz-dialog-card">
			<v-card-title class="d-flex align-center">
				<v-icon start color="primary">mdi-printer-wireless</v-icon>
				{{ __("QZ Tray Setup") }}
			</v-card-title>

			<v-card-text>
				<v-alert
					class="mb-4"
					:type="qzConnecting ? 'warning' : qzConnected ? 'success' : 'error'"
					variant="tonal"
					density="comfortable"
				>
					{{ connectionStatusText }}
				</v-alert>

				<div class="d-flex flex-wrap ga-2 mb-4">
					<v-btn
						color="primary"
						:loading="qzConnecting"
						:disabled="qzConnected && !qzConnecting"
						@click="handleConnect"
					>
						{{ __("Connect") }}
					</v-btn>
					<v-btn
						color="secondary"
						variant="outlined"
						:loading="loadingPrinters"
						:disabled="loadingPrinters || (qzReconnectPaused && !qzConnected)"
						@click="refreshPrinters"
					>
						{{ __("Refresh Printers") }}
					</v-btn>
					<v-btn color="default" variant="text" :disabled="!qzConnected" @click="handleDisconnect">
						{{ __("Disconnect") }}
					</v-btn>
				</div>

				<v-select
					v-model="selectedPrinter"
					:items="printerOptions"
					:label="__('Printer')"
					:placeholder="__('Select printer')"
					variant="outlined"
					density="compact"
					clearable
					:disabled="loadingPrinters"
				/>
				<div class="d-flex flex-wrap align-center justify-space-between ga-2 mt-3">
					<div class="text-caption text-medium-emphasis">
						{{
							__(
								"Save the selected printer as the POS Profile default so it shows automatically on this setup.",
							)
						}}
					</div>
					<v-btn
						data-test="qz-save-profile-printer"
						color="primary"
						variant="tonal"
						:loading="savingProfilePrinter"
						:disabled="!selectedPrinter || !profileName"
						@click="handleSaveProfilePrinter"
					>
						{{ __("Save as POS Profile Default") }}
					</v-btn>
				</div>

				<v-alert v-if="!selectedPrinter" type="warning" variant="tonal" density="compact" class="mt-3">
					{{ __("Select a printer to use QZ silent printing.") }}
				</v-alert>

				<v-divider class="my-4"></v-divider>

				<div class="text-subtitle-1 mb-2">{{ __("Certificate") }}</div>
				<v-alert :type="certAlertType" variant="tonal" density="comfortable" class="mb-3">
					{{ certificateStatusText }}
				</v-alert>

				<div class="d-flex flex-wrap ga-2">
					<v-btn color="warning" :loading="certificateLoading" @click="handleGenerateCertificate">
						{{ __("Generate Certificate") }}
					</v-btn>
					<v-btn
						color="info"
						variant="outlined"
						:disabled="!qzCertReady"
						@click="handleDownloadCertificate"
					>
						{{ __("Download Certificate") }}
					</v-btn>
				</div>

				<div class="text-caption mt-3">
					{{ __("Import the certificate into QZ Tray and restart QZ Tray on each POS machine.") }}
				</div>
			</v-card-text>

			<v-card-actions>
				<v-spacer />
				<v-btn variant="text" @click="dialogModel = false">{{ __("Close") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useToastStore } from "../../stores/toastStore";
import { useUIStore } from "../../stores/uiStore";
import {
	checkQzCertificateOnce,
	connectQzTray,
	disconnectQzTray,
	findQzPrinters,
	getQzCertificateDownload,
	getQzCertificateFilename,
	qzCertReady,
	qzCertStatus,
	qzConnected,
	qzConnecting,
	qzPrinters,
	qzReconnectPaused,
	selectedQzPrinter,
	setSelectedQzPrinter,
	setupQzCertificate,
	type QzCertStatus,
} from "../../services/qzTray";

const props = defineProps<{
	modelValue: boolean;
}>();

const emit = defineEmits<{
	(e: "update:modelValue", value: boolean): void;
}>();

const toastStore = useToastStore();
const uiStore = useUIStore();
const loadingPrinters = ref(false);
const certificateLoading = ref(false);
const savingProfilePrinter = ref(false);

const dialogModel = computed({
	get: () => props.modelValue,
	set: (value: boolean) => emit("update:modelValue", value),
});

const selectedPrinter = computed({
	get: () => selectedQzPrinter.value || null,
	set: (value: string | null) => setSelectedQzPrinter(value || ""),
});

const printerOptions = computed(() =>
	qzPrinters.value.map((printer) => ({
		title: printer,
		value: printer,
	})),
);

const currentProfile = computed(() => {
	const profile =
		uiStore?.posProfile && typeof uiStore.posProfile === "object" && "value" in uiStore.posProfile
			? uiStore.posProfile.value
			: uiStore?.posProfile;

	return profile && typeof profile === "object" ? profile : null;
});

const profileName = computed(() => {
	const name = currentProfile.value?.name;
	return typeof name === "string" ? name.trim() : "";
});

const certAlertType = computed(() => {
	if (qzCertStatus.value === "trusted") return "success";
	if (qzCertStatus.value === "untrusted") return "error";
	return "warning";
});

const connectionStatusText = computed(() => {
	if (qzConnecting.value) {
		return __("Connecting to QZ Tray...");
	}
	if (qzConnected.value) {
		return __("QZ Tray connected.");
	}
	if (qzReconnectPaused.value) {
		return __("QZ Tray is manually disconnected. Press Connect to enable it again.");
	}
	return __("QZ Tray is not connected.");
});

const certificateStatusText = computed(() => {
	const status = qzCertStatus.value as QzCertStatus;
	if (status === "trusted") {
		return __("Certificate is trusted. Silent QZ printing is active.");
	}
	if (status === "untrusted") {
		return __("Certificate is missing or not trusted. QZ may show confirmation dialogs.");
	}
	return __(
		"Generate and install the certificate to allow fully silent printing without trust prompts.",
	);
});

function __(text: string, args?: string[]) {
	if (typeof window !== "undefined" && typeof (window as any).__ === "function") {
		return (window as any).__(text, args);
	}
	return text;
}

function notify(title: string, color = "info") {
	toastStore.show({ title: __(title), color });
}

async function handleConnect(showNotification = true) {
	try {
		const connected = await connectQzTray({ userInitiated: true });
		if (!connected) {
			if (showNotification) {
				notify("Could not connect to QZ Tray.", "warning");
			}
			return;
		}
		await refreshPrinters(false);
	} catch (error: any) {
		console.error("Failed to connect to QZ Tray", error);
		if (showNotification) {
			notify(
				error?.message
					? `Could not connect to QZ Tray. ${error.message}`
					: "Could not connect to QZ Tray.",
				"warning",
			);
		}
		return;
	}
	if (showNotification) {
		notify("Connected to QZ Tray.", "success");
	}
}

async function handleDisconnect() {
	await disconnectQzTray();
	notify("QZ Tray disconnected. Auto-connect is paused until you press Connect.", "info");
}

async function refreshPrinters(showNotification = true) {
	if (qzReconnectPaused.value && !qzConnected.value) {
		if (showNotification) {
			notify("QZ Tray is manually disconnected. Press Connect to enable it again.", "warning");
		}
		return;
	}

	loadingPrinters.value = true;
	try {
		const printers = await findQzPrinters();
		if (showNotification) {
			if (printers.length) {
				notify("Printer list updated.", "success");
			} else {
				notify("No printers found. Make sure QZ Tray is running.", "warning");
			}
		}
	} catch (error: any) {
		console.error("Failed to discover QZ printers", error);
		notify(
			error?.message
				? `Failed to discover printers. Check QZ Tray. ${error.message}`
				: "Failed to discover printers. Check QZ Tray.",
			"warning",
		);
	} finally {
		loadingPrinters.value = false;
	}
}

async function handleSaveProfilePrinter() {
	if (!selectedPrinter.value) {
		notify("Select a printer before saving it to the POS Profile.", "warning");
		return;
	}
	if (!profileName.value) {
		notify("POS Profile is not loaded yet. Try again in a moment.", "warning");
		return;
	}

	try {
		savingProfilePrinter.value = true;
		const response = await frappe.call({
			method: "frappe.client.set_value",
			args: {
				doctype: "POS Profile",
				name: profileName.value,
				fieldname: "posa_qz_printer_name",
				value: selectedPrinter.value,
			},
		});
		const updatedProfile = {
			...(currentProfile.value || {}),
			...(response?.message && typeof response.message === "object" ? response.message : {}),
			posa_qz_printer_name: selectedPrinter.value,
		};
		if (typeof uiStore?.setPosProfile === "function") {
			uiStore.setPosProfile(updatedProfile as any);
		}
		notify("Selected printer saved as the POS Profile default.", "success");
	} catch (error: any) {
		console.error("Failed to save QZ profile printer", error);
		notify(error?.message || "Failed to save POS Profile printer.", "error");
	} finally {
		savingProfilePrinter.value = false;
	}
}

async function handleGenerateCertificate() {
	certificateLoading.value = true;
	try {
		const result = await setupQzCertificate();
		if (result?.status === "exists") {
			notify("Certificate already exists.", "success");
		} else {
			notify("Certificate generated successfully.", "success");
		}
	} catch (error: any) {
		console.error("Failed to generate QZ certificate", error);
		notify(error?.message || "Failed to generate certificate.", "error");
	} finally {
		certificateLoading.value = false;
	}
}

async function handleDownloadCertificate() {
	try {
		const result = await getQzCertificateDownload();
		const pem = typeof result?.pem === "string" ? result.pem.trim() : "";
		const company = typeof result?.company === "string" ? result.company.trim() : "";
		if (!pem || !company) {
			notify("Failed to download certificate. Certificate payload is incomplete.", "error");
			return;
		}
		const blob = new Blob([pem], { type: "application/x-pem-file" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = getQzCertificateFilename(company);
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
		notify("Certificate downloaded.", "success");
	} catch (error: any) {
		console.error("Failed to download QZ certificate", error);
		notify(error?.message || "Failed to download certificate.", "error");
	}
}

watch(
	() => props.modelValue,
	async (open) => {
		if (!open) return;
		await checkQzCertificateOnce();
		if (!qzConnected.value && !qzReconnectPaused.value) {
			await handleConnect(false);
		}
		if (qzConnected.value && !qzPrinters.value.length) {
			await refreshPrinters(false);
		}
	},
);
</script>

<style scoped>
.qz-dialog-card {
	background-color: rgb(var(--v-theme-surface));
	color: rgb(var(--v-theme-on-surface));
}
</style>
