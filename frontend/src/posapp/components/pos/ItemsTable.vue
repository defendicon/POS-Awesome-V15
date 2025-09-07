<template>
	<div
		class="my-0 py-0 overflow-y-auto items-table-container bg-white dark:bg-gray-900 dark:text-gray-100"
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
			class="modern-items-table elevation-2 bg-white dark:bg-gray-800 dark:text-gray-100"
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
				<div class="qty-counter-container" :class="{ 'rtl-layout': isRTL }" :title="`RTL: ${isRTL}`">
					<v-btn
						:disabled="!!item.posa_is_replace"
						size="small"
						color="warning"
						variant="tonal"
						class="qty-control-btn minus-btn"
						@click.stop="handleMinusClick(item)"
					>
						<v-icon size="small">mdi-minus</v-icon>
					</v-btn>
					<input
						type="number"
						min="1"
						class="qty-input qty-display amount-value number-field-rtl"
						:class="{ 'negative-number': isNegative(item.qty) }"
						v-model.number="item.qty"
						@change="handleQtyChange(item)"
						@blur="handleQtyChange(item)"
					/>
					<v-btn
						:disabled="
							!!item.posa_is_replace ||
							((!stock_settings.allow_negative_stock ||
								pos_profile.posa_block_sale_beyond_available_qty) &&
								item.max_qty !== undefined &&
								item.qty >= item.max_qty)
						"
						size="small"
						color="success"
						variant="tonal"
						class="qty-control-btn plus-btn"
						@click.stop="addOne(item)"
					>
						<v-icon size="small">mdi-plus</v-icon>
					</v-btn>
				</div>
			</template>

			<!-- Rate column -->
			<template v-slot:item.rate="{ item }">
				<div class="currency-display right-aligned">
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span class="amount-value" :class="{ 'negative-number': isNegative(item.rate) }">{{
						formatCurrency(item.rate)
					}}</span>
				</div>
			</template>

			<!-- Amount column -->
			<template v-slot:item.amount="{ item }">
				<div class="currency-display right-aligned">
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
				<div class="currency-display right-aligned">
					<span class="amount-value"
						>{{
							formatFloat(
								item.discount_percentage ||
									(item.price_list_rate
										? (item.discount_amount / item.price_list_rate) * 100
										: 0),
							)
						}}%</span
					>
				</div>
			</template>

			<!-- Discount amount column -->
			<template v-slot:item.discount_amount="{ item }">
				<div class="currency-display right-aligned">
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
				<div class="currency-display right-aligned">
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span
						class="amount-value"
						:class="{ 'negative-number': isNegative(item.price_list_rate) }"
						>{{ formatCurrency(item.price_list_rate) }}</span
					>
				</div>
			</template>

			<!-- Offer toggle button column -->
			<template v-slot:item.posa_is_offer="{ item }">
				<v-btn
					size="x-small"
					color="primary"
					variant="tonal"
					class="ma-0 pa-0"
					@click.stop="toggleOffer(item)"
				>
					{{ item.posa_offer_applied ? __("Remove Offer") : __("Apply Offer") }}
				</v-btn>
			</template>

			<!-- Actions column -->
			<template v-slot:item.actions="{ item }">
				<v-btn
					:disabled="!!item.posa_is_replace"
					size="default"
					color="error"
					variant="tonal"
					class="delete-action-btn"
					@click.stop="removeItem(item)"
				>
					<v-icon size="small">mdi-delete-outline</v-icon>
				</v-btn>
			</template>

			<!-- Expanded row content using Vuetify's built-in system -->
			<template v-slot:expanded-row="{ item }">
				<td :colspan="headers.length" class="ma-0 pa-0 expanded-row-cell">
					<div class="expanded-content responsive-expanded-content">
						<!-- Item Details Form -->
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
											@change="handleQtyChange(item, $event)"
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
		isRTL() {
			// Multiple RTL detection methods
			const htmlDir = document.documentElement.getAttribute("dir");
			const bodyDir = document.body.getAttribute("dir");
			const computedDir = window.getComputedStyle(document.documentElement).direction;
			const lang = document.documentElement.getAttribute("lang") || navigator.language;

			// Check if current language is RTL
			const rtlLanguages = ["ar", "he", "fa", "ur", "yi"];
			const isRTLLanguage = rtlLanguages.some((rtlLang) => lang.startsWith(rtlLang));

			console.log("RTL Detection:", {
				htmlDir,
				bodyDir,
				computedDir,
				lang,
				isRTLLanguage,
				result: htmlDir === "rtl" || bodyDir === "rtl" || computedDir === "rtl" || isRTLLanguage,
			});

			return htmlDir === "rtl" || bodyDir === "rtl" || computedDir === "rtl" || isRTLLanguage;
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
		handleQtyChange(item, event) {
			let newQty;
			if (event && event.target) {
				newQty = parseFloat(event.target.value);
			} else {
				newQty = parseFloat(item.qty);
			}
			if (!newQty || newQty < 1) {
				newQty = 1;
			}
			this.setFormatedQty(item, "qty", null, false, newQty);
		},
		handleMinusClick(item) {
			if (item.qty > 1) {
				// Use the existing subtractOne function
				this.subtractOne(item);
			} else {
				// Enforce minimum quantity of 1
				this.setFormatedQty(item, "qty", null, false, 1);
			}
		},
	},
};
</script>

