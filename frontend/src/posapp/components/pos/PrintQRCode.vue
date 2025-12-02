<template>
	<div fluid>
		<v-row>
			<v-col cols="12">
				<v-card
					class="main mx-auto mt-3 p-4 overflow-y-auto"
					style="max-height: 94vh; height: 94vh"
				>
					<v-card-title class="text-h5 mb-4">
						<v-icon left class="mr-2">mdi-qrcode</v-icon>
						{{ __("Print QR Code Labels") }}
					</v-card-title>

					<v-card-text>
						<!-- Search Items -->
						<v-row>
							<v-col cols="12" md="8">
								<v-text-field
									v-model="search_term"
									:label="__('Search Item by Name or Code')"
									outlined
									dense
									@keyup.enter="search_items"
									prepend-icon="mdi-magnify"
									:loading="searching"
								></v-text-field>
							</v-col>
							<v-col cols="12" md="4">
								<v-btn block color="primary" @click="search_items" :loading="searching">
									{{ __("Search") }}
								</v-btn>
							</v-col>
						</v-row>

						<!-- Items Table -->
						<v-data-table
							:headers="headers"
							:items="items"
							:items-per-page="15"
							class="elevation-1 mt-4"
							dense
						>
							<template v-slot:[`item.item_code`]="{ item }">
								<strong>{{ item.item_code }}</strong>
							</template>

							<template v-slot:[`item.rate`]="{ item }">
								{{ format_currency(item.rate) }}
							</template>

							<template v-slot:[`item.qty_to_print`]="{ item }">
								<v-text-field
									v-model.number="item.qty_to_print"
									type="number"
									dense
									outlined
									min="1"
									style="width: 100px"
									hide-details
								></v-text-field>
							</template>

							<template v-slot:[`item.actions`]="{ item }">
								<v-btn
									small
									color="primary"
									@click="print_single_qr(item)"
									:disabled="!item.qty_to_print || item.qty_to_print <= 0"
								>
									<v-icon small left>mdi-printer</v-icon>
									{{ __("Print") }}
								</v-btn>
							</template>
						</v-data-table>

						<!-- Bulk Print Section -->
						<v-card outlined class="mt-4" v-if="items_with_qty.length > 0">
							<v-card-title class="subtitle-1">
								{{ __("Bulk Print") }}
							</v-card-title>
							<v-card-text>
								<v-alert type="info" dense>
									{{ items_with_qty.length }} {{ __("items selected for printing") }}
								</v-alert>
								<v-btn color="success" @click="print_bulk_qr" block>
									<v-icon left>mdi-printer-multiple</v-icon>
									{{ __("Print All QR Codes") }}
								</v-btn>
							</v-card-text>
						</v-card>
					</v-card-text>
				</v-card>
			</v-col>
		</v-row>
	</div>
</template>

