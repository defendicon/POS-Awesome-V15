<template>
	<Teleport to="body" :disabled="inline">
		<aside
			ref="panel"
			v-if="workspace.active.value"
			class="workspace-editor"
			:class="{
				'workspace-editor--collapsed': collapsed,
				'v-theme--dark': isDark,
				'v-theme--light': !isDark,
				'workspace-editor--left': workspace.section.value !== 'selector',
			}"
			role="dialog"
			aria-modal="false"
			:aria-label="__('Customize workspace')"
			@keydown.esc.stop.prevent="workspace.cancel()"
		>
			<header class="workspace-editor__header">
				<div class="workspace-editor__identity">
					<span class="workspace-editor__icon"><v-icon icon="mdi-tune-variant" size="20" /></span>
					<div>
						<h2>{{ __("Customize workspace") }}</h2>
						<p>{{ __("Preview your layout before applying") }}</p>
					</div>
				</div>
				<button
					type="button"
					class="workspace-editor__icon-button"
					:aria-label="collapsed ? __('Expand editor') : __('Minimize editor')"
					@click="collapsed = !collapsed"
				>
					<v-icon :icon="collapsed ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" />
				</button>
			</header>
			<template v-if="!collapsed">
				<nav class="workspace-editor__tabs" :aria-label="__('Workspace sections')">
					<button
						v-for="tab in tabs"
						:key="tab.key"
						type="button"
						:aria-pressed="workspace.section.value === tab.key"
						:class="{ 'is-active': workspace.section.value === tab.key }"
						@click="workspace.select(tab.key)"
					>
						<v-icon :icon="tab.icon" size="17" /><span>{{ __(tab.label) }}</span>
					</button>
				</nav>
				<div class="workspace-editor__body">
					<p class="workspace-editor__hint">
						{{
							__(
								workspace.section.value === "cards"
									? "Arrange cards on the canvas, or use the controls below."
									: "Drag column grips on the table, resize the dividers, or enter exact widths below.",
							)
						}}
					</p>
					<div v-if="contexts.length > 1" class="workspace-editor__field">
						<label for="workspace-table">{{ __("Table") }}</label
						><select id="workspace-table" v-model="context">
							<option
								v-for="part in contexts"
								:key="part.scope.value"
								:value="part.scope.value"
							>
								{{ __(part.label) }}
							</option>
						</select>
					</div>
					<div v-if="cardPart" class="workspace-editor__presets">
						<button type="button" @click="cardPart.preset?.('single')">
							<v-icon icon="mdi-view-column-outline" size="18" />{{
								__("Side by side")
							}}</button
						><button type="button" @click="cardPart.preset?.('stack')">
							<v-icon icon="mdi-view-agenda-outline" size="18" />{{ __("Separate rows") }}
						</button>
					</div>
					<div class="workspace-editor__list">
						<div
							v-for="(entry, index) in entries"
							:key="entry.key"
							class="workspace-editor__item"
						>
							<div class="workspace-editor__item-label">
								<v-icon
									:icon="cardPart ? 'mdi-view-dashboard-outline' : 'mdi-table-column'"
									size="16"
								/><span>{{ __(entry.label) }}</span
								><span v-if="entry.required" class="workspace-editor__badge">{{
									__("Required")
								}}</span>
							</div>
							<div class="workspace-editor__item-controls">
								<input
									v-if="visibilityPart"
									type="checkbox"
									:checked="entry.visible"
									:disabled="entry.required"
									:aria-label="__('Show column') + ': ' + __(entry.label)"
									@change="
										visibilityPart.setVisible?.(
											entry.key,
											($event.target as HTMLInputElement).checked,
										)
									"
								/>
								<select
									v-if="cardPart"
									:value="entry.width"
									:aria-label="__('Card width') + ': ' + __(entry.label)"
									@change="
										cardPart.setWidth?.(
											entry.key,
											($event.target as HTMLSelectElement).value,
										)
									"
								>
									<option value="auto">{{ __("Auto") }}</option>
									<option value="3">25%</option>
									<option value="4">33%</option>
									<option value="6">50%</option>
									<option value="8">67%</option>
									<option value="full">100%</option>
									<option
										v-if="
											typeof entry.width === 'number' &&
											![3, 4, 6, 8].includes(entry.width)
										"
										:value="entry.width"
									>
										{{ Math.round((entry.width / 12) * 100) }}%
									</option>
								</select>
								<label
									v-else-if="
										entry.visible !== false && widthPart && widthEntries.has(entry.key)
									"
									class="workspace-editor__pixels"
									><input
										type="number"
										:value="widthEntries.get(entry.key)?.width"
										:min="widthEntries.get(entry.key)?.min || 64"
										max="1600"
										step="10"
										:aria-label="__('Column width') + ': ' + __(entry.label)"
										@change="updateWidth(entry.key, $event)"
									/><span>px</span></label
								>
								<span v-else class="workspace-editor__muted">{{ __("Hidden") }}</span>
								<button
									type="button"
									class="workspace-editor__icon-button"
									:disabled="index === 0 || entry.visible === false"
									:aria-label="__('Move up') + ': ' + __(entry.label)"
									@click="move(entry.key, -1)"
								>
									<v-icon icon="mdi-chevron-up" size="18" />
								</button>
								<button
									type="button"
									class="workspace-editor__icon-button"
									:disabled="index === entries.length - 1 || entry.visible === false"
									:aria-label="__('Move down') + ': ' + __(entry.label)"
									@click="move(entry.key, 1)"
								>
									<v-icon icon="mdi-chevron-down" size="18" />
								</button>
							</div>
						</div>
					</div>
					<p v-if="!entries.length" class="workspace-editor__hint">
						{{ __("Open this view to customize its layout.") }}
					</p>
					<button
						v-if="rowsPart"
						type="button"
						class="workspace-editor__link"
						@click="rowsPart.reset()"
					>
						{{ __("Reset item row order") }}
					</button>
					<div v-if="workspace.saveError.value" class="workspace-editor__error" role="alert">
						{{ __(workspace.saveError.value) }}
					</div>
				</div>
			</template>
			<footer class="workspace-editor__footer">
				<div class="workspace-editor__status">
					<span :class="{ 'is-dirty': workspace.changed.value.length }" />{{
						__(workspace.changed.value.length ? "Unsaved changes" : "No changes yet")
					}}
				</div>
				<div class="workspace-editor__actions">
					<button
						v-if="!collapsed"
						type="button"
						class="workspace-editor__reset"
						@click="workspace.resetSection()"
					>
						{{ __("Reset section") }}</button
					><button type="button" class="workspace-editor__secondary" @click="workspace.cancel()">
						{{ __("Cancel") }}</button
					><button type="button" class="workspace-editor__primary" @click="workspace.apply()">
						{{ __("Apply") }}
					</button>
				</div>
				<p v-if="!collapsed">{{ __("Layout preferences are saved in this browser.") }}</p>
			</footer>
		</aside>
	</Teleport>