<style scoped>
/* Modern table styling with clean design */
.modern-items-table {
	border-radius: 8px;
	overflow: hidden;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	border: 1px solid rgba(0, 0, 0, 0.1);
	height: 100%;
	display: flex;
	flex-direction: column;
	transition: all 0.3s ease;
	background: #ffffff;
}

:deep([data-theme="dark"]) .modern-items-table,
:deep(.v-theme--dark) .modern-items-table {
	background: #1a202c;
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
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
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.3px;
	padding: 12px;
	transition: background-color 0.2s ease;
	border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	background-color: #f8f9fa;
	color: #495057;
	position: sticky;
	top: 0;
	z-index: 1;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 150px;
	min-width: 80px;
	text-align: center;
	vertical-align: middle !important;
	line-height: 1.2 !important;
	height: 40px;
}

:deep([data-theme="dark"]) .modern-items-table :deep(th),
:deep(.v-theme--dark) .modern-items-table :deep(th) {
	background-color: #2d3748;
	color: #e2e8f0;
	border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

/* Header text wrapper for better control */
.modern-items-table :deep(th .v-data-table-header__content) {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 100%;
	display: block;
}

/* Tooltip for truncated headers on hover */
.modern-items-table :deep(th:hover) {
	overflow: visible;
	z-index: 10;
}

.modern-items-table :deep(th:hover .v-data-table-header__content) {
	white-space: normal;
	word-break: break-word;
	background: var(--table-header-bg, var(--surface-secondary, #f5f5f5));
	padding: 4px 8px;
	border-radius: 4px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	position: relative;
	z-index: 11;
}

/* Table row styling */
.modern-items-table :deep(tr) {
	transition: background-color 0.2s ease;
	border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.modern-items-table :deep(tr:hover) {
	background-color: rgba(0, 0, 0, 0.02);
}

:deep([data-theme="dark"]) .modern-items-table :deep(tr) {
	border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

:deep([data-theme="dark"]) .modern-items-table :deep(tr:hover) {
	background-color: rgba(255, 255, 255, 0.03);
}

/* Table cell styling */
.modern-items-table :deep(td) {
	padding: 16px 12px;
	vertical-align: middle;
	height: 60px;
	text-align: center;
	color: #374151;
	position: relative;
}

/* Ensure all cell contents fill the cell */
.modern-items-table :deep(td) > div {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
}

:deep([data-theme="dark"]) .modern-items-table :deep(td),
:deep(.v-theme--dark) .modern-items-table :deep(td) {
	color: #e5e7eb;
}

/* =================================================================
   EXPANDED CONTENT - CLEAN STRUCTURE
   ================================================================= */

/* Base expanded row styling */
.expanded-row-cell {
	padding: 0 !important;
	width: 100%;
	overflow: hidden;
}

/* Main expanded content container */
.expanded-content {
	padding: 24px;
	width: 100%;
	box-sizing: border-box;
	background: #f8f9fa;
	border-radius: 0 0 8px 8px;
	border: 1px solid rgba(0, 0, 0, 0.1);
	border-top: none;
	animation: expandIn 0.3s ease forwards;

	/* Enable container queries */
	container-type: inline-size;
	container-name: expanded-content;
}

/* Dark theme */
:deep([data-theme="dark"]) .expanded-content,
:deep(.v-theme--dark) .expanded-content {
	background: #2d3748;
	border-color: rgba(255, 255, 255, 0.1);
}

@keyframes expandIn {
	from {
		opacity: 0;
		transform: translateY(-20px) scale(0.95);
		max-height: 0;
	}

	to {
		opacity: 1;
		transform: translateY(0) scale(1);
		max-height: 1000px;
	}
}

@keyframes shimmer {
	0% {
		transform: translateX(-100%);
	}
	50% {
		transform: translateX(100%);
	}
	100% {
		transform: translateX(100%);
	}
}

@keyframes fadeInUp {
	from {
		opacity: 0;
		transform: translateY(20px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes pulse {
	0%,
	100% {
		transform: scale(1);
	}
	50% {
		transform: scale(1.05);
	}
}

/* =================================================================
   EXPANDED CONTENT LAYOUT - SINGLE COLUMN VERTICAL STACK
   ================================================================= */

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

/* =================================================================
   FORM LAYOUT - SINGLE COLUMN OPTIMIZED
   ================================================================= */

/* Main form container - single column stack */
.item-details-form {
	width: 100%;
	display: flex;
	flex-direction: column;
	gap: 20px;
}

/* Form sections - optimized for vertical stacking */
.form-section {
	width: 100%;
	padding: 24px;
	box-sizing: border-box;

	background: #ffffff;
	border-radius: 12px;
	border: 1px solid rgba(0, 0, 0, 0.1);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

	/* Smooth transitions */
	transition: all 0.3s ease;
}

.form-section:hover {
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
	transform: translateY(-2px);
}

/* Section headers - clean and modern */
.section-header {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 20px;
	padding-bottom: 16px;
	border-bottom: 2px solid #1976d2;
	position: relative;
}

.section-header::after {
	content: "";
	position: absolute;
	bottom: -2px;
	left: 0;
	width: 60px;
	height: 2px;
	background: linear-gradient(90deg, #1976d2, rgba(25, 118, 210, 0.3));
	border-radius: 1px;
}

.section-icon {
	color: #1976d2;
	background: rgba(25, 118, 210, 0.1);
	padding: 8px;
	border-radius: 10px;
}

.section-title {
	font-weight: 600;
	font-size: 0.9rem;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	color: var(--text-primary);
}

/* Form rows - flexible and responsive */
.form-row {
	display: flex;
	flex-wrap: wrap;
	gap: 16px;
	margin-bottom: 16px;
	width: 100%;
}

.form-field {
	flex: 1;
	min-width: 250px;
	max-width: 100%;
	box-sizing: border-box;
}

.form-field.full-width {
	flex-basis: 100%;
	min-width: 100%;
}

/* Dark theme */
:deep([data-theme="dark"]) .form-section,
:deep(.v-theme--dark) .form-section {
	background: #1a202c;
	border-color: rgba(255, 255, 255, 0.1);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

:deep([data-theme="dark"]) .form-section:hover,
:deep(.v-theme--dark) .form-section:hover {
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

:deep([data-theme="dark"]) .section-icon,
:deep(.v-theme--dark) .section-icon {
	background: rgba(144, 202, 249, 0.15);
}

/* =================================================================
   RESPONSIVE DESIGN - CONTAINER QUERIES
   ================================================================= */

/* Small containers - mobile optimization */
@container expanded-content (max-width: 600px) {
	.expanded-content {
		padding: 16px;
	}

	.item-details-form {
		gap: 16px;
	}

	.form-section {
		padding: 20px 16px;
		border-radius: 8px;
	}

	.form-row {
		flex-direction: column;
		gap: 12px;
	}

	.form-field {
		min-width: 100%;
	}

	.section-header {
		margin-bottom: 16px;
		padding-bottom: 12px;
	}

	.section-title {
		font-size: 0.85rem;
	}
}

/* Medium containers - tablet optimization */
@container expanded-content (max-width: 900px) {
	.form-field {
		min-width: min(200px, 48%);
	}

	.form-section {
		padding: 20px;
	}
}

/* =================================================================
   RTL SUPPORT - ENHANCED WITH MULTIPLE SELECTORS
   ================================================================= */

/* Base RTL layout - Enhanced selectors */
[dir="rtl"] .expanded-content,
[lang^="ar"] .expanded-content,
[lang^="he"] .expanded-content,
[lang^="fa"] .expanded-content,
html[dir="rtl"] .expanded-content,
body[dir="rtl"] .expanded-content {
	direction: rtl !important;
}

/* RTL form layout - Enhanced selectors */
[dir="rtl"] .form-row,
[lang^="ar"] .form-row,
[lang^="he"] .form-row,
[lang^="fa"] .form-row,
html[dir="rtl"] .form-row,
body[dir="rtl"] .form-row {
	flex-direction: row-reverse !important;
}

[dir="rtl"] .item-details-form,
[lang^="ar"] .item-details-form,
[lang^="he"] .item-details-form,
[lang^="fa"] .item-details-form,
html[dir="rtl"] .item-details-form,
body[dir="rtl"] .item-details-form {
	text-align: right !important;
	direction: rtl !important;
}

/* RTL section headers - Enhanced selectors */
[dir="rtl"] .section-header,
[lang^="ar"] .section-header,
[lang^="he"] .section-header,
[lang^="fa"] .section-header,
html[dir="rtl"] .section-header,
body[dir="rtl"] .section-header {
	flex-direction: row-reverse !important;
	text-align: right !important;
}

/* RTL section icon positioning - place icon on the right side */
[dir="rtl"] .section-icon,
[lang^="ar"] .section-icon,
[lang^="he"] .section-icon,
[lang^="fa"] .section-icon,
html[dir="rtl"] .section-icon,
body[dir="rtl"] .section-icon {
	order: 2 !important;
	margin-left: 0 !important;
	margin-right: 12px !important;
}

[dir="rtl"] .section-header::after,
[lang^="ar"] .section-header::after,
[lang^="he"] .section-header::after,
[lang^="fa"] .section-header::after,
html[dir="rtl"] .section-header::after,
body[dir="rtl"] .section-header::after {
	right: 0 !important;
	left: auto !important;
	background: linear-gradient(-90deg, #1976d2, rgba(25, 118, 210, 0.3)) !important;
}

[dir="rtl"] .section-title,
[lang^="ar"] .section-title,
[lang^="he"] .section-title,
[lang^="fa"] .section-title,
html[dir="rtl"] .section-title,
body[dir="rtl"] .section-title {
	text-align: right !important;
	direction: rtl !important;
	width: 100% !important;
	display: block !important;
	order: 1 !important;
}

/* RTL form fields - Enhanced selectors */
[dir="rtl"] .form-field,
[lang^="ar"] .form-field,
[lang^="he"] .form-field,
[lang^="fa"] .form-field,
html[dir="rtl"] .form-field,
body[dir="rtl"] .form-field {
	text-align: right !important;
	direction: rtl !important;
}

/* RTL quantity counter in expanded content - use same order approach */
[dir="rtl"] .expanded-content .qty-counter-container,
[lang^="ar"] .expanded-content .qty-counter-container,
[lang^="he"] .expanded-content .qty-counter-container,
[lang^="fa"] .expanded-content .qty-counter-container,
.expanded-content .qty-counter-container.rtl-layout,
html[dir="rtl"] .expanded-content .qty-counter-container,
body[dir="rtl"] .expanded-content .qty-counter-container {
	flex-direction: row !important; /* Use order instead of row-reverse */
}

/* Same button ordering for expanded content (reverse order values for RTL context) */
[dir="rtl"] .expanded-content .qty-counter-container .plus-btn,
[lang^="ar"] .expanded-content .qty-counter-container .plus-btn,
[lang^="he"] .expanded-content .qty-counter-container .plus-btn,
[lang^="fa"] .expanded-content .qty-counter-container .plus-btn,
.expanded-content .qty-counter-container.rtl-layout .plus-btn,
html[dir="rtl"] .expanded-content .qty-counter-container .plus-btn,
body[dir="rtl"] .expanded-content .qty-counter-container .plus-btn {
	order: 3 !important; /* Plus button should appear first visually in RTL */
}

[dir="rtl"] .expanded-content .qty-counter-container .qty-display,
[lang^="ar"] .expanded-content .qty-counter-container .qty-display,
[lang^="he"] .expanded-content .qty-counter-container .qty-display,
[lang^="fa"] .expanded-content .qty-counter-container .qty-display,
.expanded-content .qty-counter-container.rtl-layout .qty-display,
html[dir="rtl"] .expanded-content .qty-counter-container .qty-display,
body[dir="rtl"] .expanded-content .qty-counter-container .qty-display {
	order: 2 !important; /* Quantity stays in middle */
}

[dir="rtl"] .expanded-content .qty-counter-container .minus-btn,
[lang^="ar"] .expanded-content .qty-counter-container .minus-btn,
[lang^="he"] .expanded-content .qty-counter-container .minus-btn,
[lang^="fa"] .expanded-content .qty-counter-container .minus-btn,
.expanded-content .qty-counter-container.rtl-layout .minus-btn,
html[dir="rtl"] .expanded-content .qty-counter-container .minus-btn,
body[dir="rtl"] .expanded-content .qty-counter-container .minus-btn {
	order: 1 !important; /* Minus button should appear last visually in RTL */
}

/* Keep numbers LTR in expanded content */
[dir="rtl"] .expanded-content .qty-display,
[lang^="ar"] .expanded-content .qty-display,
[lang^="he"] .expanded-content .qty-display,
[lang^="fa"] .expanded-content .qty-display,
html[dir="rtl"] .expanded-content .qty-display,
body[dir="rtl"] .expanded-content .qty-display {
	direction: ltr !important; /* Keep numbers readable */
}

/* Enhanced responsive design */
@media (max-width: 768px) {
	.modern-items-table {
		border-radius: 12px;
		margin: 0 4px;
	}

	.modern-items-table :deep(th) {
		font-size: 0.65rem;
		padding: 12px 6px;
		letter-spacing: 0.5px;
	}

	.modern-items-table :deep(td) {
		padding: 16px 8px;
		height: 56px;
		font-size: 0.85rem;
	}

	.expanded-content {
		padding: 20px 16px;
		border-radius: 0 0 12px 12px;
	}
}

@media (max-width: 600px) {
	.expanded-content {
		padding: clamp(12px, 3vw, 16px);
	}

	.form-section {
		margin-top: 8px;
		padding: clamp(10px, 2.5vw, 16px);
		border-radius: clamp(8px, 2vw, 12px);
		animation: fadeInUp 0.3s ease;
	}

	.form-row {
		gap: clamp(6px, 1.5vw, 10px);
		margin-bottom: clamp(8px, 2vw, 12px);
		flex-direction: column;
	}

	.section-header {
		margin-bottom: clamp(8px, 2vw, 12px);
		padding-bottom: 6px;
		flex-wrap: wrap;
	}

	.form-field {
		min-width: 100%;
		flex: none;
		width: 100%;
	}

	.section-title {
		font-size: clamp(0.75rem, 2vw, 0.85rem);
		line-height: 1.2;
	}

	.section-icon {
		margin-right: clamp(6px, 1.5vw, 10px);
		padding: clamp(4px, 1vw, 6px);
	}

	.modern-items-table {
		border-radius: 8px;
		margin: 0 2px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
	}

	.modern-items-table :deep(th) {
		font-size: 0.6rem;
		padding: 8px 4px;
		max-width: 80px;
		min-width: 50px;
		letter-spacing: 0.3px;
	}

	.modern-items-table :deep(td) {
		padding: 12px 4px;
		height: 48px;
		font-size: 0.8rem;
	}

	.modern-items-table :deep(th[data-column-key="item_name"]) {
		min-width: 120px;
		max-width: 150px;
	}

	.modern-items-table :deep(th[data-column-key="qty"]) {
		min-width: 100px;
		max-width: 120px;
	}

	.modern-items-table :deep(th[data-column-key="rate"]),
	.modern-items-table :deep(th[data-column-key="amount"]) {
		min-width: 70px;
		max-width: 90px;
	}

	.qty-counter-container {
		min-width: 110px;
		width: 110px;
		height: auto;
		gap: 4px;
		padding: 2px;
	}

	.qty-control-btn {
		width: 28px !important;
		height: 28px !important;
		min-width: 28px !important;
		border-radius: 6px !important;
	}

	.qty-display {
		min-width: 32px;
		padding: 4px 6px;
		font-size: 0.8rem;
		height: 28px;
	}

	.action-button-group {
		flex-direction: column;
		gap: 6px;
		width: 100%;
	}

	.item-action-btn {
		width: 100% !important;
		min-width: 100% !important;
		height: 40px !important;
		justify-content: center;
	}

	.item-action-btn .action-label {
		display: inline-block !important;
	}

	.expanded-content {
		padding: 16px;
		border-radius: 0 0 8px 8px;
	}

	.action-panel {
		padding: 12px;
		gap: 8px;
	}

	.action-panel-content {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
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

/* Enhanced form field styling with context awareness */
.form-field :deep(.v-field) {
	border-radius: clamp(6px, 2vw, 12px) !important;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
	background: rgba(255, 255, 255, 0.8) !important;
	backdrop-filter: blur(10px) !important;
	border: 1px solid rgba(0, 0, 0, 0.06) !important;
	width: 100% !important;
	max-width: 100% !important;
	box-sizing: border-box !important;
}

.form-field :deep(.v-field__input) {
	padding: clamp(8px, 2vw, 12px) !important;
	font-size: clamp(0.8rem, 2vw, 0.9rem) !important;
	min-height: auto !important;
}

.form-field :deep(.v-field__prepend-inner) {
	padding-right: clamp(4px, 1vw, 8px) !important;
}

/* Improved responsive text field sizing */
.form-field :deep(.v-text-field .v-field__input) {
	flex-wrap: nowrap;
	overflow: hidden;
}

.form-field :deep(.v-autocomplete .v-field__input) {
	flex-wrap: nowrap;
}

.form-field :deep(.v-field:hover) {
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
	transform: translateY(-1px);
	border-color: rgba(37, 99, 235, 0.2) !important;
}

.form-field :deep(.v-field--focused) {
	box-shadow:
		0 0 0 3px rgba(37, 99, 235, 0.1),
		0 4px 20px rgba(37, 99, 235, 0.15) !important;
	transform: translateY(-1px);
	border-color: rgba(37, 99, 235, 0.4) !important;
	background: rgba(255, 255, 255, 0.95) !important;
}

:deep([data-theme="dark"]) .form-field :deep(.v-field),
:deep(.v-theme--dark) .form-field :deep(.v-field) {
	background: rgba(30, 30, 30, 0.8) !important;
	border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

:deep([data-theme="dark"]) .form-field :deep(.v-field:hover),
:deep(.v-theme--dark) .form-field :deep(.v-field:hover) {
	border-color: rgba(59, 130, 246, 0.3) !important;
}

:deep([data-theme="dark"]) .form-field :deep(.v-field--focused),
:deep(.v-theme--dark) .form-field :deep(.v-field--focused) {
	box-shadow:
		0 0 0 3px rgba(59, 130, 246, 0.2),
		0 4px 20px rgba(59, 130, 246, 0.25) !important;
	border-color: rgba(59, 130, 246, 0.5) !important;
	background: rgba(30, 30, 30, 0.95) !important;
}

/* Currency and amount display with enhanced Arabic number support */
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

.amount-value.right-aligned {
	text-align: center;
}

/* RTL support for currency displays */
[dir="rtl"] .currency-display.right-aligned {
	justify-content: center;
}

[dir="rtl"] .amount-value.right-aligned {
	text-align: center;
}

[dir="rtl"] .currency-symbol {
	margin-left: 2px;
	margin-right: 0;
}

/* RTL specific alignment for discount percentage and amount values */
[dir="rtl"] .currency-display.right-aligned .amount-value,
[lang^="ar"] .currency-display.right-aligned .amount-value,
[lang^="he"] .currency-display.right-aligned .amount-value,
[lang^="fa"] .currency-display.right-aligned .amount-value,
html[dir="rtl"] .currency-display.right-aligned .amount-value,
body[dir="rtl"] .currency-display.right-aligned .amount-value {
	direction: ltr !important;
	text-align: center !important;
	vertical-align: middle !important;
	line-height: 1 !important;
}

/* RTL specific alignment for standalone amount-value with right-aligned class */
[dir="rtl"] .amount-value.right-aligned,
[lang^="ar"] .amount-value.right-aligned,
[lang^="he"] .amount-value.right-aligned,
[lang^="fa"] .amount-value.right-aligned,
html[dir="rtl"] .amount-value.right-aligned,
body[dir="rtl"] .amount-value.right-aligned {
	direction: ltr !important;
	text-align: center !important;
	vertical-align: middle !important;
	line-height: 1 !important;
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

/* Column width constraints and alignment */
.modern-items-table :deep(th[data-column-key="item_name"]),
.modern-items-table :deep(td[data-column-key="item_name"]) {
	min-width: 200px;
	max-width: 250px;
	text-align: left;
}

.modern-items-table :deep(th[data-column-key="qty"]),
.modern-items-table :deep(td[data-column-key="qty"]) {
	min-width: 140px;
	max-width: 160px;
	text-align: center;
}

.modern-items-table :deep(th[data-column-key="uom"]),
.modern-items-table :deep(td[data-column-key="uom"]) {
	min-width: 80px;
	max-width: 100px;
	text-align: center;
}

.modern-items-table :deep(th[data-column-key="rate"]),
.modern-items-table :deep(td[data-column-key="rate"]),
.modern-items-table :deep(th[data-column-key="amount"]),
.modern-items-table :deep(td[data-column-key="amount"]) {
	min-width: 100px;
	max-width: 130px;
	text-align: center !important;
}

/* Ensure consistent header padding for rate/amount columns */
.modern-items-table :deep(th[data-column-key="rate"]),
.modern-items-table :deep(th[data-column-key="amount"]) {
	padding: 12px !important;
}

/* Only cells get custom padding */
.modern-items-table :deep(td[data-column-key="rate"]),
.modern-items-table :deep(td[data-column-key="amount"]) {
	padding: 16px 8px;
}

.modern-items-table :deep(th[data-column-key="price_list_rate"]),
.modern-items-table :deep(td[data-column-key="price_list_rate"]) {
	min-width: 120px;
	max-width: 140px;
	text-align: center !important;
	font-weight: 500;
}

/* Ensure consistent header padding for price list rate column */
.modern-items-table :deep(th[data-column-key="price_list_rate"]) {
	padding: 12px !important;
}

/* Only cells get custom padding */
.modern-items-table :deep(td[data-column-key="price_list_rate"]) {
	padding: 16px 8px;
}

/* Specific header styling for Price List Rate */
.modern-items-table :deep(th[data-column-key="price_list_rate"]) {
	background: linear-gradient(135deg, var(--table-header-bg) 0%, rgba(25, 118, 210, 0.02) 100%);
	border-right: 1px solid rgba(25, 118, 210, 0.1);
}

/* Enhanced header hover effects */
.modern-items-table :deep(th:hover) {
	background-color: rgba(25, 118, 210, 0.05);
	transition: background-color 0.2s ease;
}

.modern-items-table :deep(th[data-column-key="discount_value"]),
.modern-items-table :deep(td[data-column-key="discount_value"]),
.modern-items-table :deep(th[data-column-key="discount_amount"]),
.modern-items-table :deep(td[data-column-key="discount_amount"]) {
	min-width: 90px;
	max-width: 120px;
	text-align: center !important;
}

/* Ensure consistent header padding for discount columns */
.modern-items-table :deep(th[data-column-key="discount_value"]),
.modern-items-table :deep(th[data-column-key="discount_amount"]) {
	padding: 12px !important;
	vertical-align: middle !important;
	line-height: 1.2 !important;
}

/* Additional fix for headers containing percentage or Arabic text */
.modern-items-table :deep(th) {
	display: table-cell !important;
	vertical-align: middle !important;
}

/* Specific fix for headers with Arabic text and special characters */
.modern-items-table :deep(th .v-data-table-header__content) {
	vertical-align: middle !important;
	line-height: 1.2 !important;
	display: flex !important;
	align-items: center !important;
	justify-content: center !important;
	height: 100% !important;
}

/* Only cells get custom padding */
.modern-items-table :deep(td[data-column-key="discount_value"]),
.modern-items-table :deep(td[data-column-key="discount_amount"]) {
	padding: 16px 8px;
	vertical-align: middle !important;
	line-height: 1 !important;
}

.modern-items-table :deep(th[data-column-key="posa_is_offer"]),
.modern-items-table :deep(td[data-column-key="posa_is_offer"]) {
	min-width: 70px;
	max-width: 90px;
	text-align: center;
}

.modern-items-table :deep(th[data-column-key="actions"]),
.modern-items-table :deep(td[data-column-key="actions"]) {
	min-width: 80px;
	max-width: 100px;
	text-align: center;
}

/* RTL support for table columns */
[dir="rtl"] .modern-items-table :deep(th[data-column-key="item_name"]),
[dir="rtl"] .modern-items-table :deep(td[data-column-key="item_name"]) {
	text-align: right;
}

[dir="rtl"] .modern-items-table :deep(th[data-column-key="rate"]),
[dir="rtl"] .modern-items-table :deep(td[data-column-key="rate"]),
[dir="rtl"] .modern-items-table :deep(th[data-column-key="amount"]),
[dir="rtl"] .modern-items-table :deep(td[data-column-key="amount"]),
[dir="rtl"] .modern-items-table :deep(th[data-column-key="price_list_rate"]),
[dir="rtl"] .modern-items-table :deep(td[data-column-key="price_list_rate"]),
[dir="rtl"] .modern-items-table :deep(th[data-column-key="discount_value"]),
[dir="rtl"] .modern-items-table :deep(td[data-column-key="discount_value"]),
[dir="rtl"] .modern-items-table :deep(th[data-column-key="discount_amount"]),
[dir="rtl"] .modern-items-table :deep(td[data-column-key="discount_amount"]) {
	text-align: center !important;
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

/* QTY Counter Styling */
.qty-control-btn {
	width: 32px !important;
	height: 32px !important;
	min-width: 32px !important;
	border-radius: 8px !important;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
	box-shadow:
		0 2px 8px rgba(0, 0, 0, 0.06),
		0 1px 3px rgba(0, 0, 0, 0.04) !important;
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
	background: rgba(255, 255, 255, 0.2);
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

.qty-counter-container {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 4px;
	min-width: 130px;
	width: 130px;
	height: auto;
	background: rgba(255, 255, 255, 0.6);
	border-radius: 12px;
	backdrop-filter: blur(10px);
	border: 1px solid rgba(0, 0, 0, 0.04);
	transition: all 0.3s ease;
	margin: 0 auto;
}

.qty-counter-container:hover {
	background: rgba(255, 255, 255, 0.8);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
	transform: translateY(-1px);
}

:deep([data-theme="dark"]) .qty-counter-container,
:deep(.v-theme--dark) .qty-counter-container {
	background: rgba(30, 30, 30, 0.6);
	border: 1px solid rgba(255, 255, 255, 0.08);
}

:deep([data-theme="dark"]) .qty-counter-container:hover,
:deep(.v-theme--dark) .qty-counter-container:hover {
	background: rgba(30, 30, 30, 0.8);
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

/* RTL support for quantity counter - Enhanced with multiple selectors */
/* HTML order: - | qty | + */
/* RTL desired: + | qty | - */

/* Use CSS order for precise RTL layout: + | qty | - */
[dir="rtl"] .qty-counter-container,
[lang^="ar"] .qty-counter-container,
[lang^="he"] .qty-counter-container,
[lang^="fa"] .qty-counter-container,
.qty-counter-container.rtl-layout,
html[dir="rtl"] .qty-counter-container,
body[dir="rtl"] .qty-counter-container {
	/* Keep normal flex direction but use order */
	flex-direction: row !important;
}

/* RTL Button ordering: + | qty | - (reverse order values for RTL context) */
[dir="rtl"] .qty-counter-container .plus-btn,
[lang^="ar"] .qty-counter-container .plus-btn,
[lang^="he"] .qty-counter-container .plus-btn,
[lang^="fa"] .qty-counter-container .plus-btn,
.qty-counter-container.rtl-layout .plus-btn,
html[dir="rtl"] .qty-counter-container .plus-btn,
body[dir="rtl"] .qty-counter-container .plus-btn {
	order: 3 !important; /* Plus button should appear first visually */
}

[dir="rtl"] .qty-counter-container .qty-display,
[lang^="ar"] .qty-counter-container .qty-display,
[lang^="he"] .qty-counter-container .qty-display,
[lang^="fa"] .qty-counter-container .qty-display,
.qty-counter-container.rtl-layout .qty-display,
html[dir="rtl"] .qty-counter-container .qty-display,
body[dir="rtl"] .qty-counter-container .qty-display {
	order: 2 !important; /* Quantity stays in middle */
}

[dir="rtl"] .qty-counter-container .minus-btn,
[lang^="ar"] .qty-counter-container .minus-btn,
[lang^="he"] .qty-counter-container .minus-btn,
[lang^="fa"] .qty-counter-container .minus-btn,
.qty-counter-container.rtl-layout .minus-btn,
html[dir="rtl"] .qty-counter-container .minus-btn,
body[dir="rtl"] .qty-counter-container .minus-btn {
	order: 1 !important; /* Minus button should appear last visually */
}

/* Keep numbers readable in RTL - multiple selectors */
[dir="rtl"] .qty-display,
[lang^="ar"] .qty-display,
[lang^="he"] .qty-display,
[lang^="fa"] .qty-display,
.qty-counter-container.rtl-layout .qty-display,
html[dir="rtl"] .qty-display,
body[dir="rtl"] .qty-display {
	direction: ltr !important;
	text-align: center;
}

/* Enhanced RTL support for number fields without currency - prevents shifting */
[dir="rtl"] .number-field-rtl,
[lang^="ar"] .number-field-rtl,
[lang^="he"] .number-field-rtl,
[lang^="fa"] .number-field-rtl,
html[dir="rtl"] .number-field-rtl,
body[dir="rtl"] .number-field-rtl {
	direction: ltr !important;
	text-align: center !important;
	unicode-bidi: embed !important;
}

.qty-display {
	min-width: 40px;
	text-align: center;
	font-weight: 600;
	padding: 4px 6px;
	border-radius: 4px;
	background: transparent;
	border: none;
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
	font-size: 0.85rem;
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: center;
	height: 32px;
}

.qty-input {
	outline: none;
	box-shadow: none;
	background: transparent;
	border: none;
}

.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

.qty-input[type="number"] {
	-moz-appearance: textfield;
}

.qty-control-btn:hover {
	transform: translateY(-1px);
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.16) !important;
}

.qty-control-btn.minus-btn {
	background: linear-gradient(145deg, #fef3c7, #fbbf24) !important;
	color: #92400e !important;
	border: 2px solid rgba(251, 191, 36, 0.3) !important;
}

.qty-control-btn.minus-btn:hover {
	background: linear-gradient(145deg, #fbbf24, #f59e0b) !important;
	box-shadow:
		0 6px 20px rgba(251, 191, 36, 0.25),
		0 4px 8px rgba(0, 0, 0, 0.08) !important;
	transform: translateY(-2px) scale(1.05) !important;
}

.qty-control-btn.plus-btn {
	background: linear-gradient(145deg, #d1fae5, #34d399) !important;
	color: #065f46 !important;
	border: 2px solid rgba(52, 211, 153, 0.3) !important;
}

.qty-control-btn.plus-btn:hover {
	background: linear-gradient(145deg, #34d399, #10b981) !important;
	box-shadow:
		0 6px 20px rgba(52, 211, 153, 0.25),
		0 4px 8px rgba(0, 0, 0, 0.08) !important;
	transform: translateY(-2px) scale(1.05) !important;
}

:deep([data-theme="dark"]) .qty-control-btn.minus-btn,
:deep(.v-theme--dark) .qty-control-btn.minus-btn {
	background: linear-gradient(145deg, #4a3c10, #3a2e0c) !important;
	color: #ffb74d !important;
}

:deep([data-theme="dark"]) .qty-control-btn.plus-btn,
:deep(.v-theme--dark) .qty-control-btn.plus-btn {
	background: linear-gradient(145deg, #1b4620, #133419) !important;
	color: #81c784 !important;
}

/* Delete action button styling */
.delete-action-btn {
	min-width: 44px !important;
	height: 44px !important;
	border-radius: 12px !important;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
	box-shadow:
		0 4px 12px rgba(239, 68, 68, 0.15),
		0 2px 4px rgba(0, 0, 0, 0.08) !important;
	font-weight: 600 !important;
	background: linear-gradient(145deg, #fef2f2, #fecaca) !important;
	color: #dc2626 !important;
	border: 2px solid rgba(239, 68, 68, 0.2) !important;
	position: relative !important;
	overflow: hidden !important;
}

.delete-action-btn::before {
	content: "";
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: linear-gradient(45deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.15));
	transition: transform 0.3s ease;
	transform: translateX(-100%);
	z-index: 0;
}

.delete-action-btn:hover::before {
	transform: translateX(0);
}

.delete-action-btn:hover {
	transform: translateY(-2px) scale(1.05);
	box-shadow:
		0 8px 24px rgba(239, 68, 68, 0.25),
		0 4px 8px rgba(0, 0, 0, 0.1) !important;
	background: linear-gradient(145deg, #fecaca, #f87171) !important;
}

.delete-action-btn .v-icon {
	position: relative;
	z-index: 1;
	transition: all 0.2s ease;
}

.delete-action-btn:hover .v-icon {
	animation: pulse 0.6s ease-in-out;
}

:deep([data-theme="dark"]) .delete-action-btn,
:deep(.v-theme--dark) .delete-action-btn {
	background: linear-gradient(145deg, #4a1515, #3a1010) !important;
	color: #ff8a80 !important;
}

:deep([data-theme="dark"]) .delete-action-btn:hover,
:deep(.v-theme--dark) .delete-action-btn:hover {
	background: linear-gradient(145deg, #5a1a1a, #4a1515) !important;
}
</style>
