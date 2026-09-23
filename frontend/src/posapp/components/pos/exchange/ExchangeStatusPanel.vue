<template>
	<section
		class="exchange-panel"
		:class="[
			`exchange-panel--${stage}`,
			`exchange-panel--${settlement.type}`,
			{ 'exchange-panel--compact': compact },
		]"
		data-testid="exchange-status-panel"
		role="status"
		aria-live="polite"
	>
		<div class="exchange-panel__header">
			<div class="exchange-panel__marker" aria-hidden="true">
				<v-icon
					:icon="
						stage === 'return' ? 'mdi-package-variant-closed-remove' : 'mdi-swap-horizontal-bold'
					"
				/>
			</div>

			<div class="exchange-panel__copy">
				<div class="exchange-panel__heading-row">
					<span class="exchange-panel__eyebrow">{{ __("Item exchange") }}</span>
					<span class="exchange-panel__step">
						{{ stage === "return" ? __("Step 1 of 2") : __("Step 2 of 2") }}
					</span>
				</div>
				<strong class="exchange-panel__title">
					{{
						stage === "return" ? __("Choose the items coming back") : __("Add replacement items")
					}}
				</strong>
				<span v-if="stage === 'return'" class="exchange-panel__detail">
					{{ __("Remove anything the customer is keeping, then continue.") }}
				</span>
			</div>

			<div class="exchange-panel__actions">
				<v-btn
					variant="text"
					color="medium-emphasis"
					size="small"
					:disabled="continuing"
					@click="$emit('cancel')"
				>
					{{ __("Cancel exchange") }}
				</v-btn>
				<v-btn
					v-if="stage === 'return'"
					color="primary"
					variant="flat"
					prepend-icon="mdi-arrow-right"
					:loading="continuing"
					@click="$emit('continue')"
				>
					{{ __("Choose replacement") }}
				</v-btn>
			</div>
		</div>

		<div v-if="stage === 'sale'" class="exchange-panel__ledger" data-testid="exchange-settlement-ledger">
			<div class="exchange-panel__metric">
				<span>{{ __("Replacement sale") }}</span>
				<strong>{{ displayAmount(settlement.saleTotal) }}</strong>
			</div>
			<div class="exchange-panel__operator" aria-hidden="true">−</div>
			<div class="exchange-panel__metric">
				<span>{{ __("Return credit") }}</span>
				<strong>{{ displayAmount(settlement.returnTotal) }}</strong>
			</div>
			<div class="exchange-panel__operator" aria-hidden="true">=</div>
			<div class="exchange-panel__metric exchange-panel__metric--settlement">
				<span>{{ settlementLabel }}</span>
				<strong>{{ displayAmount(settlement.amount) }}</strong>
			</div>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { getExchangeSettlement } from "../../../utils/exchangeSettlement";

const __ = window.__;

const props = defineProps({
	stage: { type: String, default: "return" },
	returnTotal: { type: Number, default: 0 },
	saleTotal: { type: Number, default: 0 },
	currencySymbol: { type: String, default: "" },
	currencyPrecision: { type: Number, default: 2 },
	formatAmount: { type: Function, required: true },
	continuing: { type: Boolean, default: false },
	compact: { type: Boolean, default: false },
});

defineEmits(["continue", "cancel"]);

const settlement = computed(() =>
	getExchangeSettlement(props.saleTotal, props.returnTotal, props.currencyPrecision),
);
const settlementLabel = computed(() => {
	if (settlement.value.type === "even") return __("Even exchange");
	return settlement.value.type === "payment" ? __("Customer pays") : __("Customer credit");
});
const displayAmount = (value: number) => `${props.currencySymbol}${props.formatAmount(value)}`;
</script>

