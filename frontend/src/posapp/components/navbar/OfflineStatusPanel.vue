<template>
	<transition name="offline-status-panel-fade">
		<v-card
			v-if="props.modelValue"
			data-test="offline-status-panel"
			class="offline-status-panel pos-themed-card"
			elevation="16"
		>
			<div class="offline-status-panel__header">
				<div class="offline-status-panel__copy">
					<div class="offline-status-panel__title">
						{{ __("Offline Status") }}
					</div>
					<div class="offline-status-panel__subtitle">
						{{ summaryMessage }}
					</div>
				</div>
				<v-chip
					size="small"
					variant="tonal"
					:color="chipColor"
					class="offline-status-panel__chip"
				>
					{{ connectivityLabel }}
				</v-chip>
			</div>

			<div class="offline-status-panel__meta">
				<div class="offline-status-panel__meta-item">
					<span class="offline-status-panel__meta-label">{{ __("Pending Sales") }}</span>
					<strong>{{ summary.pendingInvoices }}</strong>
				</div>
				<div class="offline-status-panel__meta-item">
					<span class="offline-status-panel__meta-label">{{ __("Cache Usage") }}</span>
					<strong>{{ cacheUsageLabel }}</strong>
				</div>
			</div>

			<div
				v-if="bootstrapWarning.active"
				class="offline-status-panel__warning"
				data-test="offline-status-warning"
			>
				<div class="offline-status-panel__warning-title">
					{{ bootstrapWarning.title }}
				</div>
				<div
					v-for="message in bootstrapWarning.messages"
					:key="message"
					class="offline-status-panel__warning-line"
				>
					{{ message }}
				</div>
			</div>

			<div class="offline-status-panel__section">
				<div class="offline-status-panel__section-title">
					{{ __("Offline Capabilities") }}
				</div>
				<div
					v-if="capabilitySummaries.length"
					class="offline-status-panel__resources"
				>
					<div
						v-for="capability in capabilitySummaries"
						:key="capability.id"
						class="offline-status-panel__resource"
						:data-test="`offline-capability-${capability.id}`"
					>
						<div class="offline-status-panel__resource-head">
							<div class="offline-status-panel__resource-title">
								{{ capability.label }}
							</div>
							<div class="offline-status-panel__resource-status">
								{{ capability.status }}
							</div>
						</div>
						<div class="offline-status-panel__resource-detail">
							{{ capability.message }}
						</div>
						<div
							v-if="capability.action"
							class="offline-status-panel__resource-id"
						>
							{{ capability.action }}
						</div>
					</div>
				</div>
				<div v-else class="offline-status-panel__empty">
					{{ __("No capability warnings recorded yet.") }}
				</div>
			</div>

			<div class="offline-status-panel__section">
				<div class="offline-status-panel__section-title">
					{{ __("Resource Health") }}
				</div>
				<div
					v-if="sortedResources.length"
					class="offline-status-panel__resources"
				>
					<div
						v-for="resource in sortedResources"
						:key="resource.resourceId"
						class="offline-status-panel__resource"
						:data-test="`offline-status-resource-${resource.resourceId}`"
					>
						<div class="offline-status-panel__resource-head">
							<div class="offline-status-panel__resource-title">
								{{ resource.label }}
							</div>
							<div class="offline-status-panel__resource-status">
								{{ resource.status }}
							</div>
						</div>
						<div class="offline-status-panel__resource-id">
							{{ resource.resourceId }}
						</div>
						<div
							v-if="resource.lastError"
							class="offline-status-panel__resource-detail"
						>
							{{ resource.lastError }}
						</div>
					</div>
				</div>
				<div v-else class="offline-status-panel__empty">
					{{ __("No offline sync issues recorded yet.") }}
				</div>
			</div>

			<div class="offline-status-panel__actions">
				<button
					type="button"
					data-test="offline-status-action-connectivity"
					@click="$emit('toggle-offline')"
				>
					{{ connectivityActionLabel }}
				</button>
				<button
					type="button"
					data-test="offline-status-action-refresh"
					@click="$emit('refresh-offline-data')"
				>
					{{ __("Refresh Offline Data") }}
				</button>
				<button
					type="button"
					data-test="offline-status-action-rebuild"
					@click="$emit('rebuild-offline-data')"
				>
					{{ __("Rebuild Offline Data") }}
				</button>
				<button
					type="button"
					data-test="offline-status-action-clear-cache"
					@click="$emit('clear-cache')"
				>
					{{ __("Clear Cache") }}
				</button>
				<button
					type="button"
					data-test="offline-status-action-diagnostics"
					@click="$emit('open-diagnostics')"
				>
					{{ __("View Data Diagnostics") }}
				</button>
			</div>
		</v-card>
	</transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";

