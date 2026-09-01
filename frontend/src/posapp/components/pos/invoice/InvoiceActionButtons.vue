<template>
	<div v-if="isCounterGrid" class="counter-grid-actions" data-testid="counter-grid-actions">
		<v-btn
			variant="tonal"
			prepend-icon="mdi-content-save-outline"
			class="counter-grid-action"
			data-pos-keyboard-target="invoice-action"
			data-testid="invoice-action-save-clear"
			:loading="saveLoading"
			@click="$emit('save-and-clear')"
		>
			{{ __("Save & Clear") }}
		</v-btn>
		<v-btn
			variant="tonal"
			prepend-icon="mdi-tray-full"
			class="counter-grid-action"
			data-pos-keyboard-target="invoice-action"
			data-testid="invoice-action-drafts"
			:loading="loadDraftsLoading"
			@click="$emit('load-drafts')"
		>
			{{ __("Drafts") }}
		</v-btn>
		<v-btn
			variant="tonal"
			prepend-icon="mdi-folder-search-outline"
			class="counter-grid-action"
			data-pos-keyboard-target="invoice-action"
			data-testid="invoice-action-management"
			:loading="invoiceManagementLoading"
			@click="$emit('open-invoice-management')"
		>
			{{ __("Invoices") }}
		</v-btn>
		<v-btn
			v-if="pos_profile.posa_allow_return == 1"
			variant="tonal"
			prepend-icon="mdi-backup-restore"
			class="counter-grid-action"
			data-pos-keyboard-target="invoice-action"
			data-testid="invoice-action-returns"
			:loading="returnsLoading"
			@click="$emit('open-returns')"
		>
			{{ __("Return") }}
		</v-btn>
		<v-menu v-if="showMoreActions" location="top end">
			<template #activator="{ props: menuProps }">
				<v-btn
					v-bind="menuProps"
					variant="tonal"
					prepend-icon="mdi-dots-horizontal"
					class="counter-grid-action"
					data-pos-keyboard-target="invoice-action"
					data-testid="invoice-action-more"
				>
					{{ __("More") }}
				</v-btn>
			</template>
			<v-list density="compact" min-width="220">
				<v-list-item
					prepend-icon="mdi-tag-outline"
					data-pos-keyboard-target="invoice-action"
					data-testid="invoice-action-offers"
					@click="$emit('open-offers')"
				>
					<v-list-item-title>{{ __("Offers") }}</v-list-item-title>
				</v-list-item>
				<v-list-item
					prepend-icon="mdi-ticket-percent-outline"
					data-pos-keyboard-target="invoice-action"
					data-testid="invoice-action-coupons"
					@click="$emit('open-coupons')"
				>
					<v-list-item-title>{{ __("Coupons") }}</v-list-item-title>
				</v-list-item>
				<v-list-item
					v-if="pos_profile.custom_allow_select_sales_order == 1"
					prepend-icon="mdi-book-search"
					data-testid="invoice-action-select-order"
					:disabled="selectOrderLoading"
					@click="$emit('select-order')"
				>
					<v-list-item-title>{{ __("Select Sales Order") }}</v-list-item-title>
				</v-list-item>
				<v-list-item
					v-if="pos_profile.posa_allow_print_draft_invoices"
					prepend-icon="mdi-printer"
					data-testid="invoice-action-print-draft"
					:disabled="printLoading"
					@click="$emit('print-draft')"
				>
					<v-list-item-title>{{ __("Print Draft") }}</v-list-item-title>
				</v-list-item>
				<v-list-item
					v-if="showCustomerDisplayButton"
					prepend-icon="mdi-monitor"
					data-testid="invoice-action-customer-display"
					:disabled="customerDisplayLoading"
					@click="$emit('open-customer-display')"
				>
					<v-list-item-title>{{ __("Customer Screen") }}</v-list-item-title>
				</v-list-item>
			</v-list>
		</v-menu>
		<v-btn
			color="error"
			variant="tonal"
			prepend-icon="mdi-close-circle-outline"
			class="counter-grid-action counter-grid-action--cancel"
			data-pos-keyboard-target="invoice-action"
			data-testid="invoice-action-cancel-sale"
			:loading="cancelLoading"
			@click="$emit('cancel-sale')"
		>
			{{ __("Cancel") }}
		</v-btn>
		<v-btn
			color="success"
			variant="flat"
			prepend-icon="mdi-credit-card-check-outline"
			class="counter-grid-action counter-grid-action--pay"
			data-pos-keyboard-target="pay"
			data-testid="invoice-action-pay"
			:loading="paymentLoading"
			@click="$emit('show-payment')"
		>
			{{ __("Pay") }}
		</v-btn>
	</div>

	<v-row v-else dense>
		<v-col cols="12" sm="6">
			<v-btn
				block
				color="accent"
				theme="dark"
				prepend-icon="mdi-content-save"
				@click="$emit('save-and-clear')"
				class="summary-btn summary-btn--utility"
				data-pos-keyboard-target="invoice-action"
				data-testid="invoice-action-save-clear"
				:loading="saveLoading"
			>
				{{ __("Save & Clear") }}
			</v-btn>
		</v-col>
		<v-col cols="12" sm="6">
			<v-btn
				block
				color="warning"
				theme="dark"
				prepend-icon="mdi-tray-full"
				@click="$emit('load-drafts')"
				class="summary-btn summary-btn--utility"
				data-pos-keyboard-target="invoice-action"
				data-testid="invoice-action-drafts"
				:loading="loadDraftsLoading"
			>
				{{ __("Drafts") }}
			</v-btn>
		</v-col>
		<v-col cols="12" sm="6" v-if="pos_profile.custom_allow_select_sales_order == 1">
			<v-btn
				block
				color="info"
				theme="dark"
				prepend-icon="mdi-book-search"
				@click="$emit('select-order')"
				class="summary-btn summary-btn--utility"
				data-pos-keyboard-target="invoice-action"
				data-testid="invoice-action-select-order"
				:loading="selectOrderLoading"
			>
				{{ __("Select S.O") }}
			</v-btn>
		</v-col>
		<v-col cols="12" sm="6">
			<v-btn
				block
				color="deep-purple"
				theme="dark"
				prepend-icon="mdi-folder-search-outline"
				@click="$emit('open-invoice-management')"
				class="summary-btn summary-btn--utility"
				data-pos-keyboard-target="invoice-action"
				data-testid="invoice-action-management"
				:loading="invoiceManagementLoading"
			>
				{{ __("Invoice Mgmt") }}
			</v-btn>
		</v-col>
		<v-col cols="12" sm="6">
			<v-btn
				block
				color="error"
				theme="dark"
				prepend-icon="mdi-close-circle"
				@click="$emit('cancel-sale')"
				class="summary-btn summary-btn--danger"
				data-pos-keyboard-target="invoice-action"
				data-testid="invoice-action-cancel-sale"
				:loading="cancelLoading"
			>
				{{ __("Cancel Sale") }}
			</v-btn>
		</v-col>

		<v-col cols="12" sm="6" v-if="pos_profile.posa_allow_return == 1">
			<v-btn
				block
				color="secondary"
				theme="dark"
				prepend-icon="mdi-backup-restore"
				@click="$emit('open-returns')"
				class="summary-btn summary-btn--utility"
				data-pos-keyboard-target="invoice-action"
				data-testid="invoice-action-returns"
				:loading="returnsLoading"
			>
				{{ __("Sales Return") }}
			</v-btn>
		</v-col>
		<v-col cols="12" sm="6" v-if="pos_profile.posa_allow_print_draft_invoices">
			<v-btn
				block
				color="primary"
				theme="dark"
				prepend-icon="mdi-printer"
				@click="$emit('print-draft')"
				class="summary-btn summary-btn--utility"
				data-pos-keyboard-target="invoice-action"
				data-testid="invoice-action-print-draft"
				:loading="printLoading"
			>
				{{ __("Print Draft") }}
			</v-btn>
		</v-col>
		<v-col cols="12" sm="6" v-if="showCustomerDisplayButton">
			<v-btn
				block
				color="indigo"
				theme="dark"
				prepend-icon="mdi-monitor"
				@click="$emit('open-customer-display')"
				class="summary-btn summary-btn--utility"
				data-pos-keyboard-target="invoice-action"
				data-testid="invoice-action-customer-display"
				:loading="customerDisplayLoading"
			>
				{{ __("Customer Screen") }}
			</v-btn>
		</v-col>
		<v-col cols="12">
			<v-btn
				block
				color="success"
				theme="dark"
				size="large"
				prepend-icon="mdi-credit-card"
				@click="$emit('show-payment')"
				class="summary-btn pay-btn"
				data-pos-keyboard-target="pay"
				data-testid="invoice-action-pay"
				:loading="paymentLoading"
			>
				{{ __("PAY") }}
			</v-btn>
		</v-col>
	</v-row>
