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
		<button
			v-if="widthsResettable"
			type="button"
			data-column-order-control
			class="pos-column-header__reset"
			:aria-label="__('Reset column widths')"
			:title="__('Reset column widths')"
			@click.stop="emit('reset-widths')"
			@keydown.stop
		>
			<v-icon icon="mdi-arrow-expand-horizontal" size="14" />
		</button>
		<ColumnResizeHandle :column-key="column.key" :label="column.title" :width="column.width" />
		<button
			v-if="resettable"
			data-column-order-control
			type="button"
			class="pos-column-header__reset"
			:aria-label="__('Reset column order')"
			:title="__('Reset column order')"
			@click.stop="emit('reset-order')"
			@keydown.stop
		>
			<v-icon icon="mdi-restore" size="14" />
		</button>
	</div>
</template>
<script setup lang="ts">
import ColumnResizeHandle from "./ColumnResizeHandle.vue";
defineProps<{
	column: any;
	getSortIcon?: (column: any) => any;
	resettable?: boolean;
	widthsResettable?: boolean;
}>();
const emit = defineEmits<{ "reset-order": []; "reset-widths": [] }>();
const __ = (text: string) => (window.__ ? window.__(text) : text);
</script>
<style>
.pos-column-header {
	gap: 3px;
	min-width: 0;
}
.pos-column-header__grip,
.pos-column-header__reset {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	min-width: 20px;
	height: 26px;
	border-radius: 4px;
	color: inherit;
	opacity: 0.55;
}
.pos-column-header__grip {
	cursor: grab;
	touch-action: none;
}
.pos-column-header__grip:hover,
.pos-column-header__grip:focus-visible,
.pos-column-header__reset:hover,
.pos-column-header__reset:focus-visible {
	opacity: 1;
	background: rgba(var(--v-theme-primary), 0.15);
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
