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
		:aria-valuetext="typeof width === 'number' ? width + ' px' : undefined"
		:aria-label="__('Resize column') + ': ' + (label || columnKey)"
		:title="__('Drag to resize. Double-click or Home resets this column; arrow keys adjust width.')"
		:draggable="false"
		@click.stop
		@keydown.enter.stop
		@keydown.space.stop
		@dragstart.stop.prevent
	>
		<span v-if="typeof width === 'number'" class="pos-column-width-handle__value" aria-hidden="true"
			>{{ Math.round(width) }} px</span
		>
	</button>
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

.pos-column-width-handle {
	width: 12px;
	transition:
		background-color 150ms ease,
		border-color 150ms ease;
}
.pos-column-width-handle__value {
	opacity: 0;
	pointer-events: none;
	position: absolute;
	top: 2px;
	inset-inline-end: 12px;
	padding: 3px 6px;
	border-radius: 5px;
	white-space: nowrap;
	font-size: 10px;
	font-variant-numeric: tabular-nums;
	background: rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-on-primary));
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	transition: opacity 150ms ease;
}
.pos-column-width-handle:hover .pos-column-width-handle__value,
.pos-column-width-handle:focus-visible .pos-column-width-handle__value,
.pos-column-width-active .pos-column-width-handle__value {
	opacity: 1;
}
.pos-column-width-active {
	background: rgba(var(--v-theme-primary), 0.08) !important;
	box-shadow: inset -2px 0 rgb(var(--v-theme-primary));
}
.pos-customization-editing th {
	transition:
		background-color 160ms ease,
		box-shadow 160ms ease;
}
@media (prefers-reduced-motion: reduce) {
	.pos-column-width-handle,
	.pos-column-width-handle__value,
	.pos-customization-editing th {
		transition: none;
	}
}
</style>
