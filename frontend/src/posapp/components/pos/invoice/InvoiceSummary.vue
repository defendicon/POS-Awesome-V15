<template>
	<v-card
		class="cards sticky-summary-card mb-0 py-2 px-3 rounded-lg pos-themed-card"
		:class="{
			'sticky-summary-card--dock-safe': useCompactSaleDock && !isCounterGrid,
			'counter-grid-summary-card': isCounterGrid,
		}"
	>
		<div v-if="isCounterGrid" class="counter-grid-summary" data-testid="counter-grid-summary">
			<div class="counter-grid-summary__metrics">
				<div class="counter-grid-summary__metric">
					<span>{{ __("Gross") }}</span>
					<strong>{{ currencySymbol(displayCurrency) }}{{ formatCurrency(grossTotal) }}</strong>
				</div>
				<div class="counter-grid-summary__metric">
					<span>{{ __("Item discount") }}</span>
					<strong
						>{{ currencySymbol(displayCurrency)
						}}{{ formatCurrency(total_items_discount_amount) }}</strong
					>
				</div>
				<div class="counter-grid-summary__metric counter-grid-summary__metric--qty">
					<span>{{ __("Quantity") }}</span>
					<strong>{{ formatFloat(total_qty, hide_qty_decimals ? 0 : undefined) }}</strong>
				</div>
				<div class="counter-grid-summary__discount">
					<v-text-field
						v-if="!pos_profile.posa_use_percentage_discount"
						ref="additionalDiscountField"
						v-model="additionalDiscountDisplay"
						name="pos-counter-additional-discount"
						autocomplete="transaction-amount"
						inputmode="decimal"
						data-1p-ignore="true"
						data-lpignore="true"
						data-bwignore="true"
						@update:model-value="handleAdditionalDiscountUpdate"
						@focus="handleAdditionalDiscountFocus"
						@blur="handleAdditionalDiscountBlur"
						:label="frappe._('Additional Discount')"
						variant="outlined"
						density="compact"
						hide-details
						:prefix="currencySymbol(pos_profile.currency)"
						:disabled="
							!pos_profile.posa_allow_user_to_edit_additional_discount ||
							!!discount_percentage_offer_name
						"
					/>
					<v-text-field
						v-else
						ref="additionalDiscountField"
						v-model="additionalDiscountPercentageDisplay"
						name="pos-counter-additional-discount-percent"
						autocomplete="transaction-amount"
						inputmode="decimal"
						data-1p-ignore="true"
						data-lpignore="true"
						data-bwignore="true"
						@update:model-value="handleAdditionalDiscountPercentageUpdate"
						@change="$emit('update_discount_umount')"
						@focus="handleAdditionalDiscountPercentageFocus"
						@blur="handleAdditionalDiscountPercentageBlur"
						:rules="[isNumber]"
						:label="frappe._('Additional Discount')"
						suffix="%"
						variant="outlined"
						density="compact"
						hide-details
						:disabled="
							!pos_profile.posa_allow_user_to_edit_additional_discount ||
							!!discount_percentage_offer_name
						"
					/>
				</div>
				<div class="counter-grid-summary__metric counter-grid-summary__metric--total">
					<span>{{ __("Net total") }}</span>
					<strong>{{ currencySymbol(displayCurrency) }}{{ formatCurrency(subtotal) }}</strong>
				</div>
			</div>

			<InvoiceActionButtons
				presentation="counter-grid"
				:pos_profile="pos_profile"
				:saveLoading="saveLoading"
				:loadDraftsLoading="loadDraftsLoading"
				:selectOrderLoading="selectOrderLoading"
				:cancelLoading="cancelLoading"
				:invoiceManagementLoading="invoiceManagementLoading"
				:returnsLoading="returnsLoading"
				:printLoading="printLoading"
				:paymentLoading="paymentLoading"
				:customerDisplayLoading="customerDisplayLoading"
				@save-and-clear="handleSaveAndClear"
				@load-drafts="handleLoadDrafts"
				@select-order="handleSelectOrder"
				@cancel-sale="handleCancelSale"
				@open-invoice-management="handleOpenInvoiceManagement"
				@open-returns="handleOpenReturns"
				@print-draft="handlePrintDraft"
				@show-payment="handleShowPayment"
				@open-customer-display="handleOpenCustomerDisplay"
				@open-offers="$emit('open-offers')"
				@open-coupons="$emit('open-coupons')"
			/>
		</div>

		<v-row v-else dense class="summary-content">
			<v-col
				v-if="!useCompactSaleDock || showReturnDiscountAlert"
				cols="12"
				:md="useCompactSaleDock ? 12 : 7"
			>
				<v-alert
					v-if="showReturnDiscountAlert"
					density="compact"
					type="info"
					variant="tonal"
					class="summary-field summary-field--alert"
				>
					{{ __("Prorated return discount") }}: {{ formatRatio(return_discount_meta.ratio) }} -
					{{ __("Original") }}: {{ formatCurrency(return_discount_meta.original_discount) }},
					{{ __("Applied") }}:
					{{ formatCurrency(return_discount_meta.prorated_discount) }}
				</v-alert>

				<div v-if="!useCompactSaleDock" class="summary-hero">
					<div class="summary-hero__copy">
						<span class="summary-hero__eyebrow">{{ __("Active sale") }}</span>
						<strong class="summary-hero__amount">
							{{ currencySymbol(displayCurrency) }}{{ formatCurrency(subtotal) }}
						</strong>
						<div class="summary-hero__meta">
							<span
								>{{ formatFloat(total_qty, hide_qty_decimals ? 0 : undefined) }}
								{{ __("qty") }}</span
							>
							<span>
								{{ currencySymbol(displayCurrency)
								}}{{ formatCurrency(total_items_discount_amount) }}
								{{ __("discount") }}
							</span>
						</div>
					</div>

					<div class="summary-hero__field-wrap">
						<v-text-field
							v-if="!pos_profile.posa_use_percentage_discount"
							ref="additionalDiscountField"
							v-model="additionalDiscountDisplay"
							name="pos-invoice-additional-discount"
							autocomplete="transaction-amount"
							inputmode="decimal"
							data-1p-ignore="true"
							data-lpignore="true"
							data-bwignore="true"
							@update:model-value="handleAdditionalDiscountUpdate"
							@focus="handleAdditionalDiscountFocus"
							@blur="handleAdditionalDiscountBlur"
							:label="frappe._('Additional Discount')"
							prepend-inner-icon="mdi-cash-minus"
							variant="solo"
							density="compact"
							color="warning"
							:prefix="currencySymbol(pos_profile.currency)"
							:disabled="
								!pos_profile.posa_allow_user_to_edit_additional_discount ||
								!!discount_percentage_offer_name
							"
							class="summary-field summary-field--dock"
						/>

						<v-text-field
							v-else
							ref="additionalDiscountField"
							v-model="additionalDiscountPercentageDisplay"
							name="pos-invoice-additional-discount-percent"
							autocomplete="transaction-amount"
							inputmode="decimal"
							data-1p-ignore="true"
							data-lpignore="true"
							data-bwignore="true"
							@update:model-value="handleAdditionalDiscountPercentageUpdate"
							@change="$emit('update_discount_umount')"
							@focus="handleAdditionalDiscountPercentageFocus"
							@blur="handleAdditionalDiscountPercentageBlur"
							:rules="[isNumber]"
							:label="frappe._('Additional Discount %')"
							suffix="%"
							prepend-inner-icon="mdi-percent"
							variant="solo"
							density="compact"
							color="warning"
							:disabled="
								!pos_profile.posa_allow_user_to_edit_additional_discount ||
								!!discount_percentage_offer_name
							"
							class="summary-field summary-field--dock"
						/>
					</div>
				</div>
			</v-col>

			<v-col cols="12" :md="useCompactSaleDock ? 12 : 5" class="invoice-summary-actions">
				<InvoiceActionButtons
					:pos_profile="pos_profile"
					:saveLoading="saveLoading"
					:loadDraftsLoading="loadDraftsLoading"
					:selectOrderLoading="selectOrderLoading"
					:cancelLoading="cancelLoading"
					:invoiceManagementLoading="invoiceManagementLoading"
					:returnsLoading="returnsLoading"
					:printLoading="printLoading"
					:paymentLoading="paymentLoading"
					:customerDisplayLoading="customerDisplayLoading"
					@save-and-clear="handleSaveAndClear"
					@load-drafts="handleLoadDrafts"
					@select-order="handleSelectOrder"
					@cancel-sale="handleCancelSale"
					@open-invoice-management="handleOpenInvoiceManagement"
					@open-returns="handleOpenReturns"
					@print-draft="handlePrintDraft"
					@show-payment="handleShowPayment"
					@open-customer-display="handleOpenCustomerDisplay"
				/>
			</v-col>
		</v-row>
	</v-card>

	<v-navigation-drawer
		v-if="showDesktopDrafts"
		v-model="desktopDraftsDrawer"
		location="right"
		temporary
		width="360"
		class="drafts-drawer"
	>
		<div class="drafts-drawer__body">
			<DocumentSourceSelector
				v-if="showDraftSourceSelector"
				v-model="currentDraftSource"
				:options="availableDraftSources"
				compact
				:aria-label="__('Draft source')"
				class="drafts-drawer__sources"
			/>
			<ParkedOrdersList
				ref="desktopDraftsList"
				:parked-orders="allDrafts"
				:format-currency="formatCurrency"
				:currency-symbol="currencySymbol"
				:show-manage-all="true"
				:loading="loadDraftsLoading"
				:loading-title="__(currentDraftSourceOption.loadingLabel)"
				:title="currentDraftSourceOption.panelTitle"
				:eyebrow="currentDraftSourceOption.panelEyebrow"
				:subtitle="currentDraftSourceOption.panelSubtitle"
				:empty-title="__(currentDraftSourceOption.emptyTitle)"
				:empty-subtitle="__(currentDraftSourceOption.emptySubtitle)"
				@resume="handleResumeDraft"
				@manage-all="handleManageAllDrafts"
				@close="closeDraftsSurface"
			/>
		</div>
	</v-navigation-drawer>

	<v-dialog v-else v-model="mobileDraftsDialog" max-width="680" scrollable data-test="mobile-drafts-dialog">
		<v-card class="pos-themed-card">
			<v-card-title class="d-flex align-center justify-space-between">
				<span>{{ __(currentDraftSourceOption.panelTitle) }}</span>
				<v-btn variant="text" size="small" @click="mobileDraftsDialog = false">
					{{ __("Close") }}
				</v-btn>
			</v-card-title>
			<v-card-text class="pt-0">
				<DocumentSourceSelector
					v-if="showDraftSourceSelector"
					v-model="currentDraftSource"
					:options="availableDraftSources"
					compact
					:aria-label="__('Draft source')"
					class="drafts-drawer__sources"
				/>
				<ParkedOrdersList
					ref="mobileDraftsList"
					:parked-orders="allDrafts"
					:format-currency="formatCurrency"
					:currency-symbol="currencySymbol"
					:show-manage-all="true"
					:loading="loadDraftsLoading"
					:loading-title="__(currentDraftSourceOption.loadingLabel)"
					:title="currentDraftSourceOption.panelTitle"
					:eyebrow="currentDraftSourceOption.panelEyebrow"
					:subtitle="currentDraftSourceOption.panelSubtitle"
					:empty-title="__(currentDraftSourceOption.emptyTitle)"
					:empty-subtitle="__(currentDraftSourceOption.emptySubtitle)"
					@resume="handleResumeDraft"
					@manage-all="handleManageAllDrafts"
					@close="closeDraftsSurface"
				/>
			</v-card-text>
		</v-card>
	</v-dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { loadItemSelectorSettings } from "../../../utils/itemSelectorSettings";
