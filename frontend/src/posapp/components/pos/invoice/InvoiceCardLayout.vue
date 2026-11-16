<template>
	<div class="invoice-card-layout">
		<div class="invoice-card-layout__toolbar">
			<v-btn
				size="small"
				variant="text"
				prepend-icon="mdi-view-dashboard-edit-outline"
				@click="editing = !editing"
				:aria-expanded="editing"
			>
				{{ __(editing ? "Done" : "Customize cards") }}
			</v-btn>
		</div>
		<div v-if="editing" class="invoice-card-layout__settings">
			<p>
				{{
					__(
						"Move cards up or down and choose their width. Auto cards share available space and stack on smaller screens.",
					)
				}}
			</p>
			<p>
				{{
					__(
						"Saved for this user and POS Profile in this browser. Card availability follows POS Profile settings.",
					)
				}}
			</p>
			<div v-for="(card, index) in visibleCards" :key="card.id" class="invoice-card-layout__setting">
				<span>{{ __(labelFor(card.id)) }}</span>
				<div class="invoice-card-layout__controls">
					<v-btn
						icon="mdi-arrow-up"
						size="small"
						variant="text"
						:disabled="index === 0"
						:aria-label="__('Move up') + ': ' + __(labelFor(card.id))"
						@click="move(card.id, -1)"
					/>
					<v-btn
						icon="mdi-arrow-down"
						size="small"
						variant="text"
						:disabled="index === visibleCards.length - 1"
						:aria-label="__('Move down') + ': ' + __(labelFor(card.id))"
						@click="move(card.id, 1)"
					/>
					<select
						:value="card.width"
						:aria-label="__('Card width') + ': ' + __(labelFor(card.id))"
						@change="setWidth(card.id, ($event.target as HTMLSelectElement).value)"
					>
						<option value="auto">{{ __("Auto") }}</option>
						<option value="full">{{ __("Full row") }}</option>
					</select>
				</div>
			</div>
			<v-btn size="small" variant="text" prepend-icon="mdi-restore" @click="reset">{{
				__("Reset layout")
			}}</v-btn>
		</div>
		<v-alert v-if="storageError" type="warning" density="compact" role="status">{{
			storageError
		}}</v-alert>
		<div class="invoice-card-layout__cards">
			<div
				v-for="card in visibleCards"
				:key="card.id"
				class="invoice-card-layout__card"
				:class="{
					'invoice-card-layout__card--full': card.width === 'full',
					'invoice-card-layout__card--items': card.id === 'items',
				}"
				:data-invoice-card="card.id"
			>
				<slot :name="card.id" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	invoiceCardDefaults,
	invoiceCardLayoutKey,
	normalizeInvoiceCardLayout,
	type InvoiceCardId,
} from "../../../utils/invoiceCardLayout";

const props = defineProps<{ user: string; profile: string; enabled: InvoiceCardId[] }>();
const __ = (text: string) => (window.__ ? window.__(text) : text);
const editing = ref(false);
const storageError = ref("");
const preferences = ref(normalizeInvoiceCardLayout(null));
const key = computed(() => invoiceCardLayoutKey(props.user, props.profile));
const visibleCards = computed(() => preferences.value.filter((card) => props.enabled.includes(card.id)));
const labelFor = (id: InvoiceCardId) => invoiceCardDefaults.find((card) => card.id === id)!.label;

watch(
	key,
	() => {
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
	if (!card || (width !== "auto" && width !== "full")) return;
	card.width = width;
	save();
}

function reset() {
	preferences.value = normalizeInvoiceCardLayout(null);
	save();
}
</script>

<style scoped>
.invoice-card-layout {
	display: flex;
	flex-direction: column;
	gap: var(--dynamic-sm, 10px);
	min-width: 0;
}
.invoice-card-layout__toolbar {
	display: flex;
	justify-content: flex-end;
}
.invoice-card-layout__settings {
	padding: 12px;
	border: 1px solid rgba(var(--v-theme-primary), 0.25);
	border-radius: var(--pos-radius-md, 12px);
	background: var(--pos-card-bg);
	font-size: 0.875rem;
}
.invoice-card-layout__settings p {
	margin-bottom: 8px;
}
.invoice-card-layout__setting,
.invoice-card-layout__controls {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}
.invoice-card-layout__setting {
	justify-content: space-between;
	padding-block: 4px;
}
.invoice-card-layout__controls select {
	border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
	border-radius: 6px;
	padding: 6px 8px;
	color: var(--pos-text-primary);
	background: var(--pos-card-bg);
}
.invoice-card-layout__cards {
	display: flex;
	flex-wrap: wrap;
	align-items: stretch;
	gap: var(--dynamic-sm, 10px);
	min-width: 0;
}
.invoice-card-layout__card {
	flex: 1 1 360px;
	min-width: 0;
	max-width: 100%;
	display: flex;
	flex-direction: column;
}
.invoice-card-layout__card--full {
	flex-basis: 100%;
}
.invoice-card-layout__card--items {
	min-height: 320px;
}
.invoice-card-layout__card > :deep(.invoice-section-card) {
	width: 100%;
	height: 100%;
	min-width: 0;
}
</style>
