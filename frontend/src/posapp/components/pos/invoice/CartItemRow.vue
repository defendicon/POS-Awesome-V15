<template>
	<tr
		:id="rowDomId"
		class="posa-cart-item-row"
		:class="rowClasses"
		:data-cart-row-index="rowIndex"
		:data-testid="`cart-row-${item.item_code || rowIndex}`"
		:data-active-cell-key="activeCellKey || undefined"
		:tabindex="activeRow && keyboardMode === 'row' ? 0 : -1"
		role="row"
		:aria-selected="activeRow ? 'true' : 'false'"
		v-memo="memoDeps"
	>
		<template v-for="column in visibleColumns" :key="column.key">
			<!-- Item Name Column -->
			<td v-if="column.key === 'item_name'" v-bind="getCellAttrs('item_name', 'text-start')">
				<div class="posa-cart-item-row__item-cell">
					<span class="posa-cart-item-row__item-name">{{ item.item_name }}</span>
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
					<div
						v-if="item.has_batch_no || item.has_serial_no"
						class="posa-cart-item-row__tracking-stack"
					>
						<v-chip
							v-if="item.has_batch_no"
							:color="item.batch_no ? 'info' : 'error'"
							size="x-small"
							variant="tonal"
							class="posa-cart-item-row__tracking-chip"
							prepend-icon="mdi-package-variant-closed"
							role="button"
							tabindex="0"
							@click.stop="$emit('open-batch-serial', item)"
							@keydown.enter.stop.prevent="$emit('open-batch-serial', item)"
							@keydown.space.stop.prevent="$emit('open-batch-serial', item)"
						>
							{{ item.batch_no ? `${__("Batch")}: ${item.batch_no}` : __("Select Batch") }}
							<v-icon end size="x-small">mdi-pencil</v-icon>
						</v-chip>
						<v-chip
							v-if="item.has_serial_no"
							:color="serialSelectionComplete ? 'info' : 'error'"
							size="x-small"
							variant="tonal"
							class="posa-cart-item-row__tracking-chip"
							prepend-icon="mdi-barcode"
							role="button"
							tabindex="0"
							@click.stop="$emit('open-batch-serial', item)"
							@keydown.enter.stop.prevent="$emit('open-batch-serial', item)"
							@keydown.space.stop.prevent="$emit('open-batch-serial', item)"
						>
							{{ __("Serials") }}: {{ selectedSerialCount }}/{{ requiredSerialCount }}
							<v-icon end size="x-small">mdi-pencil</v-icon>
						</v-chip>
					</div>
					<v-chip
						v-if="item.posa_is_offer || item.is_free_item"
						color="success"
						size="x-small"
						variant="flat"
						class="me-1"
					>
						{{ __("Offer Item") }}
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
						v-if="posProfile?.posa_allow_line_item_name_override && !item.posa_is_replace"
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
			<td v-else-if="column.key === 'qty'" v-bind="getCellAttrs('qty', 'text-center')">
				<div
					class="posa-cart-table__qty-input-shell amount-value number-field-rtl"
					:class="{
						'negative-number': isNegative(item.qty),
						'large-number': qtyLength > 6,
						'rtl-layout': isRTL,
					}"
					:data-length="qtyLength"
					:title="formatFloat(item.qty, hideQtyDecimals ? 0 : undefined)"
					data-pos-keyboard-target="cart-qty"
					@click.stop="focusQtyInput"
				>
					<v-text-field
						:model-value="editingQtyValue"
						:aria-label="__('Quantity')"
						density="compact"
						variant="outlined"
						hide-details
						class="posa-cart-table__qty-input posa-cart-table__qty-input--direct"
						@update:model-value="handleQtyInputUpdate"
						@focus="handleQtyFocus"
						@blur="closeQtyEdit"
						@keydown="handleQtyKeydown"
						@keydown.enter.stop.prevent="submitQtyEdit"
						@keydown.esc.stop.prevent="cancelQtyEdit"
						@paste="handleQtyPaste"
						@click.stop
						ref="qtyInput"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						autocorrect="off"
						autocapitalize="off"
						:spellcheck="false"
						:disabled="disableInput"
					></v-text-field>
				</div>
			</td>

			<!-- UOM Column (Optional) -->
			<td v-else-if="column.key === 'uom'" v-bind="getCellAttrs('uom', 'text-center')">
				<div class="posa-cart-table__editor-box uom-editor" @click.stop>
					<v-btn
						size="x-small"
						variant="flat"
						class="posa-cart-table__editor-btn uom-arrow"
						@click.stop="changeUom(-1)"
						:aria-label="__('Previous unit of measure')"
						:disabled="!canEditUom"
					>
						<v-icon size="small">mdi-chevron-left</v-icon>
					</v-btn>

					<div
						v-if="!isEditingUom"
						class="posa-cart-table__editor-display"
						@click.stop="openUomEdit"
						:tabindex="canEditUom ? 0 : -1"
						:data-pos-keyboard-target="canEditUom ? 'cart-uom' : undefined"
						role="button"
						:aria-disabled="canEditUom ? 'false' : 'true'"
						:aria-label="__('Edit unit of measure')"
					>
						<span>{{ item.uom }}</span>
					</div>

					<v-select
						v-else
						ref="uomSelect"
						:model-value="item.uom"
						@update:model-value="handleUomSelect"
						:items="item.item_uoms"
						item-title="uom"
						item-value="uom"
						density="compact"
						variant="outlined"
						class="posa-cart-table__editor-input uom-select"
						hide-details
						menu-icon=""
						:autofocus="true"
						:disabled="!canEditUom"
						@blur="isEditingUom = false"
						@keydown.esc.prevent="isEditingUom = false"
					></v-select>

					<v-btn
						size="x-small"
						variant="flat"
						class="posa-cart-table__editor-btn uom-arrow"
						@click.stop="changeUom(1)"
						:aria-label="__('Next unit of measure')"
						:disabled="!canEditUom"
					>
						<v-icon size="small">mdi-chevron-right</v-icon>
					</v-btn>
				</div>
			</td>

			<!-- Price List Rate (Optional) -->
			<td
				v-else-if="column.key === 'price_list_rate'"
				v-bind="getCellAttrs('price_list_rate', 'text-end')"
			>
				<div class="currency-display right-aligned">
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span
						class="amount-value"
						:class="{ 'negative-number': isNegative(item.price_list_rate) }"
					>
						{{ formatCurrency(item.price_list_rate) }}
					</span>
				</div>
			</td>

			<!-- Discount % (Optional) -->
			<td
				v-else-if="column.key === 'discount_percentage'"
				v-bind="getCellAttrs('discount_percentage', 'text-center')"
			>
				<div class="posa-cart-table__editor-box">
					<div
						v-if="!isEditingDiscountPercent"
						class="posa-cart-table__editor-display"
						@click.stop="openDiscountPercentEdit"
						tabindex="0"
						data-pos-keyboard-target="cart-discount-percent"
						role="button"
						:aria-label="__('Edit discount percentage')"
						:aria-disabled="disableDiscountEdit ? 'true' : 'false'"
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
						class="posa-cart-table__editor-input"
						@blur="closeDiscountPercentEdit"
						@keydown="handleDiscountPercentKeydown"
						@keydown.enter.prevent="submitDiscountPercentEdit"
						@keydown.esc.prevent="cancelDiscountPercentEdit"
						@paste="handleDiscountPercentPaste"
						@click.stop
						ref="discountPercentInput"
						:autofocus="true"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						autocorrect="off"
						autocapitalize="off"
						:spellcheck="false"
						:disabled="disableDiscountEdit"
					></v-text-field>
				</div>
			</td>

			<!-- Discount Amount (Optional) -->
			<td
				v-else-if="column.key === 'discount_amount'"
				v-bind="getCellAttrs('discount_amount', 'text-center')"
			>
				<div class="posa-cart-table__editor-box">
					<div
						v-if="!isEditingDiscountAmount"
						class="posa-cart-table__editor-display"
						@click.stop="openDiscountAmountEdit"
						tabindex="0"
						data-pos-keyboard-target="cart-discount-amount"
						role="button"
						:aria-label="__('Edit discount amount')"
						:aria-disabled="disableDiscountEdit ? 'true' : 'false'"
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
						class="posa-cart-table__editor-input"
						@blur="closeDiscountAmountEdit"
						@keydown="handleDiscountAmountKeydown"
						@keydown.enter.prevent="submitDiscountAmountEdit"
						@keydown.esc.prevent="cancelDiscountAmountEdit"
						@paste="handleDiscountAmountPaste"
						@click.stop
						ref="discountAmountInput"
						:autofocus="true"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						autocorrect="off"
						autocapitalize="off"
						:spellcheck="false"
						:disabled="disableDiscountEdit"
					></v-text-field>
				</div>
			</td>

			<!-- Rate Column -->
			<td v-else-if="column.key === 'rate'" v-bind="getCellAttrs('rate', 'text-center')">
				<div class="posa-cart-table__editor-box">
					<div
						v-if="!isEditingRate"
						class="posa-cart-table__editor-display"
						@click.stop="openRateEdit"
						tabindex="0"
						data-pos-keyboard-target="cart-rate"
						role="button"
						:aria-label="__('Edit rate')"
						:aria-disabled="disableRateEdit ? 'true' : 'false'"
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
						class="posa-cart-table__editor-input"
						@blur="closeRateEdit"
						@keydown="handleRateKeydown"
						@keydown.enter.prevent="submitRateEdit"
						@keydown.esc.prevent="cancelRateEdit"
						@paste="handleRatePaste"
						@click.stop
						ref="rateInput"
						:autofocus="true"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						autocorrect="off"
						autocapitalize="off"
						:spellcheck="false"
						:disabled="disableRateEdit"
					></v-text-field>
				</div>
			</td>

			<!-- Amount Column -->
			<td v-else-if="column.key === 'amount'" v-bind="getCellAttrs('amount', 'text-center')">
				<div class="currency-display right-aligned">
					<span class="currency-symbol">{{ currencySymbol(displayCurrency) }}</span>
					<span
						class="amount-value"
						:class="{ 'negative-number': isNegative(item.qty * item.rate) }"
					>
						{{ formatCurrency(item.qty * item.rate) }}
					</span>
				</div>
			</td>

			<!-- Offer Toggle (Optional) -->
			<td
				v-else-if="column.key === 'posa_is_offer'"
				v-bind="getCellAttrs('posa_is_offer', 'text-center')"
			>
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
			<td v-else-if="column.key === 'actions'" v-bind="getCellAttrs('actions', 'text-center')">
				<v-btn
					:disabled="!!item.posa_is_replace"
					size="small"
					variant="flat"
					class="posa-cart-table__delete-btn delete-action-btn"
					@click.stop="$emit('remove-item', item)"
					:aria-label="__('Remove item')"
				>
					<v-icon size="small">mdi-delete-outline</v-icon>
				</v-btn>
			</td>

			<td
				v-else-if="column.key === 'data-table-expand'"
				v-bind="getCellAttrs('data-table-expand', 'text-center')"
			>
				<v-btn
					icon
					size="small"
					variant="text"
					class="posa-cart-table__expand-btn"
					@click.stop="$emit('toggle-expand')"
					:aria-label="__('Open item sales history and details')"
				>
					<v-icon size="small">mdi-chart-line</v-icon>
				</v-btn>
			</td>
		</template>
	</tr>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { getCartGridCellId, getCartGridRowId } from "../../../utils/cartFieldFocus";
