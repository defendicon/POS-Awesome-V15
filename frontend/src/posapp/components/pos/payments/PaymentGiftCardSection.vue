<template>
	<div v-if="enabled" class="gift-card-entry">
		<div class="gift-card-entry__summary">
			<div class="gift-card-entry__copy">
				<div class="gift-card-entry__label-row">
					<p class="gift-card-entry__label">{{ __("Gift Card") }}</p>
					<span class="gift-card-entry__state" :class="{ 'gift-card-entry__state--applied': appliedAmount > 0 }">
						{{ appliedAmount > 0 ? __("Applied") : __("Ready") }}
					</span>
				</div>
				<h4 class="gift-card-entry__title">{{ __("Gift card payment") }}</h4>
				<p class="gift-card-entry__subtitle">
					<template v-if="appliedAmount > 0">
						{{ __("Applied") }} {{ formatCurrency(appliedAmount) }} {{ __("from") }}
						{{ cardCode || __("gift card") }}
					</template>
					<template v-else>
						{{ __("Tap the button below to redeem a gift card during checkout.") }}
					</template>
				</p>
				<div class="gift-card-entry__meta">
					<span class="gift-card-entry__meta-pill">{{ __("Scan-First Flow") }}</span>
					<span v-if="cardCode" class="gift-card-entry__meta-pill gift-card-entry__meta-pill--code">
						{{ cardCode }}
					</span>
				</div>
			</div>
			<div class="gift-card-entry__actions">
				<v-btn
					data-test="gift-card-toggle"
					color="primary"
					variant="flat"
					@click="emit('toggle')"
				>
					{{ expanded ? __("Hide Gift Card") : actionLabel }}
				</v-btn>
			</div>
		</div>

		<div v-if="expanded" class="gift-card-entry__editor">
			<div class="gift-card-entry__editor-fields">
				<v-text-field
					data-test="gift-card-code-input"
					:model-value="cardCode"
					:label="__('Gift Card Code')"
					hide-details="auto"
					variant="outlined"
					density="comfortable"
					@update:model-value="emit('update:cardCode', $event)"
				/>
				<v-text-field
					data-test="gift-card-amount-input"
					:model-value="redeemAmount"
					:label="__('Amount')"
					type="number"
					hide-details="auto"
					variant="outlined"
					density="comfortable"
					@update:model-value="emit('update:redeemAmount', $event)"
				/>
			</div>

			<div class="gift-card-entry__stats">
				<div class="gift-card-entry__stat">
					<span>{{ __("Balance") }}</span>
					<strong>{{ formatCurrency(balance || 0) }}</strong>
				</div>
				<div class="gift-card-entry__stat">
					<span>{{ __("Status") }}</span>
					<strong>{{ status || __("Not checked") }}</strong>
				</div>
			</div>

			<p v-if="errorMessage" class="gift-card-entry__error">{{ errorMessage }}</p>

			<div class="gift-card-entry__editor-actions">
				<v-btn
					data-test="gift-card-check-balance"
					variant="tonal"
					:disabled="loading"
					@click="emit('check-balance')"
				>
					{{ __("Check Balance") }}
				</v-btn>
				<v-btn
					data-test="gift-card-apply"
					color="primary"
					variant="flat"
					:disabled="loading"
					@click="emit('apply')"
				>
					{{ __("Apply Gift Card") }}
				</v-btn>
				<v-btn
					v-if="appliedAmount > 0"
					data-test="gift-card-clear"
					variant="text"
					color="warning"
					@click="emit('clear')"
				>
					{{ __("Clear") }}
				</v-btn>
			</div>
		</div>
	</div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
	enabled: {
		type: Boolean,
		default: false,
	},
	expanded: {
		type: Boolean,
		default: false,
	},
	appliedAmount: {
		type: Number,
		default: 0,
	},
	cardCode: {
		type: String,
		default: "",
	},
	redeemAmount: {
		type: [Number, String],
		default: 0,
	},
	balance: {
		type: Number,
		default: 0,
	},
	status: {
		type: String,
		default: "",
	},
	loading: {
		type: Boolean,
		default: false,
	},
	errorMessage: {
		type: String,
		default: "",
	},
	formatCurrency: {
		type: Function,
		required: true,
	},
});

const emit = defineEmits([
	"toggle",
	"clear",
	"check-balance",
	"apply",
	"update:cardCode",
	"update:redeemAmount",
]);

const __ = window.__;

const actionLabel = computed(() =>
	props.appliedAmount > 0 ? __("Edit Gift Application") : __("Apply Gift Card"),
);
</script>

<style scoped>
.gift-card-entry {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	border-radius: 18px;
	border: 1px solid rgba(var(--v-theme-primary), 0.12);
	background:
		radial-gradient(circle at top left, rgba(var(--v-theme-primary), 0.14), transparent 34%),
		linear-gradient(180deg, rgba(var(--v-theme-primary), 0.06) 0%, var(--pos-surface-raised) 100%);
	box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
}

.gift-card-entry__summary {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--pos-space-3);
}

.gift-card-entry__copy {
	min-width: 0;
}

.gift-card-entry__label-row {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 4px;
}

.gift-card-entry__label {
	margin: 0;
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.gift-card-entry__state,
.gift-card-entry__meta-pill {
	display: inline-flex;
	align-items: center;
	padding: 6px 10px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
}

.gift-card-entry__state {
	background: rgba(var(--v-theme-primary), 0.1);
	color: var(--pos-text-secondary);
}

.gift-card-entry__state--applied {
	background: rgba(var(--v-theme-success), 0.12);
	color: rgb(var(--v-theme-success));
}

.gift-card-entry__title {
	margin: 0;
	font-size: 1.02rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.gift-card-entry__subtitle {
	margin: 6px 0 0;
	font-size: 0.85rem;
	color: var(--pos-text-secondary);
}

.gift-card-entry__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 12px;
}

.gift-card-entry__meta-pill {
	background: rgba(var(--v-theme-surface), 0.88);
	color: var(--pos-text-secondary);
	border: 1px solid rgba(var(--v-theme-primary), 0.1);
}

.gift-card-entry__meta-pill--code {
	color: var(--pos-text-primary);
}

.gift-card-entry__actions,
.gift-card-entry__editor-actions {
	display: flex;
	flex-wrap: wrap;
	gap: var(--pos-space-2);
}

.gift-card-entry__actions {
	justify-content: flex-end;
}

.gift-card-entry__editor {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding-top: 14px;
	border-top: 1px solid rgba(var(--v-theme-primary), 0.1);
}

.gift-card-entry__editor-fields,
.gift-card-entry__stats {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.gift-card-entry__stat {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 12px 14px;
	border-radius: 14px;
	background: rgba(var(--v-theme-surface), 0.84);
	border: 1px solid rgba(var(--v-theme-primary), 0.08);
}

.gift-card-entry__stat span {
	font-size: 0.74rem;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.gift-card-entry__stat strong {
	font-size: 1rem;
	color: var(--pos-text-primary);
}

.gift-card-entry__error {
	margin: 0;
	font-size: 0.84rem;
	font-weight: 600;
	color: rgb(var(--v-theme-error));
}

@media (max-width: 768px) {
	.gift-card-entry__summary {
		flex-direction: column;
		align-items: stretch;
	}

	.gift-card-entry__editor-fields,
	.gift-card-entry__stats {
		grid-template-columns: 1fr;
	}

	.gift-card-entry__actions {
		justify-content: stretch;
	}
}
</style>
