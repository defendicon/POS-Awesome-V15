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
				/>
			</v-col>

			<!-- Right Column: Barcode Printing -->
			<v-col cols="12" md="7" class="h-100 pa-0">
				<v-card class="h-100 d-flex flex-column pos-themed-card" flat>
					<v-card-title class="py-2 px-4 bg-primary text-white d-flex align-center">
						<span class="text-h6">{{ __("Barcode Label Printing") }}</span>
						<v-spacer></v-spacer>
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
							<v-col cols="12" md="3">
								<v-select
									v-model="pageFormat"
									:items="pageFormatOptions"
									:label="__('Page Format')"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
								></v-select>
							</v-col>
							<v-col cols="6" md="2">
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
							<v-col cols="6" md="2">
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
							<v-col cols="12" md="5" class="d-flex gap-2">
								<v-btn
									color="secondary"
									class="flex-grow-1 mr-1"
									height="40"
									@click="downloadPdf"
									:disabled="!items.length"
								>
									<v-icon start class="mr-2">mdi-file-pdf-box</v-icon>
									{{ __("PDF") }}
								</v-btn>
								<v-btn
									color="primary"
									class="flex-grow-1 ml-1"
									height="40"
									@click="printLabels"
									:disabled="!items.length"
								>
									<v-icon start class="mr-2">mdi-printer</v-icon>
									{{ __("Print") }}
								</v-btn>
							</v-col>
						</v-row>

						<v-row dense class="mb-2">
							<v-col cols="12" md="6">
								<v-checkbox
									v-model="includePrice"
									:label="__('Include Price')"
									density="compact"
									hide-details
									color="primary"
								></v-checkbox>
							</v-col>
							<v-col cols="12" md="6">
								<v-checkbox
									v-model="includeBatchSerial"
									:label="__('Include Batch / Serial')"
									density="compact"
									hide-details
									color="primary"
								></v-checkbox>
							</v-col>
						</v-row>

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
								<div v-if="item.barcode">{{ item.barcode }}</div>
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
						v-if="
							pendingAddItem && shouldShowScaleGramsInput(pendingAddItem)
						"
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
	</div>
</template>

<script>
import ItemsSelector from "../items/ItemsSelector.vue";
import { useItemsStore } from "../../../stores/itemsStore";
import { useToastStore } from "../../../stores/toastStore";
import { mapStores } from "pinia";
import format from "../../../format";
import { useUIStore } from "../../../stores/uiStore.js";

