<template>
	<v-dialog v-model="visible" max-width="460" persistent>
		<v-card class="pos-update-dialog pos-themed-card">
			<v-card-title class="d-flex align-start">
				<div class="update-icon">
					<v-icon size="20">mdi-update</v-icon>
				</div>
				<div class="ml-3">
					<div class="text-subtitle-1 font-weight-semibold">
						{{ __("Update available") }}
					</div>
					<div class="text-caption text-medium-emphasis">
						{{ __("New changes are ready to load") }}
					</div>
				</div>
				<v-spacer></v-spacer>
				<span class="update-pill" v-if="label">{{ label }}</span>
			</v-card-title>
			<v-card-text class="pt-2">
				<div class="text-body-2">
					{{ __("Reload to apply the latest changes. Your current session will be refreshed.") }}
				</div>
				<div class="update-details" v-if="detail || branch">
					<div v-if="detail" class="detail-row">
						<v-icon size="16" class="detail-icon">mdi-text-box-outline</v-icon>
						<span>{{ detail }}</span>
					</div>
					<div v-if="branch" class="detail-row">
						<v-icon size="16" class="detail-icon">mdi-source-branch</v-icon>
						<span>{{ branch }}</span>
					</div>
				</div>
			</v-card-text>
			<v-card-actions class="update-actions">
				<v-spacer></v-spacer>
				<v-btn variant="elevated" color="primary" @click="dismiss">
					{{ __("Dismiss") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useUpdateStore } from "../../stores/updateStore";
import { useRtl } from "../../composables/core/useRtl";

defineOptions({
	name: "UpdatePrompt",
});

const updateStore = useUpdateStore();
const { isRtl } = useRtl();
const visible = ref(false);

// @ts-ignore
const __ = (window as any).__ || ((s: string) => s);

watch(
	() => updateStore.shouldPrompt,
	(shouldShow) => {
		visible.value = shouldShow;
	},
	{ immediate: true },
);

const label = computed(() => updateStore.formattedAvailableVersion);
const detail = computed(() => updateStore.formattedAvailableDetails);
const branch = computed(() => updateStore.formattedAvailableBranch);

function dismiss() {
	updateStore.dismissUpdate();
	visible.value = false;
}
</script>

<style scoped>
.pos-update-dialog {
	border-radius: 18px;
	box-shadow:
		0 24px 48px rgba(15, 23, 42, 0.12),
		0 8px 16px rgba(15, 23, 42, 0.08);
	border: 1px solid rgba(99, 102, 241, 0.08);
}

.update-icon {
	width: 36px;
	height: 36px;
	border-radius: 12px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(14, 165, 233, 0.12));
	color: #4338ca;
}

.update-pill {
	margin-top: 2px;
	padding: 4px 10px;
	border-radius: 999px;
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.3px;
	color: #0f172a;
	background: rgba(148, 163, 184, 0.18);
	border: 1px solid rgba(148, 163, 184, 0.3);
}

.update-details {
	margin-top: 12px;
	padding: 10px 12px;
	border-radius: 12px;
	background: rgba(15, 23, 42, 0.04);
	display: flex;
	flex-direction: column;
	gap: 8px;
	font-size: 12px;
}

.detail-row {
	display: flex;
	align-items: center;
	gap: 8px;
	color: rgba(15, 23, 42, 0.75);
}

.detail-icon {
	color: rgba(15, 23, 42, 0.5);
}

.update-actions {
	padding: 12px 16px 16px;
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

:deep(.v-theme--dark) .update-icon {
	color: #e0e7ff;
	background: linear-gradient(135deg, rgba(129, 140, 248, 0.25), rgba(56, 189, 248, 0.2));
}

:deep(.v-theme--dark) .update-pill {
	color: #e2e8f0;
	background: rgba(148, 163, 184, 0.18);
	border-color: rgba(148, 163, 184, 0.35);
}

:deep(.v-theme--dark) .update-details {
	background: rgba(148, 163, 184, 0.12);
}

:deep(.v-theme--dark) .detail-row {
	color: rgba(226, 232, 240, 0.75);
}

:deep(.v-theme--dark) .detail-icon {
	color: rgba(226, 232, 240, 0.6);
}
</style>
