<template>
	<tr class="cart-item-row" v-memo="memoDeps">
		<!-- Item Name Column -->
		<td class="text-start" :data-column-key="'item_name'">
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
				<v-btn
					v-if="posProfile.posa_allow_line_item_name_override && !item.posa_is_replace"
					icon
					size="x-small"
					variant="text"
					class="ml-1"
					@click.stop="$emit('open-name-dialog', item)"
					:aria-label="__('Edit item name')"
				>
					<v-icon size="small">mdi-pencil</v-icon>
				</v-btn>
				<v-btn
					v-if="item.name_overridden"
					icon
					size="x-small"
					variant="text"
					class="ml-1"
					@click.stop="$emit('reset-item-name', item)"
					:aria-label="__('Reset item name')"
				>
					<v-icon size="small">mdi-undo</v-icon>
				</v-btn>
			</div>
		</td>

		<!-- Quantity Column -->
		<td class="text-center" :data-column-key="'qty'">
			<div class="pos-table__qty-counter" :class="{ 'rtl-layout': isRTL }">
				<v-btn
					:disabled="disableDecrement"
					size="small"
					variant="flat"
					class="pos-table__qty-btn pos-table__qty-btn--minus minus-btn qty-control-btn"
					@click.stop="handleMinusClick"
					:aria-label="__('Decrease quantity')"
				>
					<v-icon size="small">mdi-minus</v-icon>
				</v-btn>
				<div
					v-if="!isEditingQty"
					class="pos-table__qty-display amount-value number-field-rtl"
					:class="{
						'negative-number': isNegative(item.qty),
						'large-number': qtyLength > 6,
					}"
					:data-length="qtyLength"
					:title="formatFloat(item.qty, hideQtyDecimals ? 0 : undefined)"
					@click.stop="openQtyEdit"
					tabindex="0"
					role="button"
					:aria-label="__('Edit quantity')"
					@keydown.enter.prevent="openQtyEdit"
					@keydown.space.prevent="openQtyEdit"
				>
					{{ formatFloat(item.qty, hideQtyDecimals ? 0 : undefined) }}
				</div>
				<v-text-field
					v-else
					v-model="editingQtyValue"
					density="compact"
					variant="outlined"
					class="pos-table__qty-input"
					@blur="closeQtyEdit"
					@keydown.enter.prevent="closeQtyEdit"
					@click.stop
					ref="qtyInput"
					:autofocus="true"
					type="number"
					:disabled="disableInput"
				></v-text-field>
				<v-btn
					:disabled="disableIncrement"
					size="small"
					variant="flat"
					class="pos-table__qty-btn pos-table__qty-btn--plus plus-btn qty-control-btn"
					@click.stop="$emit('add-one', item)"
					:aria-label="__('Increase quantity')"
				>
					<v-icon size="small">mdi-plus</v-icon>
				</v-btn>
			</div>
		</td>

		<!-- UOM Column (Optional) -->
		<td v-if="showUom" class="text-center" :data-column-key="'uom'">
			<div class="pos-table__editor-box uom-editor" @click.stop>
				<v-btn
					size="x-small"
					variant="flat"
					class="pos-table__editor-btn uom-arrow"
					@click.stop="changeUom(-1)"
					:aria-label="__('Previous unit of measure')"
					:disabled="!item.item_uoms || item.item_uoms.length <= 1"
				>
					<v-icon size="small">mdi-chevron-left</v-icon>
				</v-btn>
				<v-select
					ref="uomSelect"
					:class="{ 'uom-display-mode': !isEditingUom }"
					:model-value="item.uom"
					@update:model-value="handleUomSelect"
					:items="item.item_uoms"
					item-title="uom"
					item-value="uom"
					density="compact"
					variant="outlined"
					class="pos-table__editor-input uom-select"
					hide-details
					@focus="isEditingUom = true"
					@blur="isEditingUom = false"
				></v-select>
				<v-btn
					size="x-small"
					variant="flat"
					class="pos-table__editor-btn uom-arrow"
					@click.stop="changeUom(1)"
					:aria-label="__('Next unit of measure')"
					:disabled="!item.item_uoms || item.item_uoms.length <= 1"
				>
					<v-icon size="small">mdi-chevron-right</v-icon>
				</v-btn>
			</div>
		</td>

		<!-- Price List Rate (Optional) -->
		<td v-if="showPriceListRate" class="text-end" :data-column-key="'price_list_rate'">
			<div class="currency-display right-aligned">
				<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
				<span class="amount-value" :class="{ 'negative-number': isNegative(item.price_list_rate) }">
					{{ formatCurrency(item.price_list_rate) }}
				</span>
			</div>
		</td>

		<!-- Discount % (Optional) -->
		<td v-if="showDiscountPercent" class="text-center" :data-column-key="'discount_value'">
			<div class="pos-table__editor-box">
				<div
					v-if="!isEditingDiscountPercent"
					class="pos-table__editor-display"
					@click.stop="openDiscountPercentEdit"
					tabindex="0"
					role="button"
					:aria-label="__('Edit discount percentage')"
					@keydown.enter.prevent="openDiscountPercentEdit"
					@keydown.space.prevent="openDiscountPercentEdit"
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
					v-model="editingDiscountPercentValue"
					density="compact"
					variant="outlined"
					class="pos-table__editor-input"
					@blur="closeDiscountPercentEdit"
					@keydown.enter.prevent="closeDiscountPercentEdit"
					@click.stop
					ref="discountPercentInput"
					:autofocus="true"
					type="number"
					:disabled="disableDiscountEdit"
				></v-text-field>
			</div>
		</td>

		<!-- Discount Amount (Optional) -->
		<td v-if="showDiscountAmount" class="text-center" :data-column-key="'discount_amount'">
			<div class="pos-table__editor-box">
				<div
					v-if="!isEditingDiscountAmount"
					class="pos-table__editor-display"
					@click.stop="openDiscountAmountEdit"
					tabindex="0"
					role="button"
					:aria-label="__('Edit discount amount')"
					@keydown.enter.prevent="openDiscountAmountEdit"
					@keydown.space.prevent="openDiscountAmountEdit"
				>
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span class="amount-value">{{
						formatCurrency(Math.abs(item.discount_amount || 0))
					}}</span>
				</div>
				<v-text-field
					v-else
					v-model="editingDiscountAmountValue"
					density="compact"
					variant="outlined"
					class="pos-table__editor-input"
					@blur="closeDiscountAmountEdit"
					@keydown.enter.prevent="closeDiscountAmountEdit"
					@click.stop
					ref="discountAmountInput"
					:autofocus="true"
					type="number"
					:disabled="disableDiscountEdit"
				></v-text-field>
			</div>
		</td>

		<!-- Rate Column -->
		<td class="text-center" :data-column-key="'rate'">
			<div class="pos-table__editor-box">
				<div
					v-if="!isEditingRate"
					class="pos-table__editor-display"
					@click.stop="openRateEdit"
					tabindex="0"
					role="button"
					:aria-label="__('Edit rate')"
					@keydown.enter.prevent="openRateEdit"
					@keydown.space.prevent="openRateEdit"
				>
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span class="amount-value" :class="{ 'negative-number': isNegative(item.rate) }">
						{{ formatCurrency(item.rate) }}
					</span>
				</div>
				<v-text-field
					v-else
					v-model="editingRateValue"
					density="compact"
					variant="outlined"
					class="pos-table__editor-input"
					@blur="closeRateEdit"
					@keydown.enter.prevent="closeRateEdit"
					@click.stop
					ref="rateInput"
					:autofocus="true"
					type="number"
					:disabled="disableRateEdit"
				></v-text-field>
			</div>
		</td>

		<!-- Amount Column -->
		<td class="text-center" :data-column-key="'amount'">
			<div class="currency-display right-aligned">
				<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
				<span class="amount-value" :class="{ 'negative-number': isNegative(item.qty * item.rate) }">
					{{ formatCurrency(item.qty * item.rate) }}
				</span>
			</div>
		</td>

		<!-- Offer Toggle (Optional) -->
		<td v-if="showOffer" class="text-center" :data-column-key="'posa_is_offer'">
			<v-btn
				size="x-small"
				color="primary"
				variant="tonal"
				class="ma-0 pa-0"
				@click.stop="$emit('toggle-offer', item)"
			>
				{{ item.posa_offer_applied ? __("Remove Offer") : __("Apply Offer") }}
			</v-btn>
		</td>

		<!-- Actions -->
		<td class="text-center" :data-column-key="'actions'">
			<v-btn
				:disabled="!!item.posa_is_replace"
				size="small"
				variant="flat"
				class="pos-table__delete-btn delete-action-btn"
				@click.stop="$emit('remove-item', item)"
				:aria-label="__('Remove item')"
			>
				<v-icon size="small">mdi-delete-outline</v-icon>
			</v-btn>
		</td>
	</tr>
