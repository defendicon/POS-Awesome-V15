<template>
	<div class="sticky-header">
		<v-row class="items">
			<v-col
				class="pb-0"
				:cols="posProfile.posa_input_qty ? 8 : 12"
				:sm="posProfile.posa_input_qty ? 9 : 12"
			>
				<v-text-field
					density="compact"
					clearable
					autofocus
					variant="solo"
					color="primary"
					class="pos-themed-input"
					:label="frappe._('Search, scan or browse item')"
					hide-details
					:model-value="searchInput"
					@update:model-value="
						(val) => {
							$emit('update:searchInput', val);
							$emit('search-input', val);
						}
					"
					@keydown.esc="$emit('esc')"
					@keydown.enter="$emit('enter')"
					@keydown="$emit('search-keydown', $event)"
					@click:clear="$emit('clear-search')"
					@click:prepend-inner="$emit('focus')"
					@paste="$emit('search-paste', $event)"
					prepend-inner-icon="mdi-magnify"
					@focus="$emit('focus')"
					ref="debounce_search"
				>
					<template v-slot:append-inner>
						<v-btn
							v-if="posProfile.posa_enable_camera_scanning"
							icon="mdi-camera"
							size="small"
							color="primary"
							variant="text"
							:disabled="scannerLocked"
							@click="$emit('start-camera')"
							:aria-label="
								scannerLocked
									? __('Camera scanner is locked until the current error is acknowledged')
									: __('Scan with camera')
							"
							:title="
								scannerLocked
									? __('Acknowledge the error to resume scanning')
									: __('Scan with Camera')
							"
						>
						</v-btn>
						<v-btn
							icon="mdi-tune-vertical"
							size="small"
							color="primary"
							variant="text"
							@click.stop="toolsOpen = !toolsOpen"
							:aria-label="toolsOpen ? __('Hide search tools') : __('Show search tools')"
						>
						</v-btn>
					</template>
				</v-text-field>
			</v-col>
			<v-col cols="4" sm="3" class="pb-0" v-if="posProfile.posa_input_qty">
				<v-text-field
					density="compact"
					variant="solo"
					color="primary"
					class="pos-themed-input"
					:label="frappe._('QTY')"
					hide-details
					:model-value="qtyInput"
					@update:model-value="$emit('update:qtyInput', $event)"
					type="text"
					inputmode="decimal"
					@keydown.enter="$emit('enter')"
					@keydown.esc="$emit('esc')"
					@focus="$emit('clear-qty')"
					@click="$emit('clear-qty')"
					@blur="$emit('blur-qty')"
				></v-text-field>
			</v-col>
		</v-row>
		<v-expand-transition>
			<div v-if="toolsOpen" class="tools-panel">
				<div class="tools-panel__actions">
					<v-btn
						v-if="context === 'purchase'"
						density="compact"
						variant="text"
						color="primary"
						prepend-icon="mdi-plus"
						@click="$emit('open-new-item')"
						class="settings-btn"
					>
						{{ __("New Item") }}
					</v-btn>
					<v-btn
						density="compact"
						variant="text"
						color="primary"
						prepend-icon="mdi-cog-outline"
						@click="$emit('toggle-settings')"
						class="settings-btn"
					>
						{{ __("Settings") }}
					</v-btn>
					<v-btn
						density="compact"
						variant="text"
						color="primary"
						prepend-icon="mdi-refresh"
						@click="$emit('reload-items')"
						class="settings-btn"
					>
						{{ __("Reload Items") }}
					</v-btn>
				</div>
				<div class="tools-panel__meta">
					<span
						v-if="syncStatus"
						class="text-caption text-info font-weight-bold sync-status-label"
					>
						{{ syncStatus }}
					</span>
					<span
						v-else-if="enableBackgroundSync"
						class="text-caption text-medium-emphasis last-sync-label"
					>
						{{ __("Last sync:") }} {{ lastSyncTime }}
					</span>
				</div>
			</div>
		</v-expand-transition>
	</div>
</template>

<script setup>
import { ref } from "vue";

defineProps({
	searchInput: { type: String, default: "" },
	qtyInput: { type: [String, Number], default: 1 },
	posProfile: { type: Object, required: true },
	scannerLocked: { type: Boolean, default: false },
	enableBackgroundSync: { type: Boolean, default: false },
	lastSyncTime: { type: String, default: "" },
	syncStatus: { type: String, default: "" },
	context: { type: String, default: "pos" },
});

defineEmits([
	"update:searchInput",
	"update:qtyInput",
	"esc",
	"enter",
	"search-keydown",
	"clear-search",
	"search-input",
	"search-paste",
	"focus",
	"clear-qty",
	"blur-qty",
	"start-camera",
	"open-new-item",
	"toggle-settings",
	"reload-items",
]);

const debounce_search = ref(null);
const toolsOpen = ref(false);

defineExpose({
	debounce_search,
});
</script>

<style scoped>
.sticky-header {
	position: sticky;
	top: 0;
	z-index: 5;
	background: var(--pos-surface);
	padding: 12px 12px 0 12px;
	border-bottom: 1px solid var(--pos-border);
	margin-bottom: 0;
}

.items {
	margin: 0;
}

.tools-panel {
	margin-top: 8px;
	padding: 10px 12px;
	border-radius: 16px;
	background: var(--pos-surface-muted);
	border: 1px solid var(--pos-border);
}

.tools-panel__actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.tools-panel__meta {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	padding-top: 6px;
}

.settings-btn {
	text-transform: none !important;
	letter-spacing: normal !important;
	font-weight: 500 !important;
	background-color: transparent !important;
	min-height: 40px !important;
}

.last-sync-label {
	white-space: nowrap;
	font-size: 0.75rem;
}

.dynamic-margin-xs {
	margin-top: 4px;
}

:deep(.sticky-header .v-field) {
	border-radius: 16px;
}

@media (max-width: 768px) {
	.sticky-header {
		top: 0;
		z-index: 13;
		padding: 12px 12px 2px;
	}

	.tools-panel {
		padding: 8px 10px;
	}

	.tools-panel__meta {
		justify-content: flex-start;
	}
}
</style>
