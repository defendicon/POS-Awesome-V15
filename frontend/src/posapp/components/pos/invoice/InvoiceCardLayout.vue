<template>
	<div
		class="invoice-card-layout"
		:class="{ 'invoice-card-layout--editing': editing, 'invoice-card-layout--interacting': interaction }"
	>
		<v-alert v-if="storageError" type="warning" density="compact" role="status">{{
			storageError
		}}</v-alert>
		<div ref="grid" class="invoice-card-layout__cards">
			<div
				v-for="(card, index) in visibleCards"
				:key="card.id"
				class="invoice-card-layout__card"
				:class="{
					'invoice-card-layout__card--full': card.width === 'full' || card.width === 12,
					'invoice-card-layout__card--items': card.id === 'items',
					'invoice-card-layout__card--first': index === 0,
					'invoice-card-layout__card--dragging':
						interaction?.kind === 'drag' && interaction.id === card.id,
					['invoice-card-layout__card--drop-' + dropTarget?.position]: dropTarget?.id === card.id,
				}"
				:style="{
					'--invoice-card-span': spanFor(card),
					gridColumn: card.startRow ? '1 / span var(--invoice-card-span)' : undefined,
				}"
				:data-invoice-card="card.id"
			>
				<v-btn
					v-if="!editing && index === 0"
					class="invoice-card-layout__toggle"
					icon="mdi-tune-variant"
					size="x-small"
					variant="text"
					:aria-label="__('Customize workspace')"
					:title="__('Customize workspace')"
					:aria-expanded="false"
					@click="toggleEditing"
				/>
				<div v-if="editing" class="invoice-card-layout__card-tools">
					<button
						type="button"
						class="invoice-card-layout__drag"
						:aria-label="__('Drag card') + ': ' + __(labelFor(card.id))"
						:title="__('Drag to arrange card')"
						@pointerdown="beginDrag($event, card.id)"
						@keydown.up.prevent="move(card.id, -1)"
						@keydown.down.prevent="move(card.id, 1)"
					>
						<v-icon icon="mdi-drag" size="18" />
					</button>
				</div>
				<slot :name="card.id" />
				<button
					v-if="editing"
					type="button"
					class="invoice-card-layout__resize"
					role="slider"
					:aria-label="__('Resize card') + ': ' + __(labelFor(card.id))"
					:aria-valuemin="3"
					:aria-valuemax="12"
					:aria-valuenow="spanFor(card)"
					:aria-valuetext="Math.round((spanFor(card) / 12) * 100) + '%'"
					:title="__('Drag to resize; arrow keys also adjust width')"
					@pointerdown="beginResize($event, card.id)"
					@keydown.left.prevent="resizeWithKey(card.id, -1)"
					@keydown.right.prevent="resizeWithKey(card.id, 1)"
				>
					<v-icon icon="mdi-resize-bottom-right" size="20" />
				</button>
			</div>
			<div
				v-if="editing"
				class="invoice-card-layout__new-row"
				data-drop-new-row
				:class="{ 'invoice-card-layout__new-row--active': dropAtEnd }"
			>
				<v-icon icon="mdi-plus" size="18" />{{ __("Drop here for a new row") }}
			</div>
		</div>
		<div
			v-if="interaction?.kind === 'drag' && interaction.moved"
			class="invoice-card-layout__ghost"
			:style="{ left: interaction.x + 14 + 'px', top: interaction.y + 14 + 'px' }"
		>
			<v-icon icon="mdi-drag" size="18" />{{ __(labelFor(interaction.id)) }}
		</div>
		<span class="invoice-card-layout__announcement" role="status" aria-live="polite">{{
			announcement
		}}</span>
	</div>
</template>

