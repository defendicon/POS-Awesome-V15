<template>
	<div class="sticky-header">
		<v-row class="items">
			<v-col
				class="pb-0"
				:cols="posProfile.posa_input_qty ? 8 : 12"
				:sm="posProfile.posa_input_qty ? 9 : 12"
			>
				<div class="search-field-shell">
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
					<div
						v-if="showSyncProgress"
						class="search-sync-progress"
						data-test="item-search-sync-shell"
						aria-live="polite"
					>
						<v-progress-linear
							:model-value="clampedSyncProgress"
							height="3"
							rounded
							color="info"
							bg-color="rgba(15, 23, 42, 0.08)"
							data-test="item-search-sync-bar"
						/>
						<div class="search-sync-progress__meta">
							<span class="search-sync-progress__label">
								{{ syncStatus || __("Syncing items in background") }}
								<span
									v-if="normalizedSyncItemsCount > 0"
									class="search-sync-progress__count"
								>
									{{ syncItemsCountLabel }}
								</span>
							</span>
							<span class="search-sync-progress__value">
								{{ clampedSyncProgress }}%
							</span>
						</div>
					</div>
				</div>
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
import { computed, ref } from "vue";

const props = defineProps({
	searchInput: { type: String, default: "" },
	qtyInput: { type: [String, Number], default: 1 },
	posProfile: { type: Object, required: true },
	scannerLocked: { type: Boolean, default: false },
	enableBackgroundSync: { type: Boolean, default: false },
	lastSyncTime: { type: String, default: "" },
	syncStatus: { type: String, default: "" },
	showSyncProgress: { type: Boolean, default: false },
	syncProgress: { type: Number, default: 0 },
	syncItemsCount: { type: Number, default: 0 },
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
const clampedSyncProgress = computed(() => {
	const normalized = Number(props.syncProgress);
	if (!Number.isFinite(normalized) || normalized <= 0) {
		return 0;
	}
	return Math.min(100, Math.round(normalized));
});
const normalizedSyncItemsCount = computed(() => {
	const normalized = Number(props.syncItemsCount);
	if (!Number.isFinite(normalized) || normalized <= 0) {
		return 0;
	}
	return Math.round(normalized);
});
const translate = (value) =>
	typeof globalThis.__ === "function" ? globalThis.__(value) : value;
const syncItemsCountLabel = computed(() => {
	const count = normalizedSyncItemsCount.value;
	const itemLabel =
		count === 1 ? translate("item synced") : translate("items synced");
	return `${count.toLocaleString()} ${itemLabel}`;
});

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

.search-field-shell {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.search-sync-progress {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 0 6px 2px;
	animation: sync-progress-fade-in 160ms ease-out;
}

:deep(.search-sync-progress .v-progress-linear) {
	border-radius: 999px;
	overflow: hidden;
	box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.search-sync-progress__meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.search-sync-progress__label,
.search-sync-progress__value {
	font-size: 0.7rem;
	line-height: 1.2;
	color: color-mix(in srgb, var(--pos-primary, #2563eb) 78%, #0f172a 22%);
}

.search-sync-progress__label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	font-weight: 600;
	letter-spacing: 0.01em;
}

.search-sync-progress__count {
	font-variant-numeric: tabular-nums;
	font-weight: 700;
	opacity: 0.82;
}

.search-sync-progress__value {
	font-variant-numeric: tabular-nums;
	font-weight: 700;
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

	.search-sync-progress {
		gap: 3px;
		padding: 0 2px 2px;
	}

	.search-sync-progress__label,
	.search-sync-progress__value {
		font-size: 0.68rem;
	}
}

@keyframes sync-progress-fade-in {
	from {
		opacity: 0;
		transform: translateY(-2px);
	}

	to {
		opacity: 1;
		transform: translateY(0);
	}
}
</style>
