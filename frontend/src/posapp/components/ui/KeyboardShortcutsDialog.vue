<template>
	<v-dialog v-model="model" max-width="760" scrollable>
		<v-card class="pos-themed-card">
			<v-card-title class="shortcut-title">
				<v-icon start color="primary">mdi-keyboard</v-icon>
				{{ __("Keyboard Shortcuts") }}
			</v-card-title>

			<v-divider />

			<v-card-text class="shortcut-body">
				<div class="shortcut-grid">
					<div v-for="item in shortcuts" :key="item.key" class="shortcut-row">
						<div class="shortcut-key">{{ item.key }}</div>
						<div class="shortcut-desc">{{ item.description }}</div>
					</div>
				</div>
			</v-card-text>

			<v-divider />

			<v-card-actions class="shortcut-actions">
				<v-spacer />
				<v-btn color="primary" variant="flat" @click="model = false">
					{{ __("Close") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUIStore } from "../../stores/uiStore";

const uiStore = useUIStore();
const __ = window.__ || ((text: string) => text);

const model = computed({
	get: () => uiStore.shortcutHelpOpen,
	set: (value: boolean) => {
		if (!value) {
			uiStore.closeShortcutHelp();
		} else {
			uiStore.openShortcutHelp();
		}
	},
});

const shortcuts = [
	{ key: "F1 or ?", description: __("Open keyboard shortcuts help") },
	{ key: "Ctrl/Cmd + Shift + D", description: __("Toggle compact/comfortable density") },
	{ key: "Ctrl/Cmd + Shift + L", description: __("Cycle cashier/manager/kiosk layout profile") },
	{ key: "Esc", description: __("Close dialogs or clear active search fields") },
	{ key: "Enter", description: __("Confirm focused action (search/add/select)") },
	{ key: "Arrow Keys", description: __("Navigate item lists and menus") },
];
</script>

<style scoped>
.shortcut-title {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
}

.shortcut-body {
	padding-top: 12px;
	padding-bottom: 12px;
}

.shortcut-grid {
	display: grid;
	gap: 8px;
}

.shortcut-row {
	display: grid;
	grid-template-columns: 170px 1fr;
	gap: 12px;
	padding: 10px 12px;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
	border-radius: var(--pos-radius-sm);
	background: rgba(var(--v-theme-on-surface), 0.02);
}

.shortcut-key {
	font-weight: 700;
	color: rgb(var(--v-theme-primary));
}

.shortcut-desc {
	color: var(--pos-text-primary);
}

.shortcut-actions {
	padding: 10px 16px;
}

@media (max-width: 640px) {
	.shortcut-row {
		grid-template-columns: 1fr;
		gap: 4px;
	}
}
</style>
