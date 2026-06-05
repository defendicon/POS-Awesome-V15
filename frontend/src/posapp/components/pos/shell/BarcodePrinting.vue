<template>
	<div class="pa-0 h-100">
		<v-row class="h-100 ma-0">
			<!-- Left Column: Item Selector -->
			<v-col cols="12" md="5" class="h-100 pa-0 border-e d-flex flex-column">
				<ItemsSelector
					context="barcode"
					:showOnlyBarcodeItems="true"
					class="flex-grow-1"
					@add-item="onAddItem"
					@add-items="onAddItems"
				/>
			</v-col>

			<!-- Right Column: Barcode Printing -->
			<v-col cols="12" md="7" class="h-100 pa-0">
				<v-card class="h-100 d-flex flex-column pos-themed-card" flat>
					<v-card-title class="py-2 px-4 bg-primary text-white d-flex align-center">
						<span class="text-h6">{{ __("Barcode Label Printing") }}</span>
						<v-spacer></v-spacer>
						<v-btn
							icon="mdi-upload"
							variant="text"
							color="white"
							@click="bulkImportDialog = true"
							:title="__('Bulk Import')"
							:aria-label="__('Bulk import barcode items')"
						></v-btn>
						<v-btn
							icon="mdi-delete"
							variant="text"
							color="white"
							@click="clearAll"
							:title="__('Clear All')"
							:aria-label="__('Clear all barcode items')"
						></v-btn>
					</v-card-title>

					<v-card-text class="flex-grow-1 overflow-y-auto pa-4">
						<!-- Configuration -->
						<v-row dense class="mb-2 align-center">
							<v-col cols="12" md="2">
								<v-select
									v-model="pageFormat"
									:items="PAGE_FORMAT_PRESETS"
									:label="__('Page Format')"
									item-title="label"
									item-value="value"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
								></v-select>
							</v-col>
							<v-col cols="6" md="1">
								<v-text-field
									v-model.number="gridCols"
									:label="__('Cols')"
									type="number"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
									min="1"
								></v-text-field>
							</v-col>
							<v-col cols="6" md="1">
								<v-text-field
									v-model.number="gridRows"
									:label="__('Rows')"
									type="number"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
									min="1"
								></v-text-field>
							</v-col>
							<v-col cols="12" md="2">
								<v-select
									v-model="symbology"
									:items="symbologyOptions"
									:label="__('Symbology')"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
								></v-select>
							</v-col>
							<v-col cols="12" md="1">
								<v-select
									v-model="outputFormat"
									:items="['html', 'zpl', 'epl']"
									:label="__('Output')"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
								></v-select>
							</v-col>
							<v-col cols="12" md="1">
								<v-select
									v-model="printerDpi"
									:items="[
										{ title: '96 DPI (Browser)', value: 96 },
										{ title: '203 DPI (Thermal)', value: 203 },
										{ title: '300 DPI (High)', value: 300 },
									]"
									:label="__('DPI')"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
								></v-select>
							</v-col>
							<v-col cols="12" md="4" class="d-flex gap-2">
								<v-tooltip :text="__('Preview labels before printing')" location="top">
									<template v-slot:activator="{ props }">
										<v-btn
											v-bind="props"
											color="info"
											variant="text"
											height="40"
											@click="openPreview"
											:disabled="!items.length"
										>
											<v-icon>mdi-eye</v-icon>
										</v-btn>
									</template>
								</v-tooltip>
								<v-btn
									color="secondary"
									class="flex-grow-1 mr-1"
									height="40"
									@click="downloadPdf(items)"
									:disabled="!items.length"
								>
									<v-icon start class="mr-2">mdi-file-pdf-box</v-icon>
									{{ __("PDF") }}
								</v-btn>
								<v-btn
									color="primary"
									class="flex-grow-1 ml-1"
									height="40"
									@click="printLabels(items)"
									:disabled="!items.length"
								>
									<v-icon start class="mr-2">mdi-printer</v-icon>
									{{ __("Print") }}
								</v-btn>
								<v-tooltip :text="__('Print via QZ Tray thermal printer')" location="top">
									<template v-slot:activator="{ props }">
										<v-btn
											v-bind="props"
											color="deep-purple-accent-3"
											class="flex-grow-1 ml-1"
											height="40"
											@click="thermalPrint"
											:disabled="!items.length || !qzThermalAvailable"
											:loading="thermalPrinting"
										>
											<v-icon start class="mr-2">mdi-fire</v-icon>
											{{ __("Thermal") }}
										</v-btn>
									</template>
								</v-tooltip>
							</v-col>
						</v-row>

						<v-row dense class="mb-2">
							<v-col cols="12" md="4">
								<v-checkbox
									v-model="includePrice"
									:label="__('Include Price')"
									density="compact"
									hide-details
									color="primary"
								></v-checkbox>
							</v-col>
							<v-col cols="12" md="4">
								<v-checkbox
									v-model="includeBatchSerial"
									:label="__('Include Batch / Serial')"
									density="compact"
									hide-details
									color="primary"
								></v-checkbox>
							</v-col>
							<v-col cols="12" md="4">
								<v-checkbox
									v-model="includeWarehouseLocation"
									:label="__('Include Warehouse Location')"
									density="compact"
									hide-details
									color="primary"
								></v-checkbox>
							</v-col>
						</v-row>

						<v-alert
							v-if="sizeWarnings.length"
							type="warning"
							density="compact"
							variant="tonal"
							class="mb-2"
						>
							{{ sizeWarnings[0] }}
						</v-alert>

						<v-divider class="my-3"></v-divider>

						<!-- Items List -->
						<v-data-table
							:headers="headers"
							:items="items"
							density="compact"
							class="elevation-1 border rounded"
							:items-per-page="-1"
							hide-default-footer
						>
							<template v-slot:item.uom="{ item }">
								<v-select
									v-if="getItemUomOptions(item).length"
									v-model="item.uom"
									:items="getItemUomOptions(item)"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
									@update:modelValue="onItemUomChange(item)"
								></v-select>
								<span v-else class="text-caption text-medium-emphasis">-</span>
							</template>
							<template v-slot:item.price="{ item }">
								<span class="text-caption">{{ formatCurrency(item.price) }}</span>
							</template>
							<template v-slot:item.qty="{ item }">
								<div class="pos-table__qty-counter">
									<v-btn
										size="small"
										variant="flat"
										class="pos-table__qty-btn pos-table__qty-btn--minus minus-btn qty-control-btn"
										@click="decrementQty(item)"
										:aria-label="__('Decrease quantity')"
									>
										<v-icon size="small">mdi-minus</v-icon>
									</v-btn>
									<div
										v-if="!item._editingQty"
										class="pos-table__qty-display amount-value"
										@click="openQtyEdit(item)"
										tabindex="0"
										role="button"
										:aria-label="__('Edit quantity')"
									>
										{{ item.qty }}
									</div>
									<v-text-field
										v-else
										v-model="editingQtyValue"
										density="compact"
										variant="outlined"
										class="pos-table__qty-input"
										@blur="closeQtyEdit(item)"
										@keydown.enter.prevent="closeQtyEdit(item)"
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
										@click="incrementQty(item)"
										:aria-label="__('Increase quantity')"
									>
										<v-icon size="small">mdi-plus</v-icon>
									</v-btn>
								</div>
							</template>
							<template v-slot:item.barcode="{ item }">
								<div v-if="item.barcode" class="d-flex align-center ga-1">
									<template v-if="getAvailableBarcodes(item).length > 1">
										<v-select
											v-model="item.barcode"
											:items="getAvailableBarcodes(item)"
											item-title="barcode"
											item-value="barcode"
											density="compact"
											variant="outlined"
											hide-details
											class="pos-themed-input"
											@update:modelValue="(v) => selectBarcode(item, v)"
										>
											<template v-slot:item="{ props, item: bcItem }">
												<v-list-item v-bind="props" :subtitle="bcItem.raw.barcode_type || ''"></v-list-item>
											</template>
										</v-select>
									</template>
									<span v-else class="text-caption">
										{{ item.barcode }}
										<v-chip v-if="getBarcodeTypeLabel(item)" size="x-small" variant="outlined" class="ml-1">{{ getBarcodeTypeLabel(item) }}</v-chip>
									</span>
									<v-tooltip v-if="validateBarcodeItem(item)" location="top">
										<template v-slot:activator="{ props }">
											<v-icon v-bind="props" color="error" size="small">mdi-alert-circle</v-icon>
										</template>
										<span>{{ validateBarcodeItem(item) }}</span>
									</v-tooltip>
								</div>
								<div v-else class="text-error text-caption">{{ __("No Barcode") }}</div>
							</template>
							<template v-slot:item.grams="{ item }">
								<v-text-field
									v-if="shouldShowScaleGramsInput(item)"
									v-model.number="item.scale_grams"
									density="compact"
									variant="outlined"
									hide-details
									type="number"
									min="1"
									step="1"
									class="pos-themed-input"
									@blur="onItemScaleGramsChange(item)"
									@keydown.enter.prevent="onItemScaleGramsChange(item)"
								></v-text-field>
								<span v-else class="text-caption text-medium-emphasis">-</span>
							</template>
							<template v-slot:item.warehouseLocation="{ item }">
								<v-autocomplete
									v-model="item.warehouseLocation"
									:items="warehouseOptions"
									item-title="warehouse_name"
									item-value="name"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
									:placeholder="__('Loc')"
									clearable
								></v-autocomplete>
							</template>
							<template v-slot:item.variableData="{ item }">
								<v-btn
									icon="mdi-variable"
									size="small"
									variant="text"
									color="primary"
									@click="openVariableDataDialog(item)"
									:aria-label="__('Variable data')"
								></v-btn>
							</template>
							<template v-slot:item.actions="{ item }">
								<v-btn
									icon="mdi-delete"
									size="small"
									variant="text"
									color="error"
									@click="removeItem(item)"
									:aria-label="__('Remove barcode item')"
								></v-btn>
							</template>
						</v-data-table>
					</v-card-text>
				</v-card>
			</v-col>
		</v-row>

		<!-- Add Item Quantity Dialog -->
		<v-dialog v-model="addItemDialog" max-width="400">
			<v-card v-if="pendingAddItem">
				<v-card-title class="bg-primary text-white">
					{{ __("Enter Quantity") }}
				</v-card-title>
				<v-card-text class="pt-4">
					<div class="text-subtitle-1 mb-2">{{ pendingAddItem.item_name }}</div>
					<div
						v-if="pendingAddItem && shouldShowScaleGramsInput(pendingAddItem)"
						class="text-caption text-medium-emphasis mb-2"
					>
						{{ __("Scale barcode detected. Quantity here is the number of labels to print.") }}
					</div>
					<v-select
						v-if="pendingAddItem && getItemUomOptions(pendingAddItem).length > 1"
						v-model="pendingAddItem.uom"
						:items="getItemUomOptions(pendingAddItem)"
						:label="__('UOM')"
						variant="outlined"
						density="compact"
						class="mb-2 pos-themed-input"
						@update:modelValue="onPendingUomChange"
					></v-select>
					<v-text-field
						v-model.number="addItemQty"
						:label="
							pendingAddItem && shouldShowScaleGramsInput(pendingAddItem)
								? __('Labels')
								: __('Quantity')
						"
						type="number"
						min="1"
						step="1"
						variant="outlined"
						autofocus
						@keydown.enter="confirmAddItem"
					></v-text-field>
					<v-text-field
						v-if="pendingAddItem && shouldShowScaleGramsInput(pendingAddItem)"
						v-model.number="pendingScaleGrams"
						:label="__('Weight (grams)')"
						type="number"
						min="1"
						step="1"
						variant="outlined"
						class="mt-2"
						@update:modelValue="onPendingScaleGramsInput"
						@blur="syncPendingScaleBarcode"
						@keydown.enter.prevent="syncPendingScaleBarcode"
					></v-text-field>
					<div
						v-if="
							pendingAddItem &&
							shouldShowScaleGramsInput(pendingAddItem) &&
							pendingAddItem.barcode
						"
						class="text-caption text-medium-emphasis mt-1"
					>
						{{ __("Generated scale barcode: {0}", [pendingAddItem.barcode]) }}
					</div>
				</v-card-text>
				<v-card-actions class="justify-end">
					<v-btn variant="text" @click="closeAddItemDialog">{{ __("Cancel") }}</v-btn>
					<v-btn color="primary" variant="elevated" @click="confirmAddItem">{{ __("Add") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
		<!-- Variable Data Dialog -->
		<v-dialog v-model="variableDataDialog" max-width="400">
			<v-card v-if="variableDataItem">
				<v-card-title class="bg-primary text-white">
					{{ __("Variable Data") }}
				</v-card-title>
				<v-card-text class="pt-4">
					<v-autocomplete
						v-if="getAvailableBatches(variableDataItem).length"
						v-model="variableDataItem.batch_no"
						:items="getAvailableBatches(variableDataItem)"
						item-title="batch_no"
						item-value="batch_no"
						:label="__('Batch No')"
						variant="outlined"
						density="compact"
						class="mb-2"
						clearable
						@update:modelValue="onSelectBatch(variableDataItem, $event)"
					></v-autocomplete>
					<v-text-field
						v-else
						v-model="variableDataItem.batch_no"
						:label="__('Batch No')"
						variant="outlined"
						density="compact"
						class="mb-2"
					></v-text-field>
					<v-autocomplete
						v-if="getAvailableSerials(variableDataItem).length"
						v-model="variableDataItem.serial_no"
						:items="getAvailableSerials(variableDataItem)"
						item-title="serial_no"
						item-value="serial_no"
						:label="__('Serial No')"
						:hint="__('e.g. 1001-1050')"
						persistent-hint
						variant="outlined"
						density="compact"
						class="mb-2"
						clearable
						@update:modelValue="onSelectSerial(variableDataItem, $event)"
					></v-autocomplete>
					<v-text-field
						v-else
						v-model="variableDataItem.serial_no"
						:label="__('Serial No')"
						:hint="__('e.g. 1001-1050')"
						persistent-hint
						variant="outlined"
						density="compact"
						class="mb-2"
					></v-text-field>
					<v-text-field
						v-model="variableDataItem.expiry_date"
						:label="__('Expiry Date')"
						:hint="__('Auto-filled when batch selected')"
						persistent-hint
						type="date"
						variant="outlined"
						density="compact"
						class="mb-2"
					></v-text-field>
					<v-autocomplete
						v-model="variableDataItem.warehouseLocation"
						:items="warehouseOptions"
						item-title="warehouse_name"
						item-value="name"
						:label="__('Location')"
						:loading="warehouseLoading"
						hint="__('Choose warehouse from ERPNext')"
						persistent-hint
						variant="outlined"
						density="compact"
						class="mb-2"
						clearable
					></v-autocomplete>
				</v-card-text>
				<v-card-actions class="justify-end">
					<v-btn variant="text" @click="closeVariableDataDialog">{{ __("Cancel") }}</v-btn>
					<v-btn color="primary" variant="elevated" @click="closeVariableDataDialog">{{ __("Save") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
		<!-- Bulk Import Dialog -->
		<v-dialog v-model="bulkImportDialog" max-width="600">
			<v-card>
				<v-card-title class="bg-primary text-white d-flex align-center">
					<span>{{ __("Bulk Import") }}</span>
					<v-spacer></v-spacer>
					<v-btn icon="mdi-close" variant="text" color="white" @click="bulkImportDialog = false"></v-btn>
				</v-card-title>
				<v-card-text class="pt-4">
					<v-radio-group v-model="bulkImportFormat" inline hide-details density="compact" class="mb-2">
						<v-radio :label="__('CSV')" value="csv"></v-radio>
						<v-radio :label="__('JSON')" value="json"></v-radio>
					</v-radio-group>
					<v-textarea
						v-model="bulkImportRaw"
						:label="bulkImportFormat === 'csv' ? __('item_code, qty') : __('[{item_code:..., qty:...}]')"
						variant="outlined"
						rows="6"
						:hint="bulkImportFormat === 'csv' ? __('One per line: item_code, qty') : __('Array of objects with item_code, qty')"
						persistent-hint
					></v-textarea>
					<v-alert v-if="bulkImportError" type="error" density="compact" variant="tonal" class="mb-2">
						{{ bulkImportError }}
					</v-alert>
					<v-alert v-if="bulkImportSuccess" type="success" density="compact" variant="tonal" class="mb-2">
						{{ bulkImportSuccess }}
					</v-alert>
				</v-card-text>
				<v-card-actions class="justify-end">
					<v-btn variant="text" @click="bulkImportDialog = false">{{ __("Cancel") }}</v-btn>
					<v-btn color="primary" variant="elevated" :loading="bulkImporting" @click="processBulkImport">
						{{ __("Import") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>

		<!-- Label Preview Dialog -->
		<v-dialog v-model="previewDialog" fullscreen>
			<v-card v-if="previewContent" class="d-flex flex-column">
				<v-card-title class="bg-primary text-white d-flex align-center">
					<span class="text-h6">{{ __("Label Preview") }}</span>
					<v-spacer></v-spacer>
					<v-btn
						icon="mdi-close"
						variant="text"
						color="white"
						@click="previewDialog = false"
					></v-btn>
				</v-card-title>
				<v-card-text class="flex-grow-1 pa-0 d-flex flex-column">
					<iframe
						:srcdoc="previewContent"
						class="flex-grow-1"
						style="width: 100%; border: none;"
					></iframe>
				</v-card-text>
				<v-card-actions class="pa-4 justify-center">
					<v-btn
						color="primary"
						size="large"
						prepend-icon="mdi-printer"
						@click="printFromPreview"
					>
						{{ __("Print") }}
					</v-btn>
					<v-btn
						color="secondary"
						size="large"
						prepend-icon="mdi-file-pdf-box"
						@click="pdfFromPreview"
					>
						{{ __("Download PDF") }}
					</v-btn>
					<v-btn variant="text" size="large" @click="previewDialog = false">
						{{ __("Close") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup>
import { computed, watch, onMounted, onUnmounted, ref } from "vue";
import ItemsSelector from "../items/ItemsSelector.vue";
import { useItemsStore } from "../../../stores/itemsStore";
import { useUIStore } from "../../../stores/uiStore";
import { useToastStore } from "../../../stores/toastStore";
import { useBarcodePrintQueue } from "../../../composables/pos/items/useBarcodePrintQueue";
import { useBarcodePrintOutput, PAGE_FORMAT_PRESETS, getBarcodeCheckDigitWarning, validateBarcodeItem, getBarcodeTypeLabel } from "../../../composables/pos/items/useBarcodePrintOutput";
import { useScaleBarcodeSettings } from "../../../composables/pos/items/useScaleBarcodeSettings";

const itemsStore = useItemsStore();
const uiStore = useUIStore();

const printQueue = useBarcodePrintQueue();
const printOutput = useBarcodePrintOutput();
const scaleSettings = useScaleBarcodeSettings();

const {
	items,
	editingQtyValue,
	addItemDialog,
	addItemQty,
	pendingAddItem,
	pendingScaleGrams,
	addOrMergePrintableItem,
	removeItem,
	clearAll,
	incrementQty,
	decrementQty,
	normalizeLabelQty,
	openQtyEdit,
	closeQtyEdit,
	onAddItem,
	confirmAddItem,
	closeAddItemDialog,
	onPendingUomChange,
	onPendingScaleGramsInput,
	syncPendingScaleBarcode,
	onItemScaleGramsChange,
	onItemUomChange,
	getItemUomOptions,
	getAvailableBarcodes,
	selectBarcode,
		variableDataDialog,
		variableDataItem,
		openVariableDataDialog,
		closeVariableDataDialog,
		warehouseOptions,
		warehouseLoading,
		getAvailableBatches,
		getAvailableSerials,
		onSelectBatch,
		onSelectSerial,
		cleanup: cleanupQueue,
	} = printQueue;

const {
	pageFormat,
	gridCols,
	gridRows,
	includePrice,
	includeBatchSerial,
	includeWarehouseLocation,
	symbology,
	symbologyOptions,
	outputFormat,
	printerDpi,
	getPrintableItems,
	printLabels,
	printLabelsThermal,
	printLabelsRaw,
	qzThermalAvailable,
	downloadPdf,
	getLabelSizeWarnings,
	formatCurrency,
} = printOutput;

const thermalPrinting = ref(false);
const bulkImportDialog = ref(false);
const bulkImportRaw = ref("");
const bulkImportFormat = ref("csv");
const bulkImporting = ref(false);
const bulkImportError = ref("");
const bulkImportSuccess = ref("");

const onAddItems = async (selectedItems) => {
	for (const item of selectedItems) {
		await onAddItem(item);
	}
};

const processBulkImport = async () => {
	bulkImportError.value = "";
	bulkImportSuccess.value = "";
	const raw = (bulkImportRaw.value || "").trim();
	if (!raw) {
		bulkImportError.value = __("Please enter data to import");
		return;
	}

	bulkImporting.value = true;
	try {
		let entries = [];

		if (bulkImportFormat.value === "csv") {
			const lines = raw.split("\n").filter((l) => l.trim());
			for (const line of lines) {
				const parts = line.split(",").map((p) => p.trim());
				if (parts[0]) {
					entries.push({
						item_code: parts[0],
						qty: parts[1] ? parseInt(parts[1], 10) || 1 : 1,
					});
				}
			}
		} else {
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) throw new Error("JSON must be an array");
			entries = parsed.map((e) => ({
				item_code: String(e.item_code || e.item || "").trim(),
				qty: parseInt(e.qty || e.quantity || "1", 10) || 1,
			})).filter((e) => e.item_code);
		}

		if (!entries.length) {
			bulkImportError.value = __("No valid entries found");
			return;
		}

		const knownItems = itemsStore.items || [];
		let added = 0;
		for (const entry of entries) {
			const found = knownItems.find(
				(i) =>
					i.item_code === entry.item_code ||
					i.name === entry.item_code ||
					i.barcode === entry.item_code,
			);
			if (found) {
				added++;
				const qty = entry.qty || 1;
				addOrMergePrintableItem(
					{
						...found,
						barcode:
							found.barcode ||
							(Array.isArray(found.item_barcode) && found.item_barcode[0]?.barcode) ||
							"",
						uom: found.uom || found.stock_uom || "",
						qty,
						_prices_by_uom: found._prices_by_uom || {},
						item_barcode: found.item_barcode || [],
						item_uoms: found.item_uoms || [],
					},
					qty,
					"bulk-import",
				);
			} else {
				try {
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_items_details",
						args: {
							items_data: JSON.stringify([{ item_code: entry.item_code }]),
							pos_profile: JSON.stringify(uiStore.posProfile || {}),
							price_list: (uiStore.posProfile)?.selling_price_list || "",
						},
						silent: true,
					});
					const details = res.message && res.message[0];
					if (details) {
						added++;
						const qty = entry.qty || 1;
						addOrMergePrintableItem(
							{
								...details,
								barcode:
									details.barcode ||
									(Array.isArray(details.item_barcode) && details.item_barcode[0]?.barcode) ||
									"",
								uom: details.uom || details.stock_uom || "",
								qty,
								_prices_by_uom: details._prices_by_uom || {},
								item_barcode: details.item_barcode || [],
								item_uoms: details.item_uoms || [],
							},
							qty,
							"bulk-import",
						);
					} else {
						console.warn("Item not found:", entry.item_code);
					}
				} catch (e) {
					console.warn("Failed to fetch item:", entry.item_code, e);
				}
			}
		}

		bulkImportSuccess.value = __("Imported {0} items", String(added));
		bulkImportRaw.value = "";
	} catch (e) {
		bulkImportError.value = String(e?.message || e);
	} finally {
		bulkImporting.value = false;
	}
};

const thermalPrint = async () => {
	thermalPrinting.value = true;
	try {
		if (outputFormat.value === "zpl" || outputFormat.value === "epl") {
			await printLabelsRaw(items.value);
		} else {
			await printLabelsThermal(items.value);
		}
	} finally {
		thermalPrinting.value = false;
	}
};

const sizeWarnings = computed(() => getLabelSizeWarnings());

const previewDialog = ref(false);
const previewContent = ref("");

const generateLabelsHtml = (items) => {
	const printable = getPrintableItems(items, { notify: false });
	if (!printable.length) return "";
	const style = printOutput.getPrintStyles();
	const content = printOutput.generatePrintContent(printable);
	return `<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<style>${style}</style>
</head>
<body>
	${content}
	<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"><\/script>
	<script>
		JsBarcode(".barcode").init();
	<\/script>
</body>
</html>`;
};

const openPreview = () => {
	const html = generateLabelsHtml(items.value);
	if (!html) {
		useToastStore().show({ title: __("No items with barcodes to preview"), color: "warning" });
		return;
	}
	previewContent.value = html;
	previewDialog.value = true;
};

const printFromPreview = () => {
	if (previewContent.value) {
		printLabels(items.value);
		previewDialog.value = false;
	}
};

const pdfFromPreview = () => {
	if (previewContent.value) {
		downloadPdf(items.value);
		previewDialog.value = false;
	}
};

const { shouldShowScaleGramsInput } = scaleSettings;

const headers = computed(() => [
	{ title: __("Item Code"), key: "item_code", width: "13%" },
	{ title: __("Item Name"), key: "item_name", width: "17%" },
	{ title: __("UOM"), key: "uom", width: "10%" },
	{ title: __("Price"), key: "price", width: "10%" },
	{ title: __("Barcode"), key: "barcode", width: "20%" },
	{ title: __("Weight (g)"), key: "grams", width: "10%" },
	{ title: __("Location"), key: "warehouseLocation", width: "10%" },
	{ title: __("Quantity"), key: "qty", align: "center", width: "10%" },
	{ title: "", key: "variableData", align: "center", sortable: false, width: "5%" },
	{ title: "", key: "actions", align: "center", sortable: false, width: "5%" },
]);

watch(
	() => uiStore.posProfile,
	(profile) => {
		if (profile) {
			// POS profile is available for printOutput formatCurrency
		}
	},
	{ deep: true, immediate: true },
);

onMounted(() => {
	scaleSettings.ensureScaleBarcodeSettings();
});

onUnmounted(() => {
	cleanupQueue();
});
</script>

<style scoped>
.qty-control-btn {
	width: 24px !important;
	height: 24px !important;
	min-width: 24px !important;
	border-radius: 6px !important;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
	box-shadow:
		0 2px 8px var(--pos-shadow-light),
		0 1px 3px var(--pos-shadow-light) !important;
	font-weight: 600 !important;
	backdrop-filter: blur(10px) !important;
	position: relative !important;
	overflow: hidden !important;
	flex-shrink: 0;
}

.qty-control-btn::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: var(--pos-hover-bg);
	transition: transform 0.3s ease;
	transform: translateX(-100%);
	z-index: 0;
}

.qty-control-btn:hover::before {
	transform: translateX(0);
}

.qty-control-btn .v-icon {
	position: relative;
	z-index: 1;
}

.pos-table__qty-counter {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 2px;
	padding: 2px;
	min-width: 60px;
	max-width: 100px;
	width: auto;
	height: auto;
	background: var(--pos-surface-variant);
	border-radius: 8px;
	backdrop-filter: blur(10px);
	border: 1px solid var(--pos-border-light);
	transition: all 0.3s ease;
	margin: 0 auto;
	flex-shrink: 0;
	box-sizing: border-box;
}

.pos-table__qty-counter:hover {
	background: var(--pos-hover-bg);
	box-shadow: 0 4px 16px var(--pos-shadow);
	transform: translateY(-1px);
}

.pos-table__qty-display {
	min-width: 15px;
	max-width: 40px;
	width: auto;
	flex: 1 1 auto;
	text-align: center;
	font-weight: 600;
	padding: 0 2px;
	border-radius: 4px;
	background: var(--pos-primary-container);
	border: 1px solid var(--pos-primary-variant);
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	color: var(--pos-primary);
	font-size: 0.75rem;
	transition: all 0.2s ease;
	box-shadow: 0 1px 3px var(--pos-shadow-light);
	display: flex;
	align-items: center;
	justify-content: center;
	height: 24px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	letter-spacing: -0.02em;
	word-spacing: -0.1em;
	cursor: pointer;
}

.pos-table__qty-display:focus-visible {
	outline: 2px solid var(--pos-primary);
	outline-offset: 2px;
	z-index: 10;
}

.qty-control-btn:hover {
	transform: translateY(-1px);
	box-shadow: 0 2px 6px var(--pos-shadow) !important;
}

.qty-control-btn.minus-btn {
	background: var(--pos-button-warning-bg) !important;
	color: var(--pos-button-warning-text) !important;
	border: 2px solid var(--pos-button-warning-border) !important;
}

.qty-control-btn.minus-btn:hover {
	background: var(--pos-button-warning-hover-bg) !important;
	color: var(--pos-button-warning-hover-text) !important;
	box-shadow:
		0 6px 20px var(--pos-shadow),
		0 4px 8px var(--pos-shadow-light) !important;
	transform: translateY(-2px) scale(1.05) !important;
}

.qty-control-btn.plus-btn {
	background: var(--pos-button-success-bg) !important;
	color: var(--pos-button-success-text) !important;
	border: 2px solid var(--pos-button-success-border) !important;
}

.qty-control-btn.plus-btn:hover {
	background: var(--pos-button-success-hover-bg) !important;
	color: var(--pos-button-success-hover-text) !important;
	box-shadow:
		0 6px 20px var(--pos-shadow),
		0 4px 8px var(--pos-shadow-light) !important;
	transform: translateY(-2px) scale(1.05) !important;
}

.pos-table__qty-input {
	max-width: 80px;
	margin: 0 auto;
}
.pos-table__qty-input :deep(input) {
	text-align: center;
	font-weight: 600;
	-moz-appearance: textfield;
	appearance: textfield;
}
.pos-table__qty-input :deep(input::-webkit-outer-spin-button),
.pos-table__qty-input :deep(input::-webkit-inner-spin-button) {
	-webkit-appearance: none;
	appearance: none;
	margin: 0;
}
.pos-table__qty-input :deep(.v-input__control) {
	height: 24px;
}
.pos-table__qty-input :deep(.v-field__field) {
	height: 24px;
	padding: 0 4px;
}
.pos-table__qty-input :deep(.v-field__input) {
	padding: 0;
	min-height: 24px;
	font-size: 0.75rem;
}
</style>