import { useResponsive } from "../../../composables/core/useResponsive";
import { useUIStore } from "../../../stores/uiStore";
import {
	getAvailableDocumentSources,
	getDefaultDocumentSource,
	getDocumentSourceOption,
	shouldShowDocumentSourceSelector,
} from "../../../utils/documentSources";
import InvoiceActionButtons from "./InvoiceActionButtons.vue";
import ParkedOrdersList from "./ParkedOrdersList.vue";
import DocumentSourceSelector from "../shared/DocumentSourceSelector.vue";

defineOptions({
	name: "InvoiceSummary",
});

const props = defineProps({
	presentation: {
		type: String,
		default: "classic",
	},
	pos_profile: Object,
	total_qty: [Number, String],
	additional_discount: Number,
	additional_discount_percentage: Number,
	total_items_discount_amount: Number,
	grossTotal: Number,
	subtotal: Number,
	displayCurrency: String,
	formatFloat: Function,
	formatCurrency: Function,
	currencySymbol: Function,
	discount_percentage_offer_name: [String, Number],
	isNumber: Function,
	return_discount_meta: Object,
});

const emit = defineEmits([
	"update:additional_discount",
	"update:additional_discount_percentage",
	"update_discount_umount",
	"save-and-clear",
	"load-drafts",
	"select-order",
	"cancel-sale",
	"open-invoice-management",
	"open-returns",
	"print-draft",
	"show-payment",
	"open-customer-display",
	"open-offers",
	"open-coupons",
	"resume-parked-order",
]);