</template>

<script>
/* global __ */
export default {
	name: "CartItemRow",
	props: {
		item: {
			type: Object,
			required: true,
		},
		posProfile: {
			type: Object,
			required: true,
		},
		isReturnInvoice: Boolean,
		invoiceType: String,
		displayCurrency: String,
		formatFloat: Function,
		formatCurrency: Function,
		currencySymbol: Function,
		isNumber: Function,
		isNegative: Function,
		hideQtyDecimals: Boolean,
		isRTL: Boolean,
		// Column visibility flags to avoid passing full headers array
		showUom: Boolean,
		showPriceListRate: Boolean,
		showDiscountPercent: Boolean,
		showDiscountAmount: Boolean,
		showOffer: Boolean,
	},
	data() {
		return {
			isEditingQty: false,
			editingQtyValue: "",
			isEditingUom: false,
			isEditingRate: false,
			editingRateValue: "",
			isEditingDiscountPercent: false,
			editingDiscountPercentValue: "",
			isEditingDiscountAmount: false,
			editingDiscountAmountValue: "",
		};
	},
	computed: {
		memoDeps() {
			return [
				this.item.qty,
				this.item.rate,
				this.item.amount,
				this.item.discount_amount,
				this.item.discount_percentage,
				this.item.uom,
				this.item.item_name,
				this.item.name_overridden,
				this.item.pricing_rule_badge,
				this.item.batch_no_is_expired,
				this.item.posa_is_offer,
				this.item.posa_offer_applied,
				this.item.is_free_item,
				this.item.price_list_rate,
				// Include edit states to ensure UI updates when switching modes
				this.isEditingQty,
				this.isEditingRate,
				this.isEditingUom,
				this.isEditingDiscountPercent,
				this.isEditingDiscountAmount,
			];
		},
		qtyLength() {
			return String(Math.abs(this.item.qty || 0)).replace(".", "").length;
		},
		disableDecrement() {
			return (
				!!this.item.posa_is_replace ||
				(this.isReturnInvoice &&
					(this.item.is_free_item || this.item.posa_is_offer || this.item.posa_is_replace))
			);
		},
		disableIncrement() {
			return (
				!!this.item.posa_is_replace ||
				this.item.disable_increment ||
				(this.isReturnInvoice &&
					(this.item.is_free_item || this.item.posa_is_offer || this.item.posa_is_replace))
			);
		},
		disableInput() {
			return (
				this.isReturnInvoice &&
				(this.item.is_free_item || this.item.posa_is_offer || this.item.posa_is_replace)
			);
		},
		disableRateEdit() {
			return (
				!this.posProfile.posa_allow_user_to_edit_rate ||
				!!this.item.posa_is_replace ||
				!!this.item.posa_offer_applied
			);
		},
		disableDiscountEdit() {
			return (
				!this.posProfile.posa_allow_user_to_edit_item_discount ||
				!!this.item.posa_is_replace ||
				!!this.item.posa_offer_applied
			);
		},
	},
	methods: {
		openQtyEdit() {
			this.isEditingQty = true;
			this.editingQtyValue = "";
			this.$nextTick(() => {
				this.$refs.qtyInput?.focus();
			});
		},
		closeQtyEdit() {
			if (this.isEditingQty) {
				if (this.editingQtyValue !== "" && this.editingQtyValue != null) {
					const newQty = parseFloat(this.editingQtyValue);
					// Emit event to update parent state
					const val = !newQty || newQty <= 0 ? 1 : newQty;
					this.$emit("update-qty", this.item, val);
				}
				this.isEditingQty = false;
				this.editingQtyValue = "";
			}
		},
		handleMinusClick() {
			this.$emit("minus-click", this.item);
		},
		changeUom(direction) {
			const uoms = this.item.item_uoms.map((u) => u.uom);
			const currentIndex = uoms.indexOf(this.item.uom);
			let newIndex = currentIndex + direction;

			if (newIndex < 0) {
				newIndex = uoms.length - 1;
			} else if (newIndex >= uoms.length) {
				newIndex = 0;
			}

			const newUom = uoms[newIndex];
			if (newUom !== this.item.uom) {
				this.$emit("calc-uom", this.item, newUom);
			}
		},
		handleUomSelect(newUom) {
			if (newUom && newUom !== this.item.uom) {
				this.$emit("calc-uom", this.item, newUom);
			}
			// Find the correct component instance to blur - ref is local now
			this.$refs.uomSelect?.blur();
		},
		openRateEdit() {
			if (this.disableRateEdit) return;
			this.isEditingRate = true;
			this.editingRateValue = "";
			this.$nextTick(() => {
				this.$refs.rateInput?.focus();
			});
		},
		closeRateEdit() {
			if (this.isEditingRate) {
				if (this.editingRateValue !== "" && this.editingRateValue != null) {
					const newRate = parseFloat(this.editingRateValue);
					if (Number.isFinite(newRate) && newRate !== this.item.rate) {
						// We need to pass the "event-like" object that useDiscounts expects or handle it in parent
						// For isolation, let's emit value and let parent handler construct event if needed
						// But ItemsTable methods expect (item, value, event)
						this.$emit("update-rate", this.item, newRate);
					}
				}
				this.isEditingRate = false;
				this.editingRateValue = "";
			}
		},
		openDiscountPercentEdit() {
			if (this.disableDiscountEdit) return;
			this.isEditingDiscountPercent = true;
			this.editingDiscountPercentValue = "";
			this.$nextTick(() => {
				this.$refs.discountPercentInput?.focus();
			});
		},
		closeDiscountPercentEdit() {
			if (this.isEditingDiscountPercent) {
				if (this.editingDiscountPercentValue !== "" && this.editingDiscountPercentValue != null) {
					const newDiscount = parseFloat(this.editingDiscountPercentValue);
					if (Number.isFinite(newDiscount) && newDiscount !== this.item.discount_percentage) {
						this.$emit("update-discount-percent", this.item, newDiscount);
					}
				}
				this.isEditingDiscountPercent = false;
				this.editingDiscountPercentValue = "";
			}
		},
		openDiscountAmountEdit() {
			if (this.disableDiscountEdit) return;
			this.isEditingDiscountAmount = true;
			this.editingDiscountAmountValue = "";
			this.$nextTick(() => {
				this.$refs.discountAmountInput?.focus();
			});
		},
		closeDiscountAmountEdit() {
			if (this.isEditingDiscountAmount) {
				if (this.editingDiscountAmountValue !== "" && this.editingDiscountAmountValue != null) {
					const newDiscount = parseFloat(this.editingDiscountAmountValue);
					if (Number.isFinite(newDiscount) && newDiscount !== this.item.discount_amount) {
						this.$emit("update-discount-amount", this.item, newDiscount);
					}
				}
				this.isEditingDiscountAmount = false;
				this.editingDiscountAmountValue = "";
			}
		},
	},
};
</script>