<script setup lang="ts">
import {
	registerCustomization,
	workspaceCustomization,
} from "../../../composables/core/workspaceCustomization";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
	invoiceCardDefaults,
	invoiceCardLayoutKey,
	normalizeInvoiceCardLayout,
	type InvoiceCardId,
	type InvoiceCardPreference,
	type CardDropPosition,
	repositionInvoiceCard,
	resizedCardSpan,
} from "../../../utils/invoiceCardLayout";

const props = defineProps<{ user: string; profile: string; enabled: InvoiceCardId[] }>();
const __ = (text: string) => (window.__ ? window.__(text) : text);
const editing = computed(() => workspaceCustomization.isEditing("cards"));
const grid = ref<HTMLElement | null>(null);
const announcement = ref("");
type Interaction = {
	kind: "drag" | "resize";
	id: InvoiceCardId;
	pointerId: number;
	startX: number;
	startY: number;
	x: number;
	y: number;
	moved: boolean;
	startSpan: number;
	original: InvoiceCardPreference[];
};
const interaction = ref<Interaction | null>(null);
const dropTarget = ref<{ id: InvoiceCardId; position: CardDropPosition } | null>(null);
const dropAtEnd = ref(false);
let scrollFrame: number | null = null;
const storageError = ref("");
const preferences = ref(normalizeInvoiceCardLayout(null));
const key = computed(() => invoiceCardLayoutKey(props.user, props.profile));
const visibleCards = computed(() => preferences.value.filter((card) => props.enabled.includes(card.id)));
const labelFor = (id: InvoiceCardId) => invoiceCardDefaults.find((card) => card.id === id)!.label;

watch(
	key,
	() => {
		cancelInteraction();
		storageError.value = "";
		preferences.value = normalizeInvoiceCardLayout(null);
		if (!props.user || !props.profile) return;
		try {
			preferences.value = normalizeInvoiceCardLayout(
				JSON.parse(localStorage.getItem(key.value) || "null"),
			);
		} catch (error) {
			console.warn("Unable to load invoice card layout", error);
			storageError.value = __("Saved card layout could not be loaded. Default layout is in use.");
		}
	},
	{ immediate: true },
);

function save() {
	if (customization.defer()) return;
	if (!props.user || !props.profile) return;
	try {
		localStorage.setItem(key.value, JSON.stringify(preferences.value));
		storageError.value = "";
	} catch (error) {
		console.warn("Unable to save invoice card layout", error);
		storageError.value = __("Card layout could not be saved. Changes will last for this session only.");
	}
}

function move(id: InvoiceCardId, direction: number) {
	const visibleIndex = visibleCards.value.findIndex((card) => card.id === id);
	const target = visibleCards.value[visibleIndex + direction];
	if (!target) return;
	const from = preferences.value.findIndex((card) => card.id === id);
	const to = preferences.value.findIndex((card) => card.id === target.id);
	const current = preferences.value[from];
	const adjacent = preferences.value[to];
	if (!current || !adjacent) return;
	preferences.value[from] = adjacent;
	preferences.value[to] = current;
	save();
}

function setWidth(id: InvoiceCardId, width: string) {
	const card = preferences.value.find((card) => card.id === id);
	if (!card) return;
	const numeric = Number(width);
	if (width === "auto" || width === "full") card.width = width;
	else if (Number.isInteger(numeric) && numeric >= 3 && numeric <= 12) card.width = numeric;
	else return;
	card.startRow = false;
	save();
}

function spanFor(card: InvoiceCardPreference): number {
	if (card.width === "full") return 12;
	if (typeof card.width === "number") return card.width;
	const headerCards = visibleCards.value.filter((entry) => entry.id !== "items");
	return headerCards.length % 2 === 1 && headerCards.at(-1)?.id === card.id ? 12 : 6;
}

function toggleEditing() {
	cancelInteraction();
	workspaceCustomization.open("cards");
}

