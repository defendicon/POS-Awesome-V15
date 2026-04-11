<template>
	<section v-if="parkedOrders.length" class="drafts-rail" :class="`drafts-rail--${layout}`">
		<div class="drafts-rail__header">
			<div>
				<p class="drafts-rail__eyebrow">{{ __("Ready to resume") }}</p>
				<h4 class="drafts-rail__title">{{ __("Drafts") }}</h4>
			</div>
			<div class="drafts-rail__actions">
				<span class="drafts-rail__count">{{ totalCount || parkedOrders.length }}</span>
				<v-btn
					size="small"
					variant="text"
					color="primary"
					data-test="parked-orders-view-all"
					@click="$emit('view-all')"
				>
					{{ viewAllLabel || (layout === "desktop" ? __("Open drawer") : __("View all")) }}
				</v-btn>
			</div>
		</div>

		<div v-if="layout === 'desktop'" class="drafts-rail__desktop">
			<button
				v-for="draft in parkedOrders"
				:key="draft.name"
				type="button"
				class="drafts-rail__summary-card"
				:data-test="`draft-card-${draft.name}`"
				@click="$emit('resume', draft)"
			>
				<div class="drafts-rail__card-top">
					<strong>{{ draft.customer_name || __("Walk-in Customer") }}</strong>
					<span class="drafts-rail__amount">
						{{ currencySymbol(draft.currency) }}{{ formatCurrency(draft.grand_total) }}
					</span>
				</div>
				<div class="drafts-rail__meta">
					<span>{{ draft.name }}</span>
					<span>{{ formatDraftAge(draft) }}</span>
					<span class="drafts-rail__status">{{ draft.status || __("Draft") }}</span>
				</div>
			</button>
		</div>

		<div v-else class="drafts-rail__mobile">
			<div class="drafts-rail__strip">
				<button
					v-for="draft in parkedOrders"
					:key="draft.name"
					type="button"
					class="drafts-rail__chip-card"
					:data-test="`draft-card-${draft.name}`"
					@click="$emit('resume', draft)"
				>
					<strong>{{ draft.customer_name || __("Walk-in Customer") }}</strong>
					<span class="drafts-rail__chip-meta">
						{{ currencySymbol(draft.currency) }}{{ formatCurrency(draft.grand_total) }}
					</span>
					<span class="drafts-rail__chip-meta">
						{{ formatDraftAge(draft) }} . {{ draft.status || __("Draft") }}
					</span>
				</button>
			</div>
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
	layout: {
		type: String,
		default: "mobile",
	},
	totalCount: {
		type: Number,
		default: 0,
	},
	viewAllLabel: {
		type: String,
		default: "",
	},
});

defineEmits(["resume", "view-all"]);

const __ = window.__;

const toDraftDate = (draft) => {
	const datePart = String(draft?.posting_date || "").trim();
	const timePart = String(draft?.posting_time || "")
		.trim()
		.replace(/\.\d+$/, "");
	if (!datePart) return null;
	const isoValue = timePart ? `${datePart}T${timePart}` : `${datePart}T00:00:00`;
	const parsed = new Date(isoValue);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDraftAge = (draft) => {
	const parsed = toDraftDate(draft);
	if (!parsed) {
		return draft?.posting_time?.split?.(".")?.[0] || "";
	}

	const diffMs = Date.now() - parsed.getTime();
	if (!Number.isFinite(diffMs) || diffMs < 0) {
		return draft?.posting_time?.split?.(".")?.[0] || "";
	}

	const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
	if (diffMinutes < 1) return __("Just now");
	if (diffMinutes < 60) return __("{0}m ago", [diffMinutes]);

	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours < 24) return __("{0}h ago", [diffHours]);

	const diffDays = Math.round(diffHours / 24);
	return __("{0}d ago", [diffDays]);
};
</script>

<style scoped>
.drafts-rail {
	display: flex;
	flex-direction: column;
	gap: var(--pos-space-2);
	padding: 12px;
	border-radius: 18px;
	background:
		linear-gradient(135deg, rgba(var(--v-theme-primary), 0.08), rgba(var(--v-theme-info), 0.06)),
		var(--pos-surface-muted);
	border: 1px solid rgba(var(--v-theme-primary), 0.14);
	min-width: 0;
}

.drafts-rail__header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.drafts-rail__eyebrow {
	margin: 0 0 2px;
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}

.drafts-rail__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	color: var(--pos-text-primary);
}

.drafts-rail__actions {
	display: flex;
	align-items: center;
	gap: 8px;
}

.drafts-rail__count {
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

.drafts-rail__desktop,
.drafts-rail__mobile {
	min-width: 0;
}

.drafts-rail__summary-card,
.drafts-rail__chip-card {
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
	width: 100%;
}

.drafts-rail__summary-card:hover,
.drafts-rail__summary-card:focus-visible,
.drafts-rail__chip-card:hover,
.drafts-rail__chip-card:focus-visible {
	transform: translateY(-1px);
	box-shadow: 0 10px 18px rgba(15, 23, 42, 0.12);
	border-color: rgba(var(--v-theme-primary), 0.34);
}

.drafts-rail__card-top {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
}

.drafts-rail__amount {
	font-weight: 700;
	white-space: nowrap;
}

.drafts-rail__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 10px;
	font-size: 0.8rem;
	color: var(--pos-text-secondary);
}

.drafts-rail__status {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	border-radius: 999px;
	background: rgba(var(--v-theme-primary), 0.1);
	color: rgb(var(--v-theme-primary));
	font-size: 0.72rem;
	font-weight: 700;
}

.drafts-rail__strip {
	display: flex;
	gap: 10px;
	overflow-x: auto;
	padding-bottom: 4px;
	scrollbar-width: thin;
}

.drafts-rail__chip-card {
	min-width: 180px;
	max-width: 220px;
}

.drafts-rail__chip-meta {
	font-size: 0.8rem;
	color: var(--pos-text-secondary);
}

@media (max-width: 768px) {
	.drafts-rail {
		padding: 10px;
	}
}
</style>
