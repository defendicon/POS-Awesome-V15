<template>
	<div
		class="my-0 py-0 overflow-y-auto items-table-container"
		:style="{ height: 'calc(100% - 80px)', maxHeight: 'calc(100% - 80px)' }"
		@dragover="onDragOverFromSelector($event)"
		@drop="onDropFromSelector($event)"
		@dragenter="onDragEnterFromSelector"
		@dragleave="onDragLeaveFromSelector"
	>
		<v-data-table-virtual
			:headers="headers"
                        :items="items"
			:theme="$theme.current"
			:expanded="expanded"
			show-expand
			item-value="posa_row_id"
			class="modern-items-table elevation-2"
			:items-per-page="itemsPerPage"
			expand-on-click
			density="compact"
			hide-default-footer
			:single-expand="true"
			:header-props="headerProps"
			:no-data-text="__('No items in cart')"
			@update:expanded="
				(val) =>
					$emit(
						'update:expanded',
						val.map((v) => (typeof v === 'object' ? v.posa_row_id : v)),
					)
			"
			:search="itemSearch"
		>
			<!-- Item name column -->
			<template v-slot:item.item_name="{ item }">
                                <div class="d-flex align-center">
                                        <span>{{ item.item_name }}</span>
                                        <v-chip v-if="item.is_bundle" color="secondary" size="x-small" class="ml-1">{{
                                                __("Bundle")
                                        }}</v-chip>
                                        <v-chip v-if="item.name_overridden" color="primary" size="x-small" class="ml-1">{{
                                                __("Edited")
                                        }}</v-chip>
					<v-icon
						v-if="pos_profile.posa_allow_line_item_name_override && !item.posa_is_replace"
						size="x-small"
						class="ml-1"
						@click.stop="openNameDialog(item)"
						>mdi-pencil</v-icon
					>
					<v-icon
						v-if="item.name_overridden"
						size="x-small"
						class="ml-1"
						@click.stop="resetItemName(item)"
						>mdi-undo</v-icon
					>
				</div>
			</template>

			<!-- Quantity column -->
			<template v-slot:item.qty="{ item }">
				<div class="amount-value" :class="{ 'negative-number': isNegative(item.qty) }">
					{{ formatFloat(item.qty, hide_qty_decimals ? 0 : undefined) }}
				</div>
			</template>

			<!-- Rate column -->
			<template v-slot:item.rate="{ item }">
				<div class="currency-display">
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span class="amount-value" :class="{ 'negative-number': isNegative(item.rate) }">{{
						formatCurrency(item.rate)
					}}</span>
				</div>
			</template>

			<!-- Amount column -->
			<template v-slot:item.amount="{ item }">
				<div class="currency-display">
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span
						class="amount-value"
						:class="{ 'negative-number': isNegative(item.qty * item.rate) }"
						>{{ formatCurrency(item.qty * item.rate) }}</span
					>
				</div>
			</template>

			<!-- Discount percentage column -->
			<template v-slot:item.discount_value="{ item }">
				<div class="amount-value">
					{{
						formatFloat(
							item.discount_percentage ||
								(item.price_list_rate
									? (item.discount_amount / item.price_list_rate) * 100
									: 0),
						)
					}}%
				</div>
			</template>

			<!-- Discount amount column -->
			<template v-slot:item.discount_amount="{ item }">
				<div class="currency-display">
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span
						class="amount-value"
						:class="{ 'negative-number': isNegative(item.discount_amount || 0) }"
						>{{ formatCurrency(item.discount_amount || 0) }}</span
					>
				</div>
			</template>

			<!-- Price list rate column -->
			<template v-slot:item.price_list_rate="{ item }">
				<div class="currency-display">
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span
						class="amount-value"
						:class="{ 'negative-number': isNegative(item.price_list_rate) }"
						>{{ formatCurrency(item.price_list_rate) }}</span
					>
				</div>
			</template>

			<!-- Offer checkbox column -->
			<template v-slot:item.posa_is_offer="{ item }">
				<v-checkbox-btn
					v-model="item.posa_is_offer"
					class="center"
					@change="toggleOffer(item)"
				></v-checkbox-btn>
			</template>

			<!-- Expanded row content using Vuetify's built-in system -->
			<template v-slot:expanded-row="{ item }">
				<td :colspan="headers.length" class="ma-0 pa-0">
                                        <div class="expanded-content">
						<!-- Enhanced Action Panel with better visual hierarchy -->
						<div class="action-panel">
							<div class="action-panel-header">
								<v-icon size="small" class="action-panel-icon">mdi-cog</v-icon>
								<span class="action-panel-title">{{ __("Quick Actions") }}</span>
							</div>
							<div class="action-panel-content">
                                                                <div class="action-button-group">
                                                                        <v-btn
                                                                                :disabled="!!item.posa_is_replace"
                                                                                size="large"
                                                                                color="error"
                                                                                variant="tonal"
                                                                                class="item-action-btn delete-btn"
                                                                                @click.stop="removeItem(item)"
                                                                        >
                                                                                <v-icon size="large">mdi-trash-can-outline</v-icon>
                                                                                <span class="action-label">{{ __("Remove") }}</span>
                                                                        </v-btn>
                                                                        <v-btn
                                                                                v-if="item.is_bundle"
                                                                                :disabled="!!item.posa_is_replace"
                                                                                size="large"
                                                                                color="primary"
                                                                                variant="tonal"
                                                                                class="item-action-btn bundle-btn"
                                                                                @click.stop="$emit('view-packed', item.bundle_id)"
                                                                        >
                                                                                <v-icon size="large">mdi-package-variant</v-icon>
                                                                               <span class="action-label">{{ __("Items Included") }}</span>
                                                                       </v-btn>
                                                               </div>

								<div class="action-button-group">
									<v-btn
										:disabled="!!item.posa_is_replace"
										size="large"
										color="warning"
										variant="tonal"
										class="item-action-btn minus-btn"
										@click.stop="subtractOne(item)"
									>
										<v-icon size="large">mdi-minus-circle-outline</v-icon>
										<span class="action-label">{{ __("Decrease") }}</span>
									</v-btn>
									<v-btn
										:disabled="
											!!item.posa_is_replace ||
											((!stock_settings.allow_negative_stock ||
												pos_profile.posa_block_sale_beyond_available_qty) &&
												item.max_qty !== undefined &&
												item.qty >= item.max_qty)
										"
										size="large"
										color="success"
										variant="tonal"
										class="item-action-btn plus-btn"
										@click.stop="addOne(item)"
									>
										<v-icon size="large">mdi-plus-circle-outline</v-icon>
										<span class="action-label">{{ __("Increase") }}</span>
									</v-btn>
								</div>
							</div>
						</div>

						<!-- Enhanced Item Details Form with better organization -->
						<div class="item-details-form">
							<!-- Basic Information Section -->
							<div class="form-section">
								<div class="section-header">
									<v-icon size="small" class="section-icon">mdi-information-outline</v-icon>
									<span class="section-title">{{ __("Basic Information") }}</span>
								</div>
								<div class="form-row">
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Item Code')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											v-model="item.item_code"
											disabled
											prepend-inner-icon="mdi-barcode"
										></v-text-field>
									</div>
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('QTY')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											:model-value="
												formatFloat(item.qty, hide_qty_decimals ? 0 : undefined)
											"
											@change="
												setFormatedQty(item, 'qty', null, false, $event.target.value)
											"
											:rules="[isNumber]"
											:disabled="!!item.posa_is_replace"
											prepend-inner-icon="mdi-numeric"
										></v-text-field>
										<div v-if="item.max_qty !== undefined" class="text-caption mt-1">
											{{
												__("In stock: {0}", [
													formatFloat(
														item.max_qty,
														hide_qty_decimals ? 0 : undefined,
													),
												])
											}}
										</div>
									</div>
									<div class="form-field">
										<v-select
											density="compact"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											:label="frappe._('UOM')"
											v-model="item.uom"
											:items="item.item_uoms"
											variant="outlined"
											item-title="uom"
											item-value="uom"
											hide-details
											@update:model-value="calcUom(item, $event)"
											:disabled="
												!!item.posa_is_replace ||
												(isReturnInvoice && invoice_doc.return_against)
											"
											prepend-inner-icon="mdi-weight"
										></v-select>
									</div>
								</div>
							</div>

							<!-- Pricing Section -->
							<div class="form-section">
								<div class="section-header">
									<v-icon size="small" class="section-icon">mdi-currency-usd</v-icon>
									<span class="section-title">{{ __("Pricing & Discounts") }}</span>
								</div>
								<div class="form-row">
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											id="rate"
											:label="frappe._('Rate')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											:model-value="formatCurrency(item.rate)"
											@change="[
												setFormatedCurrency(item, 'rate', null, false, $event),
												calcPrices(item, $event.target.value, $event),
											]"
											:disabled="
												!pos_profile.posa_allow_user_to_edit_rate ||
												!!item.posa_is_replace ||
												!!item.posa_offer_applied
											"
											prepend-inner-icon="mdi-currency-usd"
										></v-text-field>
									</div>
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											id="discount_percentage"
											:label="frappe._('Discount %')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											:model-value="formatFloat(item.discount_percentage || 0)"
											@change="[
												setFormatedCurrency(
													item,
													'discount_percentage',
													null,
													false,
													$event,
												),
												calcPrices(item, $event.target.value, $event),
											]"
											:disabled="
												!pos_profile.posa_allow_user_to_edit_item_discount ||
												!!item.posa_is_replace ||
												!!item.posa_offer_applied
											"
											prepend-inner-icon="mdi-percent"
										></v-text-field>
									</div>
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											id="discount_amount"
											:label="frappe._('Discount Amount')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											:model-value="formatCurrency(item.discount_amount || 0)"
											@change="[
												setFormatedCurrency(
													item,
													'discount_amount',
													null,
													false,
													$event,
												),
												calcPrices(item, $event.target.value, $event),
											]"
											:disabled="
												!pos_profile.posa_allow_user_to_edit_item_discount ||
												!!item.posa_is_replace ||
												!!item.posa_offer_applied
											"
											prepend-inner-icon="mdi-tag-minus"
										></v-text-field>
									</div>
								</div>
								<div class="form-row">
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Price List Rate')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											:model-value="formatCurrency(item.price_list_rate || 0)"
											:disabled="!pos_profile.posa_allow_price_list_rate_change"
											prepend-inner-icon="mdi-format-list-numbered"
											:prefix="currencySymbol(pos_profile.currency)"
											@change="changePriceListRate(item)"
										></v-text-field>
									</div>
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Total Amount')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											:model-value="formatCurrency(item.qty * item.rate)"
											disabled
											prepend-inner-icon="mdi-calculator"
										></v-text-field>
									</div>
									<div
										class="form-field"
										v-if="pos_profile.posa_allow_price_list_rate_change"
									>
										<v-btn
											size="small"
											color="primary"
											variant="outlined"
											class="change-price-btn"
											@click.stop="changePriceListRate(item)"
										>
											<v-icon size="small" class="mr-1">mdi-pencil</v-icon>
											{{ __("Change Price") }}
										</v-btn>
									</div>
								</div>
							</div>

							<!-- Stock Information Section -->
							<div class="form-section">
								<div class="section-header">
									<v-icon size="small" class="section-icon">mdi-warehouse</v-icon>
									<span class="section-title">{{ __("Stock Information") }}</span>
								</div>
								<div class="form-row">
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Available QTY')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											:model-value="formatFloat(item.actual_qty)"
											disabled
											prepend-inner-icon="mdi-package-variant"
										></v-text-field>
									</div>
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Stock QTY')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											:model-value="formatFloat(item.stock_qty)"
											disabled
											prepend-inner-icon="mdi-scale-balance"
										></v-text-field>
									</div>
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Stock UOM')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											v-model="item.stock_uom"
											disabled
											prepend-inner-icon="mdi-weight-pound"
										></v-text-field>
									</div>
								</div>
								<div class="form-row">
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Warehouse')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											v-model="item.warehouse"
											disabled
											prepend-inner-icon="mdi-warehouse"
										></v-text-field>
									</div>
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Group')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											v-model="item.item_group"
											disabled
											prepend-inner-icon="mdi-folder-outline"
										></v-text-field>
									</div>
									<div class="form-field" v-if="item.posa_offer_applied">
										<v-checkbox
											density="compact"
											:label="frappe._('Offer Applied')"
											v-model="item.posa_offer_applied"
											readonly
											hide-details
											class="mt-1"
											color="success"
										></v-checkbox>
									</div>
								</div>
							</div>

							<!-- Serial Number Section -->
							<div class="form-section" v-if="item.has_serial_no || item.serial_no">
								<div class="section-header">
									<v-icon size="small" class="section-icon">mdi-barcode-scan</v-icon>
									<span class="section-title">{{ __("Serial Numbers") }}</span>
								</div>
								<div class="form-row">
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Serial No QTY')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											v-model="item.serial_no_selected_count"
											type="number"
											disabled
											prepend-inner-icon="mdi-counter"
										></v-text-field>
									</div>
								</div>
								<div class="form-row">
									<div class="form-field full-width">
										<v-autocomplete
											v-model="item.serial_no_selected"
											:items="item.serial_no_data"
											item-title="serial_no"
											item-value="serial_no"
											variant="outlined"
											density="compact"
											chips
											color="primary"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											:label="frappe._('Serial No')"
											multiple
											@update:model-value="setSerialNo(item)"
											prepend-inner-icon="mdi-barcode"
										></v-autocomplete>
									</div>
								</div>
							</div>

							<!-- Batch Number Section -->
							<div class="form-section" v-if="item.has_batch_no || item.batch_no">
								<div class="section-header">
									<v-icon size="small" class="section-icon"
										>mdi-package-variant-closed</v-icon
									>
									<span class="section-title">{{ __("Batch Information") }}</span>
								</div>
								<div class="form-row">
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Batch No. Available QTY')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											:model-value="formatFloat(item.actual_batch_qty)"
											disabled
											prepend-inner-icon="mdi-package-variant"
										></v-text-field>
									</div>
									<div class="form-field">
										<v-text-field
											density="compact"
											variant="outlined"
											color="primary"
											:label="frappe._('Batch No Expiry Date')"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											hide-details
											v-model="item.batch_no_expiry_date"
											disabled
											prepend-inner-icon="mdi-calendar-clock"
										></v-text-field>
									</div>
									<div class="form-field">
										<v-autocomplete
											v-model="item.batch_no"
											:items="item.batch_no_data"
											item-title="batch_no"
											variant="outlined"
											density="compact"
											color="primary"
											:bg-color="isDarkTheme ? '#1E1E1E' : 'white'"
											class="dark-field"
											:label="frappe._('Batch No')"
											@update:model-value="setBatchQty(item, $event)"
											hide-details
											prepend-inner-icon="mdi-package-variant-closed"
										>
											<template v-slot:item="{ props, item }">
												<v-list-item v-bind="props">
													<v-list-item-title
														v-html="item.raw.batch_no"
													></v-list-item-title>
													<v-list-item-subtitle
														v-html="
															`Available QTY  '${item.raw.batch_qty}' - Expiry Date ${item.raw.expiry_date}`
														"
													></v-list-item-subtitle>
												</v-list-item>
											</template>
										</v-autocomplete>
									</div>
								</div>
							</div>

							<!-- Delivery Date Section -->
							<div
								class="form-section"
								v-if="pos_profile.posa_allow_sales_order && invoiceType == 'Order'"
							>
								<div class="section-header">
									<v-icon size="small" class="section-icon">mdi-calendar-check</v-icon>
									<span class="section-title">{{ __("Delivery Information") }}</span>
								</div>
								<div class="form-row">
									<div class="form-field">
										<VueDatePicker
											v-model="item.posa_delivery_date"
											model-type="format"
											format="dd-MM-yyyy"
											:min-date="new Date()"
											auto-apply
											:dark="isDarkTheme"
											@update:model-value="validateDueDate(item)"
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
				</td>
			</template>
		</v-data-table-virtual>
		<v-dialog v-model="editNameDialog" max-width="400">
			<v-card>
				<v-card-title>{{ __("Item Name") }}</v-card-title>
				<v-card-text>
					<v-text-field v-model="editedName" :maxlength="140" />
				</v-card-text>
				<v-card-actions>
					<v-btn
						v-if="editNameTarget && editNameTarget.name_overridden"
						variant="text"
						@click="resetItemName(editNameTarget)"
						>{{ __("Reset") }}</v-btn
					>
					<v-spacer></v-spacer>
					<v-btn variant="text" @click="editNameDialog = false">{{ __("Cancel") }}</v-btn>
					<v-btn color="primary" variant="text" @click="saveItemName">{{ __("Save") }}</v-btn>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script>
