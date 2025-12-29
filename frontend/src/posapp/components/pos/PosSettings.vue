<template>
	<div class="pa-4 h-100">
		<v-card class="h-100 d-flex flex-column pos-themed-card" flat>
			<v-card-title class="pos-text-primary">POS Settings</v-card-title>
			<v-divider></v-divider>
			<div class="d-flex flex-grow-1 overflow-hidden">
				<!-- Sidebar Menu -->
				<div class="settings-sidebar border-e">
					<v-list density="compact" nav class="bg-transparent">
						<v-list-item
							v-for="(item, index) in menuItems"
							:key="index"
							:value="item"
							:active="selectedItem === item"
							@click="selectedItem = item"
							color="primary"
							rounded="lg"
							class="mb-1"
						>
							<v-list-item-title class="pos-text-secondary">{{ item }}</v-list-item-title>
						</v-list-item>
					</v-list>
				</div>

				<!-- Main Content Area -->
				<div class="settings-content flex-grow-1 pa-4 overflow-y-auto">
					<h2 class="text-h5 mb-4 pos-text-primary">{{ selectedItem }}</h2>
					<v-divider class="mb-4"></v-divider>

					<!-- Placeholder for settings content -->
					<div class="pos-text-secondary">
						<p>Settings for {{ selectedItem }} will appear here.</p>
					</div>
				</div>
			</div>
		</v-card>
	</div>
</template>

<script>
import { useSettings } from "../../composables/useSettings.js";

export default {
	name: "PosSettings",
	setup() {
		const { settings, updateSetting, loadSettings } = useSettings();
		loadSettings();
		return { settings, updateSetting };
	},
	data() {
		return {
			selectedItem: "Invoice Settings",
			menuItems: [
				"Invoice Settings",
				"Camera & Scanner Settings",
				"Item Selector Settings",
				"Customer Related Settings",
				"Invoice Return Settings",
				"Payment Settings",
				"Offline Settings",
				"POS Shift Settings",
				"Misc. Settings",
				"Advance Settings",
			],
		};
	},
};
</script>

<style scoped>
.h-100 {
	height: 100%;
}

.settings-sidebar {
	width: 280px;
	overflow-y: auto;
	padding: 12px;
}

.settings-content {
	background-color: rgba(0, 0, 0, 0.02);
}

:deep(.v-theme--dark) .settings-content {
	background-color: rgba(255, 255, 255, 0.02);
}

.border-e {
	border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
