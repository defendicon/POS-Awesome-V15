<template>
	<v-menu
		location="bottom end"
		offset="8"
		open-on-hover
		:open-on-click="true"
		:open-on-focus="true"
		:open-delay="80"
		:close-delay="160"
		:close-on-content-click="true"
		content-class="item-rate-info-menu-content"
	>
		<template #activator="{ props: activatorProps }">
			<v-btn
				v-bind="activatorProps"
				icon
				variant="text"
				size="x-small"
				class="item-rate-info-trigger"
				:aria-label="__('Show rate info')"
				@click.stop
			>
				<v-icon size="16">mdi-information-outline</v-icon>
			</v-btn>
		</template>

		<div class="item-rate-info-menu" @click.stop>
			<div
				v-for="row in rows"
				:key="row.key"
				class="item-rate-info-row"
			>
				<div class="item-rate-info-row__label">{{ row.label }}</div>
				<div class="item-rate-info-row__value" :class="{ 'is-muted': !row.info.available }">
					<template v-if="row.info.available">
						{{ formatValue(row.info) }}
					</template>
					<template v-else>
						{{ __("Not available") }}
					</template>
				</div>
				<div
					v-if="row.info.available && (row.info.source || row.info.date || row.info.meta)"
					class="item-rate-info-row__meta"
				>
					{{ formatMeta(row.info) }}
				</div>
			</div>
		</div>
	</v-menu>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ItemRateInfoEntry, ItemRateInfoPayload } from "../../../composables/pos/items/useItemRateInfo";

const __ = (window as any).__;

const props = defineProps({
	rateInfo: {
		type: Object as () => ItemRateInfoPayload,
		required: true,
	},
	currencySymbol: { type: Function, required: true },
	formatCurrency: { type: Function, required: true },
	ratePrecision: { type: Function, required: true },
});

const rows = computed(() =>
	(props.rateInfo.entries || []).map((info) => ({
		key: info.key,
		label: __(info.rowLabel || ""),
		info,
	})),
);

const formatValue = (info: ItemRateInfoEntry) => {
	if (!info.available || info.rate == null) {
		return __("Not available");
	}
	const currency = info.currency || "";
	const precision = props.ratePrecision(info.rate || 0);
	const formatted = props.formatCurrency(info.rate, currency, precision);
	const symbol = currency ? props.currencySymbol(currency) : "";
	const uom = info.uom ? ` / ${info.uom}` : "";
	return `${symbol} ${formatted}${uom}`.trim();
};

const formatMeta = (info: ItemRateInfoEntry) => {
	return [info.source, info.meta, info.date].filter(Boolean).join(" | ");
};
</script>

<style scoped>
.item-rate-info-trigger {
	min-width: 24px;
	width: 24px;
	height: 24px;
	color: rgba(var(--v-theme-on-surface), 0.62);
}

.item-rate-info-menu {
	min-width: 220px;
	max-width: min(280px, calc(100vw - 24px));
	padding: 10px 12px;
	background: var(--pos-surface-raised);
	border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
	border-radius: 12px;
	box-shadow: 0 16px 32px rgba(15, 23, 42, 0.14);
}

.item-rate-info-row + .item-rate-info-row {
	margin-top: 10px;
	padding-top: 10px;
	border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.item-rate-info-row__label {
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--pos-text-secondary);
}

.item-rate-info-row__value {
	margin-top: 2px;
	font-size: 0.84rem;
	font-weight: 600;
	color: var(--pos-text-primary);
}

.item-rate-info-row__value.is-muted,
.item-rate-info-row__meta {
	color: var(--pos-text-secondary);
}

.item-rate-info-row__meta {
	margin-top: 2px;
	font-size: 0.72rem;
	line-height: 1.35;
}
</style>