</template>

<script setup>
import { computed } from "vue";
import { parseBooleanSetting } from "../../../utils/stock";

const props = defineProps({
	presentation: {
		type: String,
		default: "classic",
	},
	pos_profile: {
		type: Object,
		required: true,
		default: () => ({}),
	},
	saveLoading: Boolean,
	loadDraftsLoading: Boolean,
	selectOrderLoading: Boolean,
	cancelLoading: Boolean,
	invoiceManagementLoading: Boolean,
	returnsLoading: Boolean,
	printLoading: Boolean,
	paymentLoading: Boolean,
	customerDisplayLoading: Boolean,
});

defineEmits([
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
]);

const __ = window.__;
const isCounterGrid = computed(() => props.presentation === "counter-grid");
const showCustomerDisplayButton = computed(() =>
	parseBooleanSetting(props.pos_profile?.posa_enable_customer_display),
);
const showMoreActions = computed(
	() =>
		isCounterGrid.value ||
		props.pos_profile?.custom_allow_select_sales_order == 1 ||
		Boolean(props.pos_profile?.posa_allow_print_draft_invoices) ||
		showCustomerDisplayButton.value,
);
</script>

<style scoped>
.counter-grid-actions {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
	gap: 6px;
	min-width: 0;
	--counter-rugged-navy: #09253d;
	--counter-rugged-blue: #0f70d7;
	--counter-rugged-green: #079b55;
	--counter-rugged-red: #dc343d;
}

