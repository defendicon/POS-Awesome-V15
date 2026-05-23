<template>
	<div v-if="visible" class="tab-pagination">
		<div class="tab-pagination__meta">{{ caption }}</div>
		<v-pagination
			:model-value="page"
			:length="pageCount"
			:total-visible="7"
			density="comfortable"
			@update:model-value="onPageChange"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	loading: boolean;
	filteredLength: number;
	pageCount: number;
	page: number;
	caption: string;
}>();

const emit = defineEmits<{
	"update:page": [value: number];
}>();

const visible = computed(() => !props.loading && props.filteredLength > 0 && props.pageCount > 1);

function onPageChange(value: number) {
	emit("update:page", value);
}
</script>