const saveLoading = ref(false);
const loadDraftsLoading = ref(false);
const selectOrderLoading = ref(false);
const cancelLoading = ref(false);
const invoiceManagementLoading = ref(false);
const returnsLoading = ref(false);
const printLoading = ref(false);
const paymentLoading = ref(false);
const customerDisplayLoading = ref(false);
const isEditingAdditionalDiscount = ref(false);
const isEditingAdditionalDiscountPercentage = ref(false);
const additionalDiscountField = ref(null);
const desktopDraftsDrawer = ref(false);
const mobileDraftsDialog = ref(false);
const desktopDraftsList = ref(null);
const mobileDraftsList = ref(null);
const responsive = useResponsive();
const uiStore = useUIStore();
const { parkedOrders, draftSource } = storeToRefs(uiStore);

const additionalDiscountDisplay = ref(normalizeAdditionalDiscountDisplay(props.additional_discount));
const additionalDiscountPercentageDisplay = ref(
	normalizeDiscountDisplay(props.additional_discount_percentage),
);
const isCounterGrid = computed(() => props.presentation === "counter-grid");
const useCompactSaleDock = computed(() => responsive.windowWidth.value < 1100);
const showDesktopDrafts = computed(() => Boolean(responsive.isDesktop.value));
const showReturnDiscountAlert = computed(
	() =>
		!!props.return_discount_meta &&
		!props.pos_profile?.posa_use_percentage_discount &&
		!isFullReturnDiscount(props.return_discount_meta?.ratio),
);
const allDrafts = computed(() => (Array.isArray(parkedOrders.value) ? parkedOrders.value : []));
const availableDraftSources = computed(() => getAvailableDocumentSources(props.pos_profile));
const showDraftSourceSelector = computed(() => shouldShowDocumentSourceSelector(availableDraftSources.value));
const currentDraftSource = computed({
	get() {
		return getDefaultDocumentSource(props.pos_profile, draftSource.value);
	},
	async set(value) {
		const nextSource = getDefaultDocumentSource(props.pos_profile, value);
		if (draftSource.value === nextSource) {
			return;
		}
		uiStore.setDraftSource(nextSource);
		uiStore.setParkedOrders([]);
		await emit("load-drafts", nextSource);
	},
});
const currentDraftSourceOption = computed(() => getDocumentSourceOption(currentDraftSource.value));