.counter-grid-action {
	height: 38px !important;
	min-width: 0 !important;
	padding-inline: 10px !important;
	border: 1px solid var(--pos-outline) !important;
	border-radius: 3px !important;
	background: var(--pos-button-bg) !important;
	color: var(--pos-text-primary) !important;
	font-size: 0.76rem !important;
	font-weight: 650 !important;
	text-transform: none !important;
}

.counter-grid-action:hover {
	border-color: var(--counter-rugged-blue) !important;
	background: #dbeafa !important;
}

.counter-grid-action.text-error,
.counter-grid-action--cancel {
	border-color: #b7202a !important;
	background: var(--counter-rugged-red) !important;
	color: #ffffff !important;
}

.counter-grid-action :deep(.v-btn__content) {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.counter-grid-action--pay {
	grid-column: span 2;
	border-color: #05743f !important;
	background: var(--counter-rugged-green) !important;
	color: #ffffff !important;
	font-size: 0.86rem !important;
}

.counter-grid-action--pay:hover {
	background: #07884b !important;
}

.white-text-btn {
	color: var(--pos-text-primary) !important;
}

.white-text-btn :deep(.v-btn__content) {
	color: var(--pos-text-primary) !important;
}

/* Enhanced button styling with better performance */
.summary-btn {
	transition:
		transform 140ms ease,
		box-shadow 140ms ease,
		border-color 140ms ease,
		background-color 140ms ease !important;
	position: relative;
	overflow: hidden;
	min-height: var(--pos-control-height) !important;
	border-radius: var(--pos-radius-sm) !important;
	font-weight: 650 !important;
	text-transform: none !important;
}

.summary-btn :deep(.v-btn__content) {
	white-space: normal !important;
	transition: all 0.2s ease;
}

.summary-btn:hover {
	transform: translateY(-1px);
}

.summary-btn:active {
	transform: translateY(0);
}

.summary-btn--utility {
	border: 1px solid var(--pos-border) !important;
	background: var(--pos-button-bg) !important;
	color: var(--pos-text-primary) !important;
	box-shadow: none !important;
}

.summary-btn--utility:hover {
	border-color: var(--pos-primary) !important;
	background: var(--pos-primary-container) !important;
	color: var(--pos-primary-variant) !important;
	box-shadow: var(--pos-elevation-1) !important;
}

.summary-btn--danger {
	border: 1px solid color-mix(in srgb, var(--pos-error) 46%, var(--pos-border)) !important;
	background: var(--pos-error-container) !important;
	color: var(--pos-error) !important;
	box-shadow: none !important;
}

.summary-btn--danger:hover {
	border-color: var(--pos-error) !important;
	background: color-mix(in srgb, var(--pos-error-container) 82%, var(--pos-error)) !important;
	box-shadow: var(--pos-elevation-1) !important;
}

/* Special styling for the PAY button */
.pay-btn {
	min-height: 52px !important;
	border: 1px solid color-mix(in srgb, var(--pos-success) 78%, #000000) !important;
	font-weight: 750 !important;
	font-size: 1.05rem !important;
	letter-spacing: 0.02em !important;
	background: var(--pos-success) !important;
	color: #ffffff !important;
	box-shadow: 0 8px 18px color-mix(in srgb, var(--pos-success) 24%, transparent) !important;
}

.pay-btn:hover {
	background: color-mix(in srgb, var(--pos-success) 88%, #000000) !important;
	box-shadow: 0 10px 22px color-mix(in srgb, var(--pos-success) 32%, transparent) !important;
	transform: translateY(-1px);
}

:global([data-theme="dark"]) .pay-btn,
:global([data-theme-mode="dark"]) .pay-btn {
	color: #10201b !important;
}

/* Responsive optimizations */
@media (max-width: 768px) {
	.summary-btn {
		font-size: 0.8rem !important;
		padding: 4px 8px !important;
		min-height: var(--pos-control-height) !important;
	}

	.pay-btn {
		font-size: 0.95rem !important;
		min-height: 48px !important;
	}
}

@media (max-width: 480px) {
	.summary-btn {
		font-size: 0.74rem !important;
		padding: 3px 6px !important;
		min-height: var(--pos-control-height) !important;
	}

	.pay-btn {
		font-size: 0.85rem !important;
		min-height: 50px !important;
	}
}

/* Loading state animations */
.summary-btn:deep(.v-btn__loader) {
	opacity: 0.8;
}

/* Dark theme enhancements */
:deep([data-theme="dark"]) .summary-btn,
:deep(.v-theme--dark) .summary-btn {
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
}

:deep([data-theme="dark"]) .summary-btn:hover,
:deep(.v-theme--dark) .summary-btn:hover {
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
}
</style>