export default {
	name: "BarcodePrinting",
	components: { ItemsSelector },
	mixins: [format],
	setup() {
		const toastStore = useToastStore();
		const uiStore = useUIStore();
		return { toastStore, uiStore };
	},
	data() {
		return {
			items: [],
			nextRowId: 1,
			pageFormat: "A4",
			pageFormatOptions: ["A4"],
			gridCols: 3,
			gridRows: 7,
			includePrice: true,
			includeBatchSerial: false,
			editingQtyValue: "",
			pos_profile: null,
			addItemDialog: false,
			addItemQty: 1,
			pendingAddItem: null,
			pendingScaleGrams: null,
			scaleBarcodeSettings: null,
			scaleBarcodeSettingsLoaded: false,
			pendingScaleBarcodeTimer: null,
		};
	},
	computed: {
		...mapStores(useItemsStore),
		headers() {
			return [
				{ title: __("Item Code"), key: "item_code", width: "16%" },
				{ title: __("Item Name"), key: "item_name", width: "24%" },
				{ title: __("UOM"), key: "uom", width: "12%" },
				{ title: __("Barcode"), key: "barcode", width: "20%" },
				{ title: __("Weight (g)"), key: "grams", width: "12%" },
				{ title: __("Quantity"), key: "qty", align: "center", width: "12%" },
				{ title: "", key: "actions", align: "center", sortable: false, width: "4%" },
			];
		},
	},
	methods: {
		parseLabelSize() {
			if (this.pageFormat === "A4") {
				return {
					type: "A4",
					cols: parseInt(this.gridCols) || 3,
					rows: parseInt(this.gridRows) || 7,
				};
			}
			// Fallback
			return { type: "A4", cols: 3, rows: 7 };
		},
		getScaleSettingsSnapshot() {
			const settings = this.scaleBarcodeSettings || {};
			return {
				prefix: settings.prefix || "",
				prefix_included_or_not: Number(settings.prefix_included_or_not) || 0,
				no_of_prefix_characters: Number(settings.no_of_prefix_characters) || 0,
				item_code_starting_digit: Number(settings.item_code_starting_digit) || 0,
				item_code_total_digits: Number(settings.item_code_total_digits) || 0,
				weight_starting_digit: Number(settings.weight_starting_digit) || 0,
				weight_total_digits: Number(settings.weight_total_digits) || 0,
				weight_decimals: Number(settings.weight_decimals) || 0,
				price_included_in_barcode_or_not: Number(settings.price_included_in_barcode_or_not) || 0,
				price_starting_digit: Number(settings.price_starting_digit) || 0,
				price_total_digit: Number(settings.price_total_digit) || 0,
				price_decimals: Number(settings.price_decimals) || 0,
				configured: this.isScaleSettingsConfigured(),
			};
		},
		logDebug(step, payload = {}) {
			try {
				console.debug("[POS BarcodePrinting]", step, payload);
			} catch (error) {
				console.log("[POS BarcodePrinting]", step);
			}
		},
		normalizeLabelQty(value) {
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				return 1;
			}
			return Math.max(1, Math.round(parsed));
		},
		escapeHtml(value) {
			return String(value ?? "")
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#39;");
		},
		normalizeScaleGrams(value) {
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) return null;
			return Math.round(parsed);
		},
		normalizeUomToken(uom) {
			return String(uom || "")
				.trim()
				.toLowerCase()
				.replace(/[\s._-]+/g, "");
		},
		isLikelyWeightUom(uom) {
			const token = this.normalizeUomToken(uom);
			if (!token) return false;
			const directMatches = new Set([
				"kg",
				"kgs",
				"kilogram",
				"kilograms",
				"kilogramme",
				"kilogrammes",
				"kilo",
				"gram",
				"grams",
				"gm",
				"gms",
			]);
			if (directMatches.has(token)) return true;
			return token.includes("kilo") || token.includes("gram");
		},
		getBarcodeRowsForItem(item) {
			return Array.isArray(item?.item_barcode) ? item.item_barcode.filter((row) => row?.barcode) : [];
		},
		getScaleTemplateBarcode(item) {
			if (!item) return "";
			const normalize = (value) => String(value || "").trim();
			const currentUom = String(item.uom || "").trim();
			const barcodeRows = this.getBarcodeRowsForItem(item);
			const settingsReady = this.isScaleSettingsConfigured();

			const byCurrentUom = currentUom
				? barcodeRows.filter((row) => String(row?.posa_uom || row?.uom || "").trim() === currentUom)
				: [];

			const pickTemplate = (rows) =>
				rows.find((row) => this.isPotentialScaleTemplate(row?.barcode))?.barcode || "";

			if (settingsReady) {
				const fromUom = pickTemplate(byCurrentUom);
				if (fromUom) return normalize(fromUom);
				const fromRows = pickTemplate(barcodeRows);
				if (fromRows) return normalize(fromRows);
				const known = [
					item._scale_template_barcode,
					item._scanned_scale_barcode,
					item._scanned_barcode,
					item.barcode,
				]
					.map(normalize)
					.find((code) => code && this.isPotentialScaleTemplate(code));
				return known || "";
			}

			const fallbackRow = byCurrentUom[0]?.barcode || barcodeRows[0]?.barcode;
			return (
				normalize(item._scale_template_barcode) ||
				normalize(item._scanned_scale_barcode) ||
				normalize(item._scanned_barcode) ||
				normalize(fallbackRow) ||
				normalize(item.barcode)
			);
		},
		isScaleSettingsConfigured() {
			const settings = this.scaleBarcodeSettings || {};
			return Boolean(
				Number(settings.item_code_starting_digit) > 0 &&
					Number(settings.item_code_total_digits) > 0 &&
					Number(settings.weight_starting_digit) > 0 &&
					Number(settings.weight_total_digits) > 0,
			);
		},
		getScaleRequiredLength(settings = this.scaleBarcodeSettings || {}) {
			const toNum = (v) => Number(v) || 0;
			const itemEnd = toNum(settings.item_code_starting_digit) + toNum(settings.item_code_total_digits) - 1;
			const weightEnd =
				toNum(settings.weight_starting_digit) +
				toNum(settings.weight_total_digits) +
				toNum(settings.weight_decimals) -
				1;
			let priceEnd = 0;
			if (toNum(settings.price_included_in_barcode_or_not)) {
				priceEnd =
					toNum(settings.price_starting_digit) +
					toNum(settings.price_total_digit) +
					toNum(settings.price_decimals) -
					1;
			}
			return Math.max(itemEnd, weightEnd, priceEnd, 0);
		},
		isPotentialScaleTemplate(barcode, settings = this.scaleBarcodeSettings || {}) {
			const value = String(barcode || "").trim();
			if (!value || !this.isScaleSettingsConfigured()) return false;
			const prefix = String(settings.prefix || "").trim();
			if (prefix && !value.startsWith(prefix)) return false;
			const requiredLen = this.getScaleRequiredLength(settings);
			return value.length >= requiredLen;
		},
		async ensureScaleBarcodeSettings(force = false) {
			this.logDebug("ensureScaleBarcodeSettings:start", {
				force,
				loaded: this.scaleBarcodeSettingsLoaded,
			});
			if (!force && this.scaleBarcodeSettingsLoaded && this.scaleBarcodeSettings) {
				this.logDebug("ensureScaleBarcodeSettings:cached", {
					settings: this.getScaleSettingsSnapshot(),
				});
				return this.scaleBarcodeSettings;
			}
			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.parse_scale_barcode",
					args: { barcode: "" },
				});
				const settings =
					(res && res.message && res.message.settings) || (res && res.message) || null;
				if (settings && typeof settings === "object") {
					this.scaleBarcodeSettings = settings;
				}
				this.logDebug("ensureScaleBarcodeSettings:loaded", {
					settings: this.getScaleSettingsSnapshot(),
				});
			} catch (error) {
				console.warn("Failed to load scale barcode settings for printing", error);
				this.scaleBarcodeSettings = null;
				this.logDebug("ensureScaleBarcodeSettings:error", {
					error: String(error?.message || error || ""),
				});
			} finally {
				this.scaleBarcodeSettingsLoaded = true;
			}
			return this.scaleBarcodeSettings;
		},
		shouldShowScaleGramsInput(item) {
			if (!item) return false;
			if (item._is_scale_barcode || this.isScaleBarcodePayload(item)) return true;
			const templateBarcode = this.getScaleTemplateBarcode(item);
			if (templateBarcode && this.isPotentialScaleTemplate(templateBarcode)) return true;
			return this.isLikelyWeightUom(item.uom);
		},
		async generateScaleBarcodeForItem(item, grams, { silent = false } = {}) {
			this.logDebug("generateScaleBarcodeForItem:start", {
				item_code: item?.item_code,
				uom: item?.uom,
				input_grams: grams,
				silent,
			});
			if (!item) return false;
			const normalizedGrams = this.normalizeScaleGrams(grams);
			if (!normalizedGrams) {
				this.logDebug("generateScaleBarcodeForItem:invalid-grams", {
					item_code: item?.item_code,
					input_grams: grams,
				});
				return false;
			}

			await this.ensureScaleBarcodeSettings();
			this.logDebug("generateScaleBarcodeForItem:settings", {
				settings: this.getScaleSettingsSnapshot(),
			});
			if (!this.isScaleSettingsConfigured()) {
				item.scale_grams = normalizedGrams;
				item._scale_qty = Number((normalizedGrams / 1000).toFixed(3));
				if (!silent) {
					this.toastStore.show({
						title: __(
							"Scale barcode settings are not configured. Using item barcode only.",
						),
						color: "warning",
					});
				}
				this.logDebug("generateScaleBarcodeForItem:fallback-no-settings", {
					item_code: item?.item_code,
					uom: item?.uom,
					grams: normalizedGrams,
					barcode: item?.barcode || "",
				});
				return true;
			}

			const templateBarcode = this.getScaleTemplateBarcode(item);
			this.logDebug("generateScaleBarcodeForItem:template", {
				item_code: item?.item_code,
				uom: item?.uom,
				template_barcode: templateBarcode || "",
			});

			try {
				const res = await frappe.call({
					method: "posawesome.posawesome.api.items.build_scale_barcode",
					args: {
						barcode_template: templateBarcode,
						item_code: item.item_code,
						uom: item.uom,
						weight_grams: normalizedGrams,
						price: this.includePrice ? item.price : null,
					},
				});
				const generated = res && res.message ? res.message : null;
				this.logDebug("generateScaleBarcodeForItem:api-response", {
					item_code: item?.item_code,
					uom: item?.uom,
					grams: normalizedGrams,
					generated,
				});
				if (generated && generated.warning) {
					item.scale_grams = normalizedGrams;
					item._scale_qty = Number((normalizedGrams / 1000).toFixed(3));
					if (!silent) {
						this.toastStore.show({
							title: __(
								"Scale template barcode is missing for this item/UOM. Using item barcode only.",
							),
							color: "warning",
						});
					}
					this.logDebug("generateScaleBarcodeForItem:fallback-warning", {
						item_code: item?.item_code,
						uom: item?.uom,
						grams: normalizedGrams,
						warning: generated.warning,
						barcode: item?.barcode || "",
					});
					return true;
				}
				if (!generated || !generated.barcode) {
					if (!silent) {
						this.toastStore.show({
							title: __("Unable to generate scale barcode"),
							color: "warning",
						});
					}
					return false;
				}
				item._is_scale_barcode = true;
				item._scale_template_barcode = templateBarcode || generated.barcode;
				item._scanned_barcode = generated.barcode;
				item._scale_qty = Number(generated.qty || normalizedGrams / 1000);
				item.scale_grams = normalizedGrams;
				item.barcode = String(generated.barcode);
				this.logDebug("generateScaleBarcodeForItem:success", {
					item_code: item?.item_code,
					uom: item?.uom,
					grams: normalizedGrams,
					barcode: item?.barcode || "",
					scale_qty: item?._scale_qty,
				});
				return true;
			} catch (error) {
				console.warn("Scale barcode generation failed", error);
				item.scale_grams = normalizedGrams;
				item._scale_qty = Number((normalizedGrams / 1000).toFixed(3));
				if (!silent) {
					this.toastStore.show({
						title: __("Failed to generate scale barcode. Using item barcode only."),
						color: "warning",
					});
				}
				this.logDebug("generateScaleBarcodeForItem:error-fallback", {
					item_code: item?.item_code,
					uom: item?.uom,
					grams: normalizedGrams,
					error: String(error?.message || error || ""),
					barcode: item?.barcode || "",
				});
				return true;
			}
		},
		onPendingScaleGramsInput() {
			this.logDebug("onPendingScaleGramsInput", {
				pending_grams: this.pendingScaleGrams,
			});
			if (this.pendingScaleBarcodeTimer) {
				clearTimeout(this.pendingScaleBarcodeTimer);
			}
			this.pendingScaleBarcodeTimer = setTimeout(() => {
				this.syncPendingScaleBarcode(true);
			}, 250);
		},
		async syncPendingScaleBarcode(silent = false) {
			this.logDebug("syncPendingScaleBarcode:start", {
				silent,
				has_pending_item: Boolean(this.pendingAddItem),
				pending_grams: this.pendingScaleGrams,
			});
			if (!this.pendingAddItem || !this.shouldShowScaleGramsInput(this.pendingAddItem)) {
				this.logDebug("syncPendingScaleBarcode:skip", {
					reason: "no-pending-item-or-not-scale-uom",
				});
				return false;
			}
			const grams = this.normalizeScaleGrams(this.pendingScaleGrams);
			if (!grams) {
				this.logDebug("syncPendingScaleBarcode:invalid-grams", {
					pending_grams: this.pendingScaleGrams,
				});
				return false;
			}
			this.pendingScaleGrams = grams;
			const result = await this.generateScaleBarcodeForItem(this.pendingAddItem, grams, { silent });
			this.logDebug("syncPendingScaleBarcode:done", {
				result,
				grams,
				barcode: this.pendingAddItem?.barcode || "",
			});
			return result;
		},
		async onItemScaleGramsChange(item) {
			this.logDebug("onItemScaleGramsChange:start", {
				item_code: item?.item_code,
				uom: item?.uom,
				scale_grams: item?.scale_grams,
			});
			if (!this.shouldShowScaleGramsInput(item)) return;
			const grams = this.normalizeScaleGrams(item.scale_grams);
			if (!grams) {
				this.toastStore.show({
					title: __("Enter a valid grams value"),
					color: "warning",
				});
				return;
			}
			await this.generateScaleBarcodeForItem(item, grams);
			this.logDebug("onItemScaleGramsChange:done", {
				item_code: item?.item_code,
				uom: item?.uom,
				scale_grams: item?.scale_grams,
				barcode: item?.barcode || "",
			});
		},
		closeAddItemDialog() {
			this.logDebug("closeAddItemDialog", {
				had_pending_item: Boolean(this.pendingAddItem),
				pending_item_code: this.pendingAddItem?.item_code || "",
			});
			if (this.pendingScaleBarcodeTimer) {
				clearTimeout(this.pendingScaleBarcodeTimer);
				this.pendingScaleBarcodeTimer = null;
			}
			this.addItemDialog = false;
			this.pendingAddItem = null;
			this.pendingScaleGrams = null;
			this.addItemQty = 1;
		},
		isScaleBarcodePayload(item) {
			if (!item || typeof item !== "object") return false;
			return Boolean(
				item._is_scale_barcode ||
					item._scanned_scale_barcode ||
					item._scale_qty ||
					item._scale_price ||
					(item._barcode_qty && item._scanned_barcode),
			);
		},
		extractScaleScannedBarcode(item) {
			if (!this.isScaleBarcodePayload(item)) return "";
			const scanned =
				item._scanned_scale_barcode || item._scanned_barcode || item.barcode || "";
			return String(scanned || "").trim();
		},
		getPrintableItems({ notify = true } = {}) {
			const itemsToPrint = this.items.filter((item) => String(item?.barcode || "").trim());
			this.logDebug("getPrintableItems", {
				notify,
				total_items: this.items.length,
				printable_items: itemsToPrint.length,
			});
			if (!notify) {
				return itemsToPrint;
			}

			if (itemsToPrint.length === 0) {
				this.toastStore.show({
					title: __("No items with barcodes to print"),
					color: "error",
				});
			} else if (itemsToPrint.length < this.items.length) {
				this.toastStore.show({
					title: __("Skipping items without barcodes"),
					color: "warning",
				});
			}
			return itemsToPrint;
		},
		addOrMergePrintableItem(item, qty, logPrefix = "addOrMergePrintableItem") {
			if (!item) return null;
			const normalizedQty = this.normalizeLabelQty(qty);
			const normalizedBarcode = String(item.barcode || "").trim();
			const existingItem = this.items.find(
				(i) =>
					i.item_code === item.item_code &&
					(i.uom || "") === (item.uom || "") &&
					String(i.barcode || "").trim() === normalizedBarcode,
			);

			if (existingItem) {
				existingItem.qty += normalizedQty;
				this.logDebug(`${logPrefix}:merged-existing`, {
					item_code: existingItem?.item_code || "",
					uom: existingItem?.uom || "",
					barcode: existingItem?.barcode || "",
					new_qty: existingItem?.qty,
				});
				return existingItem;
			}

			const itemToAdd = { ...item, qty: normalizedQty };
			this.items.unshift(itemToAdd);
			this.logDebug(`${logPrefix}:added-new`, {
				item_code: itemToAdd?.item_code || "",
				uom: itemToAdd?.uom || "",
				barcode: itemToAdd?.barcode || "",
				qty: itemToAdd?.qty,
				is_scale: Boolean(itemToAdd?._is_scale_barcode),
				scale_grams: itemToAdd?.scale_grams || null,
			});
			return itemToAdd;
		},
		async onAddItem(item) {
			this.logDebug("onAddItem:start", {
				item_code: item?.item_code || "",
				item_name: item?.item_name || "",
				uom: item?.uom || item?.stock_uom || "",
				barcode: item?.barcode || "",
			});
			if (!item) return;

			// Resolve POS Profile
			const profile =
				this.pos_profile && this.pos_profile.name
					? this.pos_profile
					: this.itemsStore && this.itemsStore.posProfile
						? this.itemsStore.posProfile
						: {};
			await this.ensureScaleBarcodeSettings();
			this.logDebug("onAddItem:settings", {
				settings: this.getScaleSettingsSnapshot(),
			});

			// 1. Try to find barcode in the passed item object
			const scannedScaleBarcode = this.extractScaleScannedBarcode(item);
			let barcode = scannedScaleBarcode || item.barcode;
			let itemBarcodes = Array.isArray(item.item_barcode) ? item.item_barcode : [];
			let itemUoms = Array.isArray(item.item_uoms) ? item.item_uoms : [];
			if (!itemUoms.length && itemBarcodes.length > 0) {
				const barcodeUoms = itemBarcodes
					.map((row) => row?.posa_uom || row?.uom)
					.filter(Boolean)
					.map((uom) => ({ uom }));
				itemUoms = barcodeUoms;
			}
			let defaultUom = item.uom || item.stock_uom || itemUoms?.[0]?.uom || "";

			// 2. Resolve barcode from item_barcode/UOM mapping when available
			if (!scannedScaleBarcode && itemBarcodes.length > 0) {
				const resolved = this.resolveBarcodeForUom({ item_barcode: itemBarcodes, barcode }, defaultUom);
				if (resolved) {
					barcode = resolved;
				}
			}

			// 3. Check barcodes array (if flattened)
			if (!barcode && Array.isArray(item.barcodes) && item.barcodes.length > 0) {
				barcode = item.barcodes[0];
			}

			// 4. If still not found, fetch details from server
			if (!barcode) {
				try {
					if (profile.name) {
						const res = await frappe.call({
							method: "posawesome.posawesome.api.items.get_items_details",
							args: {
								items_data: JSON.stringify([{ item_code: item.item_code }]),
								pos_profile: JSON.stringify(profile),
								price_list: profile.selling_price_list || "",
							},
							silent: true,
						});

						const details = res.message && res.message[0];
						if (details) {
							itemBarcodes = Array.isArray(details.item_barcode) ? details.item_barcode : itemBarcodes;
							itemUoms = Array.isArray(details.item_uoms) ? details.item_uoms : itemUoms;
							if (!itemUoms.length && itemBarcodes.length > 0) {
								const barcodeUoms = itemBarcodes
									.map((row) => row?.posa_uom || row?.uom)
									.filter(Boolean)
									.map((uom) => ({ uom }));
								itemUoms = barcodeUoms;
							}
							defaultUom =
								details.uom || item.uom || item.stock_uom || itemUoms?.[0]?.uom || defaultUom;
							if (!scannedScaleBarcode && itemBarcodes.length > 0) {
								const resolved = this.resolveBarcodeForUom(
									{ item_barcode: itemBarcodes, barcode: details.barcode || barcode },
									defaultUom,
								);
								if (resolved) {
									barcode = resolved;
								}
							} else if (details.barcode) {
								barcode = details.barcode;
							} else if (Array.isArray(details.barcodes) && details.barcodes.length > 0) {
								barcode = details.barcodes[0];
							}
						}
					}
				} catch (e) {
					console.warn("Failed to fetch item details for barcode", e);
				}
			}

			if (!barcode && scannedScaleBarcode) {
				barcode = scannedScaleBarcode;
			}

			if (!barcode) {
				this.toastStore.show({
					title: __("Item '{0}' has no barcode", [item.item_name]),
					color: "warning",
				});
				this.logDebug("onAddItem:abort-no-barcode", {
					item_code: item?.item_code || "",
					uom: defaultUom,
				});
				return;
			}

			// Open Quantity Dialog before adding
			if (!defaultUom && itemUoms.length > 0) {
				defaultUom = itemUoms[0].uom;
			}

			const scaleTemplateFromRows = Array.isArray(itemBarcodes)
				? (() => {
						const currentUom = String(defaultUom || "").trim();
						const scopedRows = currentUom
							? itemBarcodes.filter(
									(row) =>
										String(row?.posa_uom || row?.uom || "").trim() === currentUom,
								)
							: itemBarcodes;
						const matched =
							scopedRows.find((row) => this.isPotentialScaleTemplate(row?.barcode)) ||
							itemBarcodes.find((row) => this.isPotentialScaleTemplate(row?.barcode));
						return String((matched && matched.barcode) || "").trim();
					})()
				: "";

			const isScaleBarcode =
				this.isScaleBarcodePayload(item) ||
				this.isLikelyWeightUom(defaultUom) ||
				this.isPotentialScaleTemplate(scannedScaleBarcode || scaleTemplateFromRows || barcode);
			const initialLabelQty = isScaleBarcode ? 1 : this.normalizeLabelQty(item.qty);
			const initialScaleGrams = this.normalizeScaleGrams(
				item.scale_grams ||
					(item._scale_qty !== undefined && item._scale_qty !== null
						? Number(item._scale_qty) * 1000
						: null),
			);

			const preparedItem = {
				_row_id: this.nextRowId++,
				item_code: item.item_code,
				item_name: item.item_name,
				barcode: String(barcode || "").trim(),
				qty: initialLabelQty,
				price: item.rate || item.standard_rate || 0,
				item_barcode: itemBarcodes,
				item_uoms: itemUoms,
				uom: defaultUom || "",
				_is_scale_barcode: isScaleBarcode,
				_scanned_barcode: scannedScaleBarcode,
				_scale_template_barcode:
					scannedScaleBarcode || scaleTemplateFromRows || String(barcode || "").trim(),
				scale_grams: initialScaleGrams,
			};

			const shouldAutoAddScannedScale = Boolean(scannedScaleBarcode && isScaleBarcode);
			if (shouldAutoAddScannedScale) {
				if (this.addItemDialog) {
					this.closeAddItemDialog();
				}
				this.addOrMergePrintableItem(preparedItem, initialLabelQty, "onAddItem:auto-scale");
				this.logDebug("onAddItem:done-auto-scale", {
					item_code: preparedItem?.item_code || "",
					uom: preparedItem?.uom || "",
					barcode: preparedItem?.barcode || "",
					label_qty: initialLabelQty,
				});
				return;
			}

			this.pendingAddItem = preparedItem;
			this.addItemQty = initialLabelQty;
			this.pendingScaleGrams =
				initialScaleGrams || (isScaleBarcode && this.isLikelyWeightUom(defaultUom) ? 1000 : null);
			this.addItemDialog = true;
			this.logDebug("onAddItem:pending-created", {
				item_code: this.pendingAddItem?.item_code || "",
				uom: this.pendingAddItem?.uom || "",
				is_scale: Boolean(this.pendingAddItem?._is_scale_barcode),
				barcode: this.pendingAddItem?.barcode || "",
				pending_scale_grams: this.pendingScaleGrams,
				label_qty: this.addItemQty,
			});

			if (
				this.pendingAddItem &&
				this.pendingScaleGrams &&
				this.shouldShowScaleGramsInput(this.pendingAddItem)
			) {
				await this.syncPendingScaleBarcode(true);
			}
			this.logDebug("onAddItem:done", {
				pending_barcode: this.pendingAddItem?.barcode || "",
				pending_scale_grams: this.pendingScaleGrams,
			});
		},
		async confirmAddItem() {
			this.logDebug("confirmAddItem:start", {
				has_pending_item: Boolean(this.pendingAddItem),
				label_qty: this.addItemQty,
				pending_scale_grams: this.pendingScaleGrams,
			});
			if (!this.pendingAddItem) return;

			const item = this.pendingAddItem;
			if (this.shouldShowScaleGramsInput(item)) {
				const grams = this.normalizeScaleGrams(this.pendingScaleGrams);
				if (!grams) {
					this.toastStore.show({
						title: __("Enter valid grams for scale barcode"),
						color: "warning",
					});
					return;
				}
				const generated = await this.generateScaleBarcodeForItem(item, grams);
				if (!generated) {
					this.logDebug("confirmAddItem:abort-scale-generate-failed", {
						item_code: item?.item_code || "",
						uom: item?.uom || "",
						pending_scale_grams: this.pendingScaleGrams,
					});
					return;
				}
			}

			const qty = this.normalizeLabelQty(this.addItemQty);
			this.addOrMergePrintableItem(item, qty, "confirmAddItem");

			this.closeAddItemDialog();
		},
		async onPendingUomChange() {
			this.logDebug("onPendingUomChange:start", {
				pending_item_code: this.pendingAddItem?.item_code || "",
				uom: this.pendingAddItem?.uom || "",
			});
			if (!this.pendingAddItem) return;
			await this.onItemUomChange(this.pendingAddItem);
			if (this.shouldShowScaleGramsInput(this.pendingAddItem)) {
				if (!this.pendingScaleGrams) {
					this.pendingScaleGrams =
						this.normalizeScaleGrams(this.pendingAddItem.scale_grams) || 1000;
				}
				await this.syncPendingScaleBarcode(true);
			}
			this.logDebug("onPendingUomChange:done", {
				pending_item_code: this.pendingAddItem?.item_code || "",
				uom: this.pendingAddItem?.uom || "",
				barcode: this.pendingAddItem?.barcode || "",
				pending_scale_grams: this.pendingScaleGrams,
			});
		},
		removeItem(item) {
			this.logDebug("removeItem", {
				item_code: item?.item_code || "",
				uom: item?.uom || "",
				barcode: item?.barcode || "",
				row_id: item?._row_id,
			});
			if (item && item._row_id != null) {
				this.items = this.items.filter((i) => i._row_id !== item._row_id);
				return;
			}
			// Fallback for legacy rows without _row_id
			this.items = this.items.filter((i) => i.item_code !== item.item_code);
		},
		getItemUomOptions(item) {
			const options = Array.isArray(item.item_uoms)
				? item.item_uoms.map((row) => row?.uom).filter(Boolean)
				: [];
			if (!options.length && Array.isArray(item.item_barcode)) {
				item.item_barcode.forEach((row) => {
					const uom = row?.posa_uom || row?.uom;
					if (uom) options.push(uom);
				});
			}
			if (item.uom && !options.includes(item.uom)) {
				options.unshift(item.uom);
			}
			return Array.from(new Set(options));
		},
		resolveBarcodeForUom(item, uom) {
			const barcodeRows = Array.isArray(item.item_barcode) ? item.item_barcode : [];
			if (uom && barcodeRows.length > 0) {
				const matched = barcodeRows.find(
					(row) => row?.barcode && (row.posa_uom || row.uom) === uom,
				);
				if (matched?.barcode) return matched.barcode;
			}
			if (item.barcode) return item.barcode;
			if (barcodeRows.length > 0 && barcodeRows[0]?.barcode) return barcodeRows[0].barcode;
			if (Array.isArray(item.barcodes) && item.barcodes.length > 0) return item.barcodes[0];
			return "";
		},
		async onItemUomChange(item) {
			this.logDebug("onItemUomChange:start", {
				item_code: item?.item_code || "",
				uom: item?.uom || "",
				barcode: item?.barcode || "",
				scale_grams: item?.scale_grams || null,
			});
			if (this.shouldShowScaleGramsInput(item)) {
				const grams = this.normalizeScaleGrams(item.scale_grams) || 1000;
				item.scale_grams = grams;
				await this.generateScaleBarcodeForItem(item, grams, { silent: true });
				this.logDebug("onItemUomChange:scale-uom-updated", {
					item_code: item?.item_code || "",
					uom: item?.uom || "",
					barcode: item?.barcode || "",
					scale_grams: item?.scale_grams || null,
				});
				return;
			}

			if (item._is_scale_barcode && item._scanned_barcode) {
				item.barcode = String(item._scanned_barcode);
				return;
			}

			const nextBarcode = this.resolveBarcodeForUom(item, item.uom);
			if (nextBarcode) {
				item.barcode = nextBarcode;
				this.logDebug("onItemUomChange:barcode-updated", {
					item_code: item?.item_code || "",
					uom: item?.uom || "",
					barcode: item?.barcode || "",
				});
				return;
			}

			const hasAnyBarcodes = Array.isArray(item.item_barcode) && item.item_barcode.length > 0;
			if (hasAnyBarcodes) {
				this.toastStore.show({
					title: __("No barcode found for UOM '{0}'", [item.uom]),
					color: "warning",
				});
			}
			this.logDebug("onItemUomChange:done", {
				item_code: item?.item_code || "",
				uom: item?.uom || "",
				barcode: item?.barcode || "",
			});
		},
		clearAll() {
			this.logDebug("clearAll", { count_before: this.items.length });
			this.items = [];
		},
		incrementQty(item) {
			item.qty++;
			this.logDebug("incrementQty", {
				item_code: item?.item_code || "",
				uom: item?.uom || "",
				barcode: item?.barcode || "",
				qty: item?.qty,
			});
		},
		decrementQty(item) {
			if (item.qty > 1) {
				item.qty--;
			}
			this.logDebug("decrementQty", {
				item_code: item?.item_code || "",
				uom: item?.uom || "",
				barcode: item?.barcode || "",
				qty: item?.qty,
			});
		},
		getPrintWindowContent() {
			const style = this.getPrintStyles();
			const content = this.generatePrintContent(this.getPrintableItems({ notify: false }));
			this.logDebug("getPrintWindowContent", {
				style_length: style?.length || 0,
				content_length: content?.length || 0,
				settings: this.getScaleSettingsSnapshot(),
			});
			return { style, content };
		},
		printLabels() {
			this.logDebug("printLabels:start", {
				items_count: this.items.length,
				settings: this.getScaleSettingsSnapshot(),
			});
			if (!this.items.length) return;

			const itemsToPrint = this.getPrintableItems();
			if (!itemsToPrint.length) {
				this.logDebug("printLabels:abort-no-printable-items", {
					items_count: this.items.length,
				});
				return;
			}

			const printWindow = window.open("", "_blank");
			if (!printWindow) {
				this.toastStore.show({
					title: __("Popup blocked. Please allow popups."),
					color: "error",
				});
				return;
			}

			const style = this.getPrintStyles();
			const content = this.generatePrintContent(itemsToPrint);
			this.logDebug("printLabels:render", {
				items_to_print: itemsToPrint.length,
				style_length: style?.length || 0,
				content_length: content?.length || 0,
			});

			printWindow.document.write(`
        <html>
          <head>
            <title>Print Barcodes</title>
            <style>
              ${style}
            </style>
          </head>
          <body>
            ${content}
				<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"></${"script"}>
            <script>
              window.onload = function() {
                JsBarcode(".barcode").init();
                setTimeout(() => {
                    window.print();
                    window.close();
                }, 500);
              }
				</${"script"}>
          </body>
        </html>
      `);
			printWindow.document.close();
			this.logDebug("printLabels:window-ready", {
				items_to_print: itemsToPrint.length,
			});
		},
		downloadPdf() {
			this.logDebug("downloadPdf:start", {
				items_count: this.items.length,
				settings: this.getScaleSettingsSnapshot(),
			});
			if (!this.items.length) return;

			const itemsToPrint = this.getPrintableItems();
			if (!itemsToPrint.length) {
				this.logDebug("downloadPdf:abort-no-printable-items", {
					items_count: this.items.length,
				});
				return;
			}

			const printWindow = window.open("", "_blank");
			if (!printWindow) {
				this.toastStore.show({
					title: __("Popup blocked. Please allow popups."),
					color: "error",
				});
				return;
			}

			const style = this.getPrintStyles();
			const content = this.generatePrintContent(itemsToPrint);
			const size = this.parseLabelSize();
			const isA4 = size.type === "A4";

			// Determine PDF format settings
			let pdfFormat = "a4";
			let pdfUnit = "mm";
			let orientation = "portrait";

			if (!isA4) {
				pdfFormat = [size.width, size.height];
			}

			const jsPdfOptions = {
				unit: pdfUnit,
				format: pdfFormat,
				orientation: orientation,
			};
			this.logDebug("downloadPdf:render", {
				items_to_print: itemsToPrint.length,
				jsPdfOptions,
				style_length: style?.length || 0,
				content_length: content?.length || 0,
			});

			printWindow.document.write(`
        <html>
          <head>
            <title>Download PDF</title>
            <style>
			              ${style}
			              /* Adjustments for PDF generation if needed */
			            </style>
				<script src="/assets/posawesome/dist/js/libs/html2pdf.bundle.min.js"></${"script"}>
				<script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"></${"script"}>
          </head>
          <body>
            <div id="print-content">
                ${content}
            </div>
            <script>
              window.onload = function() {
                JsBarcode(".barcode").init();
                
                setTimeout(() => {
                    const element = document.getElementById('print-content');
                    const opt = {
                      margin:       0,
                      filename:     'barcodes.pdf',
                      image:        { type: 'jpeg', quality: 0.98 },
                      html2canvas:  { scale: 2, useCORS: true },
                      jsPDF:        ${JSON.stringify(jsPdfOptions)}
                    };

                    html2pdf().set(opt).from(element).save().then(() => {
                        // Optional: close window after download
                        // window.close();
                    });
                }, 800);
              }
				</${"script"}>
          </body>
        </html>
      `);
			printWindow.document.close();
			this.logDebug("downloadPdf:window-ready", {
				items_to_print: itemsToPrint.length,
			});
		},
		getPrintStyles() {
			const size = this.parseLabelSize();
			this.logDebug("getPrintStyles", { size });
			if (size.type === "A4") {
				const { cols, rows } = size;
				// Calculate approximate height based on A4 height (297mm) and margins
				// A4 = 210mm x 297mm
				// Default margins 10mm top/bottom
				const availableHeight = 277; // 297 - 20
				// Subtract total vertical gap space (assuming 3mm per gap)
				const totalGapSpace = (rows - 1) * 3;
				const rowHeight = Math.floor((availableHeight - totalGapSpace) / rows);

				return `
          @page { size: A4; margin: 10mm; }
          body { font-family: sans-serif; margin: 0; padding: 0; }
          .label-container {
            display: grid;
            grid-template-columns: repeat(${cols}, 1fr);
            gap: 3mm;
            page-break-after: always;
          }
          .label {
            border: 1px dashed #ccc;
            padding: 5px;
            text-align: center;
            height: ${rowHeight}mm;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            page-break-inside: avoid;
            box-sizing: border-box;
            overflow: hidden;
          }
          .item-name { 
              font-size: 11px; 
              font-weight: bold; 
              overflow: hidden; 
              white-space: nowrap; 
              text-overflow: ellipsis; 
              max-width: 95%;
              margin-bottom: 2px;
          }
          .barcode-container { margin: 2px 0; width: 100%; display: flex; justify-content: center; flex-grow: 1; align-items: center; overflow: hidden; }
          .barcode-text { font-size: 10px; }
          .price { font-size: 11px; font-weight: bold; margin-top: 2px; }
          .batch-serial { font-size: 9px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95%; }
          img.barcode { max-width: 95%; height: auto; max-height: 100%; object-fit: contain; }
        `;
			} else {
				// Thermal printer styles
				return `
          @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
          body { font-family: sans-serif; margin: 0; padding: 0; width: ${size.width}mm; height: ${size.height}mm; overflow: hidden; }
          .label {
            width: ${size.width}mm;
            height: ${size.height}mm;
            text-align: center;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            page-break-after: always;
            overflow: hidden;
            box-sizing: border-box;
            padding: 1mm;
          }
          .item-name { 
              font-size: 11px; 
              font-weight: bold; 
              white-space: nowrap; 
              overflow: hidden; 
              text-overflow: ellipsis; 
              max-width: 95%; 
              line-height: 1.2; 
              margin-bottom: 2px;
          }
          .barcode-container { 
              flex-grow: 1; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              width: 100%; 
              overflow: hidden; 
              padding: 2px 0;
          }
          .price { 
              font-size: 11px; 
              font-weight: bold; 
              line-height: 1.2; 
              margin-top: 2px;
          }
          .batch-serial { font-size: 9px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95%; }
          img.barcode { 
              max-width: 95%; 
              height: auto; 
              max-height: 100%;
              object-fit: contain; 
          }
        `;
			}
		},
		generatePrintContent(items) {
			this.logDebug("generatePrintContent:start", {
				items_count: Array.isArray(items) ? items.length : 0,
			});
			let html = "";
			const size = this.parseLabelSize();
			if (size.type === "A4") {
				html += '<div class="label-container">';
			}

			items.forEach((item) => {
				const labelsCount = this.normalizeLabelQty(item.qty);
				const safeItemName = this.escapeHtml(item.item_name || item.item_code || "");
				const safeBarcode = this.escapeHtml(item.barcode || "");
				for (let i = 0; i < labelsCount; i++) {
					let batchSerialHtml = "";
					if (this.includeBatchSerial) {
						let text = "";
						if (item.batch_no) text += `Batch: ${item.batch_no} `;
						if (item.serial_no) text += `Serial: ${item.serial_no}`;
						// Check array data if flat fields are empty
						if (!text) {
							if (item.batch_no_data && item.batch_no_data.length)
								text += `Batch: ${item.batch_no_data[0].batch_no} `;
							if (item.serial_no_data && item.serial_no_data.length)
								text += `Serial: ${item.serial_no_data[0].serial_no}`;
						}
						if (text.trim()) {
							batchSerialHtml = `<div class="batch-serial">${this.escapeHtml(text.trim())}</div>`;
						}
					}

					let priceHtml = "";
					if (this.includePrice) {
						priceHtml = `<div class="price">Price: ${this.escapeHtml(this.formatCurrency(item.price))}</div>`;
					}

					html += `
            <div class="label">
              <div class="item-name">${safeItemName}</div>
              <div class="barcode-container">
                 <img class="barcode"
                      jsbarcode-format="auto"
                      jsbarcode-value="${safeBarcode}"
                      jsbarcode-textmargin="0"
                      jsbarcode-fontoptions="bold"
                      jsbarcode-height="40"
                      jsbarcode-width="1.5"
                      jsbarcode-displayValue="true"
                      jsbarcode-fontSize="12">
              </div>
              ${batchSerialHtml}
              ${priceHtml}
            </div>
          `;
				}
			});

			if (size.type === "A4") {
				html += "</div>";
			}
			this.logDebug("generatePrintContent:done", {
				items_count: Array.isArray(items) ? items.length : 0,
				html_length: html.length,
			});
			return html;
		},
		formatCurrency(value) {
			if (this.pos_profile?.currency) {
				return value + " " + this.pos_profile.currency;
			}
			return value;
		},
		openQtyEdit(item) {
			this.logDebug("openQtyEdit", {
				item_code: item?.item_code || "",
				row_id: item?._row_id,
				current_qty: item?.qty,
			});
			// Reset other items editing state if any
			this.items.forEach((i) => (i._editingQty = false));

			item._editingQty = true;
			this.editingQtyValue = ""; // Clear value on open
			this.$nextTick(() => {
				const input = document.getElementById("qty-input-" + item._row_id);
				if (input) input.focus();
			});
		},
		closeQtyEdit(item) {
			this.logDebug("closeQtyEdit:start", {
				item_code: item?.item_code || "",
				row_id: item?._row_id,
				editing_value: this.editingQtyValue,
			});
			if (item._editingQty) {
				if (this.editingQtyValue !== "" && this.editingQtyValue != null) {
					item.qty = this.normalizeLabelQty(this.editingQtyValue);
				}
				item._editingQty = false;
				this.editingQtyValue = "";
			}
			this.logDebug("closeQtyEdit:done", {
				item_code: item?.item_code || "",
				row_id: item?._row_id,
				qty: item?.qty,
			});
		},
	},
	created() {
		this.logDebug("created", {
			settings_loaded: this.scaleBarcodeSettingsLoaded,
		});
		this.$watch(
			() => this.uiStore.posProfile,
			(profile) => {
				if (profile) this.pos_profile = profile || {};
				this.logDebug("posProfile:watch", {
					profile_name: profile?.name || "",
					currency: profile?.currency || "",
				});
			},
			{ deep: true, immediate: true },
		);
		this.ensureScaleBarcodeSettings();
		/*
		this.eventBus.on("register_pos_profile", (data) => {
			this.pos_profile = data.pos_profile || {};
		});
		*/
	},
	beforeUnmount() {
		this.logDebug("beforeUnmount", {
			pending_item_code: this.pendingAddItem?.item_code || "",
			items_count: this.items.length,
		});
		if (this.pendingScaleBarcodeTimer) {
			clearTimeout(this.pendingScaleBarcodeTimer);
			this.pendingScaleBarcodeTimer = null;
		}
		// this.eventBus.off("register_pos_profile");
	},
};
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
