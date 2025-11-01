<template>
	<div
		ref="tableContainer"
		class="my-0 py-0 overflow-y-auto items-table-container responsive-table-container pos-themed-card"
		:style="containerStyles"
		:class="containerClasses"
		@dragover="onDragOverFromSelector($event)"
		@drop="onDropFromSelector($event)"
		@dragenter="onDragEnterFromSelector"
		@dragleave="onDragLeaveFromSelector"
	>
		<v-data-table-virtual
			:headers="responsiveHeaders"
			:items="items"
			:expanded="expanded"
			show-expand
			item-value="posa_row_id"
			class="pos-table elevation-2 pos-themed-card"
			:class="tableClasses"
			:items-per-page="virtualScrollConfig.itemsPerPage"
			:item-height="virtualScrollConfig.itemHeight"
			:buffer-size="virtualScrollConfig.bufferSize"
			expand-on-click
			:density="tableDensity"
			hide-default-footer
			:single-expand="true"
			:header-props="dynamicHeaderProps"
			:no-data-text="__('No items in cart')"
			@update:expanded="handleExpandedUpdate"
			:search="itemSearch"
			:custom-filter="customItemFilter"
		>
			<!-- Item name column -->
			<template v-slot:item.item_name="{ item }">
				<div class="d-flex align-center">
					<span>{{ item.item_name }}</span>
					<v-chip v-if="item.is_bundle" color="secondary" size="x-small" class="ml-1">
						{{ __("Bundle") }}
					</v-chip>
					<v-chip v-if="item.name_overridden" color="primary" size="x-small" class="ml-1">
						{{ __("Edited") }}
					</v-chip>
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
				<div class="pos-table__qty-counter" :class="{ 'rtl-layout': isRTL }" :title="`RTL: ${isRTL}`">
					<v-btn
						:disabled="!!item.posa_is_replace"
						size="small"
						variant="flat"
						class="pos-table__qty-btn pos-table__qty-btn--minus minus-btn qty-control-btn"
						@click.stop="handleMinusClick(item)"
					>
						<v-icon size="small">mdi-minus</v-icon>
					</v-btn>
					<div
						class="pos-table__qty-display amount-value number-field-rtl"
						:class="{
							'negative-number': isNegative(item.qty),
							'large-number': memoizedQtyLength(item.qty) > 6,
						}"
						:data-length="memoizedQtyLength(item.qty)"
						:title="formatFloat(item.qty, hide_qty_decimals ? 0 : undefined)"
					>
						{{ formatFloat(item.qty, hide_qty_decimals ? 0 : undefined) }}
					</div>
					<v-btn
						:disabled="
							!!item.posa_is_replace ||
							((!stock_settings.allow_negative_stock || blockSaleBeyondAvailableQty) &&
								item.max_qty !== undefined &&
								item.qty >= item.max_qty)
						"
						size="small"
						variant="flat"
						class="pos-table__qty-btn pos-table__qty-btn--plus plus-btn qty-control-btn"
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
					<span class="amount-value" :class="{ 'negative-number': isNegative(item.rate) }">
						{{ formatCurrency(item.rate) }}
					</span>
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
					<span class="amount-value">
						{{
							formatFloat(
								item.discount_percentage ||
									(item.price_list_rate
										? (item.discount_amount / item.price_list_rate) * 100
										: 0),
							)
						}}%
					</span>
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

			<!-- Offer toggle -->
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

			<!-- Actions -->
			<template v-slot:item.actions="{ item }">
				<v-btn
					:disabled="!!item.posa_is_replace"
					size="small"
					variant="flat"
					class="pos-table__delete-btn delete-action-btn"
					@click.stop="removeItem(item)"
				>
					<v-icon size="small">mdi-delete-outline</v-icon>
				</v-btn>
			</template>

			<!-- Expanded row -->
			<template v-slot:expanded-row="{ item }">
				<td :colspan="responsiveHeaders.length + 1" class="ma-0 pa-0 expanded-row-cell">
					<div
						v-if="isItemExpanded(item.posa_row_id)"
						class="expanded-content responsive-expanded-content"
						:class="expandedContentClasses"
					>
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
											hide-details
											:model-value="formatCurrency(item.price_list_rate ?? 0)"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
											class="pos-themed-input"
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
								v-if="
									pos_profile.posa_allow_sales_order &&
									['Order', 'Quotation'].includes(invoiceType)
								"
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
											@update:model-value="validateDueDate(item)"
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
					<!-- Lazy placeholder -->
					<div v-else class="expanded-placeholder">
						<div class="text-center pa-4">
							<v-progress-circular indeterminate size="small"></v-progress-circular>
							<div class="text-caption mt-2">{{ __("Loading details...") }}</div>
						</div>
					</div>
				</td>
			</template>
		</v-data-table-virtual>

		<!-- Edit name dialog -->
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
/* global process */
import _ from "lodash";
import { logComponentRender } from "../../utils/perf.js";
import { parseBooleanSetting } from "../../utils/stock.js";
import { useInvoiceStore } from "../../stores/invoiceStore.js";
export default {
	name: "ItemsTable",
	setup() {
		const invoiceStore = useInvoiceStore();
		return { invoiceStore };
	},
	props: {
		headers: Array,
		expanded: Array,
		itemsPerPage: Number,
		itemSearch: String,
		pos_profile: Object,
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
			// Container awareness properties
			containerWidth: 0,
			containerHeight: 0,
			resizeObserver: null,
			breakpoint: "xl",
			columnVisibility: new Map(),
			// Performance optimization caches
			qtyLengthCache: new Map(),
			expandedCache: new Map(),
			lastUpdateTime: 0,
		};
	},
	computed: {
		items() {
			return this.invoiceStore.items;
		},
		invoice_doc() {
			return this.invoiceStore.invoiceDoc || {};
		},
		// Dynamic container styles based on parent
		containerStyles() {
			return {
				height: "calc(100% - 80px)",
				maxHeight: "calc(100% - 80px)",
				"--container-width": this.containerWidth + "px",
				"--container-height": this.containerHeight + "px",
			};
		},

		containerClasses() {
			return {
				[`breakpoint-${this.breakpoint}`]: true,
				"compact-view": this.containerWidth < 600,
				"medium-view": this.containerWidth >= 600 && this.containerWidth < 900,
				"large-view": this.containerWidth >= 900,
				"expanded-active": this.expanded.length > 0,
			};
		},

		tableClasses() {
			return {
				[`container-${this.breakpoint}`]: true,
				"responsive-table": true,
			};
		},

		expandedContentClasses() {
			return {
				[`expanded-${this.breakpoint}`]: true,
				"compact-expanded": this.containerWidth < 600,
			};
		},

		blockSaleBeyondAvailableQty() {
			if (["Order", "Quotation"].includes(this.invoiceType)) return false;
			const allowNegative = parseBooleanSetting(this.stock_settings?.allow_negative_stock);
			return !allowNegative && !!this.pos_profile?.posa_block_sale_beyond_available_qty;
		},

		// Responsive headers based on container size
		responsiveHeaders() {
			if (!this.headers || this.headers.length === 0) return [];

			return this.headers
				.filter((header) => {
					// Always show required columns
					if (
						header.required ||
						header.key === "item_name" ||
						header.key === "qty" ||
						header.key === "actions"
					) {
						return true;
					}

					// Hide columns based on container width
					if (this.containerWidth < 500) {
						// Ultra-compact: only essential columns
						return ["item_name", "qty", "amount", "actions"].includes(header.key);
					} else if (this.containerWidth < 700) {
						// Compact: essential + rate
						return ["item_name", "qty", "rate", "amount", "actions"].includes(header.key);
					} else if (this.containerWidth < 900) {
						// Medium: hide advanced columns
						return !["discount_value", "price_list_rate"].includes(header.key);
					}

					// Large: show all columns
					return true;
				})
				.map((header) => ({
					...header,
					width: this.calculateColumnWidth(header),
					minWidth: this.calculateMinColumnWidth(header),
				}));
		},

		// Dynamic table density based on container size
		tableDensity() {
			if (this.containerWidth < 500) return "compact";
			if (this.containerWidth < 800) return "default";
			return "comfortable";
		},

		headerProps() {
			return {};
		},

		// Enhanced header props with responsive behavior
		dynamicHeaderProps() {
			const baseProps = this.headerProps;
			return {
				...baseProps,
				class: `responsive-header container-${this.breakpoint}`,
			};
		},

		// Virtual scrolling configuration for optimal performance
		virtualScrollConfig() {
			const itemCount = this.items?.length || 0;
			const containerHeight = this.containerHeight;

			// Dynamic configuration based on dataset size and container
			return {
				itemHeight:
					this.tableDensity === "compact" ? 48 : this.tableDensity === "comfortable" ? 72 : 60,
				itemsPerPage: Math.max(20, Math.ceil(containerHeight / 60) + 5),
				bufferSize: itemCount > 1000 ? 20 : itemCount > 500 ? 15 : 10,
			};
		},

		// Memoized quantity display length calculation with cache management
		memoizedQtyLength() {
			return (qty) => {
				if (this.qtyLengthCache.has(qty)) return this.qtyLengthCache.get(qty);
				const length = String(Math.abs(qty || 0)).replace(".", "").length;
				this.qtyLengthCache.set(qty, length);

				// Limit cache size to prevent memory leaks
				if (this.qtyLengthCache.size > 1000) {
					const firstKey = this.qtyLengthCache.keys().next().value;
					this.qtyLengthCache.delete(firstKey);
				}

				return length;
			};
		},

		// Lazy loading helper for expanded content with cache
		isItemExpanded() {
			return (itemId) => {
				const cacheKey = `${itemId}_${this.expanded.length}`;

				if (this.expandedCache.has(cacheKey)) {
					return this.expandedCache.get(cacheKey);
				}

				const isExpanded = this.expanded.includes(itemId);
				this.expandedCache.set(cacheKey, isExpanded);

				// Clear cache periodically to prevent memory bloat
				if (this.expandedCache.size > 100) {
					this.expandedCache.clear();
				}

				return isExpanded;
			};
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
			if (this._rtlComputed !== undefined) {
				return this._rtlComputed;
			}

			const htmlDir = document.documentElement.getAttribute("dir");
			const bodyDir = document.body.getAttribute("dir");
			const computedDir = window.getComputedStyle(document.documentElement).direction;
			const lang = document.documentElement.getAttribute("lang") || navigator.language;
			const rtlLanguages = ["ar", "he", "fa", "ur", "yi"];
			const isRTLLanguage = rtlLanguages.some((rtlLang) => lang.startsWith(rtlLang));

			this._rtlComputed =
				htmlDir === "rtl" || bodyDir === "rtl" || computedDir === "rtl" || isRTLLanguage;

			return this._rtlComputed;
		},
	},
	methods: {
		customItemFilter(value, search, item) {
			if (search == null) {
				return true;
			}

			const normalized = String(search).toLowerCase().trim();
			if (!normalized) {
				return true;
			}

			const terms = normalized.split(/\s+/).filter(Boolean);
			if (!terms.length) {
				return true;
			}

			const haystacks = [];
			const collect = (input) => {
				if (input == null) {
					return;
				}

				if (Array.isArray(input)) {
					input.forEach(collect);
					return;
				}

				if (typeof input === "object") {
					if (Object.prototype.hasOwnProperty.call(input, "barcode")) {
						collect(input.barcode);
						return;
					}

					Object.values(input).forEach(collect);
					return;
				}

				haystacks.push(String(input).toLowerCase());
			};

			collect(value);
			const raw = item?.raw ?? item;
			collect(raw?.item_name);
			collect(raw?.item_code);
			collect(raw?.description);
			collect(raw?.barcode);
			collect(raw?.serial_no);
			collect(raw?.batch_no);
			collect(raw?.uom);
			collect(raw?.item_barcode);
			collect(raw?.barcodes);

			if (!haystacks.length) {
				return false;
			}

			return terms.every((term) => haystacks.some((text) => text.includes(term)));
		},

		// Container awareness methods
		updateContainerDimensions() {
			if (this.$refs.tableContainer) {
				const rect = this.$refs.tableContainer.getBoundingClientRect();
				this.containerWidth = rect.width;
				this.containerHeight = rect.height;
				this.updateBreakpoint();
			}
		},

		updateBreakpoint() {
			if (this.containerWidth < 500) {
				this.breakpoint = "xs";
			} else if (this.containerWidth < 700) {
				this.breakpoint = "sm";
			} else if (this.containerWidth < 900) {
				this.breakpoint = "md";
			} else if (this.containerWidth < 1200) {
				this.breakpoint = "lg";
			} else {
				this.breakpoint = "xl";
			}
		},

		calculateColumnWidth(header) {
			const baseWidths = {
				item_name: { min: 150, max: 250, ratio: 0.3 },
				qty: { min: 120, max: 160, ratio: 0.15 },
				rate: { min: 100, max: 130, ratio: 0.12 },
				amount: { min: 100, max: 130, ratio: 0.12 },
				discount_value: { min: 80, max: 110, ratio: 0.1 },
				discount_amount: { min: 90, max: 120, ratio: 0.11 },
				price_list_rate: { min: 110, max: 140, ratio: 0.13 },
				actions: { min: 80, max: 100, ratio: 0.08 },
				posa_is_offer: { min: 60, max: 80, ratio: 0.06 },
			};

			const config = baseWidths[header.key] || { min: 80, max: 120, ratio: 0.1 };
			const calculatedWidth = this.containerWidth * config.ratio;

			return Math.max(config.min, Math.min(config.max, calculatedWidth));
		},

		calculateMinColumnWidth(header) {
			const minWidths = {
				item_name: 120,
				qty: 100,
				rate: 80,
				amount: 80,
				discount_value: 70,
				discount_amount: 80,
				price_list_rate: 90,
				actions: 60,
				posa_is_offer: 50,
			};

			return minWidths[header.key] || 60;
		},

		setupResizeObserver() {
			if (typeof ResizeObserver !== "undefined") {
				// Debounced resize handler for better performance
				const debouncedResizeHandler = _.debounce((entries) => {
					for (let entry of entries) {
						const { width, height } = entry.contentRect;

						// Only update if dimensions actually changed
						if (this.containerWidth !== width || this.containerHeight !== height) {
							this.containerWidth = width;
							this.containerHeight = height;
							this.updateBreakpoint();

							// Batch emit for better performance
							this.$nextTick(() => {
								this.$emit("container-resize", {
									width,
									height,
									breakpoint: this.breakpoint,
								});
							});
						}
					}
				}, 16); // ~60fps throttling

				this.resizeObserver = new ResizeObserver(debouncedResizeHandler);

				this.$nextTick(() => {
					if (this.$refs.tableContainer) {
						this.resizeObserver.observe(this.$refs.tableContainer);
						this.updateContainerDimensions(); // Initial measurement
					}
				});
			} else {
				// Fallback to window resize for older browsers
				window.addEventListener("resize", this.updateContainerDimensions);
			}
		},

		cleanupResizeObserver() {
			if (this.resizeObserver) {
				this.resizeObserver.disconnect();
				this.resizeObserver = null;
			} else {
				window.removeEventListener("resize", this.updateContainerDimensions);
			}
		},

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
			const newQty = parseFloat(event.target.value) || 0;
			if (newQty === 0) {
				// Remove the item when quantity is set to 0
				this.removeItem(item);
			} else {
				// Use the existing setFormatedQty function for non-zero values
				this.setFormatedQty(item, "qty", null, false, event.target.value);
			}
		},
		handleMinusClick(item) {
			if (item.qty <= 1) {
				// Remove the item when quantity would become 0 or less
				this.removeItem(item);
			} else {
				// Use the existing subtractOne function
				this.subtractOne(item);
			}
		},

		// Enhanced method with memoization for better performance
		getQtyDisplayLength(qty) {
			return this.memoizedQtyLength(qty);
		},

		// Optimized expanded update handler
		handleExpandedUpdate(val) {
			const mappedValues = val.map((v) => (typeof v === "object" ? v.posa_row_id : v));
			this.$emit("update:expanded", mappedValues);
		},
	},

	mounted() {
		logComponentRender(this, "ItemsTable", "mounted", {
			rows: this.items?.length || 0,
		});
		this.setupResizeObserver();

		// Performance optimization: defer non-critical initialization
		this.$nextTick(() => {
			this.updateContainerDimensions();

			// Log performance metrics in development
			if (process.env.NODE_ENV === "development") {
				console.log("ItemsTable Performance Optimizations Active:", {
					virtualScrolling: true,
					memoizedQtyCalculations: true,
					debouncedResizing: true,
					lazyExpandedContent: true,
					cacheManagement: true,
					itemCount: this.items?.length || 0,
					containerDimensions: {
						width: this.containerWidth,
						height: this.containerHeight,
					},
				});
			}
		});
	},

	updated() {
		logComponentRender(this, "ItemsTable", "updated", {
			rows: this.items?.length || 0,
		});
	},

	beforeUnmount() {
		this.cleanupResizeObserver();

		// Clean up performance caches to prevent memory leaks
		if (this.qtyLengthCache) {
			this.qtyLengthCache.clear();
		}
		if (this.expandedCache) {
			this.expandedCache.clear();
		}
	},
};
</script>

