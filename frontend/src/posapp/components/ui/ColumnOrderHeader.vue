<template>
	<div class="v-data-table-header__content pos-column-header">
		<button
			type="button"
			class="pos-column-header__grip"
			:data-column-reorder-key="column.key"
			:aria-label="__('Move column') + ': ' + column.title"
			:title="__('Drag left or right; Alt + Left / Right also moves this column')"
			:draggable="false"
			@click.stop
			@keydown.enter.stop
			@keydown.space.stop
			@dragstart.stop.prevent
		>
			<v-icon icon="mdi-drag-vertical" size="16" />
		</button>
		<span :title="column.title">{{ column.title }}</span>
		<v-icon
			v-if="column.sortable && getSortIcon"
			class="v-data-table-header__sort-icon"
			:icon="getSortIcon(column)"
			size="16"
		/>
		<ColumnResizeHandle :column-key="column.key" :label="column.title" :width="column.width" />
	</div>
</template>
<script setup lang="ts">
import ColumnResizeHandle from "./ColumnResizeHandle.vue";
defineProps<{
	column: any;
	getSortIcon?: (column: any) => any;
}>();
const __ = (text: string) => (window.__ ? window.__(text) : text);
</script>
<style>
.pos-column-header {
	gap: 3px;
	min-width: 0;
}
.pos-column-header__grip {
	display: none;
	align-items: center;
	justify-content: center;
	width: 20px;
	min-width: 20px;
	height: 26px;
	border-radius: 4px;
	color: var(--pos-text-secondary, #62747d);
	cursor: grab;
	touch-action: none;
}
.pos-customization-editing .pos-column-header__grip {
	display: inline-flex;
}
.pos-column-header__grip:hover,
.pos-column-header__grip:focus-visible {
	background: rgba(var(--v-theme-primary), 0.08);
	color: rgb(var(--v-theme-primary));
}
.pos-column-reorder-source {
	opacity: 0.45;
}
.pos-column-reorder-before {
	box-shadow: inset var(--pos-column-edge, 3px) 0 0 rgb(var(--v-theme-primary)) !important;
}
.pos-column-reorder-after {
	box-shadow: inset calc(-1 * var(--pos-column-edge, 3px)) 0 0 rgb(var(--v-theme-primary)) !important;
}
</style>