import { normalizeCartEditQuantity } from "../../../utils/cartQuantity";
import { getItemLossRisk, resolveSaleFloorPolicy } from "../../../utils/lossPrevention";

defineOptions({
	name: "CartItemRow",
});

const props = defineProps({
	item: {
		type: Object,
		required: true,
	},
	visibleColumns: {
		type: Array,
		default: () => [],
	},
	posProfile: {
		type: Object,
		default: () => ({}),
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
	isExpanded: Boolean,
	rowIndex: {
		type: Number,
		default: -1,
	},
	keyboardMode: {
		type: String,
		default: "inactive",
	},
	activeRow: Boolean,
	activeCellKey: {
		type: String,
		default: "",
	},
});

const emit = defineEmits([
	"open-name-dialog",
	"reset-item-name",
	"add-one",
	"update-qty",
	"minus-click",
	"calc-uom",
	"update-rate",
	"update-discount-percent",
	"update-discount-amount",
	"qty-edit-submitted",
	"discount-percent-edit-submitted",
	"discount-amount-edit-submitted",
	"rate-edit-submitted",
	"toggle-offer",
	"toggle-expand",
	"open-batch-serial",
	"remove-item",
]);

const __ = window.__ || ((text) => text);

const editingQtyValue = ref("");
const isEditingQty = ref(false);
const isEditingUom = ref(false);
const isEditingRate = ref(false);
const editingRateValue = ref("");
const isEditingDiscountPercent = ref(false);
const editingDiscountPercentValue = ref("");
const isEditingDiscountAmount = ref(false);
const editingDiscountAmountValue = ref("");
const replaceQtyOnNextInput = ref(false);
const replaceRateOnNextInput = ref(false);
const replaceDiscountPercentOnNextInput = ref(false);
const replaceDiscountAmountOnNextInput = ref(false);

const qtyInput = ref(null);
const rateInput = ref(null);
const discountPercentInput = ref(null);
const discountAmountInput = ref(null);
const uomSelect = ref(null);

const memoDeps = computed(() => {
	return [
		props.item.qty,
		props.item.rate,
		props.item.amount,
		props.item.discount_amount,
		props.item.discount_percentage,
		props.item.trade_price,
		props.item.buying_price,
		props.item.buying_rate,
		props.item.last_buying_rate,
		props.item.last_purchase_rate,
		props.item.valuation_rate,
		props.item.manufacturing_cost,
		props.item.uom,
		props.item.item_name,
		props.item.name_overridden,
		props.item.pricing_rule_badge,
		props.item.batch_no_is_expired,
		props.item.batch_no,
		props.item.has_batch_no,
		props.item.has_serial_no,
		props.item.serial_no,
		Array.isArray(props.item.serial_no_selected) ? props.item.serial_no_selected.join("|") : "",
		props.item.posa_is_offer,
		props.item.posa_offer_applied,
		props.item.is_free_item,
		props.item.price_list_rate,
		props.isExpanded,
		props.rowIndex,
		props.keyboardMode,
		props.activeRow,
		props.activeCellKey,
		props.visibleColumns.map((column) => column?.key).join("|"),
		// Include edit states to ensure UI updates when switching modes
		isEditingQty.value,
		isEditingRate.value,
		isEditingUom.value,
		isEditingDiscountPercent.value,
		isEditingDiscountAmount.value,
	];
});

const qtyLength = computed(() => String(Math.abs(props.item.qty || 0)).replace(".", "").length);

const requiredSerialCount = computed(() => {
	const qty = Number(props.item.qty || 0);
	const conversionFactor = Number(props.item.conversion_factor || 1);
	return Math.abs(qty * (Number.isFinite(conversionFactor) ? conversionFactor : 1));
});

const selectedSerialCount = computed(() => {
	if (Array.isArray(props.item.serial_no_selected)) {
		return props.item.serial_no_selected.filter(Boolean).length;
	}
	return String(props.item.serial_no || "")
		.split("\n")
		.map((serial) => serial.trim())
		.filter(Boolean).length;
});

const serialSelectionComplete = computed(() => selectedSerialCount.value === requiredSerialCount.value);

const rowDomId = computed(() => (props.rowIndex >= 0 ? getCartGridRowId(props.rowIndex) : undefined));

const saleFloorPolicy = computed(() => resolveSaleFloorPolicy(props.posProfile));
const lossRisk = computed(() =>
	saleFloorPolicy.value.enabled
		? getItemLossRisk(props.item, {
				minimumMarginPercentage: saleFloorPolicy.value.minimumMarginPercentage,
			})
		: null,
);

const rowClasses = computed(() => ({
	"posa-cart-item-row--keyboard-active": props.activeRow,
	"posa-cart-item-row--keyboard-row": props.activeRow && props.keyboardMode === "row",
	"posa-cart-item-row--keyboard-cell": props.activeRow && props.keyboardMode === "cell",
	"posa-cart-item-row--loss-risk": Boolean(lossRisk.value),
}));

function isKeyboardCellActive(key) {
	return props.activeRow && props.keyboardMode === "cell" && props.activeCellKey === key;
}

function getCellAttrs(key, baseClass = "") {
	return {
		id: props.rowIndex >= 0 ? getCartGridCellId(props.rowIndex, key) : undefined,
		role: "gridcell",
		"data-column-key": key,
		"data-testid": `cart-cell-${props.rowIndex}-${key}`,
		"aria-selected": isKeyboardCellActive(key) ? "true" : "false",
		tabindex: isKeyboardCellActive(key) ? 0 : -1,
		class: [
			baseClass,
			{
				"posa-cart-item-cell--keyboard-active": isKeyboardCellActive(key),
			},
		],
	};
}

const disableInput = computed(
	() =>
		props.isReturnInvoice &&
		(props.item.is_free_item || props.item.posa_is_offer || props.item.posa_is_replace),
);

const disableUomEdit = computed(() => !!props.item.posa_is_replace);
const canEditUom = computed(
	() => !disableUomEdit.value && Array.isArray(props.item.item_uoms) && props.item.item_uoms.length > 1,
);

const disableRateEdit = computed(
	() => !props.posProfile?.posa_allow_user_to_edit_rate || !!props.item.posa_is_replace,
);

const disableDiscountEdit = computed(
	() =>
		!props.posProfile?.posa_allow_user_to_edit_item_discount ||
		!!props.item.posa_is_replace ||
		!!props.item.posa_offer_applied ||
		!!props.item.retailmind_non_discountable,
);

const getQtyInputElement = () => qtyInput.value?.$el?.querySelector?.("input") || qtyInput.value;

const getTextFieldInputElement = (fieldRef) =>
	fieldRef.value?.$el?.querySelector?.("input") || fieldRef.value;

const focusAndSelectTextField = (fieldRef) => {
	nextTick(() => {
		const target = getTextFieldInputElement(fieldRef);
		target?.focus?.();
		target?.select?.();
	});
};

const shouldReplaceEditorValueForKey = (event) => {
	if (!event || event.altKey || event.ctrlKey || event.metaKey) {
		return false;
	}
	const key = event.key || "";
	return key.length === 1 || key === "Backspace" || key === "Delete";
};

const clearEditorForReplacement = (event, valueRef, replaceFlagRef) => {
	if (!replaceFlagRef.value || !shouldReplaceEditorValueForKey(event)) {
		return;
	}
	replaceFlagRef.value = false;
	valueRef.value = "";
	const target = event.target;
	if (target && typeof target.value !== "undefined") {
		target.value = "";
	}
	if (event.key === "Backspace" || event.key === "Delete") {
		event.preventDefault?.();
	}
};

const clearEditorForPasteReplacement = (event, valueRef, replaceFlagRef) => {
	if (!replaceFlagRef.value) {
		return;
	}
	replaceFlagRef.value = false;
	valueRef.value = "";
	const target = event?.target;
	if (target && typeof target.value !== "undefined") {
		target.value = "";
	}
};

const formatQtyInputValue = () => {
	const qty = Number(props.item.qty ?? 0);
	if (!Number.isFinite(qty)) {
		return "";
	}
	if (props.hideQtyDecimals) {
		return String(Math.round(qty));
	}
	return String(qty);
};

watch(
	() => [props.item.qty, props.hideQtyDecimals],
	() => {
		if (!isEditingQty.value) {
			editingQtyValue.value = formatQtyInputValue();
		}
	},
	{ immediate: true },
);

function focusQtyInput() {
	if (disableInput.value) return;
	editingQtyValue.value = formatQtyInputValue();
	replaceQtyOnNextInput.value = true;
	nextTick(() => {
		const target = getQtyInputElement();
		target?.focus?.();
		target?.select?.();
	});
}

function handleQtyFocus() {
	isEditingQty.value = true;
	replaceQtyOnNextInput.value = true;
	if (editingQtyValue.value === "" || editingQtyValue.value == null) {
		editingQtyValue.value = formatQtyInputValue();
	}
	nextTick(() => getQtyInputElement()?.select?.());
}

function handleQtyInputUpdate(value) {
	editingQtyValue.value = value ?? "";
}

function handleQtyKeydown(event) {
	clearEditorForReplacement(event, editingQtyValue, replaceQtyOnNextInput);
}

function handleQtyPaste(event) {
	clearEditorForPasteReplacement(event, editingQtyValue, replaceQtyOnNextInput);
}

function openUomEdit() {
	if (!canEditUom.value) return;
	isEditingUom.value = true;
	nextTick(() => {
		const target = uomSelect.value?.$el?.querySelector?.("input") || uomSelect.value;
		target?.focus?.();
	});
}

function closeQtyEdit() {
	if (isEditingQty.value) {
		replaceQtyOnNextInput.value = false;
		if (editingQtyValue.value !== "" && editingQtyValue.value != null) {
			// Emit event to update parent state
			const val = normalizeCartEditQuantity(editingQtyValue.value, props.isReturnInvoice);
			if (val !== props.item.qty) {
				emit("update-qty", props.item, val);
			}
			editingQtyValue.value = String(val);
		} else {
			editingQtyValue.value = formatQtyInputValue();
		}
		isEditingQty.value = false;
	}
}

function submitQtyEdit() {
	closeQtyEdit();
	emit("qty-edit-submitted", props.item);
}

function cancelQtyEdit() {
	isEditingQty.value = false;
	replaceQtyOnNextInput.value = false;
	editingQtyValue.value = formatQtyInputValue();
	getQtyInputElement()?.blur?.();
}

function changeUom(direction) {
	if (!canEditUom.value) return;
	const uoms = props.item.item_uoms.map((u) => u.uom);
	const currentIndex = uoms.indexOf(props.item.uom);
	let newIndex = currentIndex + direction;

	if (newIndex < 0) {
		newIndex = uoms.length - 1;
	} else if (newIndex >= uoms.length) {
		newIndex = 0;
	}

	const newUom = uoms[newIndex];
	if (newUom !== props.item.uom) {
		emit("calc-uom", props.item, newUom);
	}
}

function handleUomSelect(newUom) {
	if (!canEditUom.value) return;
	if (newUom && newUom !== props.item.uom) {
		emit("calc-uom", props.item, newUom);
	}
	// Find the correct component instance to blur - ref is local now
	uomSelect.value?.blur();
}

function openRateEdit() {
	if (disableRateEdit.value) return;
	isEditingRate.value = true;
	replaceRateOnNextInput.value = true;
	editingRateValue.value = String(Number(props.item.rate ?? 0));
	focusAndSelectTextField(rateInput);
}

function closeRateEdit() {
	if (isEditingRate.value) {
		replaceRateOnNextInput.value = false;
		if (editingRateValue.value !== "" && editingRateValue.value != null) {
			const newRate = parseFloat(editingRateValue.value);
			if (Number.isFinite(newRate) && newRate !== props.item.rate) {
				// We need to pass the "event-like" object that useDiscounts expects or handle it in parent
				// For isolation, let's emit value and let parent handler construct event if needed
				// But ItemsTable methods expect (item, value, event)
				emit("update-rate", props.item, newRate);
			}
		}
		isEditingRate.value = false;
		editingRateValue.value = String(Number(props.item.rate ?? 0));
	}
}

function submitRateEdit() {
	closeRateEdit();
	emit("rate-edit-submitted", props.item);
}

function cancelRateEdit() {
	isEditingRate.value = false;
	replaceRateOnNextInput.value = false;
	editingRateValue.value = String(Number(props.item.rate ?? 0));
}

function handleRateKeydown(event) {
	clearEditorForReplacement(event, editingRateValue, replaceRateOnNextInput);
}

function handleRatePaste(event) {
	clearEditorForPasteReplacement(event, editingRateValue, replaceRateOnNextInput);
}

function openDiscountPercentEdit() {
	if (disableDiscountEdit.value) return;
	isEditingDiscountPercent.value = true;
	replaceDiscountPercentOnNextInput.value = true;
	editingDiscountPercentValue.value = String(
		Number(
			props.item.discount_percentage ||
				(props.item.price_list_rate
					? (props.item.discount_amount / props.item.price_list_rate) * 100
					: 0),
		),
	);
	focusAndSelectTextField(discountPercentInput);
}

function closeDiscountPercentEdit() {
	if (isEditingDiscountPercent.value) {
		replaceDiscountPercentOnNextInput.value = false;
		if (editingDiscountPercentValue.value !== "" && editingDiscountPercentValue.value != null) {
			const newDiscount = parseFloat(editingDiscountPercentValue.value);
			if (Number.isFinite(newDiscount) && newDiscount !== props.item.discount_percentage) {
				emit("update-discount-percent", props.item, newDiscount);
			}
		}
		isEditingDiscountPercent.value = false;
		editingDiscountPercentValue.value = String(Number(props.item.discount_percentage || 0));
	}
}

function submitDiscountPercentEdit() {
	closeDiscountPercentEdit();
	emit("discount-percent-edit-submitted", props.item);
}

function cancelDiscountPercentEdit() {
	isEditingDiscountPercent.value = false;
	replaceDiscountPercentOnNextInput.value = false;
	editingDiscountPercentValue.value = String(Number(props.item.discount_percentage || 0));
}

function handleDiscountPercentKeydown(event) {
	clearEditorForReplacement(event, editingDiscountPercentValue, replaceDiscountPercentOnNextInput);
}

function handleDiscountPercentPaste(event) {
	clearEditorForPasteReplacement(event, editingDiscountPercentValue, replaceDiscountPercentOnNextInput);
}

function openDiscountAmountEdit() {
	if (disableDiscountEdit.value) return;
	isEditingDiscountAmount.value = true;
	replaceDiscountAmountOnNextInput.value = true;
	editingDiscountAmountValue.value = String(Number(props.item.discount_amount || 0));
	focusAndSelectTextField(discountAmountInput);
}

function closeDiscountAmountEdit() {
	if (isEditingDiscountAmount.value) {
		replaceDiscountAmountOnNextInput.value = false;
		if (editingDiscountAmountValue.value !== "" && editingDiscountAmountValue.value != null) {
			const newDiscount = parseFloat(editingDiscountAmountValue.value);
			if (Number.isFinite(newDiscount) && newDiscount !== props.item.discount_amount) {
				emit("update-discount-amount", props.item, newDiscount);
			}
		}
		isEditingDiscountAmount.value = false;
		editingDiscountAmountValue.value = String(Number(props.item.discount_amount || 0));
	}
}

function submitDiscountAmountEdit() {
	closeDiscountAmountEdit();
	emit("discount-amount-edit-submitted", props.item);
}

function cancelDiscountAmountEdit() {
	isEditingDiscountAmount.value = false;
	replaceDiscountAmountOnNextInput.value = false;
	editingDiscountAmountValue.value = String(Number(props.item.discount_amount || 0));
}

function handleDiscountAmountKeydown(event) {
	clearEditorForReplacement(event, editingDiscountAmountValue, replaceDiscountAmountOnNextInput);
}

function handleDiscountAmountPaste(event) {
	clearEditorForPasteReplacement(event, editingDiscountAmountValue, replaceDiscountAmountOnNextInput);
}
</script>

<style scoped>
/* Local styles specific to the row only */
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
.posa-cart-table__qty-input-shell:focus-visible,
.posa-cart-table__editor-display:focus-visible {
	outline: 2px solid var(--pos-primary);
	outline-offset: 2px;
	z-index: 10;
}

.posa-cart-item-row--keyboard-active {
	position: relative;
	background: #174a70 !important;
	animation: none !important;
	transition: none !important;
}

.posa-cart-item-row--keyboard-active > td {
	background: #174a70 !important;
	color: #ffffff !important;
	animation: none !important;
	transition: none !important;
}

.posa-cart-item-row--keyboard-row {
	outline: 3px solid var(--pos-primary);
	outline-offset: -3px;
}

.posa-cart-item-row--keyboard-row:focus {
	outline: 3px solid var(--pos-primary);
	outline-offset: -3px;
}

.posa-cart-item-cell--keyboard-active {
	background: #174a70 !important;
	box-shadow:
		inset 0 0 0 3px #38bdf8,
		inset 0 0 0 5px #ffffff;
	z-index: 2;
}

.posa-cart-item-cell--keyboard-active > div {
	position: relative;
	z-index: 3;
}

.posa-cart-item-row--loss-risk > td {
	background: var(--pos-error-container) !important;
	color: var(--pos-text-primary);
}

.posa-cart-item-row--loss-risk {
	outline: 3px solid #ef4444;
	outline-offset: -3px;
}

.posa-cart-item-row--loss-risk.posa-cart-item-row--keyboard-active > td,
.posa-cart-item-row--loss-risk .posa-cart-item-cell--keyboard-active {
	background: #174a70 !important;
	color: #ffffff !important;
}

td[data-column-key="item_name"] {
	text-align: left;
}

.posa-cart-item-row__item-cell {
	display: flex;
	align-items: center;
	justify-content: flex-start;
	flex-wrap: wrap;
	gap: 4px;
	width: 100%;
	height: auto;
	text-align: left;
}

.posa-cart-item-row__item-name {
	min-width: 0;
	overflow-wrap: anywhere;
	font-weight: 650;
	line-height: 1.35;
}

.posa-cart-item-row__tracking-stack {
	display: flex;
	flex-direction: column;
	flex: 0 0 100%;
	order: 10;
	align-items: flex-start;
	gap: 4px;
	margin-top: 2px;
}

.posa-cart-item-row__tracking-chip {
	max-width: 100%;
	cursor: pointer;
}

.posa-cart-table__delete-btn,
.posa-cart-table__expand-btn {
	min-width: 36px !important;
	min-height: 36px !important;
	border-radius: var(--pos-radius-xs) !important;
	box-shadow: none !important;
	transition:
		border-color 120ms ease,
		background-color 120ms ease,
		color 120ms ease !important;
}

.posa-cart-table__delete-btn {
	border: 1px solid color-mix(in srgb, var(--pos-error) 32%, var(--pos-border)) !important;
	background: var(--pos-error-container) !important;
	color: var(--pos-error) !important;
}

.posa-cart-table__delete-btn:hover {
	border-color: var(--pos-error) !important;
	background: color-mix(in srgb, var(--pos-error-container) 82%, var(--pos-error)) !important;
}

.posa-cart-table__expand-btn {
	border: 1px solid var(--pos-border) !important;
	background: var(--pos-surface-muted) !important;
	color: var(--pos-primary) !important;
}

.posa-cart-table__expand-btn:hover {
	border-color: var(--pos-primary) !important;
	background: var(--pos-primary-container) !important;
}
</style>
