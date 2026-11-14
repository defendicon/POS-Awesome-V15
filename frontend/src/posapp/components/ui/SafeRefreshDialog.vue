<template>
	<v-dialog v-model="visible" persistent max-width="480">
		<v-card class="pos-themed-card">
			<v-card-title>{{ __("Safe Refresh") }}</v-card-title>
			<v-card-text>
				<v-alert v-if="error" type="error" variant="tonal">{{ error }}</v-alert>
				<div v-if="summary">
					<p>
						{{
							summary.hasCart
								? __("Your current cart has been saved for recovery.")
								: __("No active cart needs saving.")
						}}
					</p>
					<p>{{ __("Pending invoices") }}: {{ summary.pendingInvoices }}</p>
					<p>{{ __("Other pending transactions") }}: {{ summary.pendingOtherWrites }}</p>
					<p>
						{{
							__(
								"Pending transactions will stay on this device. Refresh does not clear cache or submit invoices.",
							)
						}}
					</p>
				</div>
			</v-card-text>
			<v-card-actions>
				<v-btn :disabled="running" @click="cancel">{{ __("Cancel") }}</v-btn>
				<v-btn
					:loading="checking || running"
					:disabled="checking || running"
					@click="confirmRefresh"
					>{{ error ? __("Retry checks") : __("Refresh safely") }}</v-btn
				>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { getActivePinia } from "pinia";
import { useUIStore } from "../../stores/uiStore";
import { useUpdateStore } from "../../stores/updateStore";
import {
	SAFE_REFRESH_REQUEST,
	requestSafeRefresh,
	prepareSafeRefresh,
	type RefreshRequest,
} from "../../services/safeRefresh";
const __ = window.__ || ((text: string) => text);
const ui = useUIStore(),
	update = useUpdateStore();
const visible = ref(false),
	checking = ref(false),
	running = ref(false),
	error = ref("");
const summary = ref<Awaited<ReturnType<typeof prepareSafeRefresh>> | null>(null);
let request: RefreshRequest = {};
let generation = 0;
let navigationTimer: ReturnType<typeof setTimeout> | undefined;
function allowRetryIfNavigationStops(message: string) {
	clearTimeout(navigationTimer);
	navigationTimer = setTimeout(() => {
		if (!visible.value || !running.value) return;
		running.value = false;
		error.value = message;
	}, 5000);
}
// Do not instantiate the invoice store before Frappe/offline bootstrap is ready.
const busy = () =>
	Boolean(ui.isFrozen || ui.isLoading || getActivePinia()?.state.value.invoice?.exchangeSession);
function cancel() {
	generation++;
	clearTimeout(navigationTimer);
	visible.value = false;
	request.onCancel?.();
}
async function check() {
	const run = generation;
	checking.value = true;
	error.value = "";
	summary.value = null;
	try {
		const result = await prepareSafeRefresh(busy);
		if (run === generation) summary.value = result;
	} catch (reason: any) {
		if (run === generation) error.value = reason?.message || String(reason);
	} finally {
		if (run === generation) checking.value = false;
	}
}
async function confirmRefresh() {
	if (checking.value || running.value) return;
	const run = generation;
	const retry = Boolean(error.value);
	await check(); // Recheck at action time; work may have changed while reviewing.
	if (!summary.value || retry || run !== generation || !visible.value) return;
	running.value = true;
	if (!request.update)
		allowRetryIfNavigationStops(
			__("The browser did not finish reloading. Cancel or retry Safe Refresh."),
		);
	try {
		await (request.action || (() => window.location.reload()))();
		if (request.update && !update.reloading)
			allowRetryIfNavigationStops(
				__("The update did not reload the app. Cancel or retry the refresh checks."),
			);
	} catch (reason: any) {
		clearTimeout(navigationTimer);
		error.value = reason?.message || String(reason);
		running.value = false;
		if (request.update) update.reloading = false;
	}
}
function open(event: Event) {
	event.preventDefault();
	if (visible.value) return;
	request = (event as CustomEvent<RefreshRequest>).detail || {};
	generation++;
	visible.value = true;
	void check();
}
function shortcut(event: KeyboardEvent) {
	if (running.value) {
		event.preventDefault();
		event.stopImmediatePropagation();
		return;
	}
	// Browser chrome/address-bar shortcuts remain browser controlled.
	if (
		event.defaultPrevented ||
		event.repeat ||
		!(event.ctrlKey || event.metaKey) ||
		event.altKey ||
		event.key.toLowerCase() !== "r"
	)
		return;
	event.preventDefault();
	event.stopImmediatePropagation();
	requestSafeRefresh();
}
watch(
	() => update.reloading,
	(value) => {
		if (!value && running.value && request.update) {
			allowRetryIfNavigationStops(
				__("The update did not reload the app. Cancel or retry the refresh checks."),
			);
		}
	},
);
onMounted(() => {
	window.addEventListener(SAFE_REFRESH_REQUEST, open);
	window.addEventListener("keydown", shortcut, true);
});
onUnmounted(() => {
	generation++;
	clearTimeout(navigationTimer);
	window.removeEventListener(SAFE_REFRESH_REQUEST, open);
	window.removeEventListener("keydown", shortcut, true);
});
</script>
