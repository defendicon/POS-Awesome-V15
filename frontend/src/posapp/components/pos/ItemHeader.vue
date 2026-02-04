<template>
	<div class="sticky-header">
		<v-row class="items">
			<v-col
				class="pb-0"
				:cols="posProfile.posa_input_qty || posProfile.posa_new_line ? undefined : 12"
			>
				<v-text-field
					density="compact"
					clearable
					autofocus
					variant="solo"
					color="primary"
					:label="frappe._('Search Items')"
					hint="Search by item code, serial number, batch no or barcode"
					hide-details
					:model-value="searchInput"
					@update:model-value="$emit('update:searchInput', $event)"
					@keydown.esc="$emit('esc')"
					@keydown.enter="$emit('enter')"
					@keydown="$emit('search-keydown', $event)"
					@click:clear="$emit('clear-search')"
					@input="$emit('search-input', $event)"
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
							:title="
								scannerLocked
									? __('Acknowledge the error to resume scanning')
									: __('Scan with Camera')
							"
						>
						</v-btn>
					</template>
				</v-text-field>
			</v-col>
			<v-col cols="3" class="pb-0" v-if="posProfile.posa_input_qty">
				<v-text-field
					density="compact"
					variant="solo"
					color="primary"
					:label="frappe._('QTY')"
					hide-details
					:model-value="qtyInput"
					@update:model-value="$emit('update:qtyInput', $event)"
					type="text"
					@keydown.enter="$emit('enter')"
					@keydown.esc="$emit('esc')"
					@focus="$emit('clear-qty')"
				></v-text-field>
			</v-col>
			<v-col cols="2" class="pb-0" v-if="posProfile.posa_new_line">
				<v-checkbox
					:model-value="newLine"
					@update:model-value="$emit('update:newLine', $event)"
					color="accent"
					value="true"
					label="NLine"
					density="default"
					hide-details
				></v-checkbox>
			</v-col>
			<v-col cols="12" class="dynamic-margin-xs">
				<div class="settings-container">
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
					<v-spacer></v-spacer>
					<span
						v-if="syncStatus"
						class="text-caption text-info font-weight-bold sync-status-label mx-2"
					>
						{{ syncStatus }}
					</span>
					<span
						v-if="enableBackgroundSync && !syncStatus"
						class="text-caption text-medium-emphasis last-sync-label"
					>
						{{ __("Last sync:") }} {{ lastSyncTime }}
					</span>
					<v-spacer></v-spacer>
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
			</v-col>
		</v-row>
	</div>
</template>

<script setup>
/* global frappe, __ */
import { ref } from "vue";

const props = defineProps({
	searchInput: { type: String, default: "" },
	qtyInput: { type: [String, Number], default: 1 },
	newLine: { type: [Boolean, Array], default: false },
	posProfile: { type: Object, required: true },
	scannerLocked: { type: Boolean, default: false },
	enableBackgroundSync: { type: Boolean, default: false },
	lastSyncTime: { type: String, default: "" },
	syncStatus: { type: String, default: "" },
	context: { type: String, default: "pos" },
});

const emit = defineEmits([
	"update:searchInput",
	"update:qtyInput",
	"update:newLine",
	"esc",
	"enter",
	"search-keydown",
	"clear-search",
	"search-input",
	"search-paste",
	"focus",
	"clear-qty",
	"start-camera",
	"open-new-item",
	"toggle-settings",
	"reload-items",
]);

const debounce_search = ref(null);

defineExpose({
	debounce_search,
});
</script>

<style scoped>
.sticky-header {
	position: sticky;
	top: 0;
	z-index: 5;
	background: rgb(var(--v-theme-surface));
	padding: 12px 12px 0 12px;
	border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
	margin-bottom: 0;
}

.items {
	margin: 0;
}

.settings-container {
	display: flex;
	align-items: center;
	padding: 4px 0;
}

.settings-btn {
	text-transform: none !important;
	letter-spacing: normal !important;
	font-weight: 500 !important;
	background-color: transparent !important;
}

.last-sync-label {
	white-space: nowrap;
	font-size: 0.75rem;
}

.dynamic-margin-xs {
	margin-top: 4px;
}
</style>
