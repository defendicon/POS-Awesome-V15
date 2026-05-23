<template>
	<v-card class="h-100 d-flex flex-column pos-themed-card" flat>
		<v-card-title class="py-2 px-4 bg-primary text-white d-flex align-center">
			<span class="text-h6">{{ __("Barcode Label Printing") }}</span>
			<v-spacer></v-spacer>
			<v-btn
				icon="mdi-delete"
				variant="text"
				color="white"
				@click="bp.clearAll"
				:title="__('Clear All')"
				:aria-label="__('Clear all barcode items')"
			></v-btn>
		</v-card-title>

		<v-card-text class="flex-grow-1 overflow-y-auto pa-4">
			<v-row dense class="mb-2 align-center">
				<v-col cols="12" md="3">
					<v-select
						v-model="bp.pageFormat"
						:items="bp.pageFormatOptions"
						:label="__('Page Format')"
						density="compact"
						variant="outlined"
						hide-details
						class="pos-themed-input"
					></v-select>
				</v-col>
				<v-col cols="6" md="2">
					<v-text-field
						v-model.number="bp.gridCols"
						:label="__('Cols')"
						type="number"
						density="compact"
						variant="outlined"
						hide-details
						class="pos-themed-input"
						min="1"
					></v-text-field>
				</v-col>
				<v-col cols="6" md="2">
					<v-text-field
						v-model.number="bp.gridRows"
						:label="__('Rows')"
						type="number"
						density="compact"
						variant="outlined"
						hide-details
						class="pos-themed-input"
						min="1"
					></v-text-field>
				</v-col>
				<v-col cols="12" md="5" class="d-flex gap-2">
					<v-btn
						color="secondary"
						class="flex-grow-1 mr-1"
						height="40"
						@click="bp.downloadPdf"
						:disabled="!bp.items.length"
					>
						<v-icon start class="mr-2">mdi-file-pdf-box</v-icon>
						{{ __("PDF") }}
					</v-btn>
					<v-btn
						color="primary"
						class="flex-grow-1 ml-1"
						height="40"
						@click="bp.printLabels"
						:disabled="!bp.items.length"
					>
						<v-icon start class="mr-2">mdi-printer</v-icon>
						{{ __("Print") }}
					</v-btn>
				</v-col>
			</v-row>

			<v-row dense class="mb-2">
				<v-col cols="12" md="6">
					<v-checkbox
						v-model="bp.includePrice"
						:label="__('Include Price')"
						density="compact"
						hide-details
						color="primary"
					></v-checkbox>
				</v-col>
				<v-col cols="12" md="6">
					<v-checkbox
						v-model="bp.includeBatchSerial"
						:label="__('Include Batch / Serial')"
						density="compact"
						hide-details
						color="primary"
					></v-checkbox>
				</v-col>
			</v-row>

			<v-divider class="my-3"></v-divider>

			<v-data-table
				:headers="bp.headers"
				:items="bp.items"
				density="compact"
				class="elevation-1 border rounded"
				:items-per-page="-1"
				hide-default-footer
			>
				<template v-slot:item.uom="{ item }">
					<v-select
						v-if="bp.getItemUomOptions(item).length"
						v-model="item.uom"
						:items="bp.getItemUomOptions(item)"
						density="compact"
						variant="outlined"
						hide-details
						class="pos-themed-input"
						@update:modelValue="bp.onItemUomChange(item)"
					></v-select>
					<span v-else class="text-caption text-medium-emphasis">-</span>
				</template>
				<template v-slot:item.qty="{ item }">
					<div class="pos-table__qty-counter">
						<v-btn
							size="small"
							variant="flat"
							class="pos-table__qty-btn pos-table__qty-btn--minus minus-btn qty-control-btn"
							@click="bp.decrementQty(item)"
							:aria-label="__('Decrease quantity')"
						>
							<v-icon size="small">mdi-minus</v-icon>
						</v-btn>
						<div
							v-if="!item._editingQty"
							class="pos-table__qty-display amount-value"
							@click="bp.openQtyEdit(item)"
							tabindex="0"
							role="button"
							:aria-label="__('Edit quantity')"
						>
							{{ item.qty }}
						</div>
						<v-text-field
							v-else
							v-model="bp.editingQtyValue"
							density="compact"
							variant="outlined"
							class="pos-table__qty-input"
							@blur="bp.closeQtyEdit(item)"
							@keydown.enter.prevent="bp.closeQtyEdit(item)"
							@click.stop
							:id="'qty-input-' + item._row_id"
							:autofocus="true"
							type="number"
							hide-details
						></v-text-field>
						<v-btn
							size="small"
							variant="flat"
							class="pos-table__qty-btn pos-table__qty-btn--plus plus-btn qty-control-btn"
							@click="bp.incrementQty(item)"
							:aria-label="__('Increase quantity')"
						>
							<v-icon size="small">mdi-plus</v-icon>
						</v-btn>
					</div>
				</template>
				<template v-slot:item.barcode="{ item }">
					<div v-if="item.barcode">{{ item.barcode }}</div>
					<div v-else class="text-error text-caption">{{ __("No Barcode") }}</div>
				</template>
				<template v-slot:item.grams="{ item }">
					<v-text-field
						v-if="bp.shouldShowScaleGramsInput(item)"
						v-model.number="item.scale_grams"
						density="compact"
						variant="outlined"
						hide-details
						type="number"
						min="1"
						step="1"
						class="pos-themed-input"
						@blur="bp.onItemScaleGramsChange(item)"
						@keydown.enter.prevent="bp.onItemScaleGramsChange(item)"
					></v-text-field>
					<span v-else class="text-caption text-medium-emphasis">-</span>
				</template>
				<template v-slot:item.actions="{ item }">
					<v-btn
						icon="mdi-delete"
						size="small"
						variant="text"
						color="error"
						@click="bp.removeItem(item)"
						:aria-label="__('Remove barcode item')"
					></v-btn>
				</template>
			</v-data-table>
		</v-card-text>
	</v-card>
</template>

<script setup>
/* global __ */

const { bp } = defineProps(["bp"]);
</script>

<style scoped>
@import "./barcode-printing.css";
</style>