<style scoped>
.exchange-panel {
	--exchange-accent: rgb(var(--v-theme-primary));
	--exchange-soft: rgba(var(--v-theme-primary), 0.08);
	display: grid;
	gap: 12px;
	margin: 12px 12px 0;
	padding: 14px 16px;
	border: 1px solid rgba(var(--v-theme-primary), 0.28);
	border-radius: 14px;
	background: linear-gradient(105deg, var(--exchange-soft), transparent 58%), rgb(var(--v-theme-surface));
	box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.exchange-panel--sale {
	--exchange-accent: rgb(var(--v-theme-success));
	--exchange-soft: rgba(var(--v-theme-success), 0.08);
	border-color: rgba(var(--v-theme-success), 0.32);
}

.exchange-panel__header {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 14px;
}

.exchange-panel__marker {
	display: grid;
	place-items: center;
	width: 42px;
	height: 42px;
	border-radius: 12px;
	color: #fff;
	background: var(--exchange-accent);
	box-shadow: 0 6px 14px var(--exchange-soft);
}

.exchange-panel__copy {
	display: grid;
	gap: 2px;
	min-width: 0;
}

.exchange-panel__heading-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.exchange-panel__eyebrow {
	font-size: 0.68rem;
	font-weight: 800;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--exchange-accent);
}

.exchange-panel__step {
	padding: 2px 7px;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
	border-radius: 999px;
	font-size: 0.64rem;
	font-weight: 700;
	color: rgb(var(--v-theme-on-surface-variant));
	background: rgba(var(--v-theme-surface), 0.78);
}

.exchange-panel__title {
	font-size: 0.96rem;
	line-height: 1.25;
	color: rgb(var(--v-theme-on-surface));
}

.exchange-panel__detail {
	font-size: 0.8rem;
	color: rgb(var(--v-theme-on-surface-variant));
}

.exchange-panel__actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.exchange-panel__ledger {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1.12fr);
	align-items: stretch;
	gap: 8px;
	padding-top: 10px;
	border-top: 1px dashed rgba(var(--v-theme-on-surface), 0.14);
}

.exchange-panel__metric {
	display: grid;
	gap: 2px;
	min-width: 0;
	padding: 8px 10px;
	border-radius: 9px;
	background: rgba(var(--v-theme-surface), 0.72);
}

.exchange-panel__metric span {
	overflow: hidden;
	font-size: 0.68rem;
	font-weight: 650;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: rgb(var(--v-theme-on-surface-variant));
}

.exchange-panel__metric strong {
	font-size: 0.94rem;
	font-variant-numeric: tabular-nums;
	color: rgb(var(--v-theme-on-surface));
}

.exchange-panel__metric--settlement {
	border-inline-start: 3px solid var(--exchange-accent);
	background: var(--exchange-soft);
}

.exchange-panel--credit .exchange-panel__metric--settlement {
	--exchange-accent: rgb(var(--v-theme-info));
	--exchange-soft: rgba(var(--v-theme-info), 0.1);
}

.exchange-panel--even .exchange-panel__metric--settlement {
	--exchange-accent: rgb(var(--v-theme-success));
	--exchange-soft: rgba(var(--v-theme-success), 0.1);
}

.exchange-panel__operator {
	display: grid;
	place-items: center;
	font-size: 1rem;
	font-weight: 800;
	color: rgb(var(--v-theme-on-surface-variant));
}

.exchange-panel--compact {
	gap: 7px;
	margin: 7px 0 0;
	padding: 8px 10px;
	border-radius: 12px;
	box-shadow: none;
}

.exchange-panel--compact .exchange-panel__marker {
	width: 34px;
	height: 34px;
	border-radius: 10px;
}

.exchange-panel--compact .exchange-panel__header {
	gap: 10px;
}

.exchange-panel--compact .exchange-panel__ledger {
	gap: 6px;
	padding-top: 6px;
}

.exchange-panel--compact .exchange-panel__metric {
	padding: 5px 8px;
}

.exchange-panel--compact .exchange-panel__metric strong {
	font-size: 0.88rem;
}

@media (max-width: 760px) {
	.exchange-panel__header {
		grid-template-columns: auto minmax(0, 1fr);
	}

	.exchange-panel__actions {
		grid-column: 1 / -1;
		justify-content: flex-end;
	}

	.exchange-panel__ledger {
		grid-template-columns: 1fr 1fr;
	}

	.exchange-panel__operator {
		display: none;
	}

	.exchange-panel__metric--settlement {
		grid-column: 1 / -1;
	}
}

@media (max-width: 460px) {
	.exchange-panel__heading-row {
		align-items: flex-start;
		flex-direction: column;
		gap: 3px;
	}

	.exchange-panel__actions {
		align-items: stretch;
		flex-direction: column-reverse;
	}
}
</style>