const hide_qty_decimals = computed(() => {
	const opts = loadItemSelectorSettings();
	return !!opts?.hide_qty_decimals;
});

watch(
	() => props.pos_profile,
	() => {
		const nextSource = getDefaultDocumentSource(props.pos_profile, draftSource.value);
		if (draftSource.value !== nextSource) {
			uiStore.setDraftSource(nextSource);
		}
	},
	{ deep: true, immediate: true },
);

watch(
	() => [
		props.additional_discount,
		props.return_discount_meta?.prorated_discount,
		props.pos_profile?.posa_use_percentage_discount,
	],
	([value]) => {
		if (!isEditingAdditionalDiscount.value) {
			additionalDiscountDisplay.value = normalizeAdditionalDiscountDisplay(value);
		}
	},
);

watch(
	() => props.additional_discount_percentage,
	(value) => {
		if (!isEditingAdditionalDiscountPercentage.value) {
			additionalDiscountPercentageDisplay.value = normalizeDiscountDisplay(value);
		}
	},
);

function normalizeDiscountDisplay(value) {
	if (value === 0 || value === "0") {
		return "";
	}
	return value;
}

function normalizeAdditionalDiscountDisplay(value) {
	if (value === 0 || value === "0") {
		return "";
	}
	if (props.return_discount_meta && !props.pos_profile?.posa_use_percentage_discount) {
		const proratedValue = Number(props.return_discount_meta.prorated_discount);
		if (Number.isFinite(proratedValue)) {
			return Math.abs(proratedValue);
		}
		const numericValue = Number(value);
		if (Number.isFinite(numericValue)) {
			return Math.abs(numericValue);
		}
	}
	return value;
}