</template>
<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
	workspaceCustomization as workspace,
	type CustomizationEntry,
	type CustomizationSection,
} from "../../composables/core/workspaceCustomization";
defineProps<{ inline?: boolean }>();
const __ = (text: string) => (window.__ ? window.__(text) : text);
const { proxy } = getCurrentInstance() as any;
const isDark = computed(() => proxy?.$theme?.isDark?.value || false);
const panel = ref<HTMLElement | null>(null);
const collapsed = ref(false);
watch(workspace.active, async (value) => {
	if (value) {
		await nextTick();
		panel.value?.querySelector<HTMLElement>('nav button[aria-pressed="true"]')?.focus();
	}
});
const context = ref("");
const tabs: Array<{ key: CustomizationSection; label: string; icon: string }> = [
	{ key: "cards", label: "Cards", icon: "mdi-view-dashboard-outline" },
	{ key: "selector", label: "Item selector", icon: "mdi-format-list-bulleted" },
	{ key: "invoice", label: "Invoice table", icon: "mdi-table" },
];
const parts = computed(() =>
	workspace.participants.value.filter((part) => part.section === workspace.section.value),
);
const cardPart = computed(() => parts.value.find((part) => part.kind === "cards"));
const contexts = computed(() => parts.value.filter((part) => part.kind === "order"));
watch(
	[contexts, workspace.active],
	() => {
		if (!contexts.value.some((part) => part.scope.value === context.value))
			context.value = contexts.value[0]?.scope.value || "";
		if (!workspace.active.value) collapsed.value = false;
	},
	{ immediate: true },
);
const orderPart = computed(() => contexts.value.find((part) => part.scope.value === context.value));
const widthPart = computed(() =>
	parts.value.find((part) => part.kind === "widths" && part.label === orderPart.value?.label),
);
const rowsPart = computed(() => parts.value.find((part) => part.kind === "rows"));
const visibilityPart = computed(() => parts.value.find((part) => part.kind === "visibility"));
// Newly visible headers must finish rendering before their divider widths can be measured.
const measurementVersion = ref(0);
watch(
	[entriesForMeasurement, () => widthPart.value?.state.value, workspace.active],
	async () => {
		await nextTick();
		measurementVersion.value++;
	},
	{ flush: "post" },
);
function entriesForMeasurement() {
	return visibilityPart.value
		?.entries?.()
		.map((entry) => `${entry.key}:${entry.visible}`)
		.join("|");
}
const widthEntries = computed(() => {
	void measurementVersion.value;
	return new Map((widthPart.value?.entries?.() || []).map((entry) => [entry.key, entry]));
});
const entries = computed<CustomizationEntry[]>(() => {
	if (cardPart.value) return cardPart.value.entries?.() || [];
	const available = visibilityPart.value?.entries?.() || [];
	const ordered = orderPart.value?.entries?.() || [];
	const keys = new Set(ordered.map((entry) => entry.key));
	return [...ordered, ...available.filter((entry) => !keys.has(entry.key))].map((entry) => ({
		...entry,
		...available.find((item) => item.key === entry.key),
	}));
});
function updateWidth(key: string, event: Event) {
	const input = event.target as HTMLInputElement;
	const value = Number(input.value);
	if (!input.value || !Number.isFinite(value) || value <= 0) {
		input.value = String(widthEntries.value.get(key)?.width || "");
		return;
	}
	widthPart.value?.setWidth?.(key, value);
}
function move(key: string, delta: number) {
	(cardPart.value || orderPart.value)?.move?.(key, delta);
}
onBeforeUnmount(() => {
	if (workspace.active.value) workspace.cancel();
});
</script>
<style>
.workspace-editor {
	position: fixed;
	z-index: 3100;
	inset-inline-end: 20px;
	top: 80px;
	width: 360px;
	max-width: calc(100vw - 24px);
	max-height: calc(100dvh - 100px);
	display: flex;
	flex-direction: column;
	color: var(--pos-text-primary, #23333d);
	background: var(--pos-card-bg, #fff);
	border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
	border-radius: 14px;
	box-shadow:
		0 16px 48px rgba(15, 35, 46, 0.17),
		0 2px 8px rgba(15, 35, 46, 0.07);
	font-family: var(--pos-font-sans, inherit);
}
.workspace-editor__header {
	padding: 16px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.workspace-editor__identity {
	display: flex;
	gap: 10px;
	align-items: center;
}
.workspace-editor__icon {
	width: 36px;
	height: 36px;
	border-radius: 9px;
	display: grid;
	place-items: center;
	color: rgb(var(--v-theme-primary));
	background: rgba(var(--v-theme-primary), 0.08);
}
.workspace-editor h2 {
	font-size: 14px;
	line-height: 1.4;
	font-weight: 650;
	margin: 0;
}
.workspace-editor__header p,
.workspace-editor__footer p {
	font-size: 11px;
	opacity: 0.65;
	margin: 3px 0 0;
	line-height: 1.5;
}
.workspace-editor__tabs {
	display: flex;
	padding: 6px 10px 0;
	border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.workspace-editor__tabs button {
	flex: 1;
	padding: 10px 4px;
	font-size: 11px;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	color: var(--pos-text-secondary, #62747d);
	border-bottom: 2px solid transparent;
}
.workspace-editor__tabs button.is-active {
	color: rgb(var(--v-theme-primary));
	border-bottom-color: rgb(var(--v-theme-primary));
	font-weight: 650;
}
.workspace-editor__body {
	padding: 14px 16px;
	overflow-y: auto;
	min-height: 0;
}
.workspace-editor__hint {
	font-size: 12px;
	line-height: 1.6;
	color: var(--pos-text-secondary, #62747d);
	margin: 0 0 14px;
}
.workspace-editor__presets {
	display: flex;
	gap: 8px;
	margin-bottom: 14px;
}
.workspace-editor__presets button {
	flex: 1;
	display: flex;
	gap: 6px;
	justify-content: center;
	align-items: center;
	font-size: 11px;
	padding: 9px 5px;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.13);
	border-radius: 7px;
}
.workspace-editor__list {
	display: flex;
	flex-direction: column;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
	border-radius: 9px;
	overflow: hidden;
}
.workspace-editor__list:empty {
	display: none;
}
.workspace-editor__item {
	padding: 11px 10px;
	border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.07);
}
.workspace-editor__item:last-child {
	border-bottom: none;
}
.workspace-editor__item-label {
	display: flex;
	gap: 5px;
	align-items: center;
	margin-bottom: 7px;
	font-size: 12px;
	font-weight: 550;
}
.workspace-editor__item-label > .v-icon {
	opacity: 0.35;
}
.workspace-editor__item-controls {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 5px;
}
.workspace-editor__badge {
	margin-inline-start: auto;
	font-size: 9px;
	font-weight: 500;
	color: var(--pos-text-secondary, #62747d);
	background: rgba(var(--v-theme-on-surface), 0.04);
	border-radius: 4px;
	padding: 2px 5px;
}
.workspace-editor__pixels {
	display: inline-flex;
	align-items: center;
	height: 30px;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
	border-radius: 6px;
	overflow: hidden;
}
.workspace-editor__pixels input {
	width: 66px;
	padding: 5px 6px;
	font-size: 12px;
	color: inherit;
	background: transparent;
}
.workspace-editor__pixels > span {
	padding-inline-end: 7px;
	font-size: 10px;
	opacity: 0.55;
}
.workspace-editor select {
	max-width: 180px;
	min-width: 90px;
	font-size: 12px;
	padding: 5px 8px;
	border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
	border-radius: 6px;
	background: var(--pos-card-bg, #fff);
	color: inherit;
}
.workspace-editor__field {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	margin-bottom: 12px;
}
.workspace-editor input[type="checkbox"] {
	accent-color: rgb(var(--v-theme-primary));
	margin-inline-end: auto;
	width: 16px;
	height: 16px;
}
.workspace-editor__icon-button {
	min-width: 28px;
	height: 28px;
	display: inline-grid;
	place-items: center;
	border-radius: 6px;
	color: inherit;
}
.workspace-editor__icon-button:disabled {
	opacity: 0.25;
}
.workspace-editor button:not(:disabled):hover {
	background-color: rgba(var(--v-theme-primary), 0.07);
}
.workspace-editor button:focus-visible,
.workspace-editor input:focus-visible,
.workspace-editor select:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}
.workspace-editor__footer {
	border-top: 1px solid rgba(var(--v-theme-on-surface), 0.09);
	padding: 12px 16px;
}
.workspace-editor__status {
	font-size: 11px;
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--pos-text-secondary, #62747d);
	margin-bottom: 10px;
}
.workspace-editor__status > span {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: #8b9ba2;
}
.workspace-editor__status > span.is-dirty {
	background: #b47c26;
}
.workspace-editor__actions {
	display: flex;
	gap: 7px;
	align-items: center;
}
.workspace-editor__actions button {
	font-size: 12px;
	font-weight: 550;
	border-radius: 7px;
	padding: 8px 13px;
}
.workspace-editor__reset {
	margin-inline-end: auto;
	padding-inline: 0 !important;
	font-size: 11px !important;
	color: var(--pos-text-secondary, #62747d);
}
.workspace-editor__secondary {
	border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
}
.workspace-editor__actions .workspace-editor__primary {
	background: rgb(var(--v-theme-primary));
	color: rgb(var(--v-theme-on-primary));
	border: 1px solid rgb(var(--v-theme-primary));
}
.workspace-editor__actions .workspace-editor__primary:hover {
	filter: brightness(0.94);
	background: rgb(var(--v-theme-primary));
}
.workspace-editor__error {
	font-size: 12px;
	padding: 10px;
	margin-top: 12px;
	border: 1px solid rgba(var(--v-theme-error), 0.25);
	border-radius: 7px;
	color: rgb(var(--v-theme-error));
}
.workspace-editor__link {
	margin-top: 12px;
	font-size: 11px;
	color: var(--pos-text-secondary, #62747d);
	text-decoration: underline;
	text-underline-offset: 3px;
}
.workspace-editor__muted {
	font-size: 11px;
	opacity: 0.5;
	margin-inline-end: auto;
}
.workspace-editor--left {
	inset-inline-start: 20px;
	inset-inline-end: auto;
}
.workspace-editor--collapsed {
	top: auto;
	bottom: 18px;
}
@media (max-width: 600px) {
	.workspace-editor {
		top: auto;
		bottom: 8px;
		inset-inline-start: auto;
		inset-inline-end: 8px;
		width: calc(100vw - 16px);
		max-width: none;
		max-height: 65dvh;
	}
	.workspace-editor__header {
		padding: 12px;
	}
}
@media (prefers-reduced-motion: reduce) {
	.workspace-editor * {
		scroll-behavior: auto;
	}
}
</style>
