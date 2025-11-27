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
					<v-chip
						v-if="item.batch_no_is_expired"
						color="error"
						size="x-small"
						variant="flat"
						class="ml-1"
					>
						{{ __("Expired") }}
					</v-chip>
					<v-tooltip v-if="item.pricing_rule_badge" location="bottom">
						<template #activator="{ props }">
							<v-chip v-bind="props" color="primary" size="x-small" class="ml-1">
								{{ item.pricing_rule_badge.label }}
							</v-chip>
						</template>
						<span>{{ item.pricing_rule_badge.tooltip }}</span>
					</v-tooltip>
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
				<div class="currency-display" @click.stop="openQtyEdit(item)">
					<div
						v-if="editing_qty_row_id !== item.posa_row_id"
						class="d-flex align-center justify-center w-100 h-100"
					>
						<span
							class="amount-value number-field-rtl"
							:class="{
								'negative-number': isNegative(item.qty),
								'large-number': memoizedQtyLength(item.qty) > 6,
							}"
						>
							{{ formatFloat(item.qty, hide_qty_decimals ? 0 : undefined) }}
						</span>
					</div>
					<v-text-field
						v-else
						:model-value="editing_qty_value"
						@update:model-value="editing_qty_value = $event"
						density="compact"
						variant="outlined"
						class="pos-table__qty-input compact-input"
						@blur="closeQtyEdit(item)"
						@keydown.enter.prevent="closeQtyEdit(item)"
						@click.stop
						ref="qtyInput"
						:autofocus="true"
						type="number"
						hide-details
						:disabled="
							isReturnInvoice &&
							(item.is_free_item || item.posa_is_offer || item.posa_is_replace)
						"
					></v-text-field>
				</div>
			</template>
			<!-- UOM column -->
			<template v-slot:item.uom="{ item }">
				<div class="currency-display" @click.stop>
					<v-select
						ref="uomSelect"
						:class="{ 'uom-display-mode': editing_uom_row_id !== item.posa_row_id }"
						:model-value="item.uom"
						@update:model-value="handleUomSelect(item, $event)"
						:items="item.item_uoms"
						item-title="uom"
						item-value="uom"
						density="compact"
						variant="outlined"
						class="pos-table__editor-input uom-select compact-input"
						hide-details
						@focus="openUomEdit(item)"
						@blur="closeUomEdit(item)"
					></v-select>
				</div>
			</template>

			<!-- Rate column -->
			<template v-slot:item.rate="{ item }">
				<div class="currency-display" @click.stop="openRateEdit(item)">
					<div
						v-if="editing_rate_row_id !== item.posa_row_id"
						class="d-flex align-center justify-center w-100 h-100"
					>
						<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
						<span class="amount-value" :class="{ 'negative-number': isNegative(item.rate) }">
							{{ formatCurrency(item.rate) }}
						</span>
					</div>
					<v-text-field
						v-else
						:model-value="editing_rate_value"
						@update:model-value="editing_rate_value = $event"
						density="compact"
						variant="outlined"
						class="pos-table__editor-input compact-input"
						@blur="closeRateEdit(item)"
						@keydown.enter.prevent="closeRateEdit(item)"
						@click.stop
						ref="rateInput"
						:autofocus="true"
						type="number"
						hide-details
						:disabled="
							!pos_profile.posa_allow_user_to_edit_rate ||
							!!item.posa_is_replace ||
							!!item.posa_offer_applied
						"
					></v-text-field>
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
				<div class="currency-display" @click.stop="openDiscountPercentEdit(item)">
					<div
						v-if="editing_discount_percent_row_id !== item.posa_row_id"
						class="d-flex align-center justify-center w-100 h-100"
					>
						<span class="amount-value">
							{{
								formatFloat(
									Math.abs(
										item.discount_percentage ||
											(item.price_list_rate
												? (item.discount_amount / item.price_list_rate) * 100
												: 0),
									),
								)
							}}%
						</span>
					</div>
					<v-text-field
						v-else
						:model-value="editing_discount_percent_value"
						@update:model-value="editing_discount_percent_value = $event"
						density="compact"
						variant="outlined"
						class="pos-table__editor-input compact-input"
						@blur="closeDiscountPercentEdit(item)"
						@keydown.enter.prevent="closeDiscountPercentEdit(item)"
						@click.stop
						ref="discountPercentInput"
						:autofocus="true"
						type="number"
						hide-details
						:disabled="
							!pos_profile.posa_allow_user_to_edit_item_discount ||
							!!item.posa_is_replace ||
							!!item.posa_offer_applied
						"
					></v-text-field>
				</div>
			</template>

			<!-- Discount amount column -->
			<template v-slot:item.discount_amount="{ item }">
				<div class="currency-display" @click.stop="openDiscountAmountEdit(item)">
					<div
						v-if="editing_discount_amount_row_id !== item.posa_row_id"
						class="d-flex align-center justify-center w-100 h-100"
					>
						<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
						<span class="amount-value">{{
							formatCurrency(Math.abs(item.discount_amount || 0))
						}}</span>
					</div>
					<v-text-field
						v-else
						:model-value="editing_discount_amount_value"
						@update:model-value="editing_discount_amount_value = $event"
						density="compact"
						variant="outlined"
						class="pos-table__editor-input compact-input"
						@blur="closeDiscountAmountEdit(item)"
						@keydown.enter.prevent="closeDiscountAmountEdit(item)"
						@click.stop
						ref="discountAmountInput"
						:autofocus="true"
						type="number"
						hide-details
						:disabled="
							!pos_profile.posa_allow_user_to_edit_item_discount ||
							!!item.posa_is_replace ||
							!!item.posa_offer_applied
						"
					></v-text-field>
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
														item._base_actual_qty,
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
											:model-value="
												formatFloat(Math.abs(item.discount_percentage || 0))
											"
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
											:model-value="formatCurrency(Math.abs(item.discount_amount || 0))"
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
											:model-value="formatFloat(item._base_actual_qty)"
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
											:items="getSerialOptions(item)"
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
													<v-list-item-subtitle class="d-flex align-center">
														<span
															v-html="
																`Available QTY  '${item.raw.available_qty ?? item.raw.batch_qty}' - Expiry Date ${item.raw.expiry_date}`
															"
														></span>
														<v-chip
															v-if="item.raw.is_expired"
															color="error"
															size="x-small"
															variant="flat"
															class="ml-2"
														>
															{{ __("Expired") }}
														</v-chip>
													</v-list-item-subtitle>
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
			editing_qty_row_id: null,
			editing_qty_value: null,
			editing_uom_row_id: null,
			editing_rate_row_id: null,
			editing_rate_value: null,
			editing_discount_percent_row_id: null,
			editing_discount_percent_value: null,
			editing_discount_amount_row_id: null,
			editing_discount_amount_value: null,
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
		getSerialOptions(item) {
			if (Array.isArray(item?.filtered_serial_no_data)) {
				return item.filtered_serial_no_data;
			}
			return Array.isArray(item?.serial_no_data) ? item.serial_no_data : [];
		},

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
				item_name: { min: 120, max: 200, ratio: 0.3 },
				qty: { min: 60, max: 100, ratio: 0.12 },
				rate: { min: 60, max: 90, ratio: 0.12 },
				amount: { min: 60, max: 90, ratio: 0.12 },
				discount_value: { min: 50, max: 70, ratio: 0.1 },
				discount_amount: { min: 60, max: 80, ratio: 0.11 },
				price_list_rate: { min: 70, max: 100, ratio: 0.13 },
				actions: { min: 50, max: 70, ratio: 0.08 },
				posa_is_offer: { min: 40, max: 60, ratio: 0.06 },
			};

			const config = baseWidths[header.key] || { min: 50, max: 80, ratio: 0.1 };
			const calculatedWidth = this.containerWidth * config.ratio;

			return Math.max(config.min, Math.min(config.max, calculatedWidth));
		},

		calculateMinColumnWidth(header) {
			const minWidths = {
				item_name: 100,
				qty: 60,
				rate: 60,
				amount: 60,
				discount_value: 50,
				discount_amount: 50,
				price_list_rate: 60,
				actions: 40,
				posa_is_offer: 40,
			};

			return minWidths[header.key] || 40;
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
		// Enhanced method with memoization for better performance
		getQtyDisplayLength(qty) {
			return this.memoizedQtyLength(qty);
		},

		// Optimized expanded update handler
		handleExpandedUpdate(val) {
			const mappedValues = val.map((v) => (typeof v === "object" ? v.posa_row_id : v));
			this.$emit("update:expanded", mappedValues);
		},

		openQtyEdit(item) {
			if (this.editing_qty_row_id !== item.posa_row_id) {
				this.editing_qty_row_id = item.posa_row_id;
				this.editing_qty_value = "";
				this.$nextTick(() => {
					this.$refs.qtyInput?.focus();
				});
			}
		},

		closeQtyEdit(item) {
			if (this.editing_qty_row_id === item.posa_row_id) {
				if (
					this.editing_qty_value !== "" &&
					this.editing_qty_value !== null &&
					this.editing_qty_value !== undefined
				) {
					const newQty = parseFloat(this.editing_qty_value);
					if (!newQty || newQty <= 0) {
						this.setFormatedQty(item, "qty", null, false, 1);
					} else {
						this.setFormatedQty(item, "qty", null, false, newQty);
					}
				}
				this.editing_qty_row_id = null;
				this.editing_qty_value = null;
			}
		},
		openUomEdit(item) {
			this.editing_uom_row_id = item.posa_row_id;
		},

		closeUomEdit(item) {
			this.editing_uom_row_id = null;
		},

		handleUomSelect(item, newUom) {
			if (newUom && newUom !== item.uom) {
				this.calcUom(item, newUom);
			}
			// Find the correct component instance to blur
			const uomSelectComponent = this.$refs.uomSelect.find(
				(ref) => ref.$el.id.includes(item.posa_row_id),
			);
			uomSelectComponent?.blur();
		},
		openRateEdit(item) {
			if (
				!this.pos_profile.posa_allow_user_to_edit_rate ||
				item.posa_is_replace ||
				item.posa_offer_applied
			) {
				return;
			}
			this.editing_rate_row_id = item.posa_row_id;
			this.editing_rate_value = "";
			this.$nextTick(() => {
				this.$refs.rateInput?.focus();
			});
		},

		closeRateEdit(item) {
			if (this.editing_rate_row_id === item.posa_row_id) {
				if (
					this.editing_rate_value !== "" &&
					this.editing_rate_value !== null &&
					this.editing_rate_value !== undefined
				) {
					const newRate = parseFloat(this.editing_rate_value);
					if (Number.isFinite(newRate) && newRate !== item.rate) {
						this.setFormatedCurrency(item, "rate", null, false, { target: { value: newRate } });
						this.calcPrices(item, newRate, { target: { id: "rate" } });
					}
				}
				this.editing_rate_row_id = null;
				this.editing_rate_value = null;
			}
		},
		openDiscountPercentEdit(item) {
			if (
				!this.pos_profile.posa_allow_user_to_edit_item_discount ||
				item.posa_is_replace ||
				item.posa_offer_applied
			) {
				return;
			}
			this.editing_discount_percent_row_id = item.posa_row_id;
			this.editing_discount_percent_value = "";
			this.$nextTick(() => {
				this.$refs.discountPercentInput?.focus();
			});
		},

		closeDiscountPercentEdit(item) {
			if (this.editing_discount_percent_row_id === item.posa_row_id) {
				if (
					this.editing_discount_percent_value !== "" &&
					this.editing_discount_percent_value !== null &&
					this.editing_discount_percent_value !== undefined
				) {
					const newDiscount = parseFloat(this.editing_discount_percent_value);
					if (Number.isFinite(newDiscount) && newDiscount !== item.discount_percentage) {
						this.setFormatedCurrency(item, "discount_percentage", null, false, {
							target: { value: newDiscount },
						});
						this.calcPrices(item, newDiscount, { target: { id: "discount_percentage" } });
					}
				}
				this.editing_discount_percent_row_id = null;
				this.editing_discount_percent_value = null;
			}
		},
		openDiscountAmountEdit(item) {
			if (
				!this.pos_profile.posa_allow_user_to_edit_item_discount ||
				item.posa_is_replace ||
				item.posa_offer_applied
			) {
				return;
			}
			this.editing_discount_amount_row_id = item.posa_row_id;
			this.editing_discount_amount_value = "";
			this.$nextTick(() => {
				this.$refs.discountAmountInput?.focus();
			});
		},

		closeDiscountAmountEdit(item) {
			if (this.editing_discount_amount_row_id === item.posa_row_id) {
				if (
					this.editing_discount_amount_value !== "" &&
					this.editing_discount_amount_value !== null &&
					this.editing_discount_amount_value !== undefined
				) {
					const newDiscount = parseFloat(this.editing_discount_amount_value);
					if (Number.isFinite(newDiscount) && newDiscount !== item.discount_amount) {
						this.setFormatedCurrency(item, "discount_amount", null, false, {
							target: { value: newDiscount },
						});
						this.calcPrices(item, newDiscount, { target: { id: "discount_amount" } });
					}
				}
				this.editing_discount_amount_row_id = null;
				this.editing_discount_amount_value = null;
			}
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
@import "./items-table-styles.css";

/* Compact Input Override */
.compact-input :deep(.v-input__control) {
	height: 24px;
}
.compact-input :deep(.v-field__field) {
	height: 24px;
	padding: 0 4px;
}
.compact-input :deep(.v-field__input) {
	padding: 0;
	min-height: 24px;
	font-size: 0.75rem;
	text-align: center;
}
.compact-input :deep(input) {
	text-align: center;
}

/* UOM Display Mode Overrides */
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
</style>