function normalizeAdditionalDiscountInput(value) {
	if (props.return_discount_meta && !props.pos_profile?.posa_use_percentage_discount) {
		const numericValue = Number(value);
		if (Number.isFinite(numericValue)) {
			const originalStoredValue = Number(props.additional_discount);
			const sign = Math.sign(
				Number.isFinite(originalStoredValue) && originalStoredValue !== 0 ? originalStoredValue : -1,
			);
			return sign * Math.abs(numericValue);
		}
	}
	return value;
}

function handleAdditionalDiscountUpdate(value) {
	emit("update:additional_discount", normalizeAdditionalDiscountInput(value));
}

function handleAdditionalDiscountFocus() {
	isEditingAdditionalDiscount.value = true;
}

function handleAdditionalDiscountBlur() {
	isEditingAdditionalDiscount.value = false;
}

function handleAdditionalDiscountPercentageUpdate(value) {
	emit("update:additional_discount_percentage", value);
}

function handleAdditionalDiscountPercentageFocus() {
	isEditingAdditionalDiscountPercentage.value = true;
}

function handleAdditionalDiscountPercentageBlur() {
	isEditingAdditionalDiscountPercentage.value = false;
}

function focusAdditionalDiscountField() {
	const field = additionalDiscountField.value;
	field?.focus?.();
	field?.$el?.querySelector?.("input")?.focus?.();
}

function formatRatio(value) {
	const ratio = Number.isFinite(Number(value)) ? Number(value) : 0;
	const percent = Math.round(ratio * 10000) / 100;
	return `${percent}%`;
}

function isFullReturnDiscount(value) {
	const ratio = Number.isFinite(Number(value)) ? Number(value) : 0;
	return Math.abs(ratio - 1) < 0.0001;
}

async function handleSaveAndClear() {
	saveLoading.value = true;
	try {
		await emit("save-and-clear");
	} finally {
		saveLoading.value = false;
	}
}

function handleLoadDrafts() {
	const nextSource = getDefaultDocumentSource(props.pos_profile, "invoice");
	uiStore.setDraftSource(nextSource);
	uiStore.setParkedOrders([]);
	openDraftsSurface({ focus: false });
	emit("load-drafts", nextSource);
}

function openDraftsSurface(options = {}) {
	if (showDesktopDrafts.value) {
		desktopDraftsDrawer.value = true;
		if (options.focus !== false) {
			void focusDraftsSurface();
		}
		return;
	}

	mobileDraftsDialog.value = true;
	if (options.focus !== false) {
		void focusDraftsSurface();
	}
}

