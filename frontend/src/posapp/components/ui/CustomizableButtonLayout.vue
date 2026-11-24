<template>
	<div>
		<p v-if="storageError" role="status">{{ __(storageError) }}</p>
		<div
			ref="grid"
			class="workspace-buttons"
			:class="{
				'workspace-buttons--counter': counter,
				'workspace-buttons--custom': custom,
				'workspace-buttons--editing': editing,
				'workspace-buttons--resizing': resize !== null,
			}"
			@click.capture="guardPreview"
		>
			<div
				v-for="entry in visible"
				:key="entry.key"
				:data-workspace-button="entry.key"
				class="workspace-buttons__item"
				:class="{ 'workspace-buttons__item--target': drag?.target === entry.key }"
				:style="{
					gridColumn: span(entry),
					flexBasis: custom ? layoutBasis(sizeFor(entry)) : undefined,
				}"
			>
				<button
					v-if="editing"
					type="button"
					class="workspace-buttons__grip"
					:aria-label="__('Drag button') + ': ' + __(label(entry.key))"
					@pointerdown="beginDrag($event, entry.key)"
					@keydown.up.prevent="move(entry.key, -1)"
					@keydown.down.prevent="move(entry.key, 1)"
				>
					<v-icon icon="mdi-drag" size="18" />
				</button>
				<span v-if="editing" class="workspace-buttons__size">{{ sizeLabel(entry) }}</span>
				<slot :name="entry.key" />
				<button
					v-if="editing"
					type="button"
					class="workspace-buttons__resize"
					role="slider"
					:aria-label="__('Resize button') + ': ' + __(label(entry.key))"
					:aria-valuenow="Number(sizeFor(entry).toFixed(1))"
					:aria-valuemin="10"
					:aria-valuemax="100"
					:aria-valuetext="sizeLabel(entry)"
					@pointerdown="beginResize($event, entry.key)"
					@keydown.left.prevent="resizeWithKey(entry.key, -1, $event)"
					@keydown.right.prevent="resizeWithKey(entry.key, 1, $event)"
				>
					<v-icon icon="mdi-drag-vertical" size="16" />
				</button>
			</div>
		</div>
		<span class="workspace-buttons__announcement" role="status" aria-live="polite">{{
			announcement
		}}</span>
	</div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { layoutBasis, layoutPixels, resizedLayoutPercent } from "../../utils/continuousLayout";
import { useLayoutSurface } from "../../composables/core/useLayoutSurface";
import { registerCustomization, workspaceCustomization } from "../../composables/core/workspaceCustomization";
import {
	normalizeButtonLayout,
	repositionButton,
	type ButtonDefinition,
	type ButtonPreference,
} from "../../utils/buttonLayout";

const props = defineProps<{
	user: string;
	profile: string;
	defaults: ButtonDefinition[];
	enabled: string[];
	counter?: boolean;
	view?: "classic" | "counter-grid" | "retail";
}>();
const __ = (text: string) => (window.__ ? window.__(text) : text);
const grid = ref<HTMLElement | null>(null);
const storageError = ref("");
const announcement = ref("");
const preferences = ref(normalizeButtonLayout(null, props.defaults));
const scope = computed(() =>
	props.user && props.profile
		? `posawesome:invoice-buttons:v1:${JSON.stringify([props.user, props.profile, props.view || (props.counter ? "counter-grid" : "classic")])}`
		: "",
);
const editing = computed(() => workspaceCustomization.isEditing("buttons"));
const visible = computed(() => preferences.value.filter((entry) => props.enabled.includes(entry.key)));
const custom = computed(() => preferences.value.some((entry) => entry.width !== "auto"));
const label = (key: string) => props.defaults.find((item) => item.key === key)?.label || key;
const surface = useLayoutSurface(
	grid,
	() => visible.value.map((entry) => entry.key),
	"[data-workspace-button]",
);
function sizeFor(entry: ButtonPreference): number {
	if (typeof entry.width === "number") return entry.width;
	if (entry.width === "single") return 100;
	if (entry.width === "double") return 50;
	if (!custom.value && surface.width.value) {
		const item = Array.from(
			grid.value?.querySelectorAll<HTMLElement>("[data-workspace-button]") || [],
		).find((element) => element.dataset.workspaceButton === entry.key);
		const measured = item?.getBoundingClientRect().width;
		if (measured)
			return ((measured + surface.gap.value) / (surface.width.value + surface.gap.value)) * 100;
	}
	return props.defaults.find((item) => item.key === entry.key)?.full ? 100 : 50;
}
function sizeLabel(entry: ButtonPreference) {
	const percent = sizeFor(entry);
	return surface.width.value
		? `${Math.round(layoutPixels(percent, surface.width.value, surface.gap.value))} px · ${Number(percent.toFixed(1))}%`
		: `${Number(percent.toFixed(1))}%`;
}
function span(entry: ButtonPreference) {
	if (entry.width === "single") return "1 / -1";
	if (entry.width === "double") return "span 1";
	return props.defaults.find((item) => item.key === entry.key)?.full
		? props.counter && props.view !== "retail" && !custom.value
			? "span 2"
			: "1 / -1"
		: undefined;
}

