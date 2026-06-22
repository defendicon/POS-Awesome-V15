<template>
	<v-dialog v-model="dialog" max-width="650">
		<v-card>
			<v-card-title class="bg-primary text-white d-flex align-center">
				<v-icon start class="mr-2">mdi-verified</v-icon>
				<span>{{ __("Barcode Verification") }}</span>
				<v-spacer></v-spacer>
				<v-btn icon="mdi-close" variant="text" color="white" @click="dialog = false"></v-btn>
			</v-card-title>
			<v-card-text class="pt-4">
				<v-text-field
					ref="scannerInput"
					v-model="scannedInput"
					:label="__('Scan printed barcode')"
					:placeholder="__('Scanner will auto-focus here...')"
					variant="outlined"
					density="compact"
					hide-details
					autofocus
					@keydown.enter.prevent="processScan"
					class="mb-4"
				></v-text-field>

				<v-alert
					v-if="lastScanResult"
					:type="lastScanResult.type"
					density="compact"
					variant="tonal"
					class="mb-2"
					closable
					@click:close="lastScanResult = null"
				>
					<div class="d-flex align-center">
						<v-icon start>{{ lastScanResult.icon }}</v-icon>
						<span>{{ lastScanResult.message }}</span>
					</div>
				</v-alert>

				<v-row dense class="mb-2">
					<v-col cols="6">
						<v-btn-toggle v-model="filterStatus" mandatory density="compact" color="primary" variant="outlined" divided>
							<v-btn value="Unverified" size="small">{{ __("Unverified") }}</v-btn>
							<v-btn value="all" size="small">{{ __("All") }}</v-btn>
						</v-btn-toggle>
					</v-col>
					<v-col cols="6" class="text-right">
						<v-btn variant="text" size="small" prepend-icon="mdi-refresh" @click="refreshLogs">
							{{ __("Refresh") }}
						</v-btn>
					</v-col>
				</v-row>

				<v-list v-if="logs.length" density="compact" class="border rounded" max-height="300" style="overflow-y: auto;">
					<v-list-item v-for="log in logs" :key="log.name" density="compact">
						<template v-slot:prepend>
							<v-chip
								:color="log.verification_status === 'Verified' ? 'success' : log.verification_status === 'Mismatch' ? 'error' : 'warning'"
								size="x-small"
								variant="flat"
							>
								{{ log.verification_status === 'Verified' ? '✓' : log.verification_status === 'Mismatch' ? '✗' : '?' }}
							</v-chip>
						</template>
						<v-list-item-title class="text-caption">
							<strong>{{ log.item_name || log.item_code || log.barcode }}</strong>
							<span class="text-medium-emphasis ml-2">{{ log.barcode }}</span>
						</v-list-item-title>
						<v-list-item-subtitle class="text-caption">
							{{ log.user }} · {{ log.print_method }} · {{ frappe.datetime.str_to_user(log.timestamp) }}
							<template v-if="log.verification_status === 'Verified' && log.verified_by">
								· {{ __("by {0}", [log.verified_by]) }}
							</template>
						</v-list-item-subtitle>
					</v-list-item>
				</v-list>
				<v-alert v-else type="info" density="compact" variant="tonal" class="mt-2">
					{{ __("No print logs found for today") }}
				</v-alert>

				<v-divider class="my-3"></v-divider>

				<v-row dense v-if="stats">
					<v-col cols="3">
						<div class="text-center">
							<div class="text-h6">{{ stats.total || 0 }}</div>
							<div class="text-caption text-medium-emphasis">{{ __("Total") }}</div>
						</div>
					</v-col>
					<v-col cols="3">
						<div class="text-center">
							<div class="text-h6 text-success">{{ stats.verified || 0 }}</div>
							<div class="text-caption text-medium-emphasis">{{ __("Verified") }}</div>
						</div>
					</v-col>
					<v-col cols="3">
						<div class="text-center">
							<div class="text-h6 text-error">{{ stats.mismatch || 0 }}</div>
							<div class="text-caption text-medium-emphasis">{{ __("Mismatch") }}</div>
						</div>
					</v-col>
					<v-col cols="3">
						<div class="text-center">
							<div class="text-h6 text-warning">{{ stats.unverified || 0 }}</div>
							<div class="text-caption text-medium-emphasis">{{ __("Unverified") }}</div>
						</div>
					</v-col>
				</v-row>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";