function closeDraftsSurface() {
	desktopDraftsDrawer.value = false;
	mobileDraftsDialog.value = false;
}

function handleGlobalDraftsKeydown(event) {
	if (event.key !== "Escape" || (!desktopDraftsDrawer.value && !mobileDraftsDialog.value)) {
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	closeDraftsSurface();
}

async function focusDraftsSurface() {
	await nextTick();
	await new Promise((resolve) => {
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(resolve);
			return;
		}
		setTimeout(resolve, 0);
	});
	const list = showDesktopDrafts.value ? desktopDraftsList.value : mobileDraftsList.value;
	await list?.focusFirstDraft?.();
}

async function handleSelectOrder() {
	selectOrderLoading.value = true;
	try {
		await emit("select-order");
	} finally {
		selectOrderLoading.value = false;
	}
}

async function handleCancelSale() {
	cancelLoading.value = true;
	try {
		await emit("cancel-sale");
	} finally {
		cancelLoading.value = false;
	}
}

async function handleOpenInvoiceManagement() {
	invoiceManagementLoading.value = true;
	try {
		await emit("open-invoice-management");
	} finally {
		invoiceManagementLoading.value = false;
	}
}

function handleManageAllDrafts() {
	closeDraftsSurface();
	uiStore.setInvoiceManagementDraftSource(currentDraftSource.value);
	emit("open-invoice-management", "drafts", currentDraftSource.value);
}

async function handleOpenReturns() {
	returnsLoading.value = true;
	try {
		await emit("open-returns");
	} finally {
		returnsLoading.value = false;
	}
}

async function handlePrintDraft() {
	printLoading.value = true;
	try {
		await emit("print-draft");
	} finally {
		printLoading.value = false;
	}
}

async function handleShowPayment() {
	paymentLoading.value = true;
	try {
		await emit("show-payment");
	} finally {
		paymentLoading.value = false;
	}
}

async function handleOpenCustomerDisplay() {
	customerDisplayLoading.value = true;
	try {
		await emit("open-customer-display");
	} finally {
		customerDisplayLoading.value = false;
	}
}

function handleResumeDraft(draft) {
	closeDraftsSurface();
	emit("resume-parked-order", draft);
}

onMounted(() => {
	window.addEventListener("keydown", handleGlobalDraftsKeydown, true);
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleGlobalDraftsKeydown, true);
});

defineExpose({
	focusAdditionalDiscountField,
	focusDraftsSurface,
	handleManageAllDrafts,
	openDraftsSurface,
	closeDraftsSurface,
	setDraftsLoading(value) {
		loadDraftsLoading.value = Boolean(value);
	},
});
</script>

<style scoped>
.drafts-drawer :deep(.v-navigation-drawer__content) {
	padding: 12px;
	background: var(--pos-surface-muted);
}

.drafts-drawer__body {
	padding: 4px;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.drafts-drawer__sources {
	position: sticky;
	top: 0;
	z-index: 1;
	padding: 4px;
	background: var(--pos-surface-muted);
	border-radius: 16px;
}

.cards {
	background-color: var(--pos-card-bg) !important;
	transition: all 0.3s ease;
}

.counter-grid-summary-card {
	position: static;
	padding: 8px 10px !important;
	border-top: 2px solid #174a70;
	border-radius: 0 !important;
	box-shadow: none;
	background: var(--pos-card-bg) !important;
}

.counter-grid-summary {
	display: grid;
	gap: 8px;
}

.counter-grid-summary__metrics {
	display: grid;
	grid-template-columns:
		minmax(112px, 1fr) minmax(118px, 1fr) minmax(76px, 0.65fr)
		minmax(178px, 1.35fr) minmax(150px, 1.2fr);
	gap: 6px;
	min-width: 0;
}

.counter-grid-summary__metric {
	display: flex;
	min-width: 0;
	height: 48px;
	padding: 5px 9px;
	flex-direction: column;
	justify-content: center;
	border: 1px solid var(--pos-outline);
	border-left: 4px solid #174a70;
	border-radius: 3px;
	background: var(--pos-surface-muted);
}

.counter-grid-summary__metric span {
	font-size: 0.68rem;
	font-weight: 600;
	color: var(--pos-text-secondary);
}

.counter-grid-summary__metric strong {
	overflow: hidden;
	font-size: 0.94rem;
	font-variant-numeric: tabular-nums;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--pos-text-primary);
}

