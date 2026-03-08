<template>
	<div class="column-selector-container">
		<v-text-field
			ref="itemSearchField"
			:model-value="itemSearch"
			@update:model-value="$emit('update:itemSearch', $event)"
			density="compact"
			variant="solo"
			color="primary"
			class="item-search-field pos-themed-input"
			:label="__('Search items or barcode')"
			prepend-inner-icon="mdi-magnify"
			hide-details="auto"
			clearable
			autocomplete="off"
			inputmode="search"
			spellcheck="false"
		></v-text-field>
		<v-btn
			density="compact"
			variant="text"
			color="primary"
			prepend-icon="mdi-cog-outline"
			@click="toggleColumnSelection"
			class="column-selector-btn"
		>
			{{ __("Columns") }}
		</v-btn>
		<v-dialog v-model="showColumnSelector" max-width="500px" transition="dialog-bottom-transition">
			<v-card>
				<v-card-title class="text-h6 pa-4 d-flex align-center">
					<span>{{ __("Select Columns to Display") }}</span>
					<v-spacer></v-spacer>
					<v-btn
						icon="mdi-close"
						variant="text"
						density="compact"
						@click="showColumnSelector = false"
					></v-btn>
				</v-card-title>
				<v-divider></v-divider>
				<v-card-text class="pa-4">
					<v-row dense>
						<v-col
							cols="12"
							v-for="column in availableColumns.filter((col) => !col.required)"
							:key="column.key"
						>
							<v-switch
								v-model="tempSelectedColumns"
								:label="column.title"
								:value="column.key"
								hide-details
								density="compact"
								color="primary"
								class="column-switch mb-1"
								:disabled="column.required"
							></v-switch>
						</v-col>
					</v-row>
					<div class="text-caption mt-2">
						{{ __("Required columns cannot be hidden") }}
					</div>
				</v-card-text>
				<v-card-actions class="pa-4 pt-0">
					<v-btn color="error" variant="text" @click="cancelColumnSelection">{{
						__("Cancel")
					}}</v-btn>
					<v-spacer></v-spacer>
					<v-btn color="primary" variant="tonal" @click="updateSelectedColumns">{{
						__("Apply")
					}}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup>
import { ref } from "vue";

const props = defineProps({
	itemSearch: {
		type: String,
		default: "",
	},
	availableColumns: {
		type: Array,
		default: () => [],
	},
	selectedColumns: {
		type: Array,
		default: () => [],
	},
});

const emit = defineEmits(["update:itemSearch", "update:selectedColumns"]);

const showColumnSelector = ref(false);
const tempSelectedColumns = ref([]);
const itemSearchField = ref(null);

const toggleColumnSelection = () => {
	tempSelectedColumns.value = [...props.selectedColumns];
	showColumnSelector.value = true;
};

const cancelColumnSelection = () => {
	showColumnSelector.value = false;
};

const updateSelectedColumns = () => {
	emit("update:selectedColumns", tempSelectedColumns.value);
	showColumnSelector.value = false;
};

const focusSearch = () => {
	itemSearchField.value?.focus?.();
};

defineExpose({
	focusSearch,
});
</script>

<style scoped>
.column-selector-container {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 10px;
}

.item-search-field {
	width: 100%;
	max-width: 360px;
	flex: 1 1 260px;
	margin-right: auto;
}

.column-selector-btn {
	min-height: max(44px, var(--pos-touch-target, 42px));
	padding-inline: 12px !important;
	border-radius: var(--pos-radius-sm);
	text-transform: none !important;
	font-weight: 600 !important;
}

@media (max-width: 768px) {
	.item-search-field {
		max-width: 100%;
		flex-basis: 100%;
	}

	.column-selector-btn {
		min-height: 44px;
	}
}
</style>