import _ from "lodash";
export default {
	name: "ItemsTable",
	props: {
		headers: Array,
		items: Array,
		expanded: Array,
		itemsPerPage: Number,
		itemSearch: String,
		pos_profile: Object,
		invoice_doc: Object,
		invoiceType: String,
		stock_settings: Object,
		displayCurrency: String,
		formatFloat: Function,
		formatCurrency: Function,
		currencySymbol: Function,
		isNumber: Function,
		setFormatedQty: Function,
		setFormatedCurrency: Function,
		calcPrices: Function,
		calcUom: Function,
		setSerialNo: Function,
		setBatchQty: Function,
		validateDueDate: Function,
		removeItem: Function,
		subtractOne: Function,
		addOne: Function,
		isReturnInvoice: Boolean,
		toggleOffer: Function,
		changePriceListRate: Function,
		isNegative: Function,
	},
	data() {
		return {
			draggedItem: null,
			draggedIndex: null,
			dragOverIndex: null,
			isDragging: false,
			pendingAdd: null,
			editNameDialog: false,
			editNameTarget: null,
			editedName: "",
		};
	},
	computed: {
		headerProps() {
			return this.isDarkTheme ? { style: "background-color:#121212;color:#fff" } : {};
		},
		isDarkTheme() {
			return this.$theme.current === "dark";
		},
		hide_qty_decimals() {
			try {
				const saved = localStorage.getItem("posawesome_item_selector_settings");
				if (saved) {
					const opts = JSON.parse(saved);
					return !!opts.hide_qty_decimals;
				}
			} catch (e) {
				console.error("Failed to load item selector settings:", e);
			}
			return false;
		},
	},
	methods: {
		onDragOverFromSelector(event) {
			// Check if drag data is from item selector
			const dragData = event.dataTransfer.types.includes("application/json");
			if (dragData) {
				event.preventDefault();
				event.dataTransfer.dropEffect = "copy";
			}
		},

		onDragEnterFromSelector() {
			this.$emit("show-drop-feedback", true);
		},

		onDragLeaveFromSelector(event) {
			// Only hide feedback if leaving the entire table area
			if (!event.currentTarget.contains(event.relatedTarget)) {
				this.$emit("show-drop-feedback", false);
			}
		},

		onDropFromSelector(event) {
			event.preventDefault();

			try {
				const dragData = JSON.parse(event.dataTransfer.getData("application/json"));

				if (dragData.type === "item-from-selector") {
					this.addItemDebounced(dragData.item);
					this.$emit("item-dropped", false);
				}
			} catch (error) {
				console.error("Error parsing drag data:", error);
			}
		},
		addItem(newItem) {
			// Find a matching item (by item_code, uom, and rate)
			const match = this.items.find(
				(item) =>
					item.item_code === newItem.item_code &&
					item.uom === newItem.uom &&
					item.rate === newItem.rate,
			);
			if (match) {
				// If found, increment quantity
				match.qty += newItem.qty || 1;
				match.amount = match.qty * match.rate;
				this.$forceUpdate();
			} else {
				this.items.push({ ...newItem });
			}
		},
		addItemDebounced: _.debounce(function (item) {
			this.addItem(item);
		}, 50),
		openNameDialog(item) {
			this.editNameTarget = item;
			this.editedName = item.item_name;
			this.editNameDialog = true;
		},
		sanitizeName(name) {
			const div = document.createElement("div");
			div.innerHTML = name;
			return (div.textContent || div.innerText || "").trim().slice(0, 140);
		},
		saveItemName() {
			if (!this.editNameTarget) return;
			const clean = this.sanitizeName(this.editedName);
			if (!this.editNameTarget.original_item_name) {
				this.editNameTarget.original_item_name = this.editNameTarget.item_name;
			}
			this.editNameTarget.item_name = clean;
			this.editNameTarget.name_overridden = clean !== this.editNameTarget.original_item_name ? 1 : 0;
			this.editNameDialog = false;
		},
		resetItemName(item) {
			if (item && item.original_item_name) {
				item.item_name = item.original_item_name;
				item.name_overridden = 0;
			}
			if (this.editNameTarget === item) {
				this.editedName = item.item_name;
			}
		},
	},
};
</script>