function applyPreset(preset: "single" | "stack") {
	cancelInteraction();
	const cards = visibleCards.value.filter((card) => card.id !== "items");
	const span = Math.max(3, Math.floor(12 / Math.max(1, cards.length)));
	for (const card of visibleCards.value) {
		card.width = preset === "stack" || card.id === "items" ? "full" : span;
		card.startRow = false;
	}
	save();
}

function startInteraction(event: PointerEvent, id: InvoiceCardId, kind: "drag" | "resize") {
	if (!editing.value || event.button !== 0 || interaction.value) return;
	const card = preferences.value.find((entry) => entry.id === id);
	if (!card) return;
	event.preventDefault();
	(event.currentTarget as HTMLElement).focus();
	interaction.value = {
		kind,
		id,
		pointerId: event.pointerId,
		startX: event.clientX,
		startY: event.clientY,
		x: event.clientX,
		y: event.clientY,
		moved: false,
		startSpan: spanFor(card),
		original: preferences.value.map((entry) => ({ ...entry })),
	};
	window.addEventListener("pointermove", updateInteraction, { passive: false });
	window.addEventListener("pointerup", finishInteraction);
	window.addEventListener("pointercancel", cancelInteraction);
	window.addEventListener("keydown", cancelWithEscape);
	window.addEventListener("blur", cancelInteraction);
	if (kind === "drag") scrollFrame = requestAnimationFrame(autoScroll);
}
const beginDrag = (event: PointerEvent, id: InvoiceCardId) => startInteraction(event, id, "drag");
const beginResize = (event: PointerEvent, id: InvoiceCardId) => startInteraction(event, id, "resize");

function updateInteraction(event: PointerEvent) {
	const active = interaction.value;
	if (!active || event.pointerId !== active.pointerId || !grid.value) return;
	event.preventDefault();
	active.x = event.clientX;
	active.y = event.clientY;
	active.moved ||= Math.hypot(active.x - active.startX, active.y - active.startY) > 5;
	if (active.kind === "resize") {
		const card = preferences.value.find((entry) => entry.id === active.id)!;
		const rtl = getComputedStyle(grid.value).direction === "rtl";
		const gap = parseFloat(getComputedStyle(grid.value).columnGap) || 0;
		card.width = resizedCardSpan(
			active.startSpan,
			(active.x - active.startX) * (rtl ? -1 : 1),
			grid.value.getBoundingClientRect().width,
			gap,
		);
		return;
	}
	updateDropTarget(active);
}

function updateDropTarget(active: Interaction) {
	if (!grid.value) return;
	dropTarget.value = null;
	dropAtEnd.value = false;
	if (!active.moved) return;
	const hit = document.elementFromPoint(active.x, active.y);
	if (!hit || !grid.value.contains(hit)) return;
	if (hit.closest("[data-drop-new-row]")) {
		const last = visibleCards.value.filter((card) => card.id !== active.id).at(-1);
		if (last) {
			dropTarget.value = { id: last.id, position: "below" };
			dropAtEnd.value = true;
		}
		return;
	}
	const target = hit.closest<HTMLElement>("[data-invoice-card]");
	const id = target?.dataset.invoiceCard as InvoiceCardId | undefined;
	if (!target || !id || id === active.id) return;
	const rect = target.getBoundingClientRect();
	const edge = Math.min(32, rect.height * 0.22);
	const rtl = getComputedStyle(grid.value).direction === "rtl";
	const before = active.x < rect.left + rect.width / 2 !== rtl;
	const position =
		active.y < rect.top + edge
			? "above"
			: active.y > rect.bottom - edge
				? "below"
				: before
					? "before"
					: "after";
	dropTarget.value = { id, position };
}

