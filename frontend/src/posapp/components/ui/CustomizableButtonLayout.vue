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
			}"
			@click.capture="guardPreview"
		>
			<div
				v-for="entry in visible"
				:key="entry.key"
				:data-workspace-button="entry.key"
				class="workspace-buttons__item"
				:class="{ 'workspace-buttons__item--target': drag?.target === entry.key }"
				:style="{ gridColumn: span(entry) }"
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
				<slot :name="entry.key" />
			</div>
		</div>
		<span class="workspace-buttons__announcement" role="status" aria-live="polite">{{
			announcement
		}}</span>
	</div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
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
}>();
const __ = (text: string) => (window.__ ? window.__(text) : text);
const grid = ref<HTMLElement | null>(null);
const storageError = ref("");
const announcement = ref("");
const preferences = ref(normalizeButtonLayout(null, props.defaults));
const scope = computed(() =>
	props.user && props.profile
		? `posawesome:invoice-buttons:v1:${JSON.stringify([props.user, props.profile, props.counter ? "counter-grid" : "classic"])}`
		: "",
);
const editing = computed(() => workspaceCustomization.isEditing("buttons"));
const visible = computed(() => preferences.value.filter((entry) => props.enabled.includes(entry.key)));
const custom = computed(() => preferences.value.some((entry) => entry.width !== "auto"));
const label = (key: string) => props.defaults.find((item) => item.key === key)?.label || key;
function span(entry: ButtonPreference) {
	if (entry.width === "single") return "1 / -1";
	if (entry.width === "double") return "span 1";
	return props.defaults.find((item) => item.key === entry.key)?.full
		? props.counter && !custom.value
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
	if (entry && (width === "single" || width === "double" || width === "auto")) entry.width = width;
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
function beginDrag(event: PointerEvent, key: string) {
	if (event.button !== 0 || !editing.value || drag.value) return;
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
		visible.value.map((entry) => ({ key: entry.key, label: label(entry.key), width: entry.width })),
	move,
	setWidth,
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
</style>