import { useOfflineSyncStore } from "../../stores/offlineSyncStore";

defineOptions({
	name: "OfflineStatusPanel",
});

const props = defineProps<{
	modelValue: boolean;
}>();

defineEmits<{
	(e: "update:modelValue", value: boolean): void;
	(e: "toggle-offline"): void;
	(e: "refresh-offline-data"): void;
	(e: "rebuild-offline-data"): void;
	(e: "clear-cache"): void;
	(e: "open-diagnostics"): void;
}>();

// @ts-ignore
const __ = (window as any).__ || ((text: string) => text);

const offlineSyncStore = useOfflineSyncStore();
const {
	summary,
	bootstrapWarning,
	capabilitySummaries,
	connectivityLabel,
	connectivityTone,
	sortedResources,
	summaryMessage,
} = storeToRefs(offlineSyncStore);

const connectivityActionLabel = computed(() =>
	summary.value.manualOffline ? __("Go Online") : __("Go Offline"),
);

const chipColor = computed(() => {
	switch (connectivityTone.value) {
		case "success":
			return "success";
		case "danger":
			return "error";
		default:
			return "warning";
	}
});

const cacheUsageLabel = computed(() => `${summary.value.cacheUsage || 0}%`);
</script>

<style scoped>
.offline-status-panel {
	position: absolute;
	top: calc(100% + 10px);
	right: 0;
	width: min(360px, calc(100vw - 24px));
	padding: 16px;
	display: grid;
	gap: 14px;
	z-index: 12;
	border: 1px solid var(--pos-border);
	box-shadow: 0 18px 40px var(--pos-shadow-dark);
}

.offline-status-panel__header,
.offline-status-panel__meta,
.offline-status-panel__resource-head,
.offline-status-panel__actions {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.offline-status-panel__copy,
.offline-status-panel__section,
.offline-status-panel__resources {
	display: grid;
	gap: 6px;
}

.offline-status-panel__title {
	font-size: 14px;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.offline-status-panel__subtitle,
.offline-status-panel__meta-label,
.offline-status-panel__resource-detail,
.offline-status-panel__empty,
.offline-status-panel__resource-id,
.offline-status-panel__warning-line {
	font-size: 12px;
	line-height: 1.4;
	color: var(--pos-text-secondary);
}

.offline-status-panel__meta {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
}

.offline-status-panel__meta-item {
	display: grid;
	gap: 4px;
}

.offline-status-panel__warning {
	padding: 12px;
	border-radius: 14px;
	background: rgba(255, 152, 0, 0.09);
	border: 1px solid rgba(255, 152, 0, 0.28);
	display: grid;
	gap: 6px;
}

.offline-status-panel__warning-title,
.offline-status-panel__section-title,
.offline-status-panel__resource-title,
.offline-status-panel__resource-status {
	font-size: 12px;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.offline-status-panel__resources {
	max-height: 220px;
	overflow-y: auto;
	padding-right: 4px;
}

.offline-status-panel__resource {
	padding: 10px 12px;
	border-radius: 12px;
	border: 1px solid var(--pos-border);
	background: var(--pos-card-bg);
	display: grid;
	gap: 4px;
}

.offline-status-panel__resource-status {
	text-transform: capitalize;
	color: #ff9800;
}

.offline-status-panel__actions {
	flex-wrap: wrap;
	justify-content: flex-start;
}

.offline-status-panel__actions button {
	border: 1px solid var(--pos-border);
	background: var(--pos-hover-bg);
	color: var(--pos-text-primary);
	border-radius: 999px;
	padding: 8px 12px;
	font-size: 12px;
	font-weight: 600;
	transition: background 0.18s ease, border-color 0.18s ease,
		transform 0.18s ease;
}

.offline-status-panel__actions button:hover {
	background: var(--pos-focus-bg);
	border-color: var(--pos-primary);
	transform: translateY(-1px);
}

.offline-status-panel-fade-enter-active,
.offline-status-panel-fade-leave-active {
	transition: opacity 0.18s ease, transform 0.18s ease;
}

.offline-status-panel-fade-enter-from,
.offline-status-panel-fade-leave-to {
	opacity: 0;
	transform: translateY(-6px);
}

@media (max-width: 768px) {
	.offline-status-panel {
		right: -12px;
		width: min(340px, calc(100vw - 20px));
	}
}
</style>
