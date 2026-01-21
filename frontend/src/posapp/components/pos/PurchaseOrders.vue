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
									<div class="pos-table__editor-box uom-editor" @click.stop>
										<v-btn
											size="x-small"
											variant="flat"
											class="pos-table__editor-btn uom-arrow"
											@click.stop="changeUom(item, -1)"
											:disabled="!item.item_uoms || item.item_uoms.length <= 1"
										>
											<v-icon size="small">mdi-chevron-left</v-icon>
										</v-btn>
										<v-select
											:model-value="item.uom"
											@update:model-value="(val) => updateItemUom(item, val)"
											:items="
												item.item_uoms || [
													{ uom: item.stock_uom, conversion_factor: 1 },
												]
											"
											item-title="uom"
											item-value="uom"
											density="compact"
											variant="outlined"
											class="pos-table__editor-input uom-select"
											:class="{ 'uom-display-mode': !item._isEditingUom }"
											hide-details
											@focus="item._isEditingUom = true"
											@blur="item._isEditingUom = false"
										></v-select>
										<v-btn
											size="x-small"
											variant="flat"
											class="pos-table__editor-btn uom-arrow"
											@click.stop="changeUom(item, 1)"
											:disabled="!item.item_uoms || item.item_uoms.length <= 1"
										>
											<v-icon size="small">mdi-chevron-right</v-icon>
										</v-btn>
									</div>
								</template>

								<template v-slot:item.qty="{ item }">
									<div class="pos-table__qty-counter">
										<v-btn
											size="small"
											variant="flat"
											class="pos-table__qty-btn minus-btn qty-control-btn"
											@click.stop="updateItemQty(item, item.qty - 1)"
										>
											<v-icon size="small">mdi-minus</v-icon>
										</v-btn>
										<div
											v-if="!item._isEditingQty"
											class="pos-table__qty-display"
											@click.stop="openQtyEdit(item)"
										>
											{{ formatNumber(item.qty) }}
										</div>
										<v-text-field
											v-else
											v-model="item._editingQtyValue"
											density="compact"
											variant="outlined"
											class="pos-table__qty-input"
											@blur="closeQtyEdit(item)"
											@keydown.enter.prevent="closeQtyEdit(item)"
											@click.stop
											autofocus
											type="number"
											min="0"
										></v-text-field>
										<v-btn
											size="small"
											variant="flat"
											class="pos-table__qty-btn plus-btn qty-control-btn"
											@click.stop="updateItemQty(item, item.qty + 1)"
										>
											<v-icon size="small">mdi-plus</v-icon>
										</v-btn>
									</div>
								</template>

								<template v-slot:item.rate="{ item }">
									<div class="pos-table__editor-box">
										<div
											v-if="!item._isEditingRate"
											class="pos-table__editor-display"
											@click.stop="openRateEdit(item)"
										>
											<span class="currency-symbol">{{
												currencySymbol(supplierCurrency)
											}}</span>
											<span class="amount-value">{{ formatCurrency(item.rate) }}</span>
										</div>
										<v-text-field
											v-else
											v-model="item._editingRateValue"
											density="compact"
											variant="outlined"
											class="pos-table__editor-input"
											@blur="closeRateEdit(item)"
											@keydown.enter.prevent="closeRateEdit(item)"
											@click.stop
											autofocus
											type="number"
											min="0"
										></v-text-field>
									</div>
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
							class="mr-2"
							:loading="submitLoading"
							:disabled="submitLoading || !purchaseItems.length"
							@click="openPaymentDialog"
							block
						>
							{{ __("Pay") }}
						</v-btn>
					</v-card-actions>
				</v-card>
			</v-col>
		</v-row>

		<!-- Payment Dialog -->
		<PurchasePaymentDialog
			v-model="paymentDialog"
			:total-amount="totalAmount"
			:currency="supplierCurrency"
			:pos-profile="pos_profile"
			:create-invoice="createInvoice"
			@submit="handlePaymentSubmit"
		/>

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
import PurchasePaymentDialog from "./PurchasePaymentDialog.vue";

