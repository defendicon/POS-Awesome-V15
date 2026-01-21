<template>
	<div class="pa-0 h-100">
		<v-row class="h-100 ma-0">
			<!-- Left Column: Item Selector -->
			<v-col cols="12" md="5" class="h-100 pa-0 border-e">
				<ItemsSelector context="barcode" />
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
						<v-row dense class="mb-2">
							<v-col cols="12" md="6">
								<v-select
									v-model="labelSize"
									:items="labelSizeOptions"
									:label="__('Label Size')"
									density="compact"
									variant="outlined"
									hide-details
									class="pos-themed-input"
								></v-select>
							</v-col>
							<v-col cols="12" md="6" class="d-flex gap-2">
								<v-btn
									color="secondary"
									class="flex-grow-1 mr-1 h-100"
									@click="downloadPdf"
									:disabled="!items.length"
								>
									<v-icon left class="mr-2">mdi-file-pdf-box</v-icon>
									{{ __("PDF") }}
								</v-btn>
								<v-btn
									color="primary"
									class="flex-grow-1 ml-1 h-100"
									@click="printLabels"
									:disabled="!items.length"
								>
									<v-icon left class="mr-2">mdi-printer</v-icon>
									{{ __("Print") }}
								</v-btn>
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
								<div class="d-flex align-center justify-center">
									<v-btn
										size="x-small"
										variant="flat"
										icon="mdi-minus"
										class="mr-1"
										@click="decrementQty(item)"
									></v-btn>
									<v-text-field
										v-model.number="item.qty"
										type="number"
										min="1"
										density="compact"
										variant="outlined"
										hide-details
										class="qty-input centered-input"
										style="max-width: 60px"
									></v-text-field>
									<v-btn
										size="x-small"
										variant="flat"
										icon="mdi-plus"
										class="ml-1"
										@click="incrementQty(item)"
									></v-btn>
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
	</div>
</template>

<script>
/* global __ */
import ItemsSelector from "./ItemsSelector.vue";
import { useItemsStore } from "../../stores/itemsStore";
import { mapStores } from "pinia";

export default {
	name: "BarcodePrinting",
	components: { ItemsSelector },
	data() {
		return {
			items: [],
			labelSize: "38x25mm",
			labelSizeOptions: ["38x25mm", "50x30mm", "75x50mm", "A4 (3x7 labels)"],
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
			if (this.labelSize.startsWith("A4")) return { type: "A4" };
			const [width, height] = this.labelSize
				.replace("mm", "")
				.split("x")
				.map((d) => parseInt(d));
			return { type: "Thermal", width, height };
		},
		async onAddItem(item) {
			if (!item) return;

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
					const res = await frappe.call({
						method: "posawesome.posawesome.api.items.get_items_details",
						args: {
							items_data: JSON.stringify([{ item_code: item.item_code }]),
							pos_profile: JSON.stringify(this.pos_profile || {}),
							price_list: this.pos_profile?.selling_price_list || "",
						},
					});

					const details = res.message && res.message[0];
					if (details) {
						if (details.barcode) {
							barcode = details.barcode;
						} else if (Array.isArray(details.item_barcode) && details.item_barcode.length > 0) {
							barcode = details.item_barcode[0].barcode;
						} else if (Array.isArray(details.barcodes) && details.barcodes.length > 0) {
							barcode = details.barcodes[0];
						}
					}
				} catch (e) {
					console.warn("Failed to fetch item details for barcode", e);
				}
			}

			this.items.push({
				item_code: item.item_code,
				item_name: item.item_name,
				barcode: barcode || "",
				qty: 1,
				price: item.rate || item.standard_rate || 0,
			});
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
				this.eventBus.emit("show_message", {
					title: __("No items with barcodes to print"),
					color: "error",
				});
				return;
			}

			if (itemsToPrint.length < this.items.length) {
				this.eventBus.emit("show_message", {
					title: __("Skipping items without barcodes"),
					color: "warning",
				});
			}

			const printWindow = window.open("", "_blank");
			if (!printWindow) {
				this.eventBus.emit("show_message", {
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
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js"><\/script>
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
				this.eventBus.emit("show_message", {
					title: __("No items with barcodes to print"),
					color: "error",
				});
				return;
			}

			const printWindow = window.open("", "_blank");
			if (!printWindow) {
				this.eventBus.emit("show_message", {
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
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
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
				return `
          @page { size: A4; margin: 10mm; }
          body { font-family: sans-serif; margin: 0; padding: 0; }
          .label-container {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            page-break-after: always;
          }
          .label {
            border: 1px dashed #ccc;
            padding: 5px;
            text-align: center;
            height: 36mm; /* Approx height for 3x7 grid on A4 */
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            page-break-inside: avoid;
            box-sizing: border-box;
          }
          .item-name { font-size: 12px; font-weight: bold; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 100%; }
          .barcode-container { margin: 5px 0; width: 100%; display: flex; justify-content: center; }
          .barcode-text { font-size: 10px; }
          .price { font-size: 12px; font-weight: bold; }
          img.barcode { max-width: 100%; height: auto; max-height: 20mm; }
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
          .item-name { font-size: 11px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; line-height: 1.2; }
          .barcode-container { flex-grow: 1; display: flex; align-items: center; justify-content: center; width: 100%; overflow: hidden; }
          .price { font-size: 11px; font-weight: bold; line-height: 1.2; }
          img.barcode { max-width: 100%; height: auto; object-fit: contain; }
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
              <div class="price">${this.formatCurrency(item.price)}</div>
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
	},
	created() {
		this.eventBus.on("add_item", this.onAddItem);
		this.eventBus.on("register_pos_profile", (data) => {
			this.pos_profile = data.pos_profile || {};
		});
	},
	beforeUnmount() {
		this.eventBus.off("add_item", this.onAddItem);
		this.eventBus.off("register_pos_profile");
	},
};
</script>

<style scoped>
.qty-input :deep(input) {
	text-align: center;
}
</style>