<style scoped>
/* Modern table styling with clean design */
.pos-table {
	border-radius: 8px;
	overflow: hidden;
	box-shadow: 0 2px 8px var(--pos-shadow);
	border: 1px solid var(--pos-border);
	height: 100%;
	width: 100%;
	max-width: 100%;
	display: flex;
	flex-direction: column;
	transition: all 0.3s ease;
	background: var(--pos-card-bg);
	margin: 0;
	padding: 0;
}

/* Ensure items table can scroll when many rows exist */
.items-table-container {
	overflow-y: auto;
	width: 100%;
	max-width: 100%;
	margin: 0;
	padding: 0;
	box-sizing: border-box;
}

/* Table wrapper styling */
.pos-table :deep(.v-data-table__wrapper),
.pos-table :deep(.v-table__wrapper) {
	border-radius: 0;
	height: 100%;
	width: 100%;
	max-width: 100%;
	overflow-y: auto;
	scrollbar-width: thin;
	margin: 0;
	padding: 0;
	border: none;
}

/* Enhanced table header styling with global theme support */
.pos-table :deep(th) {
	font-weight: 600;
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.3px;
	padding: 12px;
	border-bottom: 1px solid var(--pos-border);
	background-color: var(--pos-table-header-bg);
	color: var(--pos-text-primary);
	position: sticky;
	top: 0;
	z-index: 3;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 150px;
	min-width: 80px;
	text-align: center;
	vertical-align: middle !important;
	line-height: 1.2 !important;
	height: 40px;
	/* Enhanced transitions and stability */
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	background-clip: padding-box;
	border-radius: 0;
	user-select: none;
	cursor: default;
	will-change: background-color, transform, box-shadow;
	border: none;
	outline: none;
	box-sizing: border-box;
}