export default {
	mixins: [format],
	components: {
		ItemsSelector,
		PurchasePaymentDialog,
	},
	data: () => ({
		stockUtils: useStockUtils(),
		pos_profile: {},
		supplier: null,
		createInvoice: false,
		supplierOptions: [],
		supplierLoading: false,
		supplierDialog: false,
		paymentDialog: false,
		payments: [],

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
				const selectedSupplier = this.supplierOptions.find((s) => s.name === value);
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
			this.payments = [];
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
					const selectedSupplier = this.supplierOptions.find((s) => s.name === this.supplier);
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
		changeUom(item, direction) {
			if (!item.item_uoms || item.item_uoms.length <= 1) return;
			const uoms = item.item_uoms.map((u) => u.uom);
			const currentIndex = uoms.indexOf(item.uom);
			let newIndex = currentIndex + direction;

			if (newIndex < 0) {
				newIndex = uoms.length - 1;
			} else if (newIndex >= uoms.length) {
				newIndex = 0;
			}

			const newUom = uoms[newIndex];
			if (newUom !== item.uom) {
				this.updateItemUom(item, newUom);
			}
		},
		openQtyEdit(item) {
			item._isEditingQty = true;
			item._editingQtyValue = "";
		},
		closeQtyEdit(item) {
			if (item._isEditingQty) {
				if (item._editingQtyValue !== "" && item._editingQtyValue != null) {
					const val = parseFloat(item._editingQtyValue);
					if (!isNaN(val) && val >= 0) {
						this.updateItemQty(item, val);
					}
				}
				item._isEditingQty = false;
			}
		},
		openRateEdit(item) {
			item._isEditingRate = true;
			item._editingRateValue = "";
		},
		closeRateEdit(item) {
			if (item._isEditingRate) {
				if (item._editingRateValue !== "" && item._editingRateValue != null) {
					const val = parseFloat(item._editingRateValue);
					if (!isNaN(val) && val >= 0) {
						this.updateItemRate(item, val);
					}
				}
				item._isEditingRate = false;
			}
		},
		formatNumber(value) {
			return this.formatFloat(value, 2);
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
		async submitPurchaseOrder(print = false, printFormat = null, printInvoice = false) {
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
					payments: this.payments,
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

					if (print) {
						// Print either invoice or order
						// Prioritize Invoice if requested and available
						let doctype = "Purchase Order";
						let docname = message.purchase_order;

						if (printInvoice && message.purchase_invoice) {
							doctype = "Purchase Invoice";
							docname = message.purchase_invoice;
						}

						const format =
							printFormat ||
							this.pos_profile.print_format_for_purchase ||
							this.pos_profile.print_format;

						if (docname) {
							const printUrl = frappe.urllib.get_full_url(
								`/printview?doctype=${doctype}&name=${docname}&print_format=${encodeURIComponent(format || "Standard")}`,
							);
							const printWindow = window.open(printUrl, "_blank");
							if (printWindow) {
								printWindow.focus();
							}
						}
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
		openPaymentDialog() {
			if (!this.supplier) {
				this.errorMessage = __("Supplier is required.");
				return;
			}
			const items = this.purchaseItems.filter((item) => item.qty > 0);
			if (!items.length) {
				this.errorMessage = __("Please add at least one item.");
				return;
			}
			this.errorMessage = "";
			this.paymentDialog = true;
		},
		handlePaymentSubmit({ payments, print, print_format, print_invoice }) {
			this.payments = payments;
			this.submitPurchaseOrder(print, print_format, print_invoice);
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
		if (this.itemsStore && this.pos_profile && this.pos_profile.selling_price_list) {
			this.itemsStore.updatePriceList(this.pos_profile.selling_price_list);
		}
		this.eventBus.off("register_pos_profile");
		this.eventBus.off("add_item", this.onAddItem);
	},
};
</script>

<style scoped>
.cursor-pointer {
	cursor: pointer;
}

/* Copied styles from CartItemRow/ItemsTable for consistent look */
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
	cursor: pointer;
}

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

.qty-control-btn.minus-btn {
	background: var(--pos-button-warning-bg) !important;
	color: var(--pos-button-warning-text) !important;
	border: 2px solid var(--pos-button-warning-border) !important;
}

.qty-control-btn.plus-btn {
	background: var(--pos-button-success-bg) !important;
	color: var(--pos-button-success-text) !important;
	border: 2px solid var(--pos-button-success-border) !important;
}

.pos-table__qty-input {
	max-width: 80px;
	margin: 0 auto;
}
.pos-table__qty-input :deep(input) {
	text-align: center;
	font-weight: 600;
	-moz-appearance: textfield;
}
.pos-table__qty-input :deep(input::-webkit-outer-spin-button),
.pos-table__qty-input :deep(input::-webkit-inner-spin-button) {
	-webkit-appearance: none;
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

.pos-table__editor-box {
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
	border: 1px solid var(--pos-border-light);
	transition: all 0.3s ease;
	margin: 0 auto;
	flex-shrink: 0;
	box-sizing: border-box;
}

.pos-table__editor-box:hover {
	background: var(--pos-hover-bg);
	box-shadow: 0 4px 16px var(--pos-shadow);
	transform: translateY(-1px);
}

.pos-table__editor-display {
	min-width: 40px;
	max-width: 80px;
	width: auto;
	flex: 1 1 auto;
	text-align: center;
	font-weight: 600;
	padding: 0 2px;
	border-radius: 4px;
	background: var(--pos-primary-container);
	border: 1px solid var(--pos-primary-variant);
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
	cursor: pointer;
}

.pos-table__editor-btn {
	width: 24px !important;
	height: 24px !important;
	min-width: 24px !important;
	border-radius: 6px !important;
}
.pos-table__editor-input {
	max-width: 80px;
}
.pos-table__editor-input :deep(.v-input__control) {
	height: 24px;
}
.pos-table__editor-input :deep(.v-field__field) {
	height: 24px;
	padding: 0 4px;
}
.pos-table__editor-input :deep(.v-field__input) {
	padding: 0;
	min-height: 24px;
	font-size: 0.75rem;
}
.pos-table__editor-input :deep(input) {
	text-align: center;
}

.uom-editor {
	gap: 2px;
}
.uom-arrow {
	flex-shrink: 0;
}
.uom-select {
	min-width: 40px;
}

.uom-display-mode :deep(.v-field__outline) {
	display: none;
}
.uom-display-mode :deep(.v-field) {
	background-color: transparent !important;
	border: none !important;
	box-shadow: none !important;
}
.uom-display-mode :deep(.v-field__input) {
	justify-content: center;
	padding: 0;
	font-weight: 600;
	color: var(--pos-primary);
}
.uom-display-mode :deep(.v-select__selection-text) {
	text-align: center;
	color: var(--pos-primary);
	font-size: 0.65rem;
	letter-spacing: -0.05em;
	white-space: nowrap;
	overflow: visible;
}
.uom-display-mode :deep(.v-field__append-inner) {
	display: none;
}

.currency-display {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 100%;
	padding: 0;
	margin: 0;
}

.currency-display.right-aligned {
	justify-content: center;
}

.amount-value {
	font-weight: 500;
}

.currency-symbol {
	opacity: 0.7;
	margin-right: 2px;
	font-size: 0.85em;
}
</style>