function autoScroll() {
	const active = interaction.value;
	if (!active || active.kind !== "drag" || !grid.value) return;
	if (active.moved) {
		let scrollArea: HTMLElement | null = grid.value;
		while (scrollArea) {
			if (
				scrollArea.scrollHeight > scrollArea.clientHeight &&
				/auto|scroll/.test(getComputedStyle(scrollArea).overflowY)
			)
				break;
			scrollArea = scrollArea.parentElement;
		}
		scrollArea ||= document.scrollingElement as HTMLElement | null;
		if (scrollArea) {
			const rect =
				scrollArea === document.scrollingElement
					? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
					: scrollArea.getBoundingClientRect();
			if (active.x >= rect.left && active.x <= rect.right) {
				if (active.y > rect.bottom - 40 && active.y <= rect.bottom) scrollArea.scrollTop += 12;
				else if (active.y < rect.top + 40 && active.y >= rect.top) scrollArea.scrollTop -= 12;
			}
		}
		updateDropTarget(active);
	}
	scrollFrame = requestAnimationFrame(autoScroll);
}

function detachInteraction() {
	if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
	scrollFrame = null;
	window.removeEventListener("pointermove", updateInteraction);
	window.removeEventListener("pointerup", finishInteraction);
	window.removeEventListener("pointercancel", cancelInteraction);
	window.removeEventListener("keydown", cancelWithEscape);
	window.removeEventListener("blur", cancelInteraction);
	interaction.value = null;
	dropTarget.value = null;
	dropAtEnd.value = false;
}
function finishInteraction(event: PointerEvent) {
	const active = interaction.value;
	if (!active || event.pointerId !== active.pointerId) return;
	if (active.kind === "drag" && active.moved && dropTarget.value) {
		preferences.value = repositionInvoiceCard(
			preferences.value,
			active.id,
			dropTarget.value.id,
			dropTarget.value.position,
		);
		announcement.value = __("Card moved") + ": " + __(labelFor(active.id));
		save();
	} else if (active.kind === "resize" && active.moved) {
		announcement.value = __("Card resized") + ": " + __(labelFor(active.id));
		save();
	} else if (active.kind === "resize") preferences.value = active.original;
	detachInteraction();
}
function cancelInteraction() {
	if (interaction.value?.kind === "resize") preferences.value = interaction.value.original;
	detachInteraction();
}
function cancelWithEscape(event: KeyboardEvent) {
	if (event.key === "Escape") cancelInteraction();
}
function resizeWithKey(id: InvoiceCardId, delta: number) {
	const card = preferences.value.find((entry) => entry.id === id);
	if (!card) return;
	card.width = Math.max(3, Math.min(12, spanFor(card) + delta));
	save();
}
const customization = registerCustomization({
	section: "cards",
	kind: "cards",
	label: "Cards",
	scope: computed(() => (props.user && props.profile ? key.value : "")),
	state: preferences,
	error: storageError,
	reset,
	stop: cancelInteraction,
	preset: applyPreset,
	entries: () =>
		visibleCards.value.map((card) => ({ key: card.id, label: labelFor(card.id), width: card.width })),
	move: (key, delta) => move(key as InvoiceCardId, delta),
	setWidth: (key, width) => setWidth(key as InvoiceCardId, String(width)),
});
watch(editing, (value) => {
	if (!value) cancelInteraction();
});

onBeforeUnmount(cancelInteraction);

function reset() {
	cancelInteraction();
	preferences.value = normalizeInvoiceCardLayout(null);
	save();
}
</script>