function move(key: string, delta: number) {
	const index = visible.value.findIndex((entry) => entry.key === key);
	const target = visible.value[index + delta];
	if (target) preferences.value = repositionButton(preferences.value, key, target.key, delta > 0);
}
function setWidth(key: string, width: string | number) {
	const entry = preferences.value.find((item) => item.key === key);
	if (!entry) return;
	const numeric = Number(width);
	if (width === "single" || width === "double" || width === "auto") entry.width = width;
	else if (Number.isFinite(numeric)) entry.width = Math.max(10, Math.min(100, numeric));
}
const drag = ref<{
	key: string;
	pointer: number;
	x: number;
	y: number;
	moved: boolean;
	target: string;
	after: boolean;
} | null>(null);
const resize = ref<{
	key: string;
	pointer: number;
	x: number;
	start: number;
	width: number;
	gap: number;
	rtl: boolean;
	original: ButtonPreference[];
} | null>(null);
function beginResize(event: PointerEvent, key: string) {
	if (!editing.value || event.button !== 0 || resize.value || drag.value) return;
	event.preventDefault();
	(event.currentTarget as HTMLElement).focus();
	surface.measure();
	const entry = visible.value.find((item) => item.key === key);
	if (!entry) return;
	const original = preferences.value.map((item) => ({ ...item }));
	const start = sizeFor(entry);
	// Freeze the current auto-fit geometry before switching the surface to fluid flex.
	const measured = new Map(visible.value.map((item) => [item.key, sizeFor(item)]));
	for (const item of preferences.value) {
		if (measured.has(item.key)) item.width = Math.max(10, Math.min(100, measured.get(item.key)!));
	}
	resize.value = {
		key,
		pointer: event.pointerId,
		x: event.clientX,
		start,
		width: surface.width.value,
		gap: surface.gap.value,
		rtl: !!grid.value && getComputedStyle(grid.value).direction === "rtl",
		original,
	};
	window.addEventListener("pointermove", resizeMove, { passive: false });
	window.addEventListener("pointerup", resizeEnd);
	window.addEventListener("pointercancel", cancelResize);
	window.addEventListener("blur", cancelResize);
	window.addEventListener("keydown", escapeResize);
}
function resizeMove(event: PointerEvent) {
	const current = resize.value;
	if (!current || event.pointerId !== current.pointer) return;
	event.preventDefault();
	setWidth(
		current.key,
		resizedLayoutPercent(
			current.start,
			(event.clientX - current.x) * (current.rtl ? -1 : 1),
			current.width,
			current.gap,
			10,
		),
	);
}
function detachResize() {
	resize.value = null;
	window.removeEventListener("pointermove", resizeMove);
	window.removeEventListener("pointerup", resizeEnd);
	window.removeEventListener("pointercancel", cancelResize);
	window.removeEventListener("blur", cancelResize);
	window.removeEventListener("keydown", escapeResize);
}
function cancelResize() {
	if (resize.value) preferences.value = resize.value.original;
	detachResize();
}
function resizeEnd(event: PointerEvent) {
	const current = resize.value;
	if (!current || event.pointerId !== current.pointer) return;
	resizeMove(event);
	if (event.clientX === current.x) preferences.value = current.original;
	else announcement.value = __("Button resized") + ": " + __(label(current.key));
	detachResize();
}
function escapeResize(event: KeyboardEvent) {
	if (event.key === "Escape") cancelResize();
}
function resizeWithKey(key: string, delta: number, event: KeyboardEvent) {
	surface.measure();
	const entry = visible.value.find((item) => item.key === key);
	if (!entry) return;
	const rtl = grid.value && getComputedStyle(grid.value).direction === "rtl";
	setWidth(
		key,
		resizedLayoutPercent(
			sizeFor(entry),
			delta * (event.shiftKey ? 10 : 1) * (rtl ? -1 : 1),
			surface.width.value,
			surface.gap.value,
			10,
		),
	);
}
function beginDrag(event: PointerEvent, key: string) {
	if (event.button !== 0 || !editing.value || drag.value || resize.value) return;
	event.preventDefault();
	(event.currentTarget as HTMLElement).focus();
	drag.value = {
		key,
		pointer: event.pointerId,
		x: event.clientX,
		y: event.clientY,
		moved: false,
		target: "",
		after: false,
	};
	window.addEventListener("pointermove", update, { passive: false });
	window.addEventListener("pointerup", finish);
	window.addEventListener("pointercancel", stop);
	window.addEventListener("blur", stop);
	window.addEventListener("keydown", escape);
}
function update(event: PointerEvent) {
	const current = drag.value;
	if (!current || current.pointer !== event.pointerId) return;
	event.preventDefault();
	current.moved ||= Math.hypot(event.clientX - current.x, event.clientY - current.y) > 5;
	current.target = "";
	const hit = document
		.elementFromPoint(event.clientX, event.clientY)
		?.closest<HTMLElement>("[data-workspace-button]");
	if (!current.moved || !hit || !grid.value?.contains(hit) || hit.dataset.workspaceButton === current.key)
		return;
	current.target = hit.dataset.workspaceButton!;
	const rect = hit.getBoundingClientRect();
	const rtl = getComputedStyle(grid.value).direction === "rtl";
	current.after =
		event.clientY > rect.bottom - rect.height / 4 ||
		(event.clientY >= rect.top + rect.height / 4 && event.clientX > rect.left + rect.width / 2 !== rtl);
}
function finish(event: PointerEvent) {
	const current = drag.value;
	if (!current || current.pointer !== event.pointerId) return;
	update(event);
	if (current.moved && current.target) {
		preferences.value = repositionButton(preferences.value, current.key, current.target, current.after);
		announcement.value = __("Button moved") + ": " + __(label(current.key));
	}
	stop();
}
function stop() {
	cancelResize();
	drag.value = null;
	window.removeEventListener("pointermove", update);
	window.removeEventListener("pointerup", finish);
	window.removeEventListener("pointercancel", stop);
	window.removeEventListener("blur", stop);
	window.removeEventListener("keydown", escape);
}
function escape(event: KeyboardEvent) {
	if (event.key === "Escape") stop();
}
function guardPreview(event: MouseEvent) {
	if (workspaceCustomization.active.value) {
		event.preventDefault();
		event.stopPropagation();
	}
}
watch(
	scope,
	() => {
		stop();
		storageError.value = "";
		preferences.value = normalizeButtonLayout(null, props.defaults);
		if (!scope.value) return;
		try {
			preferences.value = normalizeButtonLayout(
				JSON.parse(localStorage.getItem(scope.value) || "null"),
				props.defaults,
			);
		} catch (error) {
			console.warn("Unable to load button layout", error);
			storageError.value = "Saved button layout could not be loaded. Default layout is in use.";
		}
	},
	{ immediate: true },
);
registerCustomization({
	section: "buttons",
	kind: "buttons",
	label: "Invoice buttons",
	scope,
	state: preferences,
	error: storageError,
	entries: () =>
		visible.value.map((entry) => ({
			key: entry.key,
			label: label(entry.key),
			width: entry.width,
			size: sizeFor(entry),
			min: 10,
			max: 100,
			pixels: surface.width.value
				? layoutPixels(sizeFor(entry), surface.width.value, surface.gap.value)
				: undefined,
		})),
	move,
	setWidth,
	setPixels: (key, pixels) => {
		surface.measure();
		if (surface.width.value)
			setWidth(key, ((pixels + surface.gap.value) / (surface.width.value + surface.gap.value)) * 100);
	},
	stop,
	reset: () => {
		preferences.value = normalizeButtonLayout(null, props.defaults);
	},
	preset: (value) => {
		for (const entry of preferences.value) entry.width = value === "stack" ? "single" : "double";
	},
});
watch(editing, (value) => {
	if (!value) stop();
});
watch(() => props.enabled, stop);
onBeforeUnmount(stop);
</script>
<style scoped>
.workspace-buttons {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-width: 0;
}
.workspace-buttons--counter:not(.workspace-buttons--custom) {
	grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
	gap: 6px;
}
.workspace-buttons__item {
	position: relative;
	min-width: 0;
	display: flex;
	flex-direction: column;
}
.workspace-buttons__item > :deep(.v-btn) {
	width: 100%;
	flex: 1;
}
.workspace-buttons--editing .workspace-buttons__item {
	outline: 1px dashed rgb(var(--v-theme-primary));
	border-radius: 6px;
	padding-top: 28px;
}
.workspace-buttons__grip {
	position: absolute;
	top: 0;
	inset-inline-start: 0;
	width: 100%;
	height: 26px;
	cursor: grab;
	touch-action: none;
	color: rgb(var(--v-theme-primary));
}
.workspace-buttons__item--target {
	outline: 3px solid rgb(var(--v-theme-primary)) !important;
}
.workspace-buttons__announcement {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
}
@media (max-width: 599px) {
	.workspace-buttons:not(.workspace-buttons--custom):not(.workspace-buttons--counter) {
		grid-template-columns: minmax(0, 1fr);
	}
}