.counter-grid-summary__metric--total {
	border-color: #079b55;
	border-left-color: #079b55;
	background: var(--pos-success-container);
}

.counter-grid-summary__metric--total strong {
	font-size: 1.05rem;
	color: var(--pos-text-primary);
}

.counter-grid-summary__discount {
	min-width: 0;
}

.counter-grid-summary__discount :deep(.v-field) {
	height: 48px;
	border-radius: 3px;
	background: var(--pos-input-bg);
}

.counter-grid-summary__discount :deep(.v-field__input) {
	min-height: 48px;
	font-variant-numeric: tabular-nums;
}

.sticky-summary-card {
	position: sticky;
	bottom: 0;
	z-index: 9;
	border: 1px solid var(--pos-border-light);
	box-shadow: var(--pos-elevation-2);
}

.sticky-summary-card--dock-safe {
	margin-bottom: calc(var(--bottom-safe-space) + 8px);
}

.summary-content {
	row-gap: 6px;
}

.summary-hero {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14px;
	padding: 15px 16px 15px 20px;
	border-radius: var(--pos-radius-md);
	background: var(--pos-surface-muted);
	border: 1px solid var(--pos-border-light);
	overflow: hidden;
}

.summary-hero::before {
	content: "";
	position: absolute;
	inset-block: 0;
	inset-inline-start: 0;
	width: 5px;
	background: var(--pos-primary);
}

.summary-hero__copy {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.summary-hero__eyebrow {
	font-size: 0.72rem;
	font-weight: 750;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--pos-text-secondary);
}

.summary-hero__amount {
	font-family: var(--pos-font-display);
	font-size: clamp(1.35rem, 2vw, 1.9rem);
	font-weight: 750;
	line-height: 1.1;
	font-variant-numeric: tabular-nums;
	color: var(--pos-text-primary);
}

.summary-hero__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 14px;
	font-size: 0.84rem;
	color: var(--pos-text-secondary);
}

.summary-hero__field-wrap {
	width: min(260px, 100%);
}

.invoice-summary-actions {
	position: sticky;
	bottom: 0;
}

.summary-field {
	transition: box-shadow 140ms ease;
}

.summary-field:hover {
	box-shadow: 0 0 0 1px var(--pos-border);
}

.summary-field--alert {
	margin-bottom: 10px;
}

.summary-field--dock :deep(.v-field) {
	background: rgba(var(--v-theme-surface), 0.92);
}

@media (max-width: 1279px) {
	.sticky-summary-card {
		position: static;
		bottom: auto;
		box-shadow: none;
	}

	.invoice-summary-actions {
		position: static;
	}
}

@media (max-width: 1099px) {
	.sticky-summary-card--dock-safe {
		margin-bottom: calc(var(--bottom-safe-space) + 12px);
	}
}

@media (max-width: 768px) {
	.sticky-summary-card {
		position: static;
		bottom: auto;
		box-shadow: none;
	}

	.summary-hero {
		flex-direction: column;
		align-items: stretch;
		padding: 12px;
	}

	.summary-hero__field-wrap {
		width: 100%;
	}

	.invoice-summary-actions {
		position: static;
	}

	.cards {
		padding: 10px 12px !important;
	}

	.summary-field {
		font-size: 0.875rem;
	}

	.sticky-summary-card--dock-safe {
		margin-bottom: calc(var(--bottom-safe-space) + 8px);
	}
}
</style>
