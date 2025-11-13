<template>
	<div fluid>
		<v-row>
			<v-col cols="12">
				<v-card
					:class="[
						'main mx-auto mt-3 p-4 overflow-y-auto',
						isDarkTheme ? '' : 'bg-grey-lighten-5',
					]"
					:style="isDarkTheme ? 'background-color:#1E1E1E' : ''"
					style="max-height: 94vh; height: 94vh"
				>
					<v-card-title class="text-h5 mb-4">
						<v-icon left class="mr-2">mdi-package-variant</v-icon>
						{{ __("Create Stock Entry") }}
					</v-card-title>

					<v-form ref="stockEntryForm">
						<!-- Stock Entry Type -->
						<v-row>
							<v-col cols="12" md="6">
								<v-autocomplete
									v-model="stockEntry.stock_entry_type"
									:items="stockEntryTypes"
									item-title="name"
									item-value="name"
									:label="__('Stock Entry Type') + ' *'"
									density="compact"
									variant="outlined"
									:rules="[v => !!v || __('Stock Entry Type is required')]"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
									@update:model-value="onStockEntryTypeChange"
								></v-autocomplete>
							</v-col>

							<!-- Company -->
							<v-col cols="12" md="6">
								<v-autocomplete
									v-model="stockEntry.company"
									:items="companies"
									item-title="name"
									item-value="name"
									:label="__('Company') + ' *'"
									density="compact"
									variant="outlined"
									:rules="[v => !!v || __('Company is required')]"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-autocomplete>
							</v-col>
						</v-row>

						<!-- From/To Warehouse -->
						<v-row>
							<v-col cols="12" md="6">
								<v-autocomplete
									v-model="stockEntry.from_warehouse"
									:items="warehouses"
									item-title="name"
									item-value="name"
									:label="__('From Warehouse')"
									density="compact"
									variant="outlined"
									clearable
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-autocomplete>
							</v-col>

							<v-col cols="12" md="6">
								<v-autocomplete
									v-model="stockEntry.to_warehouse"
									:items="warehouses"
									item-title="name"
									item-value="name"
									:label="__('To Warehouse')"
									density="compact"
									variant="outlined"
									clearable
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-autocomplete>
							</v-col>
						</v-row>

					<!-- Items Section -->
					<v-divider class="my-4"></v-divider>
					<v-row>
						<v-col cols="12">
							<h3 class="text-h6 mb-3">{{ __("Items") }}</h3>
						</v-col>
					</v-row>

					<!-- Barcode Scanner Row -->
					<v-row class="mb-3">
						<v-col cols="12">
							<v-text-field
								v-model="barcodeInput"
								:label="__('Scan Barcode')"
								density="compact"
								variant="outlined"
								:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								prepend-inner-icon="mdi-barcode-scan"
								hint="Scan or enter barcode to add item"
								persistent-hint
								clearable
								@keydown.enter="handleBarcodeScanned"
								@click:clear="barcodeInput = ''"
								ref="barcodeField"
							></v-text-field>
						</v-col>
					</v-row>

					<!-- Add Item Row -->
					<v-row align="center" class="mb-2">
						<v-col cols="12" md="5">
							<v-autocomplete
								v-model="newItem.item_code"
								:items="items"
								item-title="item_name"
								item-value="item_code"
								:label="__('Item')"
								density="compact"
								variant="outlined"
								:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								@update:model-value="onItemSelect"
							>
								<template v-slot:item="{ props, item }">
									<v-list-item v-bind="props">
										<template v-slot:title>
											{{ item.raw.item_code }} - {{ item.raw.item_name }}
										</template>
									</v-list-item>
								</template>
							</v-autocomplete>
						</v-col>

							<v-col cols="12" md="2">
								<v-text-field
									v-model.number="newItem.qty"
									:label="__('Quantity')"
									type="number"
									density="compact"
									variant="outlined"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-text-field>
							</v-col>

							<v-col cols="12" md="3">
								<v-autocomplete
									v-model="newItem.warehouse"
									:items="warehouses"
									item-title="name"
									item-value="name"
									:label="__('Warehouse')"
									density="compact"
									variant="outlined"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-autocomplete>
							</v-col>

							<v-col cols="12" md="2">
								<v-btn color="primary" @click="addItem" block>
									<v-icon>mdi-plus</v-icon>
									{{ __("Add") }}
								</v-btn>
							</v-col>
						</v-row>

						<!-- Items Table -->
						<v-row>
							<v-col cols="12">
								<v-data-table
									:headers="itemHeaders"
									:items="stockEntry.items"
									class="elevation-1"
									density="compact"
								>
									<template v-slot:item.actions="{ item, index }">
										<v-btn
											icon="mdi-delete"
											size="small"
											color="error"
											variant="text"
											@click="removeItem(index)"
										></v-btn>
									</template>
								</v-data-table>
							</v-col>
						</v-row>

						<!-- Remarks -->
						<v-row class="mt-3">
							<v-col cols="12">
								<v-textarea
									v-model="stockEntry.remarks"
									:label="__('Remarks')"
									density="compact"
									variant="outlined"
									rows="2"
									:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
								></v-textarea>
							</v-col>
						</v-row>

						<!-- Action Buttons -->
						<v-row class="mt-3">
							<v-col cols="12" class="d-flex justify-end">
								<v-btn
									color="grey"
									class="mr-2"
									@click="resetForm"
								>
									{{ __("Clear") }}
								</v-btn>
								<v-btn
									color="primary"
									:loading="submitting"
									@click="submitStockEntry"
								>
									{{ __("Submit") }}
								</v-btn>
							</v-col>
						</v-row>
					</v-form>
				</v-card>
			</v-col>
		</v-row>

		<!-- Snackbar for notifications -->
		<v-snackbar v-model="snack" :timeout="snackTimeout" :color="snackColor" location="top right">
			{{ snackText }}
			<template v-slot:actions>
				<v-btn color="white" variant="text" @click="snack = false">{{ __("Close") }}</v-btn>
			</template>
		</v-snackbar>
	</div>
