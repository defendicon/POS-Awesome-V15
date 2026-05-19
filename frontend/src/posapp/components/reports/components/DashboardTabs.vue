<template>
	<div class="dashboard-tabs mb-3">
		<div class="dashboard-tabs--desktop">
			<v-tabs
				:model-value="activeTab"
				color="primary"
				class="dashboard-tab-bar"
				density="comfortable"
				@update:modelValue="emit('update:activeTab', $event as DashboardTab)"
			>
				<v-tab v-for="tab in tabs" :key="`tab-${tab.value}`" :value="tab.value">
					{{ tab.label }}
				</v-tab>
			</v-tabs>
		</div>
		<div class="dashboard-tabs--mobile">
			<v-btn
				v-for="tab in tabs"
				:key="`tab-card-${tab.value}`"
				:block="true"
				:variant="activeTab === tab.value ? 'flat' : 'tonal'"
				:color="activeTab === tab.value ? 'primary' : 'secondary'"
				class="tab-card-btn"
				@click="emit('update:activeTab', tab.value)"
			>
				<v-icon size="16" start>{{ tab.icon }}</v-icon>
				<span class="tab-card-label">{{ tab.label }}</span>
			</v-btn>
		</div>
	</div>
</template>

<script setup lang="ts">
type DashboardTab =
	| "sales"
	| "staff"
	| "customers"
	| "finance"
	| "branches"
	| "products"
	| "inventory"
	| "procurement";

defineProps<{
	activeTab: DashboardTab;
	tabs: Array<{ value: DashboardTab; label: string; icon: string }>;
}>();

const emit = defineEmits<{
	(event: "update:activeTab", value: DashboardTab): void;
}>();
</script>
