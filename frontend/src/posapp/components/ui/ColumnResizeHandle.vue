<template>
	<button
		type="button"
		class="pos-column-width-handle"
		:data-column-width-key="columnKey"
		:data-column-width-label="label || columnKey"
		role="separator"
		aria-orientation="vertical"
		:aria-valuemin="minimumColumnWidth(columnKey)"
		:aria-valuemax="1600"
		:aria-valuenow="typeof width === 'number' ? width : undefined"
		:aria-label="__('Resize column') + ': ' + (label || columnKey)"
		:title="__('Drag to resize. Double-click or Home resets this column; arrow keys adjust width.')"
		:draggable="false"
		@click.stop
		@keydown.enter.stop
		@keydown.space.stop
		@dragstart.stop.prevent
	/>
</template>
<script setup lang="ts">
import { minimumColumnWidth } from "../../composables/core/useColumnWidths";
defineProps<{ columnKey: string; label?: string; width?: string | number }>();
const __ = (text: string) => (window.__ ? window.__(text) : text);
</script>
<style>
.pos-column-widths th {
	position: relative;
}
.pos-column-width-handle {
	visibility: hidden;
	position: absolute;
	inset-inline-end: 0;
	top: 0;
	height: 100%;
	width: 8px;
	z-index: 5;
	cursor: col-resize;
	touch-action: none;
	border-inline-end: 2px solid transparent;
}
.pos-customization-editing .pos-column-width-handle {
	visibility: visible;
	border-inline-end-color: rgba(var(--v-theme-primary), 0.2);
}
.pos-column-width-handle:hover,
.pos-column-width-handle:focus-visible {
	border-inline-end-color: rgb(var(--v-theme-primary));
	background: rgba(var(--v-theme-primary), 0.12);
	outline: none;
}
.pos-column-widths--resizing {
	user-select: none;
	cursor: col-resize;
}
.pos-column-widths.pos-column-widths--custom table {
	table-layout: fixed !important;
	width: var(--pos-custom-table-width) !important;
	min-width: var(--pos-custom-table-width) !important;
	max-width: var(--pos-custom-table-width) !important;
}
.pos-column-widths--custom :is(th, td) {
	overflow: hidden;
}
.pos-column-widths--custom .pos-column-header > span {
	min-width: 24px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
