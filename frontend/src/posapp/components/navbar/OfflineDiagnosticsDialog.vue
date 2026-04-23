<template>
	<v-dialog
		:model-value="modelValue"
		max-width="920"
		@update:model-value="$emit('update:modelValue', $event)"
	>
		<v-card class="pos-themed-card offline-diagnostics-dialog">
			<v-card-title class="offline-diagnostics-dialog__title">
				{{ __("Offline Diagnostics") }}
			</v-card-title>
			<v-card-text class="offline-diagnostics-dialog__body">
				<div class="offline-diagnostics-dialog__summary">
					<div>
						<strong>{{ __("Global State") }}:</strong> {{ globalStatus }}
					</div>
					<div v-if="bootstrapWarning.active">
						<strong>{{ __("Warning") }}:</strong> {{ bootstrapWarning.title }}
					</div>
				</div>

				<div class="offline-diagnostics-dialog__grid">
					<div
						v-for="resource in sortedResources"
						:key="resource.resourceId"
						class="offline-diagnostics-dialog__resource"
					>
						<div class="offline-diagnostics-dialog__resource-head">
							<div>
								<div class="offline-diagnostics-dialog__resource-title">
									{{ resource.label }}
								</div>
								<div class="offline-diagnostics-dialog__resource-id">
									{{ resource.resourceId }}
								</div>
							</div>
							<div class="offline-diagnostics-dialog__resource-status">
								{{ formatResourceStatus(resource) }}
							</div>
						</div>
						<div v-if="resource.diagnostics?.currentAction" class="offline-diagnostics-dialog__detail">
							{{ resource.diagnostics.currentAction }}
						</div>
						<div v-if="resource.diagnostics?.detail" class="offline-diagnostics-dialog__detail">
							{{ resource.diagnostics.detail }}
						</div>
						<div class="offline-diagnostics-dialog__detail">
							{{ formatCounts(resource) }}
						</div>
						<div
							v-if="resource.diagnostics?.pagesFetched || resource.diagnostics?.nextCursor"
							class="offline-diagnostics-dialog__detail"
						>
							{{ formatProgress(resource) }}
						</div>
						<div v-if="resource.lastError" class="offline-diagnostics-dialog__detail offline-diagnostics-dialog__detail--error">
							{{ resource.lastError }}
						</div>
					</div>
				</div>
			</v-card-text>
			<v-card-actions class="offline-diagnostics-dialog__actions">
				<v-spacer />
				<v-btn variant="text" @click="$emit('update:modelValue', false)">
					{{ __("Close") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useOfflineSyncStore } from "../../stores/offlineSyncStore";

defineProps<{
	modelValue: boolean;
}>();

defineEmits<{
	(e: "update:modelValue", value: boolean): void;
}>();

// @ts-ignore
const __ = (window as any).__ || ((text: string) => text);

const offlineSyncStore = useOfflineSyncStore();
const { sortedResources, bootstrapWarning, globalStatus } = storeToRefs(offlineSyncStore);

const formatResourceStatus = (resource: any) => {
	switch (resource?.status) {
		case "fresh":
			return __("Ready");
		case "partial":
			return __("Partially Loaded");
		case "repairing":
			return __("Repairing");
		case "syncing":
			return __("Syncing");
		case "verifying":
			return __("Verifying");
		case "limited":
			return __("Limited");
		case "stale":
			return __("Stale");
		case "error":
			return __("Error");
		default:
			return __("Not Loaded");
	}
};

const formatCounts = (resource: any) => {
	const parts: string[] = [];
	if (resource?.diagnostics?.localCount !== null && typeof resource?.diagnostics?.localCount !== "undefined") {
		parts.push(`${__("Local")}: ${resource.diagnostics.localCount}`);
	}
	if (resource?.diagnostics?.serverCount !== null && typeof resource?.diagnostics?.serverCount !== "undefined") {
		parts.push(`${__("Server")}: ${resource.diagnostics.serverCount}`);
	}
	if (resource?.diagnostics?.missingCount !== null && typeof resource?.diagnostics?.missingCount !== "undefined") {
		parts.push(`${__("Missing")}: ${resource.diagnostics.missingCount}`);
	}
	return parts.join(" | ");
};

const formatProgress = (resource: any) => {
	const parts: string[] = [];
	if (resource?.diagnostics?.pagesFetched) {
		parts.push(`${__("Pages")}: ${resource.diagnostics.pagesFetched}`);
	}
	if (resource?.diagnostics?.nextCursor) {
		parts.push(`${__("Next Cursor")}: ${resource.diagnostics.nextCursor}`);
	}
	return parts.join(" | ");
};
</script>

<style scoped>
.offline-diagnostics-dialog__body,
.offline-diagnostics-dialog__grid {
	display: grid;
	gap: 12px;
}

.offline-diagnostics-dialog__summary,
.offline-diagnostics-dialog__resource {
	padding: 12px;
	border: 1px solid var(--pos-border);
	border-radius: 14px;
}

.offline-diagnostics-dialog__resource-head {
	display: flex;
	justify-content: space-between;
	gap: 12px;
}

.offline-diagnostics-dialog__resource-title {
	font-weight: 700;
}

.offline-diagnostics-dialog__resource-id,
.offline-diagnostics-dialog__detail {
	font-size: 12px;
	color: var(--pos-text-secondary);
}

.offline-diagnostics-dialog__detail--error {
	color: #d32f2f;
}
</style>
