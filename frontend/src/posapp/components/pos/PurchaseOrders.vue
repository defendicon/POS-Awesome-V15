<template>
	<div class="pa-0 h-100">
		<v-row class="h-100 ma-0">
			<!-- Left Column: Item Selector -->
			<v-col cols="12" md="5" class="h-100 pa-0 border-e">
				<ItemsSelector context="purchase" />
			</v-col>

			<!-- Right Column: Purchase Order Form (Cart) -->
			<v-col cols="12" md="7" class="h-100 pa-0">
				<v-card class="h-100 d-flex flex-column pos-themed-card" flat>
					<v-card-title class="py-2 px-4 bg-primary text-white d-flex align-center">
						<span class="text-h6">{{ __("Create Purchase Order") }}</span>
						<v-spacer></v-spacer>
						<v-btn
							icon="mdi-delete"
							variant="text"
							color="white"
							@click="resetForm"
							:title="__('Clear All')"
						></v-btn>
					</v-card-title>

					<v-card-text class="flex-grow-1 overflow-y-auto pa-4">
						<v-container class="pa-0">
							<!-- Header Fields -->
							<v-row dense class="mb-2">
								<v-col cols="12" md="6">
									<v-autocomplete
										v-model="supplier"
										:items="supplierOptions"
										item-title="supplier_name"
										item-value="name"
										:label="frappe._('Supplier')"
										density="compact"
										variant="outlined"
										color="primary"
										hide-details="auto"
										:loading="supplierLoading"
										@update:search="handleSupplierSearch"
										:custom-filter="() => true"
										:no-data-text="
											supplierLoading
												? __('Loading suppliers...')
												: __('Suppliers not found')
										"
										class="pos-themed-input"
										clearable
									>
										<template #append-inner>
											<v-tooltip v-if="allowCreateSupplier" text="Add new supplier">
												<template #activator="{ props }">
													<v-icon
														v-bind="props"
														class="cursor-pointer"
														@mousedown.prevent.stop
														@click.stop="openCreateSupplierDialog"
													>
														mdi-plus
													</v-icon>
												</template>
											</v-tooltip>
										</template>
									</v-autocomplete>
								</v-col>
								<v-col cols="12" md="6">
									<v-autocomplete
										v-model="warehouse"
										:items="warehouseOptions"
										item-title="warehouse_name"
										item-value="name"
										:label="frappe._('Warehouse')"
										density="compact"
										variant="outlined"
										color="primary"
										hide-details="auto"
										clearable
										:loading="warehouseLoading"
										class="pos-themed-input"
									/>
								</v-col>
							</v-row>

							<v-row dense class="mb-4">
								<v-col cols="6">
									<VueDatePicker
										v-model="transactionDate"
										model-type="format"
										format="dd-MM-yyyy"
										:enable-time-picker="false"
										auto-apply
										:placeholder="frappe._('Posting Date')"
										class="pos-themed-input"
									/>
								</v-col>
								<v-col cols="6">
									<VueDatePicker
										v-model="scheduleDate"
										model-type="format"
										format="dd-MM-yyyy"
										:enable-time-picker="false"
										auto-apply
										:placeholder="frappe._('Required By')"
										class="pos-themed-input"
									/>
								</v-col>
							</v-row>

							<!-- Options Toggles -->
							<div class="d-flex gap-4 mb-4">
								<v-switch
									v-if="pos_profile.posa_allow_purchase_receipt"
									v-model="receiveNow"
									density="compact"
									hide-details
									color="success"
									:label="__('Receive now')"
									class="ma-0"
								></v-switch>
								<v-switch
									v-model="createInvoice"
									density="compact"
									hide-details
									color="primary"
									:label="__('Create Bill')"
									class="ma-0 ml-4"
								></v-switch>
							</div>

							<v-divider class="mb-4"></v-divider>

							<!-- Items Table -->
							<v-data-table
								:headers="itemHeaders"
								:items="purchaseItems"
								item-key="line_id"
								class="elevation-1 border rounded"
								density="compact"
								hide-default-footer
								:items-per-page="-1"
							>
								<template v-slot:item.item_name="{ item }">
									<div class="py-1">
										<div class="font-weight-bold">{{ item.item_name }}</div>
										<div class="text-caption text-medium-emphasis">
											{{ item.item_code }}
										</div>
									</div>
								</template>

								<template v-slot:item.uom="{ item }">
									<v-select
										density="compact"
										variant="outlined"
										hide-details
										:items="
											item.item_uoms || [{ uom: item.stock_uom, conversion_factor: 1 }]
										"
										item-title="uom"
										item-value="uom"
										:model-value="item.uom"
										@update:model-value="(val) => updateItemUom(item, val)"
										class="pos-themed-input"
										style="width: 100px"
									></v-select>
								</template>

								<template v-slot:item.qty="{ item }">
									<v-text-field
										density="compact"
										variant="outlined"
										hide-details
										type="number"
										min="0"
										:model-value="item.qty"
										@update:model-value="(val) => updateItemQty(item, val)"
										class="pos-themed-input"
										style="width: 80px"
									></v-text-field>
								</template>

								<template v-slot:item.rate="{ item }">
									<v-text-field
										density="compact"
										variant="outlined"
										hide-details
										type="number"
										min="0"
										:model-value="item.rate"
										@update:model-value="(val) => updateItemRate(item, val)"
										class="pos-themed-input"
										style="width: 100px"
									></v-text-field>
								</template>

								<template v-slot:item.received_qty="{ item }">
									<v-text-field
										v-if="receiveNow"
										density="compact"
										variant="outlined"
										hide-details
										type="number"
										min="0"
										:model-value="item.received_qty"
										@update:model-value="(val) => updateItemReceivedQty(item, val)"
										class="pos-themed-input"
										style="width: 80px"
									></v-text-field>
								</template>

								<template v-slot:item.amount="{ item }">
									<div class="text-right font-weight-bold">
										{{ formatCurrency(item.qty * item.rate) }}
									</div>
								</template>

								<template v-slot:item.actions="{ item }">
									<v-btn
										icon="mdi-delete"
										variant="text"
										color="error"
										size="small"
										@click="removeItem(item)"
									></v-btn>
								</template>

								<template v-slot:bottom>
									<div
										class="d-flex justify-end pa-4 font-weight-bold text-subtitle-1 border-t"
									>
										<span class="mr-4">{{ __("Total:") }}</span>
										<span>{{ formatCurrency(totalAmount) }}</span>
									</div>
								</template>
							</v-data-table>

							<v-alert v-if="errorMessage" type="error" density="compact" class="mt-4">
								{{ errorMessage }}
							</v-alert>
						</v-container>
					</v-card-text>

					<v-card-actions class="pa-4 border-t">
						<v-spacer></v-spacer>
						<v-btn
							color="success"
							size="large"
							variant="flat"
							:loading="submitLoading"
							:disabled="submitLoading || !purchaseItems.length"
							@click="submitPurchaseOrder"
							block
						>
							{{ __("Submit Purchase Order") }}
						</v-btn>
					</v-card-actions>
				</v-card>
			</v-col>
		</v-row>

		<!-- Supplier Dialog -->
		<v-dialog v-model="supplierDialog" max-width="520px">
			<v-card>
				<v-card-title>
					<span class="text-h6 text-primary">{{ __("Create Supplier") }}</span>
				</v-card-title>
				<v-card-text>
					<v-text-field
						v-model="supplierForm.supplier_name"
						:label="frappe._('Supplier Name')"
						density="compact"
						variant="outlined"
						class="pos-themed-input"
					/>
					<v-select
						v-model="supplierForm.supplier_group"
						:items="supplierGroups"
						:label="frappe._('Supplier Group')"
						density="compact"
						variant="outlined"
						class="pos-themed-input"
						clearable
					/>
					<v-select
						v-model="supplierForm.supplier_type"
						:items="supplierTypes"
						:label="frappe._('Supplier Type')"
						density="compact"
						variant="outlined"
						class="pos-themed-input"
					/>
					<v-text-field
						v-model="supplierForm.tax_id"
						:label="frappe._('Tax ID')"
						density="compact"
						variant="outlined"
						class="pos-themed-input"
					/>
					<v-text-field
						v-model="supplierForm.mobile_no"
						:label="frappe._('Mobile Number')"
						density="compact"
						variant="outlined"
						class="pos-themed-input"
					/>
					<v-text-field
						v-model="supplierForm.email_id"
						:label="frappe._('Email')"
						density="compact"
						variant="outlined"
						class="pos-themed-input"
					/>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" variant="text" @click="closeSupplierDialog">{{
						__("Cancel")
					}}</v-btn>
					<v-btn
						color="primary"
						variant="tonal"
						:loading="supplierSubmitLoading"
						:disabled="supplierSubmitLoading"
						@click="submitSupplier"
					>
						{{ __("Create") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script>
/* global __, frappe */
import format, { formatUtils } from "../../format";
import { useStockUtils } from "../../composables/useStockUtils";
import { getOpeningStorage } from "../../../offline/index.js";
import { useItemsStore } from "../../stores/itemsStore";
import { mapStores } from "pinia";
import ItemsSelector from "./ItemsSelector.vue";

export default {
	mixins: [format],
	components: {
		ItemsSelector,
	},
	data: () => ({
		stockUtils: useStockUtils(),
		pos_profile: {},
		supplier: null,
		createInvoice: false,
		supplierOptions: [],
		supplierLoading: false,
		supplierDialog: false,
		supplierSubmitLoading: false,
		supplierForm: {
			supplier_name: "",
			supplier_group: "",
			supplier_type: "Company",
			tax_id: "",
			mobile_no: "",
			email_id: "",
		},
		supplierGroups: [],
		supplierTypes: ["Company", "Individual"],
		supplierCurrency: null,
		warehouse: null,
		warehouseOptions: [],
		warehouseLoading: false,
		receiveNow: false,
		transactionDate: null,
		scheduleDate: null,
		purchaseItems: [],
		itemGroups: [],
		uomOptions: [],
		itemSearchTimeout: null,
		supplierSearchTimeout: null,
		errorMessage: "",
		submitLoading: false,
	}),
	computed: {
		...mapStores(useItemsStore),
		allowCreateSupplier() {
			return !!this.pos_profile?.posa_allow_create_purchase_suppliers;
		},
		totalAmount() {
			return this.purchaseItems.reduce((sum, item) => sum + item.qty * item.rate, 0);
		},
		itemHeaders() {
			const headers = [
				{ title: __("Item"), key: "item_name", align: "start", width: "35%" },
				{ title: __("UOM"), key: "uom", align: "center", width: "15%" },
				{ title: __("Qty"), key: "qty", align: "center", width: "15%" },
				{ title: __("Rate"), key: "rate", align: "center", width: "15%" },
			];
			if (this.receiveNow) {
				headers.push({ title: __("Received"), key: "received_qty", align: "center", width: "10%" });
			}
			headers.push(
				{ title: __("Amount"), key: "amount", align: "end", width: "10%" },
				{ title: "", key: "actions", align: "center", sortable: false, width: "50px" },
			);
			return headers;
		},
	},
	watch: {
		receiveNow(value) {
			if (!value) {
				this.purchaseItems.forEach((item) => {
					item.received_qty = 0;
					item.receivedQtyManual = false;
				});
				return;
			}
			this.purchaseItems.forEach((item) => {
				if (!item.receivedQtyManual) {
					item.received_qty = item.qty;
				}
			});
		},

		supplier(value) {
			if (value) {
				const selectedSupplier = this.supplierOptions.find(s => s.name === value);
				this.supplierCurrency = selectedSupplier?.default_currency || this.pos_profile.currency;
			} else {
				this.supplierCurrency = this.pos_profile.currency;
			}
		},
	},
	methods: {
		async onAddItem(item) {
			if (!item) return;

			// Fetch item details to get item_uoms if missing
			if (!item.item_uoms || !item.item_uoms.length) {
				try {
					const details = await this.itemsStore.getItemByCode(item.item_code);
					if (details) {
						if (details.item_uoms) item.item_uoms = details.item_uoms;
						if (details.purchase_uom) item.purchase_uom = details.purchase_uom;
					}
				} catch (e) {
					console.warn("Failed to fetch item details for UOMs", e);
				}
			}

			const existingItem = this.purchaseItems.find((p) => p.item_code === item.item_code);

			if (existingItem) {
				existingItem.qty += 1;
				if (this.receiveNow && !existingItem.receivedQtyManual) {
					existingItem.received_qty = existingItem.qty;
				}
			} else {
				// Use the rate from the store (which should be the buying price list rate)
				// If not available, fallback to standard_rate
				let rate = item.rate || item.standard_rate || 0;
				let uom = item.purchase_uom || item.stock_uom; // Default to purchase UOM if set
				let conversion_factor = 1;

				if (uom !== item.stock_uom && item.item_uoms) {
					const uomData = item.item_uoms.find((u) => u.uom === uom);
					if (uomData) {
						conversion_factor = uomData.conversion_factor;
					}
				}

				const newItem = {
					line_id: this.generateLineId(),
					item_code: item.item_code,
					item_name: item.item_name,
					stock_uom: item.stock_uom,
					item_group: item.item_group,
					item_uoms: item.item_uoms || [{ uom: item.stock_uom, conversion_factor: 1 }],
					uom: uom,
					conversion_factor: conversion_factor,
					qty: 1,
					rate: rate,
					stock_uom_rate: rate, // Store the base rate for Stock UOM for conversions
					standard_rate: item.standard_rate || 0,
					received_qty: this.receiveNow ? 1 : 0,
					receivedQtyManual: false,
				};

				this.purchaseItems.unshift(newItem); // Add to top of list

				// Recalculate rate if UOM is different from stock UOM
				if (newItem.uom !== newItem.stock_uom) {
					this.updateItemUom(newItem, newItem.uom);
				}
			}
		},
		formatDateForBackend(date) {
			if (!date) return null;
			if (typeof date === "string") {
				const western = formatUtils.fromArabicNumerals(date);
				if (/^\d{4}-\d{2}-\d{2}$/.test(western)) {
					return western;
				}
				if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(western)) {
					const [d, m, y] = western.split("-");
					return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
				}
				date = western;
			}
			const parsed = new Date(formatUtils.fromArabicNumerals(String(date)));
			if (!isNaN(parsed.getTime())) {
				const year = parsed.getFullYear();
				const month = `0${parsed.getMonth() + 1}`.slice(-2);
				const day = `0${parsed.getDate()}`.slice(-2);
				return `${year}-${month}-${day}`;
			}
			return formatUtils.fromArabicNumerals(String(date));
		},
		getTodayDisplay() {
			return formatUtils.toArabicNumerals(frappe.datetime.nowdate());
		},
		resetForm() {
			this.supplier = null;
			this.supplierOptions = [];
			this.supplierLoading = false;
			this.warehouse = this.pos_profile?.warehouse || null;
			this.transactionDate = this.getTodayDisplay();
			this.scheduleDate = this.getTodayDisplay();
			this.receiveNow = false;
			this.createInvoice = false;
			this.purchaseItems = [];
			this.errorMessage = "";
			this.submitLoading = false;
		},
		async handleSupplierSearch(term) {
			if (this.supplierSearchTimeout) {
				clearTimeout(this.supplierSearchTimeout);
			}
			this.supplierSearchTimeout = setTimeout(async () => {
				await this.searchSuppliers(term);
			}, 300);
		},
		async searchSuppliers(searchText = "") {
			this.supplierLoading = true;
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.search_suppliers",
					args: {
						search_text: searchText,
						limit: 20,
					},
				});
				this.supplierOptions = Array.isArray(message) ? message : [];
				
				// ✅ Update currency when supplier is already selected
				if (this.supplier) {
					const selectedSupplier = this.supplierOptions.find(s => s.name === this.supplier);
					this.supplierCurrency = selectedSupplier?.default_currency || this.pos_profile.currency;
				}
			} catch (error) {
				console.error("Failed to fetch suppliers:", error);
				this.supplierOptions = [];
			} finally {
				this.supplierLoading = false;
			}
		},
		async updateItemUom(item, value) {
			const foundItem = this.purchaseItems.find((i) => i.line_id === item.line_id);
			if (!foundItem || !value) {
				return;
			}

			foundItem.uom = value;
			const matched = (foundItem.item_uoms || []).find((uom) => uom.uom === value);
			foundItem.conversion_factor = matched ? matched.conversion_factor : 1;

			if (this.stockUtils?.calcStockQty) {
				this.stockUtils.calcStockQty(foundItem, foundItem.qty);
			}

			// Fetch new rate for UOM from Buying Price List
			let priceFound = false;
			try {
				const priceList = this.itemsStore.activePriceList;
				if (priceList) {
					const { message } = await frappe.call({
						method: "posawesome.posawesome.api.items.get_price_for_uom",
						args: {
							item_code: foundItem.item_code,
							price_list: priceList,
							uom: value,
						},
					});

					if (message !== undefined && message !== null && message > 0) {
						foundItem.rate = message;
						priceFound = true;
					}
				}
			} catch (e) {
				console.error("Failed to update rate for UOM", e);
			}

			if (!priceFound) {
				// Fallback: scale stock_uom_rate by conversion factor
				// Use stock_uom_rate if available, fallback to standard_rate
				const baseRate = foundItem.stock_uom_rate || foundItem.standard_rate || 0;
				foundItem.rate = baseRate * foundItem.conversion_factor;
			}
		},
		removeItem(item) {
			this.purchaseItems = this.purchaseItems.filter((row) => row.line_id !== item.line_id);
		},
		updateItemQty(item, value) {
			const val = parseFloat(value);
			item.qty = isNaN(val) ? 0 : val;
			if (this.receiveNow && !item.receivedQtyManual) {
				item.received_qty = item.qty;
			}
		},
		updateItemRate(item, value) {
			const val = parseFloat(value);
			item.rate = isNaN(val) ? 0 : val;
		},
		updateItemReceivedQty(item, value) {
			const val = parseFloat(value);
			item.received_qty = isNaN(val) ? 0 : val;
			item.receivedQtyManual = true;
		},
		generateLineId() {
			return `po_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
		},
		openCreateSupplierDialog() {
			this.resetSupplierForm();
			this.supplierDialog = true;
		},
		closeSupplierDialog() {
			this.supplierDialog = false;
		},
		resetSupplierForm() {
			this.supplierForm = {
				supplier_name: "",
				supplier_group: this.supplierGroups[0] || "",
				supplier_type: "Company",
				tax_id: "",
				mobile_no: "",
				email_id: "",
			};
			this.supplierSubmitLoading = false;
		},
		async submitSupplier() {
			if (!this.supplierForm.supplier_name) {
				this.eventBus.emit("show_message", {
					title: __("Supplier name is required"),
					color: "error",
				});
				return;
			}
			this.supplierSubmitLoading = true;
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.create_supplier",
					args: {
						data: {
							...this.supplierForm,
							pos_profile: this.pos_profile,
						},
					},
				});
				if (message && message.name) {
					this.eventBus.emit("show_message", {
						title: __("Supplier created successfully"),
						color: "success",
					});
					this.supplierOptions.unshift(message);
					this.supplier = message.name;
					this.supplierDialog = false;
				}
			} catch (error) {
				console.error("Failed to create supplier:", error);
				this.eventBus.emit("show_message", {
					title: __("Supplier creation failed"),
					color: "error",
				});
			} finally {
				this.supplierSubmitLoading = false;
			}
		},
		async submitPurchaseOrder() {
			if (!this.supplier) {
				this.errorMessage = __("Supplier is required.");
				return;
			}
			if (!this.transactionDate) {
				this.errorMessage = __("Posting date is required.");
				return;
			}
			if (!this.scheduleDate) {
				this.errorMessage = __("Required by date is required.");
				return;
			}
			const items = this.purchaseItems.filter((item) => item.qty > 0);
			if (!items.length) {
				this.errorMessage = __("Please add at least one item.");
				return;
			}
			this.errorMessage = "";
			this.submitLoading = true;
			try {
				const payload = {
					supplier: this.supplier,
					company: this.pos_profile.company,
					warehouse: this.warehouse,
					transaction_date: this.formatDateForBackend(this.transactionDate),
					schedule_date: this.formatDateForBackend(this.scheduleDate),
					receive: this.receiveNow ? 1 : 0,
					create_invoice: this.createInvoice ? 1 : 0,
					pos_profile: this.pos_profile,
					items: items.map((item) => ({
						item_code: item.item_code,
						item_name: item.item_name,
						stock_uom: item.stock_uom,
						uom: item.uom || item.stock_uom,
						conversion_factor: item.conversion_factor || 1,
						qty: item.qty,
						rate: item.rate,
						received_qty: this.receiveNow ? item.received_qty || item.qty : undefined,
						warehouse: this.warehouse || item.warehouse,
					})),
				};
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.create_purchase_order",
					args: { data: payload },
				});
				if (message?.purchase_order) {
					let title = __("Purchase order created");
					if (message.purchase_receipt && message.purchase_invoice) {
						title = __("Purchase order, receipt, and invoice created");
					} else if (message.purchase_receipt) {
						title = __("Purchase order and receipt created");
					} else if (message.purchase_invoice) {
						title = __("Purchase order and invoice created");
					}
					this.eventBus.emit("show_message", {
						title,
						color: "success",
					});
					if (message.purchase_receipt) {
						const itemCodes = items.map((item) => item.item_code);
						this.eventBus.emit("invoice_stock_adjusted", { item_codes: itemCodes });
					}
					this.resetForm();
				}
			} catch (error) {
				console.error("Failed to submit purchase order:", error);
				this.errorMessage = __("Unable to create purchase order");
			} finally {
				this.submitLoading = false;
			}
		},
		async loadSupplierGroups() {
			if (this.supplierGroups.length) return;
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Supplier Group",
						fields: ["name"],
						filters: { is_group: 0 },
						limit_page_length: 500,
						order_by: "name",
					},
				});
				this.supplierGroups = (message || []).map((row) => row.name);
			} catch (error) {
				console.error("Failed to load supplier groups:", error);
			}
		},
		async loadWarehouses() {
			this.warehouseLoading = true;
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Warehouse",
						fields: ["name", "warehouse_name"],
						filters: {
							company: this.pos_profile.company,
							is_group: 0,
							disabled: 0,
						},
						limit_page_length: 500,
						order_by: "warehouse_name",
					},
				});
				this.warehouseOptions = message || [];
			} catch (error) {
				console.error("Failed to load warehouses:", error);
				this.warehouseOptions = [];
			} finally {
				this.warehouseLoading = false;
			}
		},
		async initialize() {
			if (!this.pos_profile || !this.pos_profile.name) {
				const cachedData = getOpeningStorage();
				if (cachedData && cachedData.pos_profile) {
					this.pos_profile = cachedData.pos_profile;
				}
			}

			// Load buying price list and update store
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.get_buying_price_list",
				});
				if (message) {
					// Update store to use buying price list
					// This will trigger a price refresh in the items store
					if (this.itemsStore) {
						// Force update even if it seems same, to ensure items are reloaded with correct price list
						await this.itemsStore.updatePriceList(message);

						// If store items are already loaded but price list update didn't trigger reload (e.g. same name),
						// force a reload to ensure we get buying prices (since we cleared selling=1 filter)
						if (this.itemsStore.activePriceList === message && this.itemsStore.items.length > 0) {
							// Check if items seem to have selling prices (high rates) vs buying (low/standard)
							// This is heuristic, but reloading is safer
							await this.itemsStore.loadItems({
								forceServer: true,
								priceList: message,
							});
						}
					}
				}
			} catch (e) {
				console.error("Failed to load buying price list", e);
			}

			this.resetForm();
			await Promise.all([this.searchSuppliers(""), this.loadSupplierGroups(), this.loadWarehouses()]);
		},
	},
	created() {
		this.initialize();
		// Listen for item addition from ItemsSelector
		this.eventBus.on("add_item", this.onAddItem);
	},
	mounted() {
		this.eventBus.on("register_pos_profile", (data) => {
			this.pos_profile = data.pos_profile || {};
		});
	},
	beforeUnmount() {
		this.eventBus.off("register_pos_profile");
		this.eventBus.off("add_item", this.onAddItem);
	},
};
</script>

<style scoped>
.cursor-pointer {
	cursor: pointer;
}
</style>