.workspace-buttons {
	--workspace-layout-gap: 8px;
}
.workspace-buttons--custom {
	display: flex;
	flex-wrap: wrap;
	align-items: stretch;
}
.workspace-buttons--counter.workspace-buttons--custom {
	--workspace-layout-gap: 6px;
	gap: 6px;
}
.workspace-buttons--custom .workspace-buttons__item {
	flex: 0 0 auto;
	max-width: 100%;
	box-sizing: border-box;
}
.workspace-buttons__item {
	transition:
		outline-color 180ms ease,
		box-shadow 180ms ease;
}
.workspace-buttons__grip {
	width: 28px;
}
.workspace-buttons__size {
	position: absolute;
	top: 5px;
	inset-inline-end: 6px;
	font-size: 10px;
	font-variant-numeric: tabular-nums;
	color: rgb(var(--v-theme-primary));
	pointer-events: none;
}
.workspace-buttons__resize {
	position: absolute;
	top: 30px;
	bottom: 4px;
	inset-inline-end: -5px;
	width: 12px;
	z-index: 4;
	display: grid;
	place-items: center;
	cursor: ew-resize;
	touch-action: none;
	border-radius: 5px;
	color: rgb(var(--v-theme-primary));
	background: var(--pos-card-bg, #fff);
	border: 1px solid rgba(var(--v-theme-primary), 0.25);
}
.workspace-buttons__resize:hover,
.workspace-buttons__resize:focus-visible {
	background: rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-on-primary));
	outline: 2px solid rgba(var(--v-theme-primary), 0.2);
}
.workspace-buttons--resizing {
	cursor: ew-resize;
	user-select: none;
}
.workspace-buttons--resizing .workspace-buttons__size {
	font-weight: 700;
}
@media (prefers-reduced-motion: reduce) {
	.workspace-buttons__item {
		transition: none;
	}
}
</style>