/* Header text wrapper is now handled in the improved stable section above */

/* Improved stable header hover effects */
.pos-table :deep(th) {
	/* Ensure stable positioning */
	position: relative;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	background-clip: padding-box;
	will-change: background-color, transform;
}

.pos-table :deep(th:hover) {
	/* Smooth background transition without layout changes */
	background-color: var(--pos-hover-bg);
	transform: translateY(-1px);
	box-shadow: 0 4px 12px var(--pos-shadow);
	z-index: 2;
}

.pos-table :deep(th .v-data-table-header__content) {
	/* Stable content container */
	display: flex;
	align-items: center;
	justify-content: center;
	height: 100%;
	width: 100%;
	padding: 0;
	margin: 0;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	position: relative;
	z-index: 1;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 100%;
	box-sizing: border-box;
}

.pos-table :deep(th:hover .v-data-table-header__content) {
	/* Enhanced text on hover without disrupting layout */
	color: var(--pos-primary);
	font-weight: 600;
	letter-spacing: 0.02em;
	text-shadow: 0 1px 2px var(--pos-shadow-light);
}

/* Table row styling */
.pos-table :deep(tr) {
	transition: background-color 0.2s ease;
	border-bottom: 1px solid var(--pos-border-light);
}

.pos-table :deep(tr:hover) {
	background-color: var(--pos-table-row-hover);
}

/* Table cell styling */
.pos-table :deep(td) {
	padding: 16px 12px;
	vertical-align: middle;
	height: 60px;
	text-align: center;
	color: var(--pos-text-primary);
	position: relative;
}

/* Ensure all cell contents fill the cell */
.pos-table :deep(td) > div {
	width: 100%;
	height: 100%;
	display: flex;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
}

/* =================================================================
   EXPANDED CONTENT - CLEAN STRUCTURE
   ================================================================= */

