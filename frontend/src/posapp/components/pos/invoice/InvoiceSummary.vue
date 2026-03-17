<template>
	<v-card
		class="cards sticky-summary-card mb-0 py-2 px-3 rounded-lg pos-themed-card"
		:class="{ 'sticky-summary-card--dock-safe': useCompactSaleDock }"
	>
		<v-row dense class="summary-content">
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
					:selectPurchaseOrderLoading="selectPurchaseOrderLoading"
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
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { loadItemSelectorSettings } from "../../../utils/itemSelectorSettings";
import { useResponsive } from "../../../composables/core/useResponsive";
import InvoiceActionButtons from "./InvoiceActionButtons.vue";

defineOptions({
	name: "InvoiceSummary",
});

const props = defineProps({
	pos_profile: Object,
	total_qty: [Number, String],
	additional_discount: Number,
	additional_discount_percentage: Number,
	total_items_discount_amount: Number,
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
const responsive = useResponsive();

const additionalDiscountDisplay = ref(normalizeDiscountDisplay(props.additional_discount));
const additionalDiscountPercentageDisplay = ref(
	normalizeDiscountDisplay(props.additional_discount_percentage),
);
const useCompactSaleDock = computed(() => responsive.windowWidth.value < 1100);
const showReturnDiscountAlert = computed(
	() =>
		!!props.return_discount_meta &&
		!props.pos_profile?.posa_use_percentage_discount &&
		!isFullReturnDiscount(props.return_discount_meta?.ratio),
);

const hide_qty_decimals = computed(() => {
	const opts = loadItemSelectorSettings();
	return !!opts?.hide_qty_decimals;
});

watch(
	() => props.additional_discount,
	(value) => {
		if (!isEditingAdditionalDiscount.value) {
			additionalDiscountDisplay.value = normalizeDiscountDisplay(value);
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

function handleAdditionalDiscountUpdate(value) {
	emit("update:additional_discount", value);
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

async function handleLoadDrafts() {
	loadDraftsLoading.value = true;
	try {
		await emit("load-drafts");
	} finally {
		loadDraftsLoading.value = false;
	}
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

defineExpose({
	focusAdditionalDiscountField,
});
</script>

<style scoped>
.cards {
	background-color: var(--pos-card-bg) !important;
	transition: all 0.3s ease;
}

.sticky-summary-card {
	position: sticky;
	bottom: 0;
	z-index: 9;
	box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.08);
}

.sticky-summary-card--dock-safe {
	margin-bottom: calc(var(--bottom-safe-space) + 8px);
}

.summary-content {
	row-gap: 6px;
}

.summary-hero {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14px;
	padding: 14px 16px;
	border-radius: 20px;
	background:
		linear-gradient(135deg, rgba(var(--v-theme-primary), 0.12), rgba(var(--v-theme-success), 0.08)),
		var(--pos-surface-muted);
	border: 1px solid rgba(var(--v-theme-primary), 0.12);
}

.summary-hero__copy {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.summary-hero__eyebrow {
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--pos-text-secondary);
}

.summary-hero__amount {
	font-size: clamp(1.2rem, 2vw, 1.8rem);
	line-height: 1.1;
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
	transition: all 0.2s ease;
}

.summary-field:hover {
	transform: translateY(-1px);
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