<style scoped>
/* Copy relevant styles from items-table-styles.css or ItemsTable.vue scoped styles */
/* Note: Since we are inside a tr/td structure managed by parent,
   we need to ensure styles match.
   Many styles were scoped to .pos-table.
   We might need to rely on global styles or duplicate some here.
*/

/* QTY Counter Styling */
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

/* RTL support for quantity counter - Enhanced with multiple selectors */
[dir="rtl"] .pos-table__qty-counter,
.pos-table__qty-counter.rtl-layout {
	flex-direction: row !important;
}

[dir="rtl"] .pos-table__qty-counter .plus-btn,
.pos-table__qty-counter.rtl-layout .plus-btn {
	order: 3 !important;
}

[dir="rtl"] .pos-table__qty-counter .pos-table__qty-display,
.pos-table__qty-counter.rtl-layout .pos-table__qty-display {
	order: 2 !important;
	direction: ltr !important;
	text-align: center;
}

[dir="rtl"] .pos-table__qty-counter .minus-btn,
.pos-table__qty-counter.rtl-layout .minus-btn {
	order: 1 !important;
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
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
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
	letter-spacing: -0.02em;
	word-spacing: -0.1em;
}

.pos-table__qty-display.large-number {
	min-width: 70px;
	max-width: 120px;
	font-size: 0.75rem;
	padding: 6px 3px;
	letter-spacing: -0.04em;
}

.pos-table__qty-display.negative-number {
	color: var(--pos-error);
	background: var(--pos-error-container);
	border-color: var(--pos-error);
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
	text-align: left;
	font-family:
		"SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "Noto Sans Arabic", "Tahoma",
		sans-serif;
	font-variant-numeric: lining-nums tabular-nums;
	font-feature-settings:
		"tnum" 1,
		"lnum" 1,
		"kern" 1;
}

.amount-value.right-aligned {
	text-align: center;
}

.currency-symbol {
	opacity: 0.7;
	margin-right: 2px;
	font-size: 0.85em;
}

.negative-number {
	color: var(--pos-error) !important;
	font-weight: 600;
}

/* Add minimal padding for table cells as per ItemsTable.vue styles */
td {
	padding: 16px 12px;
	vertical-align: middle;
	height: 60px;
	text-align: center;
	color: var(--pos-text-primary);
	position: relative;
}

/* Keyboard focus styles */
.pos-table__qty-display:focus-visible,
.pos-table__editor-display:focus-visible {
	outline: 2px solid var(--pos-primary);
	outline-offset: 2px;
	z-index: 10;
}
</style>