<style scoped>
.invoice-card-layout {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: var(--dynamic-sm, 10px);
	min-width: 0;
	container-type: inline-size;
	container-name: invoice-layout;
}
.invoice-card-layout__toggle {
	position: absolute;
	inset-inline-end: 8px;
	top: 8px;
	z-index: 4;
	width: 28px;
	height: 28px;
	border-radius: 6px !important;
	color: var(--pos-text-secondary, #62747d);
	border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
	box-shadow: none;
}
.invoice-card-layout:not(.invoice-card-layout--editing)
	.invoice-card-layout__card--first
	:deep(.invoice-section-heading) {
	padding-inline-end: 48px;
}
.invoice-card-layout__cards {
	display: grid;
	grid-template-columns: repeat(12, minmax(0, 1fr));
	align-items: stretch;
	gap: var(--dynamic-sm, 10px);
	min-width: 0;
}
.invoice-card-layout__card {
	position: relative;
	grid-column: span var(--invoice-card-span, 6);
	min-width: 0;
	display: flex;
	flex-direction: column;
	container: invoice-card / inline-size;
}
.invoice-card-layout__card--items {
	min-height: 320px;
}
.invoice-card-layout__card > :deep(.invoice-section-card) {
	width: 100%;
	flex: 1 1 auto;
	min-width: 0;
}
.invoice-card-layout--editing .invoice-card-layout__card {
	border-radius: var(--pos-radius-md, 12px);
	outline: 1px dashed rgba(var(--v-theme-primary), 0.4);
	background: var(--pos-card-bg);
}
.invoice-card-layout__card-tools {
	position: absolute;
	top: 9px;
	inset-inline-start: 8px;
	z-index: 4;
}
.invoice-card-layout__drag {
	width: 28px;
	height: 28px;
	display: grid;
	place-items: center;
	border-radius: 6px;
	background: var(--pos-card-bg);
	color: var(--pos-text-secondary, #62747d);
	cursor: grab;
	touch-action: none;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.13);
}
.invoice-card-layout--editing .invoice-card-layout__card :deep(.invoice-section-heading) {
	padding-inline-start: 44px;
}
.invoice-card-layout__resize {
	position: absolute;
	inset-inline-end: 2px;
	bottom: 2px;
	z-index: 3;
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: 7px 0 7px 0;
	background: var(--pos-card-bg);
	color: rgb(var(--v-theme-primary));
	border: 1px solid rgba(var(--v-theme-primary), 0.25);
	cursor: ew-resize;
	touch-action: none;
}
.invoice-card-layout__card--dragging {
	opacity: 0.45;
}
.invoice-card-layout__card--drop-before {
	box-shadow: -4px 0 0 rgb(var(--v-theme-primary));
}
.invoice-card-layout__card--drop-after {
	box-shadow: 4px 0 0 rgb(var(--v-theme-primary));
}
.invoice-card-layout__card--drop-above {
	box-shadow: 0 -4px 0 rgb(var(--v-theme-primary));
}
.invoice-card-layout__card--drop-below {
	box-shadow: 0 4px 0 rgb(var(--v-theme-primary));
}
.invoice-card-layout__new-row {
	grid-column: 1 / -1;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 42px;
	border: 1px dashed rgba(var(--v-theme-primary), 0.4);
	border-radius: 10px;
	font-size: 0.78rem;
	color: rgb(var(--v-theme-primary));
	background: rgba(var(--v-theme-primary), 0.03);
}
.invoice-card-layout__new-row--active {
	background: rgba(var(--v-theme-primary), 0.15);
	border-style: solid;
}
.invoice-card-layout__ghost {
	position: fixed;
	z-index: 9999;
	pointer-events: none;
	padding: 8px 12px;
	display: flex;
	gap: 6px;
	align-items: center;
	border-radius: 8px;
	color: rgb(var(--v-theme-on-primary));
	background: rgb(var(--v-theme-primary));
	box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
	font-size: 0.8rem;
}
.invoice-card-layout--interacting {
	user-select: none;
}
.invoice-card-layout__announcement {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}
@container invoice-layout (max-width: 720px) {
	.invoice-card-layout__card {
		grid-column: 1 / -1 !important;
	}
	.invoice-card-layout__resize {
		display: none;
	}
}

@container invoice-card (max-width: 420px) {
	.invoice-card-layout__card:not(.invoice-card-layout__card--items)
		:deep(.v-row > :is(.v-col, [class*="v-col-"])) {
		flex: 0 0 100%;
		max-width: 100%;
		min-width: 0;
	}
}
</style>
