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

					<!-- Settings Content -->
					<div class="pos-text-secondary">
						<template v-if="selectedItem === 'Invoice Settings'">
							<v-checkbox
								v-model="settings.allowUserToEditRate"
								@update:modelValue="updateSetting('allowUserToEditRate', $event)"
								label="Allow user to edit Rate"
								color="primary"
								hide-details
							></v-checkbox>
						</template>
						<template v-else-if="selectedItem === 'Payment Settings'">
							<v-select
								v-model="settings.cashModeOfPayment"
								:items="modeOfPayments"
								label="Cash Mode of Payment"
								variant="outlined"
								density="compact"
								@update:modelValue="updateSetting('cashModeOfPayment', $event)"
							></v-select>
						</template>
						<template v-else>
							<p>Settings for {{ selectedItem }} will appear here.</p>
						</template>
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
			modeOfPayments: [],
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
	mounted() {
		this.fetchModeOfPayments();
	},
	methods: {
		async fetchModeOfPayments() {
			try {
				const r = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Mode of Payment",
						fields: ["name"],
						filters: { enabled: 1 },
					},
				});
				if (r.message) {
					this.modeOfPayments = r.message.map((m) => m.name);
				}
			} catch (e) {
				console.error("Failed to fetch mode of payments", e);
			}
		},
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