<style scoped>
/* Modern table styling with enhanced visual hierarchy */
.modern-items-table {
	border-radius: var(--border-radius-lg);
	overflow: hidden;
	box-shadow: var(--shadow-md);
	border: 1px solid rgba(0, 0, 0, 0.09);
	height: 100%;
	display: flex;
	flex-direction: column;
	transition: all 0.3s ease;
}

/* Ensure items table can scroll when many rows exist */
.items-table-container {
	overflow-y: auto;
}

/* Table wrapper styling */
.modern-items-table :deep(.v-data-table__wrapper),
.modern-items-table :deep(.v-table__wrapper) {
	border-radius: var(--border-radius-sm);
	height: 100%;
	overflow-y: auto;
	scrollbar-width: thin;
}

/* Table header styling */
.modern-items-table :deep(th) {
	font-weight: 600;
	font-size: 0.9rem;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	padding: 12px 16px;
	transition: background-color var(--transition-normal);
	border-bottom: 2px solid var(--table-header-border);
	background-color: var(--table-header-bg, var(--surface-secondary, #f5f5f5));
	color: var(--table-header-text);
	position: sticky;
	top: 0;
	z-index: 1;
}

/* Table row styling */
.modern-items-table :deep(tr) {
	transition: all 0.2s ease;
	border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.modern-items-table :deep(tr:hover) {
	background-color: var(--table-row-hover);
	transform: translateY(-1px);
	box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

/* Table cell styling */
.modern-items-table :deep(td) {
	padding: 12px 16px;
	vertical-align: middle;
}

/* Expanded content styling */
.expanded-content {
	padding: 24px;
	background: linear-gradient(135deg, var(--surface-primary) 0%, var(--surface-secondary) 100%);
	border-radius: 0 0 var(--border-radius-lg) var(--border-radius-lg);
	box-shadow: inset 0 4px 12px rgba(0, 0, 0, 0.03);
	animation: fadeIn 0.4s ease;
	border: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
	border-top: none;
}

:deep([data-theme="dark"]) .expanded-content,
:deep(.v-theme--dark) .expanded-content {
	background: linear-gradient(135deg, rgba(255, 255, 255, 0.01) 0%, rgba(255, 255, 255, 0.03) 100%);
	box-shadow: inset 0 4px 12px rgba(0, 0, 0, 0.1);
	border: 1px solid rgba(255, 255, 255, 0.08);
}

@keyframes fadeIn {
	from {
		opacity: 0;
		transform: translateY(-15px);
	}

	to {
		opacity: 1;
		transform: translateY(0);
	}
}

/* Action panel styling */
.action-panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 16px;
	margin-bottom: 20px;
	background: linear-gradient(135deg, var(--surface-secondary) 0%, var(--surface-tertiary) 100%);
	border-radius: var(--border-radius-lg);
	border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	transition: all 0.3s ease;
}

:deep([data-theme="dark"]) .action-panel,
:deep(.v-theme--dark) .action-panel {
	background: linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.06) 100%);
	border: 1px solid rgba(255, 255, 255, 0.12);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.action-panel-header {
	display: flex;
	align-items: center;
	padding-bottom: 8px;
	border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
}

:deep([data-theme="dark"]) .action-panel-header,
:deep(.v-theme--dark) .action-panel-header {
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.action-panel-icon {
	margin-right: 8px;
	color: var(--primary-color, #1976d2);
}

.action-panel-title {
	font-weight: 600;
	font-size: 0.9rem;
	color: var(--text-primary);
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.action-panel-content {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.action-button-group {
	display: flex;
	gap: 8px;
}

/* Item action buttons styling */
.item-action-btn {
	min-width: 44px !important;
	height: 44px !important;
	border-radius: 12px !important;
	transition: all 0.3s ease;
	box-shadow: 0 3px 8px rgba(0, 0, 0, 0.1) !important;
	position: relative;
	overflow: hidden;
	display: flex;
	align-items: center;
	padding: 0 16px !important;
	font-weight: 500;
}

.item-action-btn .action-label {
	margin-left: 8px;
	font-weight: 500;
	display: none;
}

@media (min-width: 600px) {
	.item-action-btn .action-label {
		display: inline-block;
	}

	.item-action-btn {
		min-width: 120px !important;
	}
}

.item-action-btn:hover {
	transform: translateY(-2px);
	box-shadow: 0 5px 12px rgba(0, 0, 0, 0.15) !important;
}

.item-action-btn .v-icon {
	font-size: 22px !important;
	position: relative;
	z-index: 2;
}

/* Light theme button styles with enhanced gradients */
.item-action-btn.delete-btn {
	background: linear-gradient(145deg, #ffebee, #ffcdd2) !important;
}

.item-action-btn.delete-btn:hover {
	background: linear-gradient(145deg, #ffcdd2, #ef9a9a) !important;
}

.item-action-btn.minus-btn {
	background: linear-gradient(145deg, #fff8e1, #ffecb3) !important;
}

.item-action-btn.minus-btn:hover {
	background: linear-gradient(145deg, #ffecb3, #ffe082) !important;
}

.item-action-btn.plus-btn {
	background: linear-gradient(145deg, #e8f5e9, #c8e6c9) !important;
}

.item-action-btn.plus-btn:hover {
	background: linear-gradient(145deg, #c8e6c9, #a5d6a7) !important;
}

/* Dark theme button styles */
:deep([data-theme="dark"]) .item-action-btn.delete-btn,
:deep(.v-theme--dark) .item-action-btn.delete-btn {
	background: linear-gradient(145deg, #4a1515, #3a1010) !important;
	color: #ff8a80 !important;
}

:deep([data-theme="dark"]) .item-action-btn.delete-btn:hover,
:deep(.v-theme--dark) .item-action-btn.delete-btn:hover {
	background: linear-gradient(145deg, #5a1a1a, #4a1515) !important;
}

:deep([data-theme="dark"]) .item-action-btn.minus-btn,
:deep(.v-theme--dark) .item-action-btn.minus-btn {
	background: linear-gradient(145deg, #4a3c10, #3a2e0c) !important;
	color: #ffe082 !important;
}

:deep([data-theme="dark"]) .item-action-btn.minus-btn:hover,
:deep(.v-theme--dark) .item-action-btn.minus-btn:hover {
	background: linear-gradient(145deg, #5a4a14, #4a3c10) !important;
}

:deep([data-theme="dark"]) .item-action-btn.plus-btn,
:deep(.v-theme--dark) .item-action-btn.plus-btn {
	background: linear-gradient(145deg, #1b4620, #133419) !important;
	color: #a5d6a7 !important;
}

:deep([data-theme="dark"]) .item-action-btn.plus-btn:hover,
:deep(.v-theme--dark) .item-action-btn.plus-btn:hover {
	background: linear-gradient(145deg, #235828, #1b4620) !important;
}

:deep([data-theme="dark"]) .item-action-btn .v-icon,
:deep(.v-theme--dark) .item-action-btn .v-icon {
	opacity: 0.9;
}

/* Form layout styling */
.item-details-form {
	margin-top: 16px;
}

.form-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 8px;
}

.form-field {
	flex: 1;
	min-width: 200px;
}

.form-field.full-width {
	flex-basis: 100%;
}

.form-section {
	margin-top: 12px;
	padding: 10px;
	background: var(--surface-secondary);
	border-radius: var(--border-radius-lg);
	border: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.02);
	transition: all 0.3s ease;
}

.form-section:hover {
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	transform: translateY(-1px);
}

:deep([data-theme="dark"]) .form-section,
:deep(.v-theme--dark) .form-section {
	background: rgba(255, 255, 255, 0.02);
	border: 1px solid rgba(255, 255, 255, 0.08);
	box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

:deep([data-theme="dark"]) .form-section:hover,
:deep(.v-theme--dark) .form-section:hover {
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.section-header {
	display: flex;
	align-items: center;
	margin-bottom: 8px;
	padding-bottom: 8px;
	border-bottom: 2px solid var(--primary-color, #1976d2);
	position: relative;
}

.section-header::after {
	content: "";
	position: absolute;
	bottom: -2px;
	left: 0;
	width: 40px;
	height: 2px;
	background: linear-gradient(90deg, var(--primary-color, #1976d2), transparent);
}

.section-icon {
	margin-right: 10px;
	color: var(--primary-color, #1976d2);
	background: rgba(25, 118, 210, 0.1);
	padding: 6px;
	border-radius: 8px;
}

:deep([data-theme="dark"]) .section-icon,
:deep(.v-theme--dark) .section-icon {
	background: rgba(144, 202, 249, 0.1);
}

.section-title {
	font-weight: 600;
	font-size: 0.85rem;
	color: var(--text-primary);
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

@media (max-width: 600px) {
	.form-section {
		margin-top: 8px;
		padding: 8px;
	}

	.form-row {
		gap: 6px;
		margin-bottom: 6px;
	}

	.section-header {
		margin-bottom: 6px;
		padding-bottom: 6px;
	}

	.form-field {
		min-width: 140px;
	}

	.section-title {
		font-size: 0.8rem;
	}
}

/* Change price button styling */
.change-price-btn {
	margin-top: 8px;
	border-radius: 8px !important;
	text-transform: none !important;
	font-weight: 500 !important;
	transition: all 0.3s ease !important;
}

.change-price-btn:hover {
	transform: translateY(-1px);
	box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1) !important;
}

/* Enhanced form field styling */
.form-field :deep(.v-field) {
	border-radius: 8px !important;
	transition: all 0.3s ease !important;
}

.form-field :deep(.v-field:hover) {
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05) !important;
}

.form-field :deep(.v-field--focused) {
	box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2) !important;
}

/* Currency and amount display with enhanced Arabic number support */
.currency-display {
	display: flex;
	align-items: center;
	justify-content: flex-start;
}

.currency-symbol {
	opacity: 0.7;
	margin-right: 2px;
	font-size: 0.85em;
	font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
}

.amount-value {
	font-weight: 500;
	text-align: left;
	/* Enhanced Arabic number font stack for maximum clarity */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	/* Force lining numbers for consistent height and alignment */
	font-variant-numeric: lining-nums tabular-nums;
	/* Additional OpenType features for better Arabic number rendering */
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	/* Ensure crisp rendering */
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	/* Better number spacing */
	letter-spacing: 0.02em;
}

/* Enhanced negative number styling for Arabic context */
.negative-number {
	color: #d32f2f !important;
	font-weight: 600;
	/* Same enhanced font stack for negative numbers */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Enhanced form fields for Arabic number input */
.form-field :deep(.v-field) input,
.form-field :deep(.v-field) textarea {
	/* Enhanced Arabic number font stack for input fields */
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
	letter-spacing: 0.01em;
}

/* Enhanced Arabic support for all numeric displays in the table */
.modern-items-table :deep(td),
.modern-items-table :deep(th) {
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	-webkit-font-smoothing: antialiased;
	-moz-osx-font-smoothing: grayscale;
}

/* Drag and drop styles */
.draggable-row {
	transition: all 0.2s ease;
	cursor: move;
}

.draggable-row:hover {
	background-color: rgba(0, 0, 0, 0.02);
}

:deep([data-theme="dark"]) .draggable-row:hover,
:deep(.v-theme--dark) .draggable-row:hover {
	background-color: rgba(255, 255, 255, 0.05);
}

.drag-handle-cell {
	width: 40px;
	text-align: center;
	padding: 8px 4px;
}

.drag-handle {
	cursor: grab;
	opacity: 0.6;
	transition: opacity 0.2s ease;
}

.drag-handle:hover {
	opacity: 1;
}

.drag-handle:active {
	cursor: grabbing;
}

.drag-source {
	opacity: 0.5;
	background-color: rgba(25, 118, 210, 0.1) !important;
}

.drag-over {
	background-color: rgba(25, 118, 210, 0.2) !important;
	border-top: 2px solid #1976d2;
	transform: translateY(-1px);
}

.drag-active .draggable-row:not(.drag-source):not(.drag-over) {
	opacity: 0.7;
}

/* Dark theme drag styles */
:deep([data-theme="dark"]) .drag-source,
:deep(.v-theme--dark) .drag-source {
	background-color: rgba(144, 202, 249, 0.1) !important;
}

:deep([data-theme="dark"]) .drag-over,
:deep(.v-theme--dark) .drag-over {
	background-color: rgba(144, 202, 249, 0.2) !important;
	border-top: 2px solid #90caf9;
}

/* Expanded row styling */
.expanded-row {
	background-color: var(--surface-secondary);
}
</style>
