<template>
	<button
		type="button"
		class="pos-row-reorder-handle"
		:data-row-reorder-key="rowKey"
		:aria-label="__('Move row') + ': ' + label"
		:title="__('Drag to reorder; Alt + Up / Down also moves this row')"
		:draggable="false"
		@click.stop
		@keydown.enter.stop
		@keydown.space.stop
		@dragstart.stop.prevent
	>
		<v-icon icon="mdi-drag" size="18" />
	</button>
</template>
<script setup lang="ts">
defineProps<{ rowKey: string; label: string }>();
const __ = (text: string) => (window.__ ? window.__(text) : text);
</script>
<style>
.pos-row-reorder-handle {
	display: inline-flex;
	flex: 0 0 24px;
	width: 24px;
	height: 28px;
	align-items: center;
	justify-content: center;
	vertical-align: middle;
	border-radius: 5px;
	cursor: grab;
	touch-action: none;
	color: rgb(var(--v-theme-primary));
	opacity: 0.6;
}
.pos-row-reorder-handle:hover,
.pos-row-reorder-handle:focus-visible {
	opacity: 1;
	background: rgba(var(--v-theme-primary), 0.1);
}
.pos-row-reorder-source {
	opacity: 0.45;
}
.pos-row-reorder-before > td {
	box-shadow: inset 0 3px 0 rgb(var(--v-theme-primary)) !important;
}
.pos-row-reorder-after > td {
	box-shadow: inset 0 -3px 0 rgb(var(--v-theme-primary)) !important;
}
.pos-row-reorder-before:not(tr) {
	outline: 2px solid rgb(var(--v-theme-primary));
}
.pos-row-reorder-after:not(tr) {
	outline: 2px solid rgb(var(--v-theme-primary));
}
.pos-row-reorder-ghost {
	position: fixed;
	pointer-events: none;
	z-index: 10000;
	padding: 7px 12px;
	border-radius: 7px;
	color: rgb(var(--v-theme-on-primary));
	background: rgb(var(--v-theme-primary));
	box-shadow: 0 5px 18px rgba(15, 23, 42, 0.2);
	font-size: 13px;
}
</style>
