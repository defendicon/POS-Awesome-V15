<template>
	<div class="pa-3">
		<div class="d-flex justify-end mb-3" v-if="pendingOfflineCount > 0">
			<v-btn
				variant="outlined"
				color="warning"
				:loading="syncingOffline"
				:disabled="isOffline()"
				@click="handleSyncOffline"
			>
				{{ __("Sync Offline Cash Movements ({0})", [pendingOfflineCount]) }}
			</v-btn>
		</div>

		<v-alert
			v-if="errorMessage"
			type="error"
			variant="tonal"
			density="compact"
			class="mb-3"
		>
			{{ errorMessage }}
		</v-alert>

		<v-alert
			v-if="contextLoaded && !context?.enable_cash_movement"
			type="warning"
			variant="tonal"
			class="mb-3"
		>
			{{ __("Cash Movement is disabled in current POS Profile.") }}
		</v-alert>

		<v-row dense>
			<v-col cols="12" md="5">
				<CashMovementForm
					:context="context"
					:submitting="submitting"
					:reset-token="formResetToken"
					:prefill-token="prefillToken"
					:prefill-data="prefillData"
					@submit="handleSubmit"
				/>
			</v-col>
			<v-col cols="12" md="7">
				<CashMovementHistory
					:rows="historyRows"
					:loading="loading"
					:action-loading="actionLoading"
					:allow-cancel="!!context?.allow_cancel_submitted_cash_movement"
					:allow-delete="!!context?.allow_delete_cancelled_cash_movement"
					:selected-status="historyStatus"
					:selected-movement-type="historyMovementType"
					:selected-search-text="historySearchText"
					:pending-offline-count="pendingOfflineCount"
					@refresh="refreshHistory"
					@duplicate="handleDuplicate"
					@cancel="handleCancel"
					@delete="handleDelete"
					@filter-change="handleFilterChange"
				/>
			</v-col>
		</v-row>

	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useUIStore } from "../../../stores/uiStore";
import { useToastStore } from "../../../stores/toastStore";
import { useCashMovement } from "../../../composables/pos/cash/useCashMovement";
import {
	getPendingOfflineCashMovementCount,
	isOffline,
	saveOfflineCashMovement,
	syncOfflineCashMovements,
} from "../../../../offline";
import CashMovementForm from "./CashMovementForm.vue";
import CashMovementHistory from "./CashMovementHistory.vue";

const __ = window.__ || ((text: string, _args?: any[]) => text);

const uiStore = useUIStore();
const toastStore = useToastStore();

const {
	loading,
	submitting,
	actionLoading,
	context,
	historyRows,
	error,
	loadContext,
	loadHistory,
	submitMovement,
	cancelMovement,
	deleteMovement,
} = useCashMovement();

const contextLoaded = ref(false);
const syncingOffline = ref(false);
const pendingOfflineCount = ref(0);
const historyStatus = ref("");
const historyMovementType = ref("");
const historySearchText = ref("");
const prefillToken = ref(0);
const prefillData = ref<any>(null);
const formResetToken = ref(0);
const errorMessage = computed(() => error.value);

const posProfileName = computed(() => uiStore.posProfile?.name || "");
const openingShiftName = computed(() => uiStore.posOpeningShift?.name || "");

async function initialize() {
	if (!posProfileName.value || !openingShiftName.value) {
		return;
	}
	await loadContext(posProfileName.value, openingShiftName.value);
	contextLoaded.value = true;
	refreshPendingOfflineCount();
	await refreshHistory();
}

async function refreshHistory() {
	if (!openingShiftName.value) {
		return;
	}
	await loadHistory(openingShiftName.value, {
		status: historyStatus.value,
		movementType: historyMovementType.value,
		searchText: historySearchText.value,
	});
}

function refreshPendingOfflineCount() {
	pendingOfflineCount.value = getPendingOfflineCashMovementCount();
}

async function handleFilterChange(payload: { status: string; movementType: string; searchText: string }) {
	historyStatus.value = payload?.status || "";
	historyMovementType.value = payload?.movementType || "";
	historySearchText.value = payload?.searchText || "";
	await refreshHistory();
}

