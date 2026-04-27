<template>
	<section class="drafts-list">
		<div class="drafts-list__header">
			<div>
				<p class="drafts-list__eyebrow">{{ eyebrow || __("Ready to resume") }}</p>
				<h4 class="drafts-list__title">{{ title || __("Drafts") }}</h4>
				<p v-if="subtitle" class="drafts-list__subtitle">{{ subtitle }}</p>
			</div>
			<div class="drafts-list__actions">
				<span class="drafts-list__count">{{ parkedOrders.length }}</span>
				<v-btn
					v-if="showManageAll"
					size="small"
					variant="text"
					color="primary"
					data-test="drafts-manage-all"
					@click="$emit('manage-all')"
				>
					{{ __("Manage all") }}
				</v-btn>
			</div>
		</div>

		<div v-if="parkedOrders.length" class="drafts-list__cards">
			<button
				v-for="draft in parkedOrders"
				:key="draft.name"
				type="button"
				class="drafts-list__card"
				:data-test="`draft-list-card-${draft.name}`"
				@click="$emit('resume', draft)"
			>
				<div class="drafts-list__card-top">
					<strong>{{ draft.customer_name || __("Walk-in Customer") }}</strong>
					<span class="drafts-list__amount">
						{{ currencySymbol(draft.currency) }}{{ formatCurrency(draft.grand_total) }}
					</span>
				</div>
				<div class="drafts-list__meta">
					<span>{{ draft.name }}</span>
					<span>{{ draft.posting_date }}</span>
					<span>{{ draft.posting_time?.split(".")[0] || "" }}</span>
				</div>
			</button>
		</div>
		<div v-else class="drafts-list__empty">
			<strong>{{ emptyTitle || __("No records found") }}</strong>
			<span>{{ emptySubtitle || __("Try another source or refresh the list.") }}</span>
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
	showManageAll: {
		type: Boolean,
		default: false,
	},
	title: {
		type: String,
		default: "",
	},
	eyebrow: {
		type: String,
		default: "",
	},
	subtitle: {
		type: String,
		default: "",
	},
	emptyTitle: {
		type: String,
		default: "",
	},
	emptySubtitle: {
		type: String,
		default: "",
	},
});

defineEmits(["resume", "manage-all"]);

const __ = window.__;
</script>

<style scoped>
.drafts-list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.drafts-list__header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.drafts-list__eyebrow {
	margin: 0 0 2px;
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.drafts-list__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.drafts-list__subtitle {
	margin: 4px 0 0;
	font-size: 0.82rem;
	color: var(--pos-text-secondary);
}

.drafts-list__actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.drafts-list__count {
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

.drafts-list__cards {
	display: flex;
	flex-direction: column;
	gap: 10px;
	max-height: calc(100vh - 180px);
	overflow: auto;
	padding-right: 2px;
}

.drafts-list__empty {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 18px 16px;
	border-radius: 18px;
	border: 1px dashed rgba(var(--v-theme-primary), 0.24);
	background: rgba(var(--v-theme-surface), 0.72);
	color: var(--pos-text-secondary);
}

.drafts-list__empty strong {
	color: var(--pos-text-primary);
}

.drafts-list__card {
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

.drafts-list__card:hover,
.drafts-list__card:focus-visible {
	transform: translateY(-1px);
	box-shadow: 0 10px 18px rgba(15, 23, 42, 0.12);
	border-color: rgba(var(--v-theme-primary), 0.34);
}

.drafts-list__card-top {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
}

.drafts-list__amount {
	font-weight: 700;
	white-space: nowrap;
}

.drafts-list__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 10px;
	font-size: 0.8rem;
	color: var(--pos-text-secondary);
}
</style>