/* Base expanded row styling - ensure full width utilization */
.expanded-row-cell {
	padding: 0 !important;
	width: 100% !important;
	max-width: 100% !important;
	overflow: hidden;
	box-sizing: border-box;
	/* Ensure it spans the full table width including expand column */
	position: relative;
}

/* Main expanded content container */
.expanded-content {
	padding: 24px;
	width: 100% !important;
	max-width: 100% !important;
	box-sizing: border-box;
	background: var(--pos-card-bg);
	border-radius: 0 0 8px 8px;
	border: 1px solid var(--pos-border);
	border-top: none;
	animation: expandIn 0.3s ease forwards;

	/* Enable container queries */
	container-type: inline-size;
	container-name: expanded-content;

	/* Ensure full width utilization */
	margin: 0;
	position: relative;
	overflow: visible;
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
	box-shadow: 0 3px 8px var(--pos-shadow) !important;
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
	box-shadow: 0 5px 12px var(--pos-shadow-dark) !important;
}

.item-action-btn .v-icon {
	font-size: 22px !important;
	position: relative;
	z-index: 2;
}

/* Theme-aware button styles */
.item-action-btn.delete-btn {
	background: var(--pos-button-error-bg) !important;
	color: var(--pos-button-error-text) !important;
	border: 1px solid var(--pos-button-error-border) !important;
}

.item-action-btn.delete-btn:hover {
	background: var(--pos-button-error-hover-bg) !important;
	color: var(--pos-button-error-hover-text) !important;
}

.item-action-btn.minus-btn {
	background: var(--pos-button-warning-bg) !important;
	color: var(--pos-button-warning-text) !important;
	border: 1px solid var(--pos-button-warning-border) !important;
}

.item-action-btn.minus-btn:hover {
	background: var(--pos-button-warning-hover-bg) !important;
	color: var(--pos-button-warning-hover-text) !important;
}

.item-action-btn.plus-btn {
	background: var(--pos-button-success-bg) !important;
	color: var(--pos-button-success-text) !important;
	border: 1px solid var(--pos-button-success-border) !important;
}

.item-action-btn.plus-btn:hover {
	background: var(--pos-button-success-hover-bg) !important;
	color: var(--pos-button-success-hover-text) !important;
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

	background: var(--pos-card-bg);
	border-radius: 12px;
	border: 1px solid var(--pos-border);
	box-shadow: 0 2px 8px var(--pos-shadow);

	/* Smooth transitions */
	transition: all 0.3s ease;
}

.form-section:hover {
	box-shadow: 0 4px 16px var(--pos-shadow-dark);
	transform: translateY(-2px);
}

/* Section headers - clean and modern */
.section-header {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 20px;
	padding-bottom: 16px;
	border-bottom: 2px solid var(--pos-primary);
	position: relative;
}

.section-header::after {
	content: "";
	position: absolute;
	bottom: -2px;
	left: 0;
	width: 60px;
	height: 2px;
	background: linear-gradient(90deg, var(--pos-primary), var(--pos-primary-container));
	border-radius: 1px;
}

.section-icon {
	color: var(--pos-primary);
	background: var(--pos-primary-container);
	padding: 8px;
	border-radius: 10px;
}

