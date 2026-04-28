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
		@update:model-value="handleMenuToggle"
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
			<div class="item-rate-info-menu__header">
				<v-icon size="15" class="item-rate-info-menu__header-icon">
					mdi-chart-line
				</v-icon>
				<span>{{ __("Rate Info") }}</span>
			</div>
			<div
				v-for="row in rows"
				:key="row.key"
				class="item-rate-info-row"
				:class="{ 'is-loading': row.info.loading }"
			>
				<div class="item-rate-info-row__label">{{ row.label }}</div>
				<div class="item-rate-info-row__value" :class="{ 'is-muted': !row.info.available }">
					<template v-if="row.info.loading">
						<span class="item-rate-info-loading">
							<v-progress-circular
								indeterminate
								size="14"
								width="2"
								color="primary"
							/>
							{{ __("Loading...") }}
						</span>
					</template>
					<template v-else-if="row.info.available">
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

const emit = defineEmits(["open"]);

const handleMenuToggle = (isOpen: boolean) => {
	if (isOpen) {
		emit("open");
	}
};

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
	min-width: 250px;
	max-width: min(320px, calc(100vw - 24px));
	padding: 10px;
	background: var(--pos-surface-raised);
	border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
	border-radius: 10px;
	box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
	backdrop-filter: blur(10px);
}

.item-rate-info-menu__header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 2px 2px 9px;
	margin-bottom: 2px;
	font-size: 0.76rem;
	font-weight: 800;
	color: var(--pos-text-primary);
	border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.item-rate-info-menu__header-icon {
	color: rgb(var(--v-theme-primary));
}

.item-rate-info-row + .item-rate-info-row {
	margin-top: 8px;
	padding-top: 8px;
	border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.item-rate-info-row {
	padding: 6px 4px 2px;
	border-radius: 8px;
}

.item-rate-info-row.is-loading {
	background: rgba(var(--v-theme-primary), 0.06);
}

.item-rate-info-row__label {
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--pos-text-secondary);
}

.item-rate-info-row__value {
	margin-top: 4px;
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

.item-rate-info-loading {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	color: var(--pos-text-secondary);
}
</style>