async function handleSubmit(payload: any) {
	try {
		if (
			(payload.movementType === "Expense" && !context.value?.allow_pos_expense) ||
			(payload.movementType === "Deposit" && !context.value?.allow_cash_deposit)
		) {
			throw new Error(__("Selected movement type is not allowed by POS Profile."));
		}

		const requestPayload = {
			pos_profile: posProfileName.value,
			pos_opening_shift: openingShiftName.value,
			posting_date: payload.postingDate,
			amount: payload.amount,
			against_name: payload.againstName,
			source_account: payload.sourceAccount,
			remarks: payload.remarks,
			expense_account: payload.expenseAccount,
			target_account: payload.targetAccount,
			movement_type: payload.movementType,
			client_request_id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		};

		if (isOffline()) {
			const method =
				payload.movementType === "Deposit"
					? "posawesome.posawesome.api.cash_movement.service.create_cash_deposit"
					: "posawesome.posawesome.api.cash_movement.service.create_pos_expense";
			await saveOfflineCashMovement({
				method,
				args: {
					payload: requestPayload,
				},
			});
			toastStore.show({
				title: __("Cash movement saved offline"),
				color: "warning",
			});
			formResetToken.value += 1;
			refreshPendingOfflineCount();
			return;
		}

		await submitMovement({
			movementType: payload.movementType,
			amount: payload.amount,
			againstName: payload.againstName,
			postingDate: payload.postingDate,
			sourceAccount: payload.sourceAccount,
			remarks: payload.remarks,
			expenseAccount: payload.expenseAccount,
			targetAccount: payload.targetAccount,
			posProfileName: posProfileName.value,
			posOpeningShiftName: openingShiftName.value,
			clientRequestId: requestPayload.client_request_id,
		});
		toastStore.show({ title: __("Cash movement submitted"), color: "success" });
		formResetToken.value += 1;
		await refreshHistory();
	} catch (err: any) {
		toastStore.show({ title: err?.message || __("Failed to submit cash movement"), color: "error" });
	}
}

function handleDuplicate(row: any) {
	if (!row?.name) return;
	prefillData.value = {
		movement_type: row.movement_type,
		amount: row.amount,
		posting_date: row.posting_date,
		against_name: row.against_name,
		source_account: row.source_account,
		remarks: row.remarks,
		expense_account: row.expense_account,
		target_account: row.target_account,
	};
	prefillToken.value += 1;
	toastStore.show({ title: __("Data loaded in form. Review and submit."), color: "info" });
}

async function handleCancel(row: any) {
	if (!row?.name) return;
	try {
		const confirmed = window.confirm(
			__("Cancel cash movement {0}?", [row.name]),
		);
		if (!confirmed) {
			return;
		}
		await cancelMovement(row.name);
		toastStore.show({ title: __("Cash movement cancelled"), color: "warning" });
		await refreshHistory();
	} catch (err: any) {
		toastStore.show({ title: err?.message || __("Failed to cancel cash movement"), color: "error" });
	}
}

async function handleDelete(row: any) {
	if (!row?.name) return;
	try {
		const confirmed = window.confirm(
			__("Delete cancelled cash movement {0}?", [row.name]),
		);
		if (!confirmed) {
			return;
		}
		await deleteMovement(row.name);
		toastStore.show({ title: __("Cash movement deleted"), color: "success" });
		await refreshHistory();
	} catch (err: any) {
		toastStore.show({ title: err?.message || __("Failed to delete cash movement"), color: "error" });
	}
}

async function handleSyncOffline() {
	if (isOffline()) {
		return;
	}
	syncingOffline.value = true;
	try {
		const result = await syncOfflineCashMovements();
		refreshPendingOfflineCount();
		if (result?.synced) {
			toastStore.show({
				title: __("Synced {0} offline cash movement(s).", [result.synced]),
				color: "success",
			});
			await refreshHistory();
			return;
		}
		toastStore.show({
			title: __("No offline cash movement synced."),
			color: "info",
		});
	} catch (err: any) {
		toastStore.show({
			title: err?.message || __("Failed to sync offline cash movements"),
			color: "error",
		});
	} finally {
		syncingOffline.value = false;
	}
}

watch([posProfileName, openingShiftName], () => {
	initialize();
}, { immediate: true });
</script>
