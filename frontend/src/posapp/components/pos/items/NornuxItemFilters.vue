<template>
	<div class="nornux-filters" data-testid="nornux-item-filters">
		<div class="nornux-filters__chips" role="tablist" :aria-label="__('Item groups')">
			<button
				v-for="group in chipGroups"
				:key="group.value"
				type="button"
				role="tab"
				class="nornux-chip"
				:class="{ 'nornux-chip--active': group.value === modelValue }"
				:aria-selected="group.value === modelValue ? 'true' : 'false'"
				:data-testid="`nornux-group-chip-${group.value}`"
				@click="$emit('update:modelValue', group.value)"
			>
				<span v-if="group.dot" class="nornux-chip__dot" :style="{ background: group.dot }" />
				<span class="nornux-chip__label">{{ group.label }}</span>
				<span v-if="group.count !== null" class="nornux-chip__count">{{ group.count }}</span>
			</button>
		</div>
		<div class="nornux-filters__tools">
			<span
				v-if="showPriceList && activePriceList"
				class="nornux-pill"
				:title="__('Active price list')"
				data-testid="nornux-price-list"
			>
				<v-icon icon="mdi-tag-outline" size="18" />
				{{ activePriceList }}
			</span>
			<div class="nornux-view-toggle" role="group" :aria-label="__('Item view')">
				<button
					type="button"
					class="nornux-view-toggle__btn"
					:class="{ 'nornux-view-toggle__btn--active': itemsView === 'card' }"
					:aria-pressed="itemsView === 'card' ? 'true' : 'false'"
					:title="__('Grid view')"
					@click="$emit('update:itemsView', 'card')"
				>
					<v-icon icon="mdi-view-grid-outline" size="20" />
				</button>
				<button
					type="button"
					class="nornux-view-toggle__btn"
					:class="{ 'nornux-view-toggle__btn--active': itemsView === 'list' }"
					:aria-pressed="itemsView === 'list' ? 'true' : 'false'"
					:title="__('List view')"
					@click="$emit('update:itemsView', 'list')"
				>
					<v-icon icon="mdi-format-list-bulleted" size="20" />
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
	/** Selected item group ("ALL" for everything). */
	modelValue: { type: String, default: "ALL" },
	/** Item group names as provided by the items store (may include "ALL"). */
	itemsGroup: { type: Array, default: () => [] },
	/** item_group -> number of loaded catalog items. */
	groupCounts: { type: Object, default: () => ({}) },
	totalCount: { type: Number, default: 0 },
	itemsView: { type: String, default: "card" },
	activePriceList: { type: String, default: "" },
	showPriceList: { type: Boolean, default: true },
});

defineEmits(["update:modelValue", "update:itemsView"]);

const __ = (text: string) => (typeof window !== "undefined" && (window as any).__ ? (window as any).__(text) : text);

// Brand-friendly fallback dots for groups that are not colour names.
const FALLBACK_DOTS = ["#F78F1E", "#15181C", "#1E9E5A", "#2F6FDB", "#D64545", "#8A5CF6", "#0E9AA7"];

const resolveDot = (name: string, index: number) => {
	const candidate = name.trim().toLowerCase();
	if (
		candidate &&
		/^[a-z]+$/.test(candidate) &&
		typeof CSS !== "undefined" &&
		typeof CSS.supports === "function" &&
		CSS.supports("color", candidate)
	) {
		return candidate;
	}
	return FALLBACK_DOTS[index % FALLBACK_DOTS.length];
};

const chipGroups = computed(() => {
	const counts = (props.groupCounts || {}) as Record<string, number>;
	const names = (props.itemsGroup as unknown[])
		.map((group) => String(group || "").trim())
		.filter((group) => group && group.toUpperCase() !== "ALL");
	const unique = Array.from(new Set(names));
	return [
		{ value: "ALL", label: __("All items"), count: props.totalCount, dot: "" },
		...unique.map((name, index) => ({
			value: name,
			label: __(name),
			count: Object.prototype.hasOwnProperty.call(counts, name) ? counts[name] : null,
			dot: resolveDot(name, index),
		})),
	];
});
</script>
