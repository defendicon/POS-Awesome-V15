<template>
	<div
		:class="['card-item-card', { 'item-highlighted': isItemHighlighted }]"
		@click="onClick"
		:draggable="true"
		@dragstart="onDragStart"
		@dragend="onDragEnd"
	>
		<div class="card-item-image-container">
			<v-img
				:src="item.image || placeholderImage"
				class="card-item-image"
				aspect-ratio="1"
				:alt="item.item_name"
			>
				<template #placeholder>
					<div class="image-placeholder">
						<v-icon size="40" color="grey-lighten-2"> mdi-image </v-icon>
					</div>
				</template>
			</v-img>
		</div>
		<div class="card-item-content">
			<div class="card-item-header">
				<h4 class="card-item-name">{{ item.item_name }}</h4>
				<span class="card-item-code">{{ item.item_code }}</span>
			</div>
			<div class="card-item-details">
				<div class="card-item-price">
					<div class="primary-price">
						<span class="currency-symbol">
							{{ currencySymbol(primaryCurrency) }}
						</span>
						<span class="price-amount">
							{{ formatCurrency(primaryRate, primaryCurrency, primaryPrecision) }}
						</span>
					</div>
					<div v-if="showSecondaryPrice" class="secondary-price">
						<span class="currency-symbol">
							{{ currencySymbol(secondaryCurrency) }}
						</span>
						<span class="price-amount">
							{{ formatCurrency(item.rate, secondaryCurrency, primaryPrecision) }}
						</span>
					</div>
					<div v-if="lastInvoiceRate" class="last-rate-chip">
						<v-icon size="14" class="mr-1" color="secondary">mdi-history</v-icon>
						<span class="last-rate-label">{{ __("Last") }}:</span>
						<span class="last-rate-value">
							{{ currencySymbol(lastInvoiceRate.currency || posProfile.currency) }}
							{{
								formatCurrency(
									lastInvoiceRate.rate,
									lastInvoiceRate.currency || posProfile.currency,
									primaryPrecision,
								)
							}}
							<span v-if="lastInvoiceRate.uom" class="last-rate-uom">
								/{{ lastInvoiceRate.uom }}
							</span>
						</span>
					</div>
				</div>
				<div class="card-item-stock">
					<v-icon size="small" class="stock-icon"> mdi-package-variant </v-icon>
					<span
						class="stock-amount"
						:class="{
							'negative-number': isNegative(item.actual_qty),
						}"
					>
						{{ formattedActualQty }}
					</span>
					<span class="stock-uom">{{ item.stock_uom || "" }}</span>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue";
import placeholderImage from "../placeholder-image.png";

const props = defineProps({
	item: { type: Object, required: true },
	posProfile: { type: Object, required: true },
	context: { type: String, default: "pos" },
	selectedCurrency: { type: String, default: "" },
	hideQtyDecimals: { type: Boolean, default: false },
	lastInvoiceRate: { type: Object, default: null },
	isItemHighlighted: { type: Boolean, default: false },
	currencySymbol: { type: Function, required: true },
	formatCurrency: { type: Function, required: true },
	formatNumber: { type: Function, required: true },
	ratePrecision: { type: Function, required: true },
	isNegative: { type: Function, default: (val) => val < 0 },
});

const emit = defineEmits(["click", "dragstart", "dragend"]);

const primaryCurrency = computed(() => {
	if (props.context === "purchase") return props.posProfile.currency;
	return (
		props.item.original_currency ||
		props.item.currency ||
		props.item.price_list_currency ||
		props.posProfile.currency
	);
});

const primaryRate = computed(() => {
	if (props.context === "purchase") {
		return props.item.rate || props.item.standard_rate || 0;
	}
	return props.item.original_rate ?? props.item.rate ?? 0;
});

const primaryPrecision = computed(() => {
	return props.ratePrecision(primaryRate.value);
});

const secondaryCurrency = computed(() => props.selectedCurrency);

const showSecondaryPrice = computed(() => {
	return (
		props.context !== "purchase" &&
		props.posProfile.posa_allow_multi_currency &&
		Boolean(props.selectedCurrency) &&
		props.selectedCurrency !== primaryCurrency.value
	);
});

const formattedActualQty = computed(() => {
	const numericQty = Number(props.item.actual_qty ?? 0);
	if (!Number.isFinite(numericQty)) {
		return 0;
	}
	if (props.hideQtyDecimals) {
		return props.formatNumber(Math.round(numericQty), 0);
	}
	return props.formatNumber(numericQty, 4);
});