declare const __: (_str: string, _args?: any[]) => string;
declare const frappe: any;

interface PrintLogEntry {
	name: string;
	item_code: string;
	item_name: string;
	barcode: string;
	barcode_type: string;
	qty: number;
	print_method: string;
	status: string;
	verification_status: string;
	user: string;
	timestamp: string;
	scanned_barcode: string;
	verified_at: string;
	verified_by: string;
	company: string;
	pos_profile: string;
}

interface ScanResult {
	type: "success" | "error" | "warning" | "info";
	icon: string;
	message: string;
}

const props = defineProps<{
	modelValue: boolean;
}>();

const emit = defineEmits<{
	(e: "update:modelValue", v: boolean): void;
}>();

const dialog = ref(props.modelValue);
const scannerInput = ref<HTMLInputElement | null>(null);
const scannedInput = ref("");
const logs = ref<PrintLogEntry[]>([]);
const stats = ref<{ total: number; verified: number; mismatch: number; unverified: number; failed: number } | null>(null);
const lastScanResult = ref<ScanResult | null>(null);
const filterStatus = ref("Unverified");
let focusInterval: ReturnType<typeof setInterval> | undefined;

const maintainFocus = () => {
	if (scannerInput.value && dialog.value) {
		scannerInput.value.focus();
	}
};

const refreshLogs = async () => {
	try {
		const res = await frappe.call({
			method: "posawesome.posawesome.api.barcode_print_log.get_print_logs",
			args: {
				filters: {
					date: frappe.datetime.get_today(),
					user: frappe.session.user,
					...(filterStatus.value !== "all" ? { verification_status: filterStatus.value } : {}),
				},
				limit: 100,
			},
			silent: true,
		});
		logs.value = res.message?.logs || [];
		stats.value = res.message?.stats || null;
	} catch {
		// silent
	}
};

const processScan = async () => {
	const scanned = (scannedInput.value || "").trim();
	if (!scanned) return;

	try {
		const existing = logs.value.find(
			(l) => l.barcode === scanned && l.verification_status !== "Mismatch"
		);
		if (existing && existing.verification_status === "Verified") {
			lastScanResult.value = {
				type: "info",
				icon: "mdi-information",
				message: __("Already verified: {0}", [scanned]),
			};
		} else if (existing) {
			await frappe.call({
				method: "posawesome.posawesome.api.barcode_print_log.verify_barcode",
				args: { log_id: existing.name, scanned_barcode: scanned, status: "Verified" },
				silent: true,
			});
			lastScanResult.value = {
				type: "success",
				icon: "mdi-check-circle",
				message: __("Verified: {0}", [existing.item_name || scanned]),
			};
			await refreshLogs();
		} else {
			const anyLog = logs.value.find((l) => l.barcode === scanned);
			if (anyLog) {
				lastScanResult.value = {
					type: "info",
					icon: "mdi-information",
					message: __("Already verified as '{0}'", [anyLog.verification_status]),
				};
			} else {
				lastScanResult.value = {
					type: "warning",
					icon: "mdi-alert-circle",
					message: __("Barcode not found in today's print queue: {0}", [scanned]),
				};
			}
		}
	} catch {
		lastScanResult.value = {
			type: "error",
			icon: "mdi-close-circle",
			message: __("Verification failed"),
		};
	}
	scannedInput.value = "";
	maintainFocus();
};

watch(dialog, (v) => {
	emit("update:modelValue", v);
	if (v) {
		refreshLogs();
		setTimeout(maintainFocus, 300);
	}
});

watch(filterStatus, () => {
	refreshLogs();
});

onMounted(() => {
	focusInterval = setInterval(maintainFocus, 500);
});

onUnmounted(() => {
	if (focusInterval) clearInterval(focusInterval);
});
</script>
