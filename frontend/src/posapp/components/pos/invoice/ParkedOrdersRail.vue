<template>
	<section v-if="parkedOrders.length" class="parked-orders-rail">
		<div class="parked-orders-rail__header">
			<div>
				<p class="parked-orders-rail__eyebrow">{{ __("Ready to resume") }}</p>
				<h4 class="parked-orders-rail__title">{{ __("Parked Orders") }}</h4>
			</div>
			<div class="parked-orders-rail__actions">
				<span class="parked-orders-rail__count">{{ parkedOrders.length }}</span>
				<v-btn
					size="small"
					variant="text"
					color="primary"
					data-test="parked-orders-view-all"
					@click="$emit('view-all')"
				>
					{{ __("View all") }}
				</v-btn>
			</div>
		</div>

		<div class="parked-orders-rail__list">
			<button
				v-for="draft in parkedOrders"
				:key="draft.name"
				type="button"
				class="parked-orders-rail__card"
				:data-test="`parked-order-card-${draft.name}`"
				@click="$emit('resume', draft)"
			>
				<div class="parked-orders-rail__card-top">
					<strong>{{ draft.customer_name || __("Walk-in Customer") }}</strong>
					<span class="parked-orders-rail__amount">
						{{ currencySymbol(draft.currency) }}{{ formatCurrency(draft.grand_total) }}
					</span>
				</div>
				<div class="parked-orders-rail__meta">
					<span>{{ draft.name }}</span>
					<span>{{ draft.posting_date }}</span>
					<span>{{ draft.posting_time?.split(".")[0] || "" }}</span>
				</div>
			</button>
		</div>
	</section>
</template>

<script setup>
defineProps({
	parkedOrders: {
		type: Array,
		default: () => [],
	},
	formatCurrency: {
		type: Function,
		required: true,
	},
	currencySymbol: {
		type: Function,
		required: true,
	},
});

defineEmits(["resume", "view-all"]);

const __ = window.__;
</script>

<style scoped>
.parked-orders-rail {
	display: flex;
	flex-direction: column;
	gap: var(--pos-space-2);
	padding: 12px;
	border-radius: 18px;
	background:
		linear-gradient(135deg, rgba(var(--v-theme-primary), 0.08), rgba(var(--v-theme-info), 0.06)),
		var(--pos-surface-muted);
	border: 1px solid rgba(var(--v-theme-primary), 0.14);
}

.parked-orders-rail__header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.parked-orders-rail__eyebrow {
	margin: 0 0 2px;
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.parked-orders-rail__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.parked-orders-rail__actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.parked-orders-rail__count {
	min-width: 28px;
	height: 28px;
	padding: 0 8px;
	border-radius: 999px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	background: rgba(var(--v-theme-primary), 0.14);
	color: rgb(var(--v-theme-primary));
	font-weight: 700;
}

.parked-orders-rail__list {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 10px;
}

.parked-orders-rail__card {
	border: 1px solid rgba(var(--v-theme-primary), 0.14);
	border-radius: 16px;
	background: rgba(var(--v-theme-surface), 0.92);
	padding: 12px;
	text-align: left;
	display: flex;
	flex-direction: column;
	gap: 8px;
	cursor: pointer;
	color: var(--pos-text-primary);
	transition:
		transform 0.18s ease,
		box-shadow 0.18s ease,
		border-color 0.18s ease;
}

.parked-orders-rail__card:hover,
.parked-orders-rail__card:focus-visible {
	transform: translateY(-1px);
	box-shadow: 0 10px 18px rgba(15, 23, 42, 0.12);
	border-color: rgba(var(--v-theme-primary), 0.34);
}

.parked-orders-rail__card-top {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
}

.parked-orders-rail__amount {
	font-weight: 700;
	white-space: nowrap;
}

.parked-orders-rail__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 10px;
	font-size: 0.8rem;
	color: var(--pos-text-secondary);
}

@media (max-width: 768px) {
	.parked-orders-rail {
		padding: 10px;
	}

	.parked-orders-rail__list {
		grid-template-columns: 1fr;
	}
}
</style>
