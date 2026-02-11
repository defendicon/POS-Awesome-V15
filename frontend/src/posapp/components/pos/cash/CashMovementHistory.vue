<template>
	<v-card class="pa-4 pos-themed-card">
		<div class="d-flex align-center justify-space-between mb-3">
			<div>
				<div class="text-h6">{{ __("Submitted Cash Movements") }}</div>
				<div class="text-body-2 text-grey">{{ __("Latest entries for current shift") }}</div>
			</div>
			<div class="d-flex align-center ga-2">
				<v-chip
					v-if="pendingOfflineCount > 0"
					color="warning"
					size="small"
					variant="tonal"
				>
					{{ __("Offline Queue: {0}", [pendingOfflineCount]) }}
				</v-chip>
				<v-btn variant="outlined" size="small" @click="$emit('refresh')" :disabled="loading">
					{{ __("Refresh") }}
				</v-btn>
			</div>
		</div>

		<v-row dense class="mb-2">
			<v-col cols="12" md="4">
				<v-select
					:model-value="selectedStatus"
					:items="statusFilters"
					variant="outlined"
					density="compact"
					:label="__('Status')"
					:disabled="loading"
					@update:model-value="$emit('filter-change', { status: $event, movementType: selectedMovementType })"
				/>
			</v-col>
			<v-col cols="12" md="4">
				<v-select
					:model-value="selectedMovementType"
					:items="movementTypeFilters"
					variant="outlined"
					density="compact"
					:label="__('Movement Type')"
					:disabled="loading"
					@update:model-value="$emit('filter-change', { status: selectedStatus, movementType: $event })"
				/>
			</v-col>
		</v-row>

		<v-data-table
			:items="rows"
			:headers="headers"
			item-key="name"
			:loading="loading"
			density="compact"
			class="elevation-0"
		>
			<template #item.docstatus="{ item }">
				<v-chip size="small" :color="statusColor(item.docstatus)">
					{{ statusLabel(item.docstatus) }}
				</v-chip>
			</template>
			<template #item.actions="{ item }">
				<div class="d-flex ga-2 justify-end">
					<v-btn
						size="x-small"
						color="warning"
						variant="tonal"
						:disabled="!allowCancel || item.docstatus !== 1 || actionLoading"
						@click="$emit('cancel', item)"
					>
						{{ __("Cancel") }}
					</v-btn>
					<v-btn
						size="x-small"
						color="error"
						variant="tonal"
						:disabled="!allowDelete || item.docstatus !== 2 || actionLoading"
						@click="$emit('delete', item)"
					>
						{{ __("Delete") }}
					</v-btn>
				</div>
			</template>
		</v-data-table>
	</v-card>
</template>

<script setup lang="ts">
const __ = window.__ || ((text: string, _args?: any[]) => text);

const props = defineProps<{
	rows: any[];
	loading: boolean;
	actionLoading: boolean;
	allowCancel: boolean;
	allowDelete: boolean;
	selectedStatus: string;
	selectedMovementType: string;
	pendingOfflineCount: number;
}>();

defineEmits<{
	(e: "refresh"): void;
	(e: "cancel", row: any): void;
	(e: "delete", row: any): void;
	(e: "filter-change", payload: { status: string; movementType: string }): void;
}>();

const statusFilters = [
	{ title: __("Submitted"), value: "submitted" },
	{ title: __("Cancelled"), value: "cancelled" },
	{ title: __("Draft"), value: "draft" },
	{ title: __("All"), value: "" },
];

const movementTypeFilters = [
	{ title: __("Expense"), value: "Expense" },
	{ title: __("Deposit"), value: "Deposit" },
	{ title: __("All"), value: "" },
];

const headers: any[] = [
	{ title: __("Date"), key: "posting_date" },
	{ title: __("Type"), key: "movement_type" },
	{ title: __("Amount"), key: "amount", align: "end" },
	{ title: __("Source"), key: "source_account" },
	{ title: __("Target"), key: "target_account" },
	{ title: __("Remarks"), key: "remarks" },
	{ title: __("Journal Entry"), key: "journal_entry" },
	{ title: __("Status"), key: "docstatus", align: "center" },
	{ title: __("Actions"), key: "actions", sortable: false, align: "end" },
];

function statusLabel(docstatus: number) {
	if (docstatus === 1) return __("Submitted");
	if (docstatus === 2) return __("Cancelled");
	return __("Draft");
}

function statusColor(docstatus: number) {
	if (docstatus === 1) return "success";
	if (docstatus === 2) return "warning";
	return "grey";
}
</script>
