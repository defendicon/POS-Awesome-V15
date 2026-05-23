<template>
	<v-dialog v-model="bp.addItemDialog" max-width="400">
		<v-card v-if="bp.pendingAddItem">
			<v-card-title class="bg-primary text-white">
				{{ __("Enter Quantity") }}
			</v-card-title>
			<v-card-text class="pt-4">
				<div class="text-subtitle-1 mb-2">{{ bp.pendingAddItem.item_name }}</div>
				<div
					v-if="bp.pendingAddItem && bp.shouldShowScaleGramsInput(bp.pendingAddItem)"
					class="text-caption text-medium-emphasis mb-2"
				>
					{{ __("Scale barcode detected. Quantity here is the number of labels to print.") }}
				</div>
				<v-select
					v-if="bp.pendingAddItem && bp.getItemUomOptions(bp.pendingAddItem).length > 1"
					v-model="bp.pendingAddItem.uom"
					:items="bp.getItemUomOptions(bp.pendingAddItem)"
					:label="__('UOM')"
					variant="outlined"
					density="compact"
					class="mb-2 pos-themed-input"
					@update:modelValue="bp.onPendingUomChange"
				></v-select>
				<v-text-field
					v-model.number="bp.addItemQty"
					:label="
						bp.pendingAddItem && bp.shouldShowScaleGramsInput(bp.pendingAddItem)
							? __('Labels')
							: __('Quantity')
					"
					type="number"
					min="1"
					step="1"
					variant="outlined"
					autofocus
					@keydown.enter="bp.confirmAddItem"
				></v-text-field>
				<v-text-field
					v-if="bp.pendingAddItem && bp.shouldShowScaleGramsInput(bp.pendingAddItem)"
					v-model.number="bp.pendingScaleGrams"
					:label="__('Weight (grams)')"
					type="number"
					min="1"
					step="1"
					variant="outlined"
					class="mt-2"
					@update:modelValue="bp.onPendingScaleGramsInput"
					@blur="bp.syncPendingScaleBarcode"
					@keydown.enter.prevent="bp.syncPendingScaleBarcode"
				></v-text-field>
				<div
					v-if="
						bp.pendingAddItem &&
						bp.shouldShowScaleGramsInput(bp.pendingAddItem) &&
						bp.pendingAddItem.barcode
					"
					class="text-caption text-medium-emphasis mt-1"
				>
					{{ __("Generated scale barcode: {0}", [bp.pendingAddItem.barcode]) }}
				</div>
			</v-card-text>
			<v-card-actions class="justify-end">
				<v-btn variant="text" @click="bp.closeAddItemDialog">{{ __("Cancel") }}</v-btn>
				<v-btn color="primary" variant="elevated" @click="bp.confirmAddItem">{{ __("Add") }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup>
/* global __ */

const { bp } = defineProps(["bp"]);
</script>
