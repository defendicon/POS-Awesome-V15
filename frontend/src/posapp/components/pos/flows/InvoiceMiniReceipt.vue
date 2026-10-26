<template>
	<section class="mini-receipt" :aria-label="__('Invoice items')">
		<div class="mini-receipt__heading">
			<div class="mini-receipt__eyebrow">
				<v-icon size="15">mdi-receipt-text-outline</v-icon>
				<span>{{ __("Receipt items") }}</span>
			</div>
			<span class="mini-receipt__count">{{ itemCountLabel }}</span>
		</div>

		<div v-if="previewItems.length" class="mini-receipt__table" role="table">
			<div class="mini-receipt__table-head" role="row">
				<span role="columnheader">{{ __("Item") }}</span>
				<span role="columnheader">{{ __("Qty") }}</span>
				<span role="columnheader">{{ __("Amount") }}</span>
			</div>
			<div
				v-for="(item, index) in previewItems"
				:key="item.name || `${item.item_code || 'item'}-${index}`"
				class="mini-receipt__line"
				role="row"
			>
				<div class="mini-receipt__item" role="cell">
					<strong>{{ item.item_name || item.item_code || __("Item") }}</strong>
					<span v-if="item.item_name && item.item_code">{{ item.item_code }}</span>
				</div>
				<div class="mini-receipt__qty" role="cell">
					{{ formatFloat(item.qty || 0) }}
					<small v-if="item.uom">{{ item.uom }}</small>
				</div>
				<div class="mini-receipt__line-total" role="cell">
					{{ currencySymbol(invoice.currency) }}
					{{ formatCurrency(item.amount || 0) }}
				</div>
			</div>
		</div>

		<div v-else class="mini-receipt__empty">
			<v-icon size="18">mdi-receipt-text-remove-outline</v-icon>
			<span>{{ __("Item preview is not available") }}</span>
		</div>

		<button
			v-if="showViewAll"
			type="button"
			class="mini-receipt__view-all"
			:aria-label="__('View all invoice items')"
			@click="$emit('view-all')"
		>
			<span>{{ __("View all {0} items", [itemCount]) }}</span>
			<span class="mini-receipt__more">+{{ hiddenItemCount }}</span>
			<v-icon size="17">mdi-arrow-right</v-icon>
		</button>
	</section>
</template>

<script>
import format from "../../../format";

export default {
	name: "InvoiceMiniReceipt",
	mixins: [format],
	emits: ["view-all"],
	props: {
		invoice: {
			type: Object,
			required: true,
		},
		maxItems: {
			type: Number,
			default: 4,
		},
		allowViewAll: {
			type: Boolean,
			default: true,
		},
	},
	computed: {
		previewItems() {
			const items = Array.isArray(this.invoice?.item_preview)
				? this.invoice.item_preview
				: Array.isArray(this.invoice?.items)
					? this.invoice.items
					: [];
			return items.slice(0, Math.max(Number(this.maxItems) || 4, 1));
		},
		itemCount() {
			const count = Number(this.invoice?.items_count);
			return Number.isFinite(count) && count >= 0 ? count : this.previewItems.length;
		},
		itemCountLabel() {
			return this.itemCount === 1 ? __("1 item") : __("{0} items", [this.itemCount]);
		},
		hiddenItemCount() {
			return Math.max(this.itemCount - this.previewItems.length, 0);
		},
		showViewAll() {
			return this.allowViewAll && this.itemCount > Math.max(Number(this.maxItems) || 4, 1);
		},
	},
};
</script>

<style scoped>
.mini-receipt {
	position: relative;
	margin-top: 16px;
	padding: 14px 15px 12px;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.11);
	border-radius: 14px;
	background:
		linear-gradient(90deg, rgba(var(--v-theme-primary), 0.035) 1px, transparent 1px) 0 0 / 18px 18px,
		var(--pos-surface-raised);
	box-shadow: inset 0 1px rgba(255, 255, 255, 0.45);
}

.mini-receipt::before {
	content: "";
	position: absolute;
	inset: 0 auto 0 0;
	width: 3px;
	border-radius: 14px 0 0 14px;
	background: rgb(var(--v-theme-primary));
	opacity: 0.72;
}

.mini-receipt__heading,
.mini-receipt__eyebrow,
.mini-receipt__view-all {
	display: flex;
	align-items: center;
}

.mini-receipt__heading {
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 8px;
}

.mini-receipt__eyebrow {
	gap: 6px;
	font-size: 0.7rem;
	font-weight: 800;
	letter-spacing: 0.1em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.mini-receipt__count {
	font-size: 0.72rem;
	font-weight: 800;
	color: rgb(var(--v-theme-primary));
}

.mini-receipt__table-head,
.mini-receipt__line {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(58px, auto) minmax(88px, auto);
	gap: 10px;
	align-items: center;
}

.mini-receipt__table-head {
	padding: 5px 4px 6px;
	border-bottom: 1px dashed rgba(var(--v-theme-on-surface), 0.2);
	font-size: 0.62rem;
	font-weight: 800;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.mini-receipt__table-head span:nth-child(n + 2) {
	text-align: right;
}

.mini-receipt__line {
	min-height: 44px;
	padding: 7px 4px;
	border-bottom: 1px dashed rgba(var(--v-theme-on-surface), 0.11);
}

.mini-receipt__line:last-child {
	border-bottom: 0;
}

.mini-receipt__item {
	min-width: 0;
}

.mini-receipt__item strong,
.mini-receipt__item span {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.mini-receipt__item strong {
	font-size: 0.82rem;
	line-height: 1.25;
}

.mini-receipt__item span,
.mini-receipt__qty small {
	font-size: 0.68rem;
	color: var(--pos-text-secondary);
}

.mini-receipt__qty,
.mini-receipt__line-total {
	text-align: right;
	font-size: 0.78rem;
	font-variant-numeric: tabular-nums;
}

.mini-receipt__qty small {
	display: block;
}

.mini-receipt__line-total {
	font-weight: 800;
	white-space: nowrap;
}

.mini-receipt__empty {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 7px;
	min-height: 56px;
	font-size: 0.76rem;
	color: var(--pos-text-secondary);
}

.mini-receipt__view-all {
	width: 100%;
	justify-content: flex-end;
	gap: 7px;
	margin-top: 8px;
	padding: 8px 4px 2px;
	border: 0;
	background: transparent;
	color: rgb(var(--v-theme-primary));
	font: inherit;
	font-size: 0.76rem;
	font-weight: 800;
	cursor: pointer;
}

.mini-receipt__view-all:hover,
.mini-receipt__view-all:focus-visible {
	text-decoration: underline;
}

.mini-receipt__view-all:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 3px;
	border-radius: 4px;
}

.mini-receipt__more {
	padding: 2px 6px;
	border-radius: 999px;
	background: rgba(var(--v-theme-primary), 0.11);
}

@media (max-width: 420px) {
	.mini-receipt__table-head,
	.mini-receipt__line {
		grid-template-columns: minmax(0, 1fr) 52px 82px;
		gap: 7px;
	}
}
</style>