</template>

<script>
/* global frappe */
export default {
	name: "MiniStockEntry",
	data() {
		return {
			stockEntry: {
				stock_entry_type: "",
				company: "",
				from_warehouse: "",
				to_warehouse: "",
				items: [],
				remarks: "",
			},
			newItem: {
				item_code: "",
				qty: 1,
				warehouse: "",
			},
			barcodeInput: "",
			stockEntryTypes: [],
			companies: [],
			warehouses: [],
			items: [],
			submitting: false,
			snack: false,
			snackText: "",
			snackColor: "success",
			snackTimeout: 3000,
			itemHeaders: [
				{ title: this.__("Item Code"), key: "item_code", sortable: false },
				{ title: this.__("Item Name"), key: "item_name", sortable: false },
				{ title: this.__("Quantity"), key: "qty", sortable: false },
				{ title: this.__("Warehouse"), key: "warehouse", sortable: false },
				{ title: this.__("Actions"), key: "actions", sortable: false, align: "center" },
			],
		};
	},
	computed: {
		isDarkTheme() {
			return this.$theme?.isDark?.value ?? false;
		},
	},
	mounted() {
		this.loadInitialData();
	},
	methods: {
		async loadInitialData() {
			try {
				// Load Stock Entry Types
				const stockEntryTypesResponse = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Stock Entry Type",
						fields: ["name"],
						limit_page_length: 100,
					},
				});
				this.stockEntryTypes = stockEntryTypesResponse.message || [];

				// Load Companies
				const companiesResponse = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Company",
						fields: ["name"],
						limit_page_length: 100,
					},
				});
				this.companies = companiesResponse.message || [];

				// Set default company
				if (frappe.boot && frappe.boot.sysdefaults && frappe.boot.sysdefaults.company) {
					this.stockEntry.company = frappe.boot.sysdefaults.company;
				}

				// Load Warehouses
				const warehousesResponse = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Warehouse",
						fields: ["name"],
						filters: { is_group: 0 },
						limit_page_length: 500,
					},
				});
				this.warehouses = warehousesResponse.message || [];

				// Load Items
				const itemsResponse = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Item",
						fields: ["item_code", "item_name", "stock_uom"],
						filters: { is_stock_item: 1, disabled: 0 },
						limit_page_length: 1000,
					},
				});
				this.items = itemsResponse.message || [];
			} catch (error) {
				console.error("Error loading initial data:", error);
				this.showMessage("Failed to load initial data", "error");
			}
		},
		onStockEntryTypeChange(value) {
			// Auto-populate purpose based on stock entry type
			if (value) {
				frappe.call({
					method: "frappe.client.get_value",
					args: {
						doctype: "Stock Entry Type",
						filters: { name: value },
						fieldname: "purpose",
					},
					callback: (r) => {
						if (r.message) {
							this.stockEntry.purpose = r.message.purpose;
						}
					},
				});
			}
		},
		onItemSelect(itemCode) {
			if (itemCode) {
				const selectedItem = this.items.find((item) => item.item_code === itemCode);
				if (selectedItem && !this.newItem.warehouse) {
					// Auto-select warehouse if set at stock entry level
					if (this.stockEntry.from_warehouse) {
						this.newItem.warehouse = this.stockEntry.from_warehouse;
					} else if (this.stockEntry.to_warehouse) {
						this.newItem.warehouse = this.stockEntry.to_warehouse;
					}
				}
			}
		},
		async handleBarcodeScanned() {
			if (!this.barcodeInput || this.barcodeInput.trim() === "") {
				return;
			}

			try {
				// Search for item by barcode
				const response = await frappe.call({
					method: "erpnext.stock.utils.scan_barcode",
					args: {
						search_value: this.barcodeInput.trim(),
					},
				});

				if (response.message && response.message.item_code) {
					const itemCode = response.message.item_code;
					const item = this.items.find((i) => i.item_code === itemCode);
					
					if (item) {
						// Set the item in the new item form
						this.newItem.item_code = itemCode;
						this.onItemSelect(itemCode);
						
						// Clear barcode input
						this.barcodeInput = "";
						
						this.showMessage(`Item ${itemCode} found`, "success");
					} else {
						this.showMessage(`Item ${itemCode} not found in stock items`, "warning");
						this.barcodeInput = "";
					}
				} else {
					this.showMessage("No item found with this barcode", "warning");
					this.barcodeInput = "";
				}
			} catch (error) {
				console.error("Error scanning barcode:", error);
				this.showMessage(error.message || "Failed to scan barcode", "error");
				this.barcodeInput = "";
			}
		},
		addItem() {
			if (!this.newItem.item_code) {
				this.showMessage("Please select an item", "warning");
				return;
			}
			if (!this.newItem.qty || this.newItem.qty <= 0) {
				this.showMessage("Please enter a valid quantity", "warning");
				return;
			}

			const selectedItem = this.items.find((item) => item.item_code === this.newItem.item_code);
			if (!selectedItem) {
				this.showMessage("Invalid item selected", "error");
				return;
			}

			this.stockEntry.items.push({
				item_code: this.newItem.item_code,
				item_name: selectedItem.item_name,
				qty: this.newItem.qty,
				warehouse: this.newItem.warehouse || this.stockEntry.from_warehouse || this.stockEntry.to_warehouse,
				uom: selectedItem.stock_uom,
			});

			// Reset new item form
			this.newItem = {
				item_code: "",
				qty: 1,
				warehouse: "",
			};
		},
		removeItem(index) {
			this.stockEntry.items.splice(index, 1);
		},
		async submitStockEntry() {
			// Validate form
			const formValid = await this.$refs.stockEntryForm.validate();
			if (!formValid.valid) {
				this.showMessage("Please fill all required fields", "error");
				return;
			}

			if (this.stockEntry.items.length === 0) {
				this.showMessage("Please add at least one item", "warning");
				return;
			}

			this.submitting = true;
			try {
				const response = await frappe.call({
					method: "posawesome.posawesome.api.stock_entry.create_stock_entry",
					args: {
						stock_entry_data: {
							stock_entry_type: this.stockEntry.stock_entry_type,
							company: this.stockEntry.company,
							from_warehouse: this.stockEntry.from_warehouse,
							to_warehouse: this.stockEntry.to_warehouse,
							items: this.stockEntry.items.map(item => ({
								item_code: item.item_code,
								qty: item.qty,
								s_warehouse: this.stockEntry.from_warehouse || item.warehouse,
								t_warehouse: this.stockEntry.to_warehouse || item.warehouse,
								uom: item.uom,
							})),
							remarks: this.stockEntry.remarks,
						},
					},
				});

				if (response.message && response.message.name) {
					this.showMessage(`Stock Entry ${response.message.name} created successfully`, "success");
					this.resetForm();
				} else {
					this.showMessage("Failed to create Stock Entry", "error");
				}
			} catch (error) {
				console.error("Error creating stock entry:", error);
				this.showMessage(error.message || "Failed to create Stock Entry", "error");
			} finally {
				this.submitting = false;
			}
		},
		resetForm() {
			this.stockEntry = {
				stock_entry_type: "",
				company: frappe.boot?.sysdefaults?.company || "",
				from_warehouse: "",
				to_warehouse: "",
				items: [],
				remarks: "",
			};
			this.newItem = {
				item_code: "",
				qty: 1,
				warehouse: "",
			};
			if (this.$refs.stockEntryForm) {
				this.$refs.stockEntryForm.reset();
			}
		},
		showMessage(text, color = "success") {
			this.snackText = text;
			this.snackColor = color;
			this.snack = true;
		},
	},
};
</script>

<style scoped>
.main {
	border-radius: 8px;
}
</style>

