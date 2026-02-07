<template>
	<div class="pa-0 h-100">
		<v-row class="h-100 ma-0">
			<!-- Left Column: Item Selector -->
			<v-col cols="12" md="5" class="h-100 pa-0 border-e d-flex flex-column">
				<div class="px-2 pt-2">
					<v-switch
						v-model="showOnlyBarcodeItems"
						:label="__('Show only items with barcode')"
						density="compact"
						color="primary"
						hide-details
						class="mb-2"
					></v-switch>
				</div>
				<ItemsSelector
					context="barcode"
					:showOnlyBarcodeItems="showOnlyBarcodeItems"
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
							<template v-slot:item.qty="{ item }">
								<div class="pos-table__qty-counter">
									<v-btn
										size="small"
										variant="flat"
										class="pos-table__qty-btn pos-table__qty-btn--minus minus-btn qty-control-btn"
										@click="decrementQty(item)"
									>
										<v-icon size="small">mdi-minus</v-icon>
									</v-btn>
									<div
										v-if="!item._editingQty"
										class="pos-table__qty-display amount-value"
										@click="openQtyEdit(item)"
										tabindex="0"
										role="button"
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
										:id="'qty-input-' + item.item_code"
										:autofocus="true"
										type="number"
										hide-details
									></v-text-field>
									<v-btn
										size="small"
										variant="flat"
										class="pos-table__qty-btn pos-table__qty-btn--plus plus-btn qty-control-btn"
										@click="incrementQty(item)"
									>
										<v-icon size="small">mdi-plus</v-icon>
									</v-btn>
								</div>
							</template>
							<template v-slot:item.barcode="{ item }">
								<div v-if="item.barcode">{{ item.barcode }}</div>
								<div v-else class="text-error text-caption">{{ __("No Barcode") }}</div>
							</template>
							<template v-slot:item.actions="{ item }">
								<v-btn
									icon="mdi-delete"
									size="small"
									variant="text"
									color="error"
									@click="removeItem(item)"
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
					<v-text-field
						v-model.number="addItemQty"
						:label="__('Quantity')"
						type="number"
						min="1"
						variant="outlined"
						autofocus
						@keydown.enter="confirmAddItem"
					></v-text-field>
				</v-card-text>
				<v-card-actions class="justify-end">
					<v-btn variant="text" @click="addItemDialog = false">{{ __("Cancel") }}</v-btn>
					<v-btn color="primary" variant="elevated" @click="confirmAddItem">{{ __("Add") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script>
import ItemsSelector from "./ItemsSelector.vue";
import { useItemsStore } from "../../stores/itemsStore";
import { useToastStore } from "../../stores/toastStore";
import { mapStores } from "pinia";
import format from "../../format";
import { useUIStore } from "../../stores/uiStore.js";

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
			pageFormat: "A4",
			pageFormatOptions: ["A4"],
			gridCols: 3,
			gridRows: 7,
			showOnlyBarcodeItems: false,
			includePrice: true,
			includeBatchSerial: false,
			editingQtyValue: "",
			pos_profile: null,
			addItemDialog: false,
			addItemQty: 1,
			pendingAddItem: null,
		};
	},
	computed: {
		...mapStores(useItemsStore),
		headers() {
			return [
				{ title: __("Item Code"), key: "item_code", width: "20%" },
				{ title: __("Item Name"), key: "item_name", width: "30%" },
				{ title: __("Barcode"), key: "barcode", width: "20%" },
				{ title: __("Quantity"), key: "qty", align: "center", width: "20%" },
				{ title: "", key: "actions", align: "center", sortable: false, width: "10%" },
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
		async onAddItem(item) {
			if (!item) return;

			// Resolve POS Profile
			const profile =
				this.pos_profile && this.pos_profile.name
					? this.pos_profile
					: this.itemsStore && this.itemsStore.posProfile
						? this.itemsStore.posProfile
						: {};

			// Check if item already exists
			const existingItem = this.items.find((i) => i.item_code === item.item_code);
			if (existingItem) {
				existingItem.qty += 1;
				return;
			}

			// 1. Try to find barcode in the passed item object
			let barcode = item.barcode;

			// 2. Check item_barcode child table (array of objects)
			if (!barcode && Array.isArray(item.item_barcode) && item.item_barcode.length > 0) {
				barcode = item.item_barcode[0].barcode;
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
							if (details.barcode) {
								barcode = details.barcode;
							} else if (
								Array.isArray(details.item_barcode) &&
								details.item_barcode.length > 0
							) {
								barcode = details.item_barcode[0].barcode;
							} else if (Array.isArray(details.barcodes) && details.barcodes.length > 0) {
								barcode = details.barcodes[0];
							}
						}
					}
				} catch (e) {
					console.warn("Failed to fetch item details for barcode", e);
				}
			}

			if (!barcode) {
				this.toastStore.show({
					title: __("Item '{0}' has no barcode", [item.item_name]),
					color: "warning",
				});
			}

			// Open Quantity Dialog before adding
			this.pendingAddItem = {
				item_code: item.item_code,
				item_name: item.item_name,
				barcode: barcode || "",
				qty: 1,
				price: item.rate || item.standard_rate || 0,
			};
			this.addItemQty = ""; // Start empty
			this.addItemDialog = true;
		},
		confirmAddItem() {
			if (!this.pendingAddItem) return;

			const item = this.pendingAddItem;
			// If empty or invalid, default to 1
			const qty = parseInt(this.addItemQty) || 1;

			// Check if item already exists
			const existingItem = this.items.find((i) => i.item_code === item.item_code);
			if (existingItem) {
				existingItem.qty += qty;
				// Optional: Move to top if desired, but user only asked for new items to be at top
				// However, if we updated it, it might be nice to see it.
				// Let's keep existing logic: update in place.
			} else {
				item.qty = qty;
				this.items.unshift(item);
			}

			this.addItemDialog = false;
			this.pendingAddItem = null;
		},
		removeItem(item) {
			this.items = this.items.filter((i) => i.item_code !== item.item_code);
		},
		clearAll() {
			this.items = [];
		},
		incrementQty(item) {
			item.qty++;
		},
		decrementQty(item) {
			if (item.qty > 1) {
				item.qty--;
			}
		},
		getPrintWindowContent() {
			const style = this.getPrintStyles();
			const content = this.generatePrintContent(this.items.filter((item) => item.barcode));
			return { style, content };
		},
		printLabels() {
			if (!this.items.length) return;

			// Filter out items without barcodes
			const itemsToPrint = this.items.filter((item) => item.barcode);
			if (itemsToPrint.length === 0) {
				this.toastStore.show({
					title: __("No items with barcodes to print"),
					color: "error",
				});
				return;
			}

			if (itemsToPrint.length < this.items.length) {
				this.toastStore.show({
					title: __("Skipping items without barcodes"),
					color: "warning",
				});
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
            <script src="/assets/posawesome/dist/js/libs/JsBarcode.all.min.js"><\/script>
            <script>
              window.onload = function() {
                JsBarcode(".barcode").init();
                setTimeout(() => {
                    window.print();
                    window.close();
                }, 500);
              }
            <\/script>
          </body>
        </html>
      `);
			printWindow.document.close();
		},
		downloadPdf() {
			if (!this.items.length) return;

			const itemsToPrint = this.items.filter((item) => item.barcode);
			if (itemsToPrint.length === 0) {
				this.toastStore.show({
					title: __("No items with barcodes to print"),
					color: "error",
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

			printWindow.document.write(`
        <html>
          <head>
            <title>Download PDF</title>
            <style>
              ${style}
              /* Adjustments for PDF generation if needed */
            </style>
            <script src="/assets/posawesome/dist/js/libs/html2pdf.bundle.min.js"><\/script>
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"><\/script>
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
            <\/script>
          </body>
        </html>
      `);
			printWindow.document.close();
		},
		getPrintStyles() {
			const size = this.parseLabelSize();
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
			let html = "";
			const size = this.parseLabelSize();
			if (size.type === "A4") {
				html += '<div class="label-container">';
			}

			items.forEach((item) => {
				for (let i = 0; i < item.qty; i++) {
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
							batchSerialHtml = `<div class="batch-serial">${text.trim()}</div>`;
						}
					}

					let priceHtml = "";
					if (this.includePrice) {
						priceHtml = `<div class="price">Price: ${this.formatCurrency(item.price)}</div>`;
					}

					html += `
            <div class="label">
              <div class="item-name">${item.item_name}</div>
              <div class="barcode-container">
                 <img class="barcode"
                      jsbarcode-format="auto"
                      jsbarcode-value="${item.barcode}"
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
			return html;
		},
		formatCurrency(value) {
			if (this.pos_profile?.currency) {
				return value + " " + this.pos_profile.currency;
			}
			return value;
		},
		openQtyEdit(item) {
			// Reset other items editing state if any
			this.items.forEach((i) => (i._editingQty = false));

			item._editingQty = true;
			this.editingQtyValue = ""; // Clear value on open
			this.$nextTick(() => {
				const input = document.getElementById("qty-input-" + item.item_code);
				if (input) input.focus();
			});
		},
		closeQtyEdit(item) {
			if (item._editingQty) {
				if (this.editingQtyValue !== "" && this.editingQtyValue != null) {
					const newQty = parseFloat(this.editingQtyValue);
					if (newQty && newQty > 0) {
						item.qty = newQty;
					}
				}
				item._editingQty = false;
				this.editingQtyValue = "";
			}
		},
	},
	created() {
		this.$watch(
			() => this.uiStore.posProfile,
			(profile) => {
				if (profile) this.pos_profile = profile || {};
			},
			{ deep: true, immediate: true },
		);
		/*
		this.eventBus.on("register_pos_profile", (data) => {
			this.pos_profile = data.pos_profile || {};
		});
		*/
	},
	beforeUnmount() {
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