const onClick = (event) => {
	emit("click", event, props.item);
};

const onDragStart = (event) => {
	emit("dragstart", event, props.item);
};

const onDragEnd = (event) => {
	emit("dragend", event);
};
</script>

<style scoped>
.card-item-card {
	background: var(--pos-surface-raised);
	border-radius: var(--pos-radius-md);
	border: 1px solid var(--pos-border-light);
	overflow: hidden;
	transition:
		transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
		box-shadow 0.2s ease,
		border-color 0.2s ease,
		background-color 0.2s ease;
	cursor: pointer;
	display: flex;
	flex-direction: column;
	height: 100%;
	width: 100%;
	box-shadow: 0 10px 24px var(--pos-shadow-light);
	will-change: transform;
	backface-visibility: hidden;
	transform: translate3d(0, 0, 0);
	position: relative;
}

.card-item-card:hover {
	transform: translate3d(0, -3px, 0);
	box-shadow: 0 16px 32px var(--pos-shadow);
	border-color: rgba(var(--v-theme-primary), 0.35);
}

.card-item-card.item-highlighted {
	border-color: rgb(var(--v-theme-primary));
	box-shadow:
		0 0 0 3px rgba(var(--v-theme-primary), 0.35),
		0 12px 28px rgba(var(--v-theme-primary), 0.2);
	transform: translate3d(0, -2px, 0);
	background: rgba(var(--v-theme-primary), 0.08);
}

.card-item-image-container {
	position: relative;
	height: 132px;
	flex-shrink: 0;
	overflow: hidden;
	background: var(--pos-surface-muted);
}

.card-item-image {
	width: 100%;
	height: 100%;
	object-fit: contain; /* Changed to contain to ensure full image visibility */
	background-color: rgb(var(--v-theme-surface-bright));
}

/* Image Placeholder Style */
.image-placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 100%;
	height: 100%;
	background-color: rgb(var(--v-theme-surface-variant));
}

.card-item-content {
	padding: var(--pos-space-3);
	display: flex;
	flex-direction: column;
	flex-grow: 1;
	justify-content: space-between;
	gap: var(--pos-space-2);
}

.card-item-header {
	display: flex;
	flex-direction: column;
	gap: var(--pos-space-1);
}

.card-item-name {
	font-size: 0.98rem;
	font-weight: 700;
	margin: 0;
	line-height: 1.35;
	color: var(--pos-text-primary);
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
}

.card-item-code {
	font-size: 0.74rem;
	color: var(--pos-text-secondary);
	display: block;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	letter-spacing: 0.02em;
}

.card-item-details {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	margin-top: auto; /* Push to bottom */
	gap: var(--pos-space-2);
}

.card-item-price {
	display: flex;
	flex-direction: column;
	gap: var(--pos-space-1);
	min-width: 0;
}

.primary-price {
	display: flex;
	align-items: baseline;
	flex-wrap: wrap;
	gap: var(--pos-space-1);
	font-weight: 700;
	color: rgb(var(--v-theme-primary));
	font-size: 1.05rem;
}

.secondary-price {
	font-size: 0.8rem;
	color: var(--pos-text-secondary);
}

.last-rate-chip {
	font-size: 0.75rem;
	color: rgb(var(--v-theme-secondary));
	background: rgba(var(--v-theme-on-surface), 0.08);
	padding: 4px 8px;
	border-radius: var(--pos-radius-xs);
	display: inline-flex;
	align-items: center;
	width: fit-content;
}

.v-theme--dark .last-rate-chip {
	color: rgba(var(--v-theme-on-surface), 0.75);
}

.last-rate-value {
	margin-left: 4px;
	font-weight: 500;
}

.card-item-stock {
	text-align: right;
	font-size: 0.82rem;
	color: var(--pos-text-secondary);
	display: flex;
	flex-direction: row;
	align-items: flex-end;
	gap: 6px;
	padding: 6px 8px;
	border-radius: var(--pos-radius-xs);
	background: rgba(var(--v-theme-on-surface), 0.06);
	white-space: nowrap;
}

.stock-amount {
	font-weight: 600;
}

.stock-amount.negative-number {
	color: rgb(var(--v-theme-error));
}

.stock-uom {
	font-size: 0.7rem;
	text-transform: uppercase;
}

@media (max-width: 768px) {
	.card-item-image-container {
		height: 112px;
	}

	.card-item-content {
		padding: var(--pos-space-2);
	}

	.card-item-name {
		font-size: 0.85rem;
	}

	.card-item-code {
		font-size: 0.7rem;
	}
}
</style>
