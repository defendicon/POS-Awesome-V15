<template>
	<v-row class="dashboard-grid mb-2">
		<v-col v-for="metric in metrics" :key="metric.key" cols="12" sm="6" lg="3">
			<MetricCard
				:label="metric.label"
				:value="formatMoney(metric.value)"
				:icon="metric.icon"
				:style-class="metric.styleClass"
			/>
		</v-col>
	</v-row>
</template>

<script setup lang="ts">
import MetricCard from "./MetricCard.vue";

defineProps<{
	metrics: Array<{
		key: string;
		label: string;
		icon: string;
		value: number;
		styleClass: string;
	}>;
	formatMoney: (value: number) => string;
}>();
</script>
