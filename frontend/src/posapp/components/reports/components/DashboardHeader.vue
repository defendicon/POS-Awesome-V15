<template>
	<div class="dashboard-toolbar mb-4">
		<div>
			<h1 class="text-h5 text-sm-h4 font-weight-bold mb-1">{{ __("Awesome Dashboard") }}</h1>
			<p class="text-body-2 text-medium-emphasis mb-0">
				{{ __("Real-time POS insights for retail operations.") }}
			</p>
			<div class="dashboard-meta mt-2">
				<v-chip size="x-small" color="secondary" variant="tonal" class="mr-1 mb-1">
					{{ scopeDisplayLabel }}
				</v-chip>
				<v-chip size="x-small" color="info" variant="tonal" class="mr-1 mb-1">
					{{ __("Profiles") }}: {{ selectedProfilesCount }}
				</v-chip>
				<v-chip size="x-small" :color="profitMethodColor" variant="tonal" class="mr-1 mb-1">
					{{ profitMethodLabel }}
				</v-chip>
			</div>
		</div>
		<div class="dashboard-actions">
			<v-select
				:model-value="dashboardScope"
				:items="dashboardScopeItems"
				item-title="label"
				item-value="value"
				density="compact"
				variant="outlined"
				hide-details
				:disabled="!isPosSupervisor"
				class="dashboard-filter mr-2 mb-2 mb-sm-0"
				:label="__('Scope')"
				@update:modelValue="emit('update:dashboardScope', $event)"
			/>
			<v-select
				v-if="dashboardScope === 'specific'"
				:model-value="selectedProfileFilter"
				:items="profileFilterItems"
				item-title="label"
				item-value="value"
				density="compact"
				variant="outlined"
				hide-details
				:disabled="!isPosSupervisor"
				class="dashboard-filter mr-2 mb-2 mb-sm-0"
				:label="__('Profile')"
				@update:modelValue="emit('update:selectedProfileFilter', String($event || ''))"
			/>
			<v-text-field
				:model-value="selectedReportMonth"
				type="month"
				:max="currentMonthToken"
				density="compact"
				variant="outlined"
				hide-details
				:disabled="!isPosSupervisor"
				class="dashboard-filter mr-2 mb-2 mb-sm-0"
				:label="__('Month')"
				@update:modelValue="emit('update:selectedReportMonth', String($event || ''))"
			/>
			<v-chip
				v-if="lastUpdatedLabel"
				size="small"
				variant="tonal"
				color="primary"
				class="mr-2 mb-2 mb-sm-0"
			>
				{{ lastUpdatedLabel }}
			</v-chip>
			<v-btn
				color="primary"
				variant="flat"
				:loading="loading"
				:disabled="!isPosSupervisor"
				@click="emit('refresh')"
			>
				{{ __("Refresh") }}
			</v-btn>
		</div>
	</div>
</template>

<script setup lang="ts">
type DashboardScope = "all" | "current" | "specific";
type SelectItem<T extends string = string> = {
	label: string;
	value: T;
};

defineProps<{
	scopeDisplayLabel: string;
	selectedProfilesCount: number;
	profitMethodLabel: string;
	profitMethodColor: string;
	dashboardScope: DashboardScope;
	dashboardScopeItems: SelectItem<DashboardScope>[];
	selectedProfileFilter: string;
	profileFilterItems: SelectItem[];
	selectedReportMonth: string;
	currentMonthToken: string;
	lastUpdatedLabel: string;
	isPosSupervisor: boolean;
	loading: boolean;
}>();

const emit = defineEmits<{
	(event: "update:dashboardScope", value: DashboardScope): void;
	(event: "update:selectedProfileFilter", value: string): void;
	(event: "update:selectedReportMonth", value: string): void;
	(event: "refresh"): void;
}>();

const __ = (value: string) => (window.__ ? window.__(value) : value);
</script>
