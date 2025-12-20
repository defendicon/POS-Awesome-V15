<template>
	<tr
		:class="{
			'v-data-table__tr': true,
			'v-data-table__tr--clickable': true,
			'v-data-table__expanded': isExpanded,
		}"
		@click="toggleExpand"
	>
		<td
			v-for="header in headers"
			:key="header.key"
			:class="['text-' + (header.align || 'start'), header.cellClass]"
			:style="{ width: header.width + 'px', minWidth: header.minWidth + 'px' }"
		>
			<!-- Item Name -->
			<div v-if="header.key === 'item_name'" class="d-flex align-center">
				<div class="text-truncate" :title="item.item_name">
					{{ item.item_name }}
				</div>
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
					@click.stop="emitOpenNameDialog"
					>mdi-pencil</v-icon
				>
				<v-icon
					v-if="item.name_overridden"
					size="x-small"
					class="ml-1"
					@click.stop="emitResetItemName"
					>mdi-undo</v-icon
				>
			</div>

			<!-- Quantity -->
			<div
				v-else-if="header.key === 'qty'"
				class="pos-table__qty-counter"
				:class="{ 'rtl-layout': isRTL }"
				@click.stop
			>
				<v-btn
					:disabled="isMinusDisabled"
					size="small"
					variant="flat"
					class="pos-table__qty-btn pos-table__qty-btn--minus minus-btn qty-control-btn"
					@click.stop="onMinusClick"
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
					@click.stop="openQtyEdit"
				>
					{{ formattedQty }}
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
					:disabled="isInputDisabled"
				></v-text-field>

				<v-btn
					:disabled="isPlusDisabled"
					size="small"
					variant="flat"
					class="pos-table__qty-btn pos-table__qty-btn--plus plus-btn qty-control-btn"
					@click.stop="onPlusClick"
					:aria-label="__('Increase quantity')"
				>
					<v-icon size="small">mdi-plus</v-icon>
				</v-btn>
			</div>

			<!-- UOM -->
			<div v-else-if="header.key === 'uom'" class="pos-table__editor-box uom-editor" @click.stop>
				<v-btn
					size="x-small"
					variant="flat"
					class="pos-table__editor-btn uom-arrow"
					@click.stop="changeUom(-1)"
					:disabled="!hasMultipleUoms"
				>
					<v-icon size="small">mdi-chevron-left</v-icon>
				</v-btn>
				<v-select
					:class="{ 'uom-display-mode': !isEditingUom }"
					:model-value="item.uom"
					@update:model-value="onUomSelect"
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
					:disabled="!hasMultipleUoms"
				>
					<v-icon size="small">mdi-chevron-right</v-icon>
				</v-btn>
			</div>

			<!-- Rate -->
			<div v-else-if="header.key === 'rate'" class="pos-table__editor-box" @click.stop>
				<div v-if="!isEditingRate" class="pos-table__editor-display" @click.stop="openRateEdit">
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span class="amount-value" :class="{ 'negative-number': isNegative(item.rate) }">
						{{ formattedRate }}
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
					:disabled="isRateDisabled"
				></v-text-field>
			</div>

			<!-- Amount -->
			<div v-else-if="header.key === 'amount'" class="currency-display right-aligned">
				<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
				<span class="amount-value" :class="{ 'negative-number': isNegative(rowAmount) }">
					{{ formattedAmount }}
				</span>
			</div>

			<!-- Discount % -->
			<div v-else-if="header.key === 'discount_value'" class="pos-table__editor-box" @click.stop>
				<div
					v-if="!isEditingDiscountPercent"
					class="pos-table__editor-display"
					@click.stop="openDiscountPercentEdit"
				>
					<span class="amount-value">{{ formattedDiscountPercent }}%</span>
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
					:disabled="isDiscountDisabled"
				></v-text-field>
			</div>

			<!-- Discount Amount -->
			<div v-else-if="header.key === 'discount_amount'" class="pos-table__editor-box" @click.stop>
				<div
					v-if="!isEditingDiscountAmount"
					class="pos-table__editor-display"
					@click.stop="openDiscountAmountEdit"
				>
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span class="amount-value">{{ formattedDiscountAmount }}</span>
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
					:disabled="isDiscountDisabled"
				></v-text-field>
			</div>

			<!-- Price List Rate -->
			<div v-else-if="header.key === 'price_list_rate'" class="currency-display right-aligned">
				<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
				<span class="amount-value" :class="{ 'negative-number': isNegative(item.price_list_rate) }">
					{{ formattedPriceListRate }}
				</span>
			</div>

			<!-- Offer Toggle -->
			<div v-else-if="header.key === 'posa_is_offer'" @click.stop>
				<v-btn
					size="x-small"
					color="primary"
					variant="tonal"
					class="ma-0 pa-0"
					@click.stop="emitToggleOffer"
				>
					{{ item.posa_offer_applied ? __("Remove Offer") : __("Apply Offer") }}
				</v-btn>
			</div>

			<!-- Actions -->
			<div v-else-if="header.key === 'actions'" @click.stop>
				<v-btn
					:disabled="!!item.posa_is_replace"
					size="small"
					variant="flat"
					class="pos-table__delete-btn delete-action-btn"
					@click.stop="emitRemoveItem"
					:aria-label="__('Remove item')"
				>
					<v-icon size="small">mdi-delete-outline</v-icon>
				</v-btn>
			</div>
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
		headers: {
			type: Array,
			required: true,
		},
		isExpanded: {
			type: Boolean,
			default: false,
		},
		pos_profile: Object,
		isReturnInvoice: Boolean,
		invoiceType: String,
		displayCurrency: String,
		isRTL: Boolean,
		hide_qty_decimals: Boolean,
		// Formatters passed as props to use parent's context/config
		formatFloat: Function,
		formatCurrency: Function,
		currencySymbol: Function,
		isNegative: Function,
	},
	data() {
		return {
			isEditingQty: false,
			editingQtyValue: null,
			isEditingRate: false,
			editingRateValue: null,
			isEditingDiscountPercent: false,
			editingDiscountPercentValue: null,
			isEditingDiscountAmount: false,
			editingDiscountAmountValue: null,
			isEditingUom: false,
		};
	},
	computed: {
		// Memoized-like computed properties for display
		// Vue 3's computed system automatically caches based on dependencies
		qtyLength() {
			return String(Math.abs(this.item.qty || 0)).replace(".", "").length;
		},
		formattedQty() {
			return this.formatFloat(this.item.qty, this.hide_qty_decimals ? 0 : undefined);
		},
		formattedRate() {
			return this.formatCurrency(this.item.rate);
		},
		formattedAmount() {
			return this.formatCurrency(this.item.qty * this.item.rate);
		},
		rowAmount() {
			return this.item.qty * this.item.rate;
		},
		formattedDiscountPercent() {
			const val =
				this.item.discount_percentage ||
				(this.item.price_list_rate
					? (this.item.discount_amount / this.item.price_list_rate) * 100
					: 0);
			return this.formatFloat(Math.abs(val));
		},
		formattedDiscountAmount() {
			return this.formatCurrency(Math.abs(this.item.discount_amount || 0));
		},
		formattedPriceListRate() {
			return this.formatCurrency(this.item.price_list_rate);
		},
		isMinusDisabled() {
			return (
				!!this.item.posa_is_replace ||
				(this.isReturnInvoice &&
					(this.item.is_free_item ||
						this.item.posa_is_offer ||
						this.item.posa_is_replace))
			);
		},
		isPlusDisabled() {
			return (
				!!this.item.posa_is_replace ||
				this.item.disable_increment ||
				(this.isReturnInvoice &&
					(this.item.is_free_item ||
						this.item.posa_is_offer ||
						this.item.posa_is_replace))
			);
		},
		isInputDisabled() {
			return (
				this.isReturnInvoice &&
				(this.item.is_free_item || this.item.posa_is_offer || this.item.posa_is_replace)
			);
		},
		hasMultipleUoms() {
			return this.item.item_uoms && this.item.item_uoms.length > 1;
		},
		isRateDisabled() {
			return (
				!this.pos_profile.posa_allow_user_to_edit_rate ||
				!!this.item.posa_is_replace ||
				!!this.item.posa_offer_applied
			);
		},
		isDiscountDisabled() {
			return (
				!this.pos_profile.posa_allow_user_to_edit_item_discount ||
				!!this.item.posa_is_replace ||
				!!this.item.posa_offer_applied
			);
		},
	},
	methods: {
		__, // Expose translation function to template
		toggleExpand() {
			this.$emit("toggle-expand", this.item);
		},
		emitOpenNameDialog() {
			this.$emit("open-name-dialog", this.item);
		},
		emitResetItemName() {
			this.$emit("reset-item-name", this.item);
		},
		onMinusClick() {
			this.$emit("minus-click", this.item);
		},
		onPlusClick() {
			this.$emit("plus-click", this.item);
		},
		emitRemoveItem() {
			this.$emit("remove-item", this.item);
		},
		emitToggleOffer() {
			this.$emit("toggle-offer", this.item);
		},

		// Qty Editing
		openQtyEdit() {
			this.isEditingQty = true;
			this.editingQtyValue = "";
			this.$nextTick(() => {
				this.$refs.qtyInput?.focus();
			});
		},
		closeQtyEdit() {
			if (this.isEditingQty) {
				if (
					this.editingQtyValue !== "" &&
					this.editingQtyValue !== null &&
					this.editingQtyValue !== undefined
				) {
					this.$emit("update-qty", { item: this.item, value: this.editingQtyValue });
				}
				this.isEditingQty = false;
				this.editingQtyValue = null;
			}
		},

		// UOM
		changeUom(direction) {
			this.$emit("change-uom", { item: this.item, direction });
		},
		onUomSelect(val) {
			this.$emit("select-uom", { item: this.item, uom: val });
		},

		// Rate Editing
		openRateEdit() {
			if (this.isRateDisabled) return;
			this.isEditingRate = true;
			this.editingRateValue = "";
			this.$nextTick(() => {
				this.$refs.rateInput?.focus();
			});
		},
		closeRateEdit() {
			if (this.isEditingRate) {
				if (
					this.editingRateValue !== "" &&
					this.editingRateValue !== null &&
					this.editingRateValue !== undefined
				) {
					this.$emit("update-rate", { item: this.item, value: this.editingRateValue });
				}
				this.isEditingRate = false;
				this.editingRateValue = null;
			}
		},

		// Discount Percent Editing
		openDiscountPercentEdit() {
			if (this.isDiscountDisabled) return;
			this.isEditingDiscountPercent = true;
			this.editingDiscountPercentValue = "";
			this.$nextTick(() => {
				this.$refs.discountPercentInput?.focus();
			});
		},
		closeDiscountPercentEdit() {
			if (this.isEditingDiscountPercent) {
				if (this.editingDiscountPercentValue !== "" && this.editingDiscountPercentValue !== null) {
					this.$emit("update-discount-percent", {
						item: this.item,
						value: this.editingDiscountPercentValue,
					});
				}
				this.isEditingDiscountPercent = false;
				this.editingDiscountPercentValue = null;
			}
		},

		// Discount Amount Editing
		openDiscountAmountEdit() {
			if (this.isDiscountDisabled) return;
			this.isEditingDiscountAmount = true;
			this.editingDiscountAmountValue = "";
			this.$nextTick(() => {
				this.$refs.discountAmountInput?.focus();
			});
		},
		closeDiscountAmountEdit() {
			if (this.isEditingDiscountAmount) {
				if (this.editingDiscountAmountValue !== "" && this.editingDiscountAmountValue !== null) {
					this.$emit("update-discount-amount", {
						item: this.item,
						value: this.editingDiscountAmountValue,
					});
				}
				this.isEditingDiscountAmount = false;
				this.editingDiscountAmountValue = null;
			}
		},
	},
};
</script>

<style scoped>
/* Reuse styles from ItemsTable or define minimal overrides */
.text-truncate {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 100%;
}
.d-flex {
	display: flex;
}
.align-center {
	align-items: center;
}
.ml-1 {
	margin-left: 4px;
}
</style>