.section-title {
	font-weight: 600;
	font-size: 0.9rem;
	text-transform: uppercase;
	letter-spacing: 0.5px;
	color: var(--pos-text-primary);
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
	background: linear-gradient(-90deg, var(--pos-primary), var(--pos-primary-container)) !important;
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
[dir="rtl"] .expanded-content .pos-table__qty-counter,
[lang^="ar"] .expanded-content .pos-table__qty-counter,
[lang^="he"] .expanded-content .pos-table__qty-counter,
[lang^="fa"] .expanded-content .pos-table__qty-counter,
.expanded-content .pos-table__qty-counter.rtl-layout,
html[dir="rtl"] .expanded-content .pos-table__qty-counter,
body[dir="rtl"] .expanded-content .pos-table__qty-counter {
	flex-direction: row !important; /* Use order instead of row-reverse */
}

/* Same button ordering for expanded content (reverse order values for RTL context) */
[dir="rtl"] .expanded-content .pos-table__qty-counter .plus-btn,
[lang^="ar"] .expanded-content .pos-table__qty-counter .plus-btn,
[lang^="he"] .expanded-content .pos-table__qty-counter .plus-btn,
[lang^="fa"] .expanded-content .pos-table__qty-counter .plus-btn,
.expanded-content .pos-table__qty-counter.rtl-layout .plus-btn,
html[dir="rtl"] .expanded-content .pos-table__qty-counter .plus-btn,
body[dir="rtl"] .expanded-content .pos-table__qty-counter .plus-btn {
	order: 3 !important; /* Plus button should appear first visually in RTL */
}

[dir="rtl"] .expanded-content .pos-table__qty-counter .pos-table__qty-display,
[lang^="ar"] .expanded-content .pos-table__qty-counter .pos-table__qty-display,
[lang^="he"] .expanded-content .pos-table__qty-counter .pos-table__qty-display,
[lang^="fa"] .expanded-content .pos-table__qty-counter .pos-table__qty-display,
.expanded-content .pos-table__qty-counter.rtl-layout .pos-table__qty-display,
html[dir="rtl"] .expanded-content .pos-table__qty-counter .pos-table__qty-display,
body[dir="rtl"] .expanded-content .pos-table__qty-counter .pos-table__qty-display {
	order: 2 !important; /* Quantity stays in middle */
}

[dir="rtl"] .expanded-content .pos-table__qty-counter .minus-btn,
[lang^="ar"] .expanded-content .pos-table__qty-counter .minus-btn,
[lang^="he"] .expanded-content .pos-table__qty-counter .minus-btn,
[lang^="fa"] .expanded-content .pos-table__qty-counter .minus-btn,
.expanded-content .pos-table__qty-counter.rtl-layout .minus-btn,
html[dir="rtl"] .expanded-content .pos-table__qty-counter .minus-btn,
body[dir="rtl"] .expanded-content .pos-table__qty-counter .minus-btn {
	order: 1 !important; /* Minus button should appear last visually in RTL */
}

/* Keep numbers LTR in expanded content */
[dir="rtl"] .expanded-content .pos-table__qty-display,
[lang^="ar"] .expanded-content .pos-table__qty-display,
[lang^="he"] .expanded-content .pos-table__qty-display,
[lang^="fa"] .expanded-content .pos-table__qty-display,
html[dir="rtl"] .expanded-content .pos-table__qty-display,
body[dir="rtl"] .expanded-content .pos-table__qty-display {
	direction: ltr !important; /* Keep numbers readable */
}

/* =================================================================
   CONTAINER-AWARE RESPONSIVE STYLES
   ================================================================= */

/* Base responsive container styles */
.responsive-table-container {
	position: relative;
	transition: all 0.3s ease;
	width: 100%;
	max-width: 100%;
	margin: 0;
	padding: 0;
	box-sizing: border-box;
}

/* Breakpoint-specific container classes */
.responsive-table-container.breakpoint-xs {
	--table-padding: 8px;
	--header-font-size: 0.65rem;
	--cell-padding: 8px 4px;
	--cell-height: 48px;
}

.responsive-table-container.breakpoint-sm {
	--table-padding: 12px;
	--header-font-size: 0.7rem;
	--cell-padding: 12px 6px;
	--cell-height: 52px;
}

.responsive-table-container.breakpoint-md {
	--table-padding: 16px;
	--header-font-size: 0.75rem;
	--cell-padding: 14px 8px;
	--cell-height: 56px;
}

.responsive-table-container.breakpoint-lg {
	--table-padding: 16px;
	--header-font-size: 0.8rem;
	--cell-padding: 16px 12px;
	--cell-height: 60px;
}

.responsive-table-container.breakpoint-xl {
	--table-padding: 20px;
	--header-font-size: 0.85rem;
	--cell-padding: 18px 12px;
	--cell-height: 64px;
}

/* Dynamic table styling based on container size */
.pos-table.responsive-table {
	width: 100%;
	height: 100%;
	max-width: 100%;
	overflow: hidden;
	margin: 0 !important;
	padding: 0 !important;
	border-left: none;
	border-right: none;
	border-radius: 0;
}

/* Container-aware headers */
.pos-table.container-xs :deep(th) {
	font-size: var(--header-font-size);
	padding: 8px 4px;
	min-width: 60px;
	max-width: 120px;
}

.pos-table.container-sm :deep(th) {
	font-size: var(--header-font-size);
	padding: 10px 6px;
	min-width: 70px;
	max-width: 140px;
}

.pos-table.container-md :deep(th) {
	font-size: var(--header-font-size);
	padding: 12px 8px;
	min-width: 80px;
	max-width: 160px;
}

.pos-table.container-lg :deep(th) {
	font-size: var(--header-font-size);
	padding: var(--cell-padding);
	min-width: 90px;
	max-width: 180px;
}

.pos-table.container-xl :deep(th) {
	font-size: var(--header-font-size);
	padding: var(--cell-padding);
	min-width: 100px;
	max-width: 200px;
}

/* Container-aware cells */
.pos-table.container-xs :deep(td),
.pos-table.container-sm :deep(td),
.pos-table.container-md :deep(td),
.pos-table.container-lg :deep(td),
.pos-table.container-xl :deep(td) {
	padding: var(--cell-padding);
	height: var(--cell-height);
	vertical-align: middle;
}

/* Compact view adjustments */
.responsive-table-container.compact-view .pos-table {
	border-radius: 0;
	margin: 0;
	padding: 0;
	width: 100%;
	max-width: 100%;
}

.responsive-table-container.compact-view .pos-table__qty-counter {
	min-width: 110px;
	max-width: 140px;
	width: auto;
	gap: 4px;
}

.responsive-table-container.compact-view .qty-control-btn {
	width: 28px !important;
	height: 28px !important;
	min-width: 28px !important;
}

.responsive-table-container.compact-view .pos-table__qty-display {
	min-width: 35px;
	max-width: 65px;
	height: 28px;
	font-size: 0.7rem;
	padding: 4px 3px;
	letter-spacing: -0.03em;
}

/* Medium view adjustments */
.responsive-table-container.medium-view .pos-table__qty-counter {
	min-width: 130px;
	max-width: 160px;
	width: auto;
}

/* Large view adjustments */
.responsive-table-container.large-view .pos-table__qty-counter {
	min-width: 140px;
	max-width: 180px;
	width: auto;
}

/* Enhanced expanded content responsiveness */
.expanded-content.expanded-xs {
	padding: 12px;
	border-radius: 0 0 6px 6px;
}

.expanded-content.expanded-sm {
	padding: 16px;
	border-radius: 0 0 8px 8px;
}

.expanded-content.expanded-md {
	padding: 20px;
	border-radius: 0 0 10px 10px;
}

.expanded-content.expanded-lg {
	padding: 24px;
	border-radius: 0 0 12px 12px;
}

.expanded-content.expanded-xl {
	padding: 28px;
	border-radius: 0 0 12px 12px;
}

/* Compact expanded content */
.expanded-content.compact-expanded .form-section {
	padding: 16px 12px;
	margin-bottom: 12px;
	border-radius: 8px;
}

.expanded-content.compact-expanded .form-row {
	flex-direction: column;
	gap: 8px;
}

.expanded-content.compact-expanded .form-field {
	min-width: 100%;
}

.expanded-content.compact-expanded .section-header {
	margin-bottom: 12px;
	padding-bottom: 8px;
}

.expanded-content.compact-expanded .section-title {
	font-size: 0.8rem;
}

/* Full width enforcement for all nested elements */
.pos-table :deep(.v-data-table),
.pos-table :deep(.v-data-table-virtual),
.pos-table :deep(.v-table) {
	width: 100% !important;
	max-width: 100% !important;
	margin: 0 !important;
	padding: 0 !important;
	border-radius: 0 !important;
}

.pos-table :deep(.v-data-table__wrapper) {
	width: 100% !important;
	max-width: 100% !important;
	margin: 0 !important;
	padding: 0 !important;
	border: none !important;
}

.pos-table :deep(table) {
	width: 100% !important;
	max-width: 100% !important;
	margin: 0 !important;
	border-collapse: collapse !important;
	table-layout: auto !important;
}

.pos-table :deep(thead),
.pos-table :deep(tbody) {
	width: 100% !important;
	max-width: 100% !important;
}

.pos-table :deep(tr) {
	width: 100% !important;
	max-width: 100% !important;
	margin: 0 !important;
	padding: 0 !important;
}

/* Remove any card or container margins around the table */
.items-table-wrapper,
.items-table-wrapper :deep(.v-card),
.items-table-wrapper :deep(.v-sheet) {
	width: 100% !important;
	max-width: 100% !important;
	margin: 0 !important;
	padding: 0 !important;
	border-radius: 0 !important;
}

/* Performance optimizations */
.responsive-table-container {
	will-change: width, height;
	contain: layout style;
}

.pos-table.responsive-table {
	will-change: transform;
	contain: layout;
}

/* Smooth transitions during resize */
.pos-table :deep(th),
.pos-table :deep(td) {
	transition:
		padding 0.2s ease,
		font-size 0.2s ease,
		width 0.2s ease;
}

/* Enhanced responsive design */
@media (max-width: 768px) {
	.pos-table {
		border-radius: 0;
		margin: 0;
		padding: 0;
		width: 100%;
		max-width: 100%;
	}

	.pos-table :deep(th) {
		font-size: 0.65rem;
		padding: 12px 6px;
		letter-spacing: 0.5px;
	}

	.pos-table :deep(td) {
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

	.pos-table {
		border-radius: 0;
		margin: 0;
		padding: 0;
		width: 100%;
		max-width: 100%;
		box-shadow: 0 4px 20px var(--pos-shadow);
	}

	.pos-table :deep(th) {
		font-size: 0.6rem;
		padding: 8px 4px;
		max-width: 80px;
		min-width: 50px;
		letter-spacing: 0.3px;
	}

	.pos-table :deep(td) {
		padding: 12px 4px;
		height: 48px;
		font-size: 0.8rem;
	}

	.pos-table :deep(th[data-column-key="item_name"]) {
		min-width: 120px;
		max-width: 150px;
	}

	.pos-table :deep(th[data-column-key="qty"]) {
		min-width: 100px;
		max-width: 120px;
	}

	.pos-table :deep(th[data-column-key="rate"]),
	.pos-table :deep(th[data-column-key="amount"]) {
		min-width: 70px;
		max-width: 90px;
	}

	.pos-table__qty-counter {
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

	.pos-table__qty-display {
		min-width: 35px;
		max-width: 70px;
		padding: 4px 3px;
		font-size: 0.75rem;
		height: 28px;
		letter-spacing: -0.03em;
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
	box-shadow: 0 4px 8px var(--pos-shadow) !important;
}

/* Enhanced form field styling with context awareness */
.form-field :deep(.v-field) {
	border-radius: clamp(6px, 2vw, 12px) !important;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
	background: var(--pos-input-bg) !important;
	backdrop-filter: blur(10px) !important;
	border: 1px solid var(--pos-border-light) !important;
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
	box-shadow: 0 4px 12px var(--pos-shadow) !important;
	transform: translateY(-1px);
	border-color: var(--pos-primary-variant) !important;
}

.form-field :deep(.v-field--focused) {
	box-shadow:
		0 0 0 3px var(--pos-primary-container),
		0 4px 20px var(--pos-shadow) !important;
	transform: translateY(-1px);
	border-color: var(--pos-primary) !important;
	background: var(--pos-input-bg) !important;
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
	color: var(--pos-error) !important;
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
.pos-table :deep(td),
.pos-table :deep(th) {
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
.pos-table :deep(th[data-column-key="item_name"]),
.pos-table :deep(td[data-column-key="item_name"]) {
	min-width: 200px;
	max-width: 250px;
	text-align: left;
}

.pos-table :deep(th[data-column-key="qty"]),
.pos-table :deep(td[data-column-key="qty"]) {
	min-width: 140px;
	max-width: 160px;
	text-align: center;
}

.pos-table :deep(th[data-column-key="uom"]),
.pos-table :deep(td[data-column-key="uom"]) {
	min-width: 80px;
	max-width: 100px;
	text-align: center;
}

.pos-table :deep(th[data-column-key="rate"]),
.pos-table :deep(td[data-column-key="rate"]),
.pos-table :deep(th[data-column-key="amount"]),
.pos-table :deep(td[data-column-key="amount"]) {
	min-width: 100px;
	max-width: 130px;
	text-align: center !important;
}

/* Ensure consistent header padding for rate/amount columns */
.pos-table :deep(th[data-column-key="rate"]),
.pos-table :deep(th[data-column-key="amount"]) {
	padding: 12px !important;
}

/* Consolidated column cell padding */
.pos-table :deep(td[data-column-key="rate"]),
.pos-table :deep(td[data-column-key="amount"]),
.pos-table :deep(td[data-column-key="price_list_rate"]) {
	padding: var(--cell-padding);
}

.pos-table :deep(th[data-column-key="price_list_rate"]),
.pos-table :deep(td[data-column-key="price_list_rate"]) {
	min-width: 120px;
	max-width: 140px;
	text-align: center !important;
	font-weight: 500;
}

/* Specific header styling for Price List Rate */
.pos-table :deep(th[data-column-key="price_list_rate"]) {
	background: linear-gradient(135deg, var(--pos-table-header-bg) 0%, var(--pos-primary-container) 100%);
	border-right: 1px solid var(--pos-primary-variant);
}

/* Advanced header tooltip for truncated text */
.pos-table :deep(th.has-tooltip) {
	position: relative;
}

.pos-table :deep(th.has-tooltip::after) {
	content: attr(data-tooltip);
	position: absolute;
	bottom: -45px;
	left: 50%;
	transform: translateX(-50%);
	background: rgba(33, 33, 33, 0.95);
	color: white;
	padding: 8px 12px;
	border-radius: 6px;
	font-size: 0.75rem;
	font-weight: 400;
	text-transform: none;
	letter-spacing: normal;
	white-space: nowrap;
	z-index: 100;
	box-shadow: 0 4px 12px var(--pos-shadow-dark);
	pointer-events: none;
	opacity: 0;
	visibility: hidden;
	transition:
		opacity 0.3s ease,
		visibility 0.3s ease,
		transform 0.3s ease;
	transform: translateX(-50%) translateY(-5px);
	max-width: 200px;
	word-wrap: break-word;
	text-align: center;
	line-height: 1.3;
}

.pos-table :deep(th.has-tooltip::before) {
	content: "";
	position: absolute;
	bottom: -8px;
	left: 50%;
	transform: translateX(-50%);
	width: 0;
	height: 0;
	border-left: 6px solid transparent;
	border-right: 6px solid transparent;
	border-bottom: 6px solid rgba(33, 33, 33, 0.95);
	z-index: 101;
	opacity: 0;
	visibility: hidden;
	transition:
		opacity 0.3s ease,
		visibility 0.3s ease;
	pointer-events: none;
}

.pos-table :deep(th.has-tooltip:hover::after) {
	opacity: 1;
	visibility: visible;
	transform: translateX(-50%) translateY(0);
	transition-delay: 0.5s;
}

.pos-table :deep(th.has-tooltip:hover::before) {
	opacity: 1;
	visibility: visible;
	transition-delay: 0.5s;
}

/* Additional header stability and interaction improvements */
.pos-table :deep(th:active) {
	transform: translateY(0px);
	transition: transform 0.1s ease;
}

.pos-table :deep(th:focus) {
	outline: 2px solid var(--pos-primary-container);
	outline-offset: -2px;
}

/* Prevent text selection and improve cursor feedback */
.pos-table :deep(th),
.pos-table :deep(th *) {
	user-select: none;
	-webkit-user-select: none;
	-moz-user-select: none;
	-ms-user-select: none;
}

/* Smooth transition for all header properties to prevent jitter */
.pos-table :deep(th),
.pos-table :deep(th .v-data-table-header__content),
.pos-table :deep(th .v-icon) {
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
	transform: translate3d(0, 0, 0);
	-webkit-transform: translate3d(0, 0, 0);
}

/* Prevent layout shift during hover */
.pos-table :deep(th) {
	contain: layout style;
}

/* Enhanced header border for better visual stability */
.pos-table :deep(th) {
	border-right: 1px solid var(--pos-border-light);
}

.pos-table :deep(th:last-child) {
	border-right: none;
}

/* =================================================================
   ELIMINATE UNWANTED VUETIFY TABLE SPACERS AND EMPTY ROWS
   ================================================================= */

/* Hide empty placeholder/spacer rows generated by Vuetify */
.pos-table :deep(tr[style*="height: 0px"]),
.pos-table :deep(tr[style*="height:0px"]) {
	display: none !important;
	height: 0 !important;
	line-height: 0 !important;
	padding: 0 !important;
	margin: 0 !important;
	border: none !important;
}

/* Hide empty cells within spacer rows */
.pos-table :deep(tr[style*="height: 0px"] td),
.pos-table :deep(tr[style*="height:0px"] td),
.pos-table :deep(td[style*="height: 0px"]),
.pos-table :deep(td[style*="height:0px"]) {
	display: none !important;
	height: 0 !important;
	line-height: 0 !important;
	padding: 0 !important;
	margin: 0 !important;
	border: none !important;
}

/* Additional targeting for Vuetify virtual table placeholders */
.pos-table :deep(.v-data-table__tr--placeholder),
.pos-table :deep(.v-table__tr--placeholder) {
	display: none !important;
}

/* Hide any empty rows with zero or minimal height */
.pos-table :deep(tr) {
	min-height: var(--cell-height, 60px);
}

.pos-table :deep(tr:empty),
.pos-table :deep(tr[style*="height: 0"]),
.pos-table :deep(tr[style*="height:0"]) {
	display: none !important;
	visibility: hidden !important;
	opacity: 0 !important;
	height: 0 !important;
	line-height: 0 !important;
}

/* Ensure table rows have consistent spacing */
.pos-table :deep(tbody tr:not([style*="height: 0"])) {
	height: var(--cell-height, 60px);
	min-height: var(--cell-height, 60px);
}

/* Clean up any unwanted spacing from virtual scrolling */
.pos-table :deep(.v-virtual-scroll__item[style*="height: 0"]),
.pos-table :deep(.v-virtual-scroll__spacer[style*="height: 0"]) {
	display: none !important;
}

/* Force table to have clean spacing */
.pos-table :deep(table) {
	border-spacing: 0;
	border-collapse: collapse;
}

/* Ensure tbody has no unwanted spacing */
.pos-table :deep(tbody) {
	border-spacing: 0;
}

/* Hide any Vuetify generated dividers or spacers */
.pos-table :deep(.v-divider),
.pos-table :deep(.v-spacer) {
	display: none !important;
}

/* Additional cleanup for v-data-table-virtual specific elements */
.pos-table :deep(.v-data-table-virtual__spacer) {
	display: none !important;
	height: 0 !important;
}

/* Hide empty measurement/calculation rows */
.pos-table :deep(tr[data-test-id]),
.pos-table :deep(tr[data-testid]),
.pos-table :deep(tr[class*="measurement"]),
.pos-table :deep(tr[class*="placeholder"]) {
	display: none !important;
}

/* Ensure no phantom spacing around table body */
.pos-table :deep(tbody) {
	vertical-align: top;
	border-top: none;
	border-bottom: none;
	margin: 0;
	padding: 0;
}

/* Clean up any row group spacing */
.pos-table :deep(tbody tr) {
	vertical-align: middle;
}

/* Remove any default table spacing that might create gaps */
.pos-table :deep(table),
.pos-table :deep(tbody),
.pos-table :deep(thead) {
	border-collapse: collapse;
	border-spacing: 0;
	margin: 0;
	padding: 0;
}

/* Ensure expanded rows don't create unwanted spacing */
.pos-table :deep(tr.v-data-table__expanded) {
	border: none;
}

/* Clean slate for table structure */
.pos-table :deep(*) {
	box-sizing: border-box;
}

/* Force removal of any invisible/zero-height elements that might cause spacing */
.pos-table :deep([style*="display: none"]),
.pos-table :deep([style*="visibility: hidden"]),
.pos-table :deep([style*="opacity: 0"]) {
	display: none !important;
	height: 0 !important;
	margin: 0 !important;
	padding: 0 !important;
}

/* Enhanced expanded row width utilization */
.pos-table :deep(tr.v-data-table__expanded__content) {
	width: 100% !important;
}

.pos-table :deep(tr.v-data-table__expanded__content td) {
	width: 100% !important;
	max-width: 100% !important;
	padding: 0 !important;
	margin: 0 !important;
}

/* Ensure expanded rows don't have unwanted borders */
.pos-table :deep(.v-data-table__expanded__content) {
	border: none !important;
	background: transparent !important;
}

/* Fix for Vuetify expanded row positioning */
.pos-table :deep(.v-data-table__expanded__content .expanded-row-cell) {
	width: 100% !important;
	border: none !important;
	background: transparent !important;
}

.pos-table :deep(th[data-column-key="discount_value"]),
.pos-table :deep(td[data-column-key="discount_value"]),
.pos-table :deep(th[data-column-key="discount_amount"]),
.pos-table :deep(td[data-column-key="discount_amount"]) {
	min-width: 90px;
	max-width: 120px;
	text-align: center !important;
}

/* Ensure consistent header padding for discount columns */
.pos-table :deep(th[data-column-key="discount_value"]),
.pos-table :deep(th[data-column-key="discount_amount"]) {
	padding: 12px !important;
	vertical-align: middle !important;
	line-height: 1.2 !important;
}

/* Additional fix for headers containing percentage or Arabic text */
.pos-table :deep(th) {
	display: table-cell !important;
	vertical-align: middle !important;
}

/* Specific fix for headers with Arabic text and special characters */
.pos-table :deep(th .v-data-table-header__content) {
	vertical-align: middle !important;
	line-height: 1.2 !important;
	display: flex !important;
	align-items: center !important;
	justify-content: center !important;
	height: 100% !important;
}

/* Discount column cells */
.pos-table :deep(td[data-column-key="discount_value"]),
.pos-table :deep(td[data-column-key="discount_amount"]) {
	padding: var(--cell-padding);
	vertical-align: middle !important;
	line-height: 1 !important;
}

.pos-table :deep(th[data-column-key="posa_is_offer"]),
.pos-table :deep(td[data-column-key="posa_is_offer"]) {
	min-width: 70px;
	max-width: 90px;
	text-align: center;
}

.pos-table :deep(th[data-column-key="actions"]),
.pos-table :deep(td[data-column-key="actions"]) {
	min-width: 80px;
	max-width: 100px;
	text-align: center;
}

/* RTL support for table columns */
[dir="rtl"] .pos-table :deep(th[data-column-key="item_name"]),
[dir="rtl"] .pos-table :deep(td[data-column-key="item_name"]) {
	text-align: right;
}

[dir="rtl"] .pos-table :deep(th[data-column-key="rate"]),
[dir="rtl"] .pos-table :deep(td[data-column-key="rate"]),
[dir="rtl"] .pos-table :deep(th[data-column-key="amount"]),
[dir="rtl"] .pos-table :deep(td[data-column-key="amount"]),
[dir="rtl"] .pos-table :deep(th[data-column-key="price_list_rate"]),
[dir="rtl"] .pos-table :deep(td[data-column-key="price_list_rate"]),
[dir="rtl"] .pos-table :deep(th[data-column-key="discount_value"]),
[dir="rtl"] .pos-table :deep(td[data-column-key="discount_value"]),
[dir="rtl"] .pos-table :deep(th[data-column-key="discount_amount"]),
[dir="rtl"] .pos-table :deep(td[data-column-key="discount_amount"]) {
	text-align: center !important;
}

/* Drag and drop styles */
.draggable-row {
	transition: all 0.2s ease;
	cursor: move;
}

.draggable-row:hover {
	background-color: var(--pos-table-row-hover);
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
	background-color: var(--pos-primary-container) !important;
}

.drag-over {
	background-color: var(--pos-selected-bg) !important;
	border-top: 2px solid var(--pos-primary);
	transform: translateY(-1px);
}

.drag-active .draggable-row:not(.drag-source):not(.drag-over) {
	opacity: 0.7;
}

/* Dark theme drag styles */

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
	gap: 6px;
	padding: 4px;
	/* More flexible sizing for larger numbers */
	min-width: 130px;
	max-width: 180px;
	width: auto;
	height: auto;
	background: var(--pos-surface-variant);
	border-radius: 12px;
	backdrop-filter: blur(10px);
	border: 1px solid var(--pos-border-light);
	transition: all 0.3s ease;
	margin: 0 auto;
	/* Allow container to grow with content */
	flex-shrink: 0;
	box-sizing: border-box;
}

.pos-table__qty-counter:hover {
	background: var(--pos-hover-bg);
	box-shadow: 0 4px 16px var(--pos-shadow);
	transform: translateY(-1px);
}

/* RTL support for quantity counter - Enhanced with multiple selectors */
/* HTML order: - | qty | + */
/* RTL desired: + | qty | - */

/* Use CSS order for precise RTL layout: + | qty | - */
[dir="rtl"] .pos-table__qty-counter,
[lang^="ar"] .pos-table__qty-counter,
[lang^="he"] .pos-table__qty-counter,
[lang^="fa"] .pos-table__qty-counter,
.pos-table__qty-counter.rtl-layout,
html[dir="rtl"] .pos-table__qty-counter,
body[dir="rtl"] .pos-table__qty-counter {
	/* Keep normal flex direction but use order */
	flex-direction: row !important;
}

/* RTL Button ordering: + | qty | - (reverse order values for RTL context) */
[dir="rtl"] .pos-table__qty-counter .plus-btn,
[lang^="ar"] .pos-table__qty-counter .plus-btn,
[lang^="he"] .pos-table__qty-counter .plus-btn,
[lang^="fa"] .pos-table__qty-counter .plus-btn,
.pos-table__qty-counter.rtl-layout .plus-btn,
html[dir="rtl"] .pos-table__qty-counter .plus-btn,
body[dir="rtl"] .pos-table__qty-counter .plus-btn {
	order: 3 !important; /* Plus button should appear first visually */
}

[dir="rtl"] .pos-table__qty-counter .pos-table__qty-display,
[lang^="ar"] .pos-table__qty-counter .pos-table__qty-display,
[lang^="he"] .pos-table__qty-counter .pos-table__qty-display,
[lang^="fa"] .pos-table__qty-counter .pos-table__qty-display,
.pos-table__qty-counter.rtl-layout .pos-table__qty-display,
html[dir="rtl"] .pos-table__qty-counter .pos-table__qty-display,
body[dir="rtl"] .pos-table__qty-counter .pos-table__qty-display {
	order: 2 !important; /* Quantity stays in middle */
}

[dir="rtl"] .pos-table__qty-counter .minus-btn,
[lang^="ar"] .pos-table__qty-counter .minus-btn,
[lang^="he"] .pos-table__qty-counter .minus-btn,
[lang^="fa"] .pos-table__qty-counter .minus-btn,
.pos-table__qty-counter.rtl-layout .minus-btn,
html[dir="rtl"] .pos-table__qty-counter .minus-btn,
body[dir="rtl"] .pos-table__qty-counter .minus-btn {
	order: 1 !important; /* Minus button should appear last visually */
}

/* Keep numbers readable in RTL - multiple selectors */
[dir="rtl"] .pos-table__qty-display,
[lang^="ar"] .pos-table__qty-display,
[lang^="he"] .pos-table__qty-display,
[lang^="fa"] .pos-table__qty-display,
.pos-table__qty-counter.rtl-layout .pos-table__qty-display,
html[dir="rtl"] .pos-table__qty-display,
body[dir="rtl"] .pos-table__qty-display {
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

.pos-table__qty-display {
	/* Dynamic width based on content with proper constraints */
	min-width: 50px;
	max-width: 100px;
	width: auto;
	flex: 1 1 auto;
	text-align: center;
	font-weight: 600;
	padding: 6px 4px;
	border-radius: 6px;
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
	font-size: 0.8rem;
	transition: all 0.2s ease;
	box-shadow: 0 1px 3px var(--pos-shadow-light);
	display: flex;
	align-items: center;
	justify-content: center;
	height: 32px;
	/* Handle overflow gracefully */
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	/* Better number display */
	letter-spacing: -0.02em;
	word-spacing: -0.1em;
}

/* Special handling for very large numbers */
.pos-table__qty-display.large-number {
	min-width: 70px;
	max-width: 120px;
	font-size: 0.75rem;
	padding: 6px 3px;
	letter-spacing: -0.04em;
}

/* Special handling for negative numbers */
.pos-table__qty-display.negative-number {
	color: var(--pos-error);
	background: var(--pos-error-container);
	border-color: var(--pos-error);
}

/* Dynamic container expansion for larger numbers */
.pos-table__qty-counter:has(.large-number) {
	min-width: 150px;
	max-width: 200px;
}

/* Responsive text sizing based on number length */
.pos-table__qty-display[data-length="1"],
.pos-table__qty-display[data-length="2"] {
	font-size: 0.85rem;
	min-width: 40px;
}

.pos-table__qty-display[data-length="3"],
.pos-table__qty-display[data-length="4"] {
	font-size: 0.8rem;
	min-width: 50px;
}

.pos-table__qty-display[data-length="5"],
.pos-table__qty-display[data-length="6"] {
	font-size: 0.75rem;
	min-width: 60px;
}

.pos-table__qty-display[data-length="7"],
.pos-table__qty-display[data-length="8"],
.pos-table__qty-display[data-length="9"] {
	font-size: 0.7rem;
	min-width: 70px;
	max-width: 100px;
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

/* Delete action button styling */
.delete-action-btn {
	min-width: 44px !important;
	height: 44px !important;
	border-radius: 12px !important;
	transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
	box-shadow:
		0 4px 12px var(--pos-shadow),
		0 2px 4px var(--pos-shadow-light) !important;
	font-weight: 600 !important;
	background: var(--pos-button-error-bg) !important;
	color: var(--pos-button-error-text) !important;
	border: 2px solid var(--pos-button-error-border) !important;
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
	background: var(--pos-hover-bg);
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
		0 8px 24px var(--pos-shadow-dark),
		0 4px 8px var(--pos-shadow) !important;
	background: var(--pos-button-error-hover-bg) !important;
	color: var(--pos-button-error-hover-text) !important;
}

.delete-action-btn .v-icon {
	position: relative;
	z-index: 1;
	transition: all 0.2s ease;
}

.delete-action-btn:hover .v-icon {
	animation: pulse 0.6s ease-in-out;
}
</style>
