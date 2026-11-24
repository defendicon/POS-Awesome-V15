<template>
	<div class="retail-cart" data-testid="retail-cart">
		<div class="retail-cart__head">
			<span class="retail-eyebrow">{{ __("Items") }}</span>
			<slot name="actions" />
			<span class="retail-cart__count">
				{{ items.length }} {{ __("lines") }} · {{ formatQty(totalQty) }}
				{{ __("qty") }}
			</span>
		</div>

		<div v-if="!items.length" class="retail-cart__empty">
			<v-icon icon="mdi-cart-outline" size="28" />
			<span>{{ __("No items in cart") }}</span>
			<small>{{ __("Tap a product to add it to this sale.") }}</small>
		</div>

		<ul v-else class="retail-cart__list">
			<li
				v-for="item in items"
				:key="item.posa_row_id || item.name || item.item_code"
				class="retail-line"
				:class="{ 'retail-line--free': item.is_free_item || item.posa_is_offer }"
				:data-testid="`retail-line-${item.item_code}`"
			>
				<button
					type="button"
					class="retail-line__main"
					:title="__('Edit item')"
					@click="emit('edit-item', item)"
				>
					<span class="retail-line__tile">{{ retailItemLabel(item) }}</span>
					<span class="retail-line__copy">
						<span class="retail-line__name">{{ item.item_name || item.item_code }}</span>
						<span class="retail-line__rate">
							{{ formatCurrency(item.rate) }} × {{ formatQty(item.qty) }}
							<template v-if="item.uom && item.uom !== item.stock_uom"> {{ item.uom }}</template>
						</span>
					</span>
				</button>

				<div class="retail-stepper" :class="{ 'retail-stepper--disabled': isLocked(item) }">
					<button
						type="button"
						class="retail-stepper__btn"
						:disabled="isLocked(item)"
						:aria-label="__('Decrease quantity')"
						:data-testid="`retail-minus-${item.item_code}`"
						@click="handleMinus(item)"
					>
						<v-icon icon="mdi-minus" size="18" />
					</button>
					<span class="retail-stepper__value">{{ formatQty(item.qty) }}</span>
					<button
						type="button"
						class="retail-stepper__btn"
						:disabled="isLocked(item)"
						:aria-label="__('Increase quantity')"
						:data-testid="`retail-plus-${item.item_code}`"
						@click="handlePlus(item)"
					>
						<v-icon icon="mdi-plus" size="18" />
					</button>
				</div>

				<span class="retail-line__amount">{{ formatCurrency(item.amount) }}</span>
			</li>
		</ul>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { retailItemLabel } from "../../../utils/retailItemLabel";
import { loadItemSelectorSettings } from "../../../utils/itemSelectorSettings";

/**
 * Retail cart list. Pure presentation: quantity changes call the same
 * invoice methods (addOne / subtractOne / removeItem) the classic items table
 * uses, with the same rules (see ItemsTable.handleMinusClick and
 * CartItemRow.disableInput).
 */
const props = defineProps({
	items: { type: Array as () => any[], default: () => [] },
	isReturnInvoice: { type: Boolean, default: false },
	formatCurrency: { type: Function, required: true },
	formatFloat: { type: Function, required: true },
	addOne: { type: Function, required: true },
	subtractOne: { type: Function, required: true },
	removeItem: { type: Function, required: true },
	eventBus: { type: Object, default: null },
});

const emit = defineEmits(["edit-item"]);

const __ = (text: string) => (typeof window !== "undefined" && (window as any).__ ? (window as any).__(text) : text);

// Same source as InvoiceSummary's quantity formatting.
const hideQtyDecimals = computed(() => !!loadItemSelectorSettings()?.hide_qty_decimals);

// Whole quantities show without decimals ("2", not "2.00").
const formatQty = (qty: unknown) => {
	const value = Number(qty) || 0;
	if (hideQtyDecimals.value || Number.isInteger(value)) return props.formatFloat(value, 0);
	return props.formatFloat(value);
};

const totalQty = computed(() =>
	props.items.reduce((sum: number, item: any) => sum + (Number(item?.qty) || 0), 0),
);

const isLocked = (item: any) =>
	props.isReturnInvoice && !!(item.is_free_item || item.posa_is_offer || item.posa_is_replace);

const recalcReturnDiscount = () => {
	(props.eventBus as any)?.emit?.("recalculate_return_discount", { defer: true });
};

const handleMinus = (item: any) => {
	if (isLocked(item)) return;
	// Same rule as ItemsTable.handleMinusClick: replacement rows and lines at
	// |qty| <= 1 are removed; otherwise subtract one (sign-aware for returns).
	if (item.posa_is_replace || Math.abs(Number(item.qty) || 0) <= 1) {
		props.removeItem(item);
	} else {
		props.subtractOne(item);
	}
	recalcReturnDiscount();
};

const handlePlus = (item: any) => {
	if (isLocked(item)) return;
	// Same as ItemsTable (@add-one="addOne"): no extra recalculation event.
	props.addOne(item);
};
</script>
