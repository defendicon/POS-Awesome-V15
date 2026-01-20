<template>
	<v-row justify="center">
		<v-dialog v-model="dialog" max-width="1100px">
			<v-card>
				<v-card-title>
					<span class="text-h5 text-primary">{{ __("Create Purchase Order") }}</span>
				</v-card-title>
				<v-card-text class="pa-0">
					<v-container>
						<v-row class="mb-2">
							<v-col cols="12" md="8">
								<v-autocomplete
									v-model="supplier"
									:items="supplierOptions"
									item-title="supplier_name"
									item-value="name"
									:label="frappe._('Supplier')"
									density="compact"
									variant="solo"
									color="primary"
									class="pos-themed-input"
									:loading="supplierLoading"
									:disabled="supplierLoading"
									:custom-filter="() => true"
									:no-data-text="
										supplierLoading
											? __('Loading suppliers...')
											: __('Suppliers not found')
									"
									@update:search="handleSupplierSearch"
									clearable
								>
									<template #append-inner>
										<v-tooltip v-if="allowCreateSupplier" text="Add new supplier">
											<template #activator="{ props }">
												<v-icon
													v-bind="props"
													class="icon-button"
													@mousedown.prevent.stop
													@click.stop="openCreateSupplierDialog"
												>
													mdi-plus
												</v-icon>
											</template>
										</v-tooltip>
									</template>
									<template #item="{ props, item }">
										<v-list-item v-bind="props">
											<v-list-item-title>{{
												item.raw.supplier_name
											}}</v-list-item-title>
											<v-list-item-subtitle
												v-if="item.raw.name !== item.raw.supplier_name"
											>
												{{ item.raw.name }}
											</v-list-item-subtitle>
										</v-list-item>
									</template>
								</v-autocomplete>
							</v-col>
							<v-col cols="12" md="4" class="d-flex flex-column">
								<v-switch
									v-if="pos_profile.posa_allow_purchase_receipt"
									v-model="receiveNow"
									density="compact"
									inset
									color="success"
									:label="__('Receive now')"
								></v-switch>
								<v-switch
									v-model="createInvoice"
									density="compact"
									inset
									color="primary"
									:label="__('Create Purchase Invoice')"
								></v-switch>
							</v-col>
						</v-row>

						<v-row class="mb-2">
							<v-col cols="12" sm="4">
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
							<v-col cols="12" sm="4">
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
							<v-col cols="12" sm="4">
								<v-autocomplete
									v-model="warehouse"
									:items="warehouseOptions"
									item-title="warehouse_name"
									item-value="name"
									:label="frappe._('Warehouse')"
									density="compact"
									variant="solo"
									color="primary"
									class="pos-themed-input"
									clearable
									:loading="warehouseLoading"
									:disabled="warehouseLoading"
								/>
							</v-col>
						</v-row>

						<v-divider class="my-2"></v-divider>

						<v-row class="mb-2">
							<v-col cols="12" md="8">
								<v-autocomplete
									v-model="selectedItemCode"
									:items="itemResults"
									item-title="item_name"
									item-value="item_code"
									:label="frappe._('Item')"
									density="compact"
									variant="solo"
									color="primary"
									class="pos-themed-input"
									:loading="itemLoading"
									:custom-filter="() => true"
									:no-data-text="
										itemLoading ? __('Loading items...') : __('Items not found')
									"
									@update:search="handleItemSearch"
									clearable
								>
									<template #append-inner>
										<v-tooltip v-if="allowCreateItem" text="Add new item">
											<template #activator="{ props }">
												<v-icon
													v-bind="props"
													class="icon-button"
													@mousedown.prevent.stop
													@click.stop="openCreateItemDialog"
												>
													mdi-plus
												</v-icon>
											</template>
										</v-tooltip>
									</template>
									<template #item="{ props, item }">
										<v-list-item v-bind="props">
											<v-list-item-title>{{ item.raw.item_name }}</v-list-item-title>
											<v-list-item-subtitle>
												{{ item.raw.item_code }}
												<span v-if="item.raw.stock_uom"
													>- {{ item.raw.stock_uom }}</span
												>
											</v-list-item-subtitle>
										</v-list-item>
									</template>
								</v-autocomplete>
							</v-col>
							<v-col cols="12" md="4" class="d-flex align-center">
								<v-btn
									block
									color="primary"
									theme="dark"
									:disabled="!selectedItemCode"
									@click="addSelectedItem"
								>
									{{ __("Add Item") }}
								</v-btn>
							</v-col>
						</v-row>

						<v-row>
							<v-col cols="12" class="pa-1">
								<v-data-table
									:headers="itemHeaders"
									:items="purchaseItems"
									item-key="line_id"
									class="elevation-1"
									hide-default-footer
								>
									<template v-slot:item.uom="{ item }">
										<v-select
											density="compact"
											variant="outlined"
											class="pos-themed-input"
											:model-value="item.uom"
											:items="
												item.item_uoms || [
													{ uom: item.stock_uom, conversion_factor: 1 },
												]
											"
											item-title="uom"
											item-value="uom"
											:disabled="!item.item_uoms || item.item_uoms.length <= 1"
											@update:model-value="updateItemUom(item, $event)"
										></v-select>
									</template>
									<template v-slot:item.qty="{ item }">
										<v-text-field
											density="compact"
											variant="outlined"
											class="pos-themed-input"
											:rules="[isNumber]"
											:label="frappe._('Qty')"
											:model-value="formatFloat(item.qty)"
											@change="updateItemQty(item, $event)"
										></v-text-field>
									</template>
									<template v-slot:item.rate="{ item }">
										<v-text-field
											density="compact"
											variant="outlined"
											class="pos-themed-input"
											:label="frappe._('Rate')"
											:model-value="formatCurrency(item.rate)"
											@change="updateItemRate(item, $event)"
										></v-text-field>
									</template>
									<template v-slot:item.received_qty="{ item }">
										<div v-if="receiveNow">
											<v-text-field
												density="compact"
												variant="outlined"
												class="pos-themed-input"
												:label="frappe._('Received')"
												:model-value="formatFloat(item.received_qty)"
												@change="updateItemReceivedQty(item, $event)"
											></v-text-field>
										</div>
									</template>
									<template v-slot:item.amount="{ item }">
										<div class="text-right">
											{{ currencySymbol(supplierCurrency || pos_profile.currency) }}
											{{ formatCurrency(item.qty * item.rate) }}
										</div>
									</template>
									<template v-slot:item.actions="{ item }">
										<v-btn
											icon="mdi-delete"
											variant="text"
											color="error"
											@click="removeItem(item)"
										></v-btn>
									</template>
								</v-data-table>
							</v-col>
						</v-row>

						<v-row v-if="errorMessage">
							<v-col cols="12" class="pt-0">
								<v-alert type="error" dense border="start" class="mx-2">
									{{ errorMessage }}
								</v-alert>
							</v-col>
						</v-row>
					</v-container>
				</v-card-text>
				<v-card-actions>
					<v-spacer></v-spacer>
					<v-btn color="error" theme="dark" @click="closeDialog">{{ __("Close") }}</v-btn>
					<v-btn
						color="success"
						theme="dark"
						:loading="submitLoading"
						:disabled="submitLoading"
						@click="submitPurchaseOrder"
					>
						{{ __("Submit") }}
					</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</v-row>

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
				<v-btn color="error" variant="text" @click="closeSupplierDialog">{{ __("Cancel") }}</v-btn>
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

	<v-dialog v-model="itemDialog" max-width="620px">
		<v-card>
			<v-card-title>
				<span class="text-h6 text-primary">{{ __("Create Item") }}</span>
			</v-card-title>
			<v-card-text>
				<v-text-field
					v-model="itemForm.item_code"
					:label="frappe._('Item Code')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
				/>
				<v-text-field
					v-model="itemForm.item_name"
					:label="frappe._('Item Name')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
				/>
				<v-autocomplete
					v-model="itemForm.stock_uom"
					:items="uomOptions"
					:label="frappe._('Stock UOM')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
					clearable
				/>
				<v-select
					v-model="itemForm.item_group"
					:items="itemGroups"
					:label="frappe._('Item Group')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
					clearable
				/>
				<v-text-field
					v-model="itemForm.barcode"
					:label="frappe._('Barcode')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
				/>
				<v-text-field
					v-model="itemForm.buying_price"
					:label="frappe._('Buying Price')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
					@change="setFormatedCurrency(itemForm, 'buying_price', null, true, $event)"
				/>
				<v-text-field
					v-model="itemForm.selling_price"
					:label="frappe._('Selling Price')"
					density="compact"
					variant="outlined"
					class="pos-themed-input"
					@change="setFormatedCurrency(itemForm, 'selling_price', null, true, $event)"
				/>
			</v-card-text>
			<v-card-actions>
				<v-spacer></v-spacer>
				<v-btn color="error" variant="text" @click="closeItemDialog">{{ __("Cancel") }}</v-btn>
				<v-btn
					color="primary"
					variant="tonal"
					:loading="itemSubmitLoading"
					:disabled="itemSubmitLoading"
					@click="submitItem"
				>
					{{ __("Create") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
/* global __, frappe */
import format, { formatUtils } from "../../format";
import { useStockUtils } from "../../composables/useStockUtils";

export default {
	mixins: [format],
	data: () => ({
		dialog: false,
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
		itemResults: [],
		selectedItemCode: null,
		itemLoading: false,
		purchaseItems: [],
		itemDialog: false,
		itemSubmitLoading: false,
		itemForm: {
			item_code: "",
			item_name: "",
			stock_uom: "",
			item_group: "",
			barcode: "",
			buying_price: "",
			selling_price: "",
		},
		itemGroups: [],
		uomOptions: [],
		itemSearchTimeout: null,
		supplierSearchTimeout: null,
		errorMessage: "",
		submitLoading: false,
	}),
	computed: {
		allowCreateSupplier() {
			return !!this.pos_profile?.posa_allow_create_purchase_suppliers;
		},
		allowCreateItem() {
			return !!this.pos_profile?.posa_allow_create_purchase_items;
		},
		itemHeaders() {
			const headers = [
				{ title: __("Item"), key: "item_name", align: "start" },
				{ title: __("UOM"), key: "uom", align: "start" },
				{ title: __("Qty"), key: "qty", align: "end" },
				{ title: __("Rate"), key: "rate", align: "end" },
			];
			if (this.receiveNow) {
				headers.push({ title: __("Received"), key: "received_qty", align: "end" });
			}
			headers.push(
				{ title: __("Amount"), key: "amount", align: "end" },
				{ title: __("Actions"), key: "actions", align: "center", sortable: false },
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
		resetDialog() {
			this.supplier = null;
			this.supplierOptions = [];
			this.supplierLoading = false;
			this.warehouse = this.pos_profile?.warehouse || null;
			this.transactionDate = this.getTodayDisplay();
			this.scheduleDate = this.getTodayDisplay();
			this.receiveNow = false;
			this.createInvoice = false;
			this.itemResults = [];
			this.selectedItemCode = null;
			this.purchaseItems = [];
			this.errorMessage = "";
			this.submitLoading = false;
		},
		closeDialog() {
			this.dialog = false;
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
		async handleItemSearch(term) {
			if (this.itemSearchTimeout) {
				clearTimeout(this.itemSearchTimeout);
			}
			this.itemSearchTimeout = setTimeout(async () => {
				await this.searchItems(term);
			}, 300);
		},
		async searchItems(searchText = "") {
			const searchValue = formatUtils.fromArabicNumerals(String(searchText || "")).trim();
			this.itemLoading = true;
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.search_items",
					args: {
						search_text: searchValue || null,
						limit: 20,
					},
				});
				const results = Array.isArray(message) ? message : [];
				this.itemResults = results.map((row) => ({
					...row,
					item_uoms: row.item_uoms || [{ uom: row.stock_uom, conversion_factor: 1 }],
				}));
			} catch (error) {
				console.error("Failed to fetch items:", error);
				this.itemResults = [];
			} finally {
				this.itemLoading = false;
			}
		},
		addSelectedItem() {
			const selected = this.itemResults.find((item) => item.item_code === this.selectedItemCode);
			if (!selected) {
				return;
			}
			const existing = this.purchaseItems.find((item) => item.item_code === selected.item_code);
			if (existing) {
				existing.qty += 1;
				if (this.receiveNow && !existing.receivedQtyManual) {
					existing.received_qty = existing.qty;
				}
				this.selectedItemCode = null;
				return;
			}
			this.purchaseItems.push({
				line_id: this.generateLineId(),
				item_code: selected.item_code,
				item_name: selected.item_name,
				stock_uom: selected.stock_uom,
				item_group: selected.item_group,
				item_uoms: selected.item_uoms || [{ uom: selected.stock_uom, conversion_factor: 1 }],
				uom: selected.stock_uom,
				conversion_factor: 1,
				qty: 1,
				rate: 0,
				received_qty: this.receiveNow ? 1 : 0,
				receivedQtyManual: false,
			});
			this.selectedItemCode = null;
		},
		removeItem(item) {
			this.purchaseItems = this.purchaseItems.filter((row) => row.line_id !== item.line_id);
		},
		updateItemQty(item, event) {
			this.setFormatedFloat(item, "qty", null, true, event);
			if (this.receiveNow && !item.receivedQtyManual) {
				item.received_qty = item.qty;
			}
		},
		updateItemRate(item, event) {
			this.setFormatedCurrency(item, "rate", null, true, event);
		},
		updateItemUom(item, value) {
			if (!item || !value) {
				return;
			}
			item.uom = value;
			const matched = (item.item_uoms || []).find((uom) => uom.uom === value);
			item.conversion_factor = matched ? matched.conversion_factor : 1;
			if (this.stockUtils?.calcStockQty) {
				this.stockUtils.calcStockQty(item, item.qty);
			}
		},
		updateItemReceivedQty(item, event) {
			this.setFormatedFloat(item, "received_qty", null, true, event);
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
		openCreateItemDialog() {
			this.resetItemForm();
			this.itemDialog = true;
		},
		closeItemDialog() {
			this.itemDialog = false;
		},
		resetItemForm() {
			this.itemForm = {
				item_code: "",
				item_name: "",
				stock_uom: "",
				item_group: this.itemGroups[0] || "",
				barcode: "",
				buying_price: "",
				selling_price: "",
			};
			this.itemSubmitLoading = false;
		},
		async submitItem() {
			if (!this.itemForm.item_code || !this.itemForm.stock_uom) {
				this.eventBus.emit("show_message", {
					title: __("Item code and stock UOM are required"),
					color: "error",
				});
				return;
			}
			this.itemSubmitLoading = true;
			try {
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.create_purchase_item",
					args: {
						data: {
							...this.itemForm,
							pos_profile: this.pos_profile,
						},
					},
				});
				const itemDoc = message?.item || message;
				if (itemDoc && itemDoc.item_code) {
					this.eventBus.emit("show_message", {
						title: __("Item created successfully"),
						color: "success",
					});
					const newItem = {
						item_code: itemDoc.item_code,
						item_name: itemDoc.item_name || itemDoc.item_code,
						stock_uom: itemDoc.stock_uom,
						item_group: itemDoc.item_group,
					};
					this.itemResults.unshift(newItem);
					this.selectedItemCode = newItem.item_code;
					this.addSelectedItem();
					this.itemDialog = false;
					this.eventBus.emit("force_reload_items");
				}
			} catch (error) {
				console.error("Failed to create item:", error);
				this.eventBus.emit("show_message", {
					title: __("Item creation failed"),
					color: "error",
				});
			} finally {
				this.itemSubmitLoading = false;
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
					this.dialog = false;
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
		async loadItemGroups() {
			if (this.itemGroups.length) return;
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Item Group",
						fields: ["name"],
						filters: { is_group: 0 },
						limit_page_length: 500,
						order_by: "name",
					},
				});
				this.itemGroups = (message || []).map((row) => row.name);
			} catch (error) {
				console.error("Failed to load item groups:", error);
			}
		},
		async loadUoms() {
			if (this.uomOptions.length) return;
			try {
				const { message } = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "UOM",
						fields: ["name"],
						limit_page_length: 500,
						order_by: "name",
					},
				});
				this.uomOptions = (message || []).map((row) => row.name);
			} catch (error) {
				console.error("Failed to load UOMs:", error);
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
	},
	created() {
		this.eventBus.on("open_purchase_orders", async () => {
			this.resetDialog();
			await Promise.all([
				this.searchSuppliers(""),
				this.searchItems(""),
				this.loadSupplierGroups(),
				this.loadItemGroups(),
				this.loadUoms(),
				this.loadWarehouses(),
			]);
			this.dialog = true;
		});
	},
	mounted() {
		this.eventBus.on("register_pos_profile", (data) => {
			this.pos_profile = data.pos_profile || {};
		});
	},
	beforeUnmount() {
		this.eventBus.off("open_purchase_orders");
		this.eventBus.off("register_pos_profile");
	},
};
</script>

<style scoped>
.icon-button {
	cursor: pointer;
	font-size: 20px;
	opacity: 0.7;
	transition: all 0.2s ease;
}

.icon-button:hover {
	opacity: 1;
	color: var(--v-theme-primary);
}
</style>
