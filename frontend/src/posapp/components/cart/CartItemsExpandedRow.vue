<template>
	<td :colspan="colspan" class="ma-0 pa-0 posa-expanded-row-cell">
		<div
			v-if="isExpanded"
			class="posa-expanded-content responsive-expanded-content"
			:class="expandedContentClasses"
		>
			<!-- Item Details Form -->
			<div class="posa-item-details-form">
				<!-- Basic Information Section -->
				<div class="posa-form-section">
					<div class="posa-section-header">
						<v-icon size="small" class="section-icon">mdi-information-outline</v-icon>
						<span class="posa-section-title">{{ __("Basic Information") }}</span>
					</div>
					<div class="posa-form-row">
						<div class="posa-form-field">
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
						<div class="posa-form-field">
							<v-text-field
								density="compact"
								variant="outlined"
								color="primary"
								:label="frappe._('QTY')"
								class="pos-themed-input"
								hide-details
								:model-value="formatFloat(item.qty, hide_qty_decimals ? 0 : undefined)"
								@change="onQtyChange(item, $event)"
								:rules="[isNumber]"
								:disabled="!!item.posa_is_replace"
								prepend-inner-icon="mdi-numeric"
							></v-text-field>
							<div v-if="item.max_qty !== undefined" class="text-caption mt-1">
								{{
									__("In stock: {0}", [
										formatFloat(item._base_actual_qty, hide_qty_decimals ? 0 : undefined),
									])
								}}
							</div>
						</div>
						<div class="posa-form-field">
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
									!!item.posa_is_replace || (isReturnInvoice && invoice_doc.return_against)
								"
								prepend-inner-icon="mdi-weight"
							></v-select>
						</div>
					</div>
				</div>

				<!-- Pricing Section -->
				<div class="posa-form-section">
					<div class="posa-section-header">
						<v-icon size="small" class="section-icon">mdi-currency-usd</v-icon>
						<span class="posa-section-title">{{ __("Pricing & Discounts") }}</span>
					</div>
					<div class="posa-form-row">
						<div class="posa-form-field">
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
									!!item.posa_is_replace
								"
								prepend-inner-icon="mdi-currency-usd"
							></v-text-field>
						</div>
						<div class="posa-form-field">
							<v-text-field
								density="compact"
								variant="outlined"
								color="primary"
								id="discount_percentage"
								:label="frappe._('Discount %')"
								class="pos-themed-input"
								hide-details
								:model-value="formatFloat(Math.abs(item.discount_percentage || 0))"
								@change="[
									setFormatedCurrency(item, 'discount_percentage', null, false, $event),
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
						<div class="posa-form-field">
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
									setFormatedCurrency(item, 'discount_amount', null, false, $event),
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
					<div class="posa-form-row">
						<div class="posa-form-field">
							<v-text-field
								density="compact"
								variant="outlined"
								color="primary"
								:label="frappe._('Price List Rate')"
								class="pos-themed-input"
								hide-details
								:model-value="formatCurrency(item.price_list_rate ?? 0)"
								:disabled="!pos_profile.posa_allow_price_list_rate_change"
								readonly
								prepend-inner-icon="mdi-format-list-numbered"
								:prefix="currencySymbol(pos_profile.currency)"
							></v-text-field>
						</div>
						<div class="posa-form-field">
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
						<div class="posa-form-field" v-if="pos_profile.posa_allow_price_list_rate_change">
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
				<div class="posa-form-section">
					<div class="posa-section-header">
						<v-icon size="small" class="section-icon">mdi-warehouse</v-icon>
						<span class="posa-section-title">{{ __("Stock Information") }}</span>
					</div>
					<div class="posa-form-row">
						<div class="posa-form-field">
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
						<div class="posa-form-field">
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
						<div class="posa-form-field">
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
					<div class="posa-form-row">
						<div class="posa-form-field">
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
						<div class="posa-form-field">
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
						<div class="posa-form-field" v-if="item.posa_offer_applied">
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
				<div class="posa-form-section" v-if="item.has_serial_no || item.serial_no">
					<div class="posa-section-header">
						<v-icon size="small" class="section-icon">mdi-barcode-scan</v-icon>
						<span class="posa-section-title">{{ __("Serial Numbers") }}</span>
					</div>
					<div class="posa-form-row">
						<div class="posa-form-field">
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
					<div class="posa-form-row">
						<div class="posa-form-field full-width">
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
				<div class="posa-form-section" v-if="item.has_batch_no || item.batch_no">
					<div class="posa-section-header">
						<v-icon size="small" class="section-icon">mdi-package-variant-closed</v-icon>
						<span class="posa-section-title">{{ __("Batch Information") }}</span>
					</div>
					<div class="posa-form-row">
						<div class="posa-form-field">
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
						<div class="posa-form-field">
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
						<div class="posa-form-field">
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
										<v-list-item-title v-html="getRaw(item).batch_no"></v-list-item-title>
										<v-list-item-subtitle class="d-flex align-center">
											<span
												v-html="
													`Available QTY  '${
														getRaw(item).available_qty ?? getRaw(item).batch_qty
													}' - Expiry Date ${getRaw(item).expiry_date}`
												"
											></span>
											<v-chip
												v-if="getRaw(item).is_expired"
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
					class="posa-form-section"
					v-if="
						pos_profile.posa_allow_sales_order &&
						['Order', 'Quotation'].includes(invoiceType || '')
					"
				>
					<div class="posa-section-header">
						<v-icon size="small" class="section-icon">mdi-calendar-check</v-icon>
						<span class="posa-section-title">{{ __("Delivery Information") }}</span>
					</div>
					<div class="posa-form-row">
						<div class="posa-form-field">
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

<script setup lang="ts">
import type { CartItem, POSProfile, InvoiceDoc } from "../../../types/models";

interface Props {
	item: CartItem | any;
	isExpanded: boolean;
	colspan: number;
	pos_profile: POSProfile | any;
	invoiceType?: string;
	isReturnInvoice?: boolean;
	invoice_doc?: InvoiceDoc | any;
	hide_qty_decimals: boolean;
	expandedContentClasses: any;

	// Formatters
	formatFloat: (_val: any, _precision?: number) => string;
	formatCurrency: (_val: any, _precision?: number) => string;
	currencySymbol: (_currency?: string) => string;
	isNumber: (_val: any) => boolean | string;

	// Actions
	setFormatedCurrency: (_item: any, _field: string, _value: any, _force?: boolean, _event?: any) => void;
	calcPrices: (_item: any, _value: any, _event?: any) => void;
	calcUom: (_item: any, _uom: string) => void;
	changePriceListRate: (_item: any) => void;
	getSerialOptions: (_item: any) => any[];
	setSerialNo: (_item: any) => void;
	setBatchQty: (_item: any, _event: any) => void;
	validateDueDate: (_item: any) => void;
}

defineProps<Props>();

const emit = defineEmits<{
	"qty-change": [item: CartItem, event: any];
}>();

const __ = (window as any).__ || ((s: string) => s);
const frappe = (window as any).frappe || { _: (s: string) => s };

const onQtyChange = (item: CartItem, event: any) => {
	emit("qty-change", item, event);
};

const getRaw = (item: any) => item?.raw || {};
</script>

<style scoped>
/* Local styles specific to the expanded content component only */
</style>