<script>
/* global frappe, __ */
export default {
	name: "PrintQRCode",
	data() {
		return {
			search_term: "",
			searching: false,
			items: [],
			headers: [
				{ text: __("Item Code"), value: "item_code" },
				{ text: __("Item Name"), value: "item_name" },
				{ text: __("Rate"), value: "rate" },
				{ text: __("Stock"), value: "actual_qty" },
				{ text: __("Qty to Print"), value: "qty_to_print" },
				{ text: __("Actions"), value: "actions", sortable: false },
			],
		};
	},
	computed: {
		items_with_qty() {
			return this.items.filter((item) => item.qty_to_print && item.qty_to_print > 0);
		},
	},
	methods: {
		async search_items() {
			if (!this.search_term) {
				frappe.show_alert({ message: __("Please enter search term"), indicator: "red" });
				return;
			}

			this.searching = true;
			try {
				const response = await frappe.call({
					method: "posawesome.posawesome.api.items.get_items",
					args: {
						pos_profile: null,
						search_value: this.search_term,
						limit: 50,
					},
				});

				if (response.message) {
					this.items = response.message.map((item) => ({
						item_code: item.item_code,
						item_name: item.item_name,
						rate: item.rate || item.price_list_rate || 0,
						actual_qty: item.actual_qty || 0,
						warehouse: item.warehouse,
						qty_to_print: 1,
					}));
				}
			} catch (error) {
				console.error("Error searching items:", error);
				frappe.show_alert({ message: __("Error searching items"), indicator: "red" });
			} finally {
				this.searching = false;
			}
		},

		print_single_qr(item) {
			if (!item.qty_to_print || item.qty_to_print <= 0) {
				frappe.show_alert({ message: __("Please enter quantity to print"), indicator: "red" });
				return;
			}

			// Print the specified quantity of QR codes
			for (let i = 0; i < item.qty_to_print; i++) {
				setTimeout(() => {
					this.generate_qr_print(item, i + 1, item.qty_to_print);
				}, i * 1000); // Delay between prints
			}
		},

		print_bulk_qr() {
			const items_to_print = this.items_with_qty;
			if (items_to_print.length === 0) {
				frappe.show_alert({
					message: __("No items selected for printing"),
					indicator: "red",
				});
				return;
			}

			let delay = 0;
			items_to_print.forEach((item) => {
				for (let i = 0; i < item.qty_to_print; i++) {
					setTimeout(() => {
						this.generate_qr_print(item, i + 1, item.qty_to_print);
					}, delay);
					delay += 1000;
				}
			});

			frappe.show_alert({
				message: __("Printing {0} QR codes...").replace("{0}", delay / 1000),
				indicator: "green",
			});
		},

		generate_qr_print(item, copy_number, total_copies) {
			const qr_data = {
				item_code: item.item_code,
				item_name: item.item_name,
				rate: item.rate,
				warehouse: item.warehouse,
				date: new Date().toISOString().split("T")[0],
				copy: copy_number + " of " + total_copies,
			};

			const qr_content = JSON.stringify(qr_data);
			const printWindow = window.open("", "", "width=800,height=600");

			const htmlContent =
				"<!DOCTYPE html>" +
				"<html><head>" +
				"<title>Print QR Code - " +
				item.item_code +
				"</title>" +
				'<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><' +
				"/script>" +
				"<style>" +
				"@page { size: 340mm 280mm; margin: 0; }" +
				"body { margin: 0; padding: 20mm; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 280mm; width: 340mm; font-family: Arial, sans-serif; }" +
				".qr-container { display: flex; flex-direction: column; align-items: center; justify-content: center; }" +
				"#qrcode { margin: 20px 0; }" +
				"#qrcode canvas { max-width: 250mm !important; max-height: 250mm !important; width: 250mm !important; height: 250mm !important; }" +
				".item-info { text-align: center; margin-top: 20px; }" +
				".item-code { font-size: 48px; font-weight: bold; margin: 10px 0; }" +
				".item-name { font-size: 36px; margin: 10px 0; }" +
				".item-details { font-size: 28px; margin: 5px 0; }" +
				".copy-number { font-size: 24px; color: #666; margin-top: 10px; }" +
				"@media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }" +
				"</style></head><body>" +
				'<div class="qr-container">' +
				'<div id="qrcode"></div>' +
				'<div class="item-info">' +
				'<div class="item-code">' +
				item.item_code +
				"</div>" +
				'<div class="item-name">' +
				item.item_name +
				"</div>" +
				'<div class="item-details">Rate: ' +
				this.format_currency(item.rate) +
				"</div>" +
				'<div class="item-details">Date: ' +
				qr_data.date +
				"</div>" +
				'<div class="copy-number">Copy ' +
				qr_data.copy +
				"</div>" +
				"</div></div>" +
				"<script>" +
				"window.onload = function() {" +
				'if (typeof QRCode !== "undefined") {' +
				'new QRCode(document.getElementById("qrcode"), {' +
				"text: " +
				JSON.stringify(qr_content) +
				"," +
				"width: 950, height: 950," +
				'colorDark: "#000000", colorLight: "#ffffff",' +
				"correctLevel: QRCode.CorrectLevel.H" +
				"});" +
				"setTimeout(function() { window.print(); }, 500);" +
				'} else { alert("QR Code library failed to load."); }' +
				"};" +
				"<" +
				"/script></body></html>";

			printWindow.document.write(htmlContent);
			printWindow.document.close();
		},

		format_currency(value) {
			if (value === null || value === undefined) return "0.00";
			const num = parseFloat(value) || 0;
			return num.toFixed(2);
		},
	},
};
</script>

<style scoped>
.v-data-table {
	background: transparent;
}
</style>

