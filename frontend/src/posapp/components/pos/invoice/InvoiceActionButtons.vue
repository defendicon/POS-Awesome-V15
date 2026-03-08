<template>
	<v-row dense class="invoice-action-grid">
		<v-col cols="12" sm="6">
			<v-btn
				block
				color="accent"
				theme="dark"
				prepend-icon="mdi-content-save"
				@click="$emit('save-and-clear')"
				class="summary-btn"
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
				prepend-icon="mdi-file-document"
				@click="$emit('load-drafts')"
				class="white-text-btn summary-btn"
				:loading="loadDraftsLoading"
			>
				{{ __("Load Drafts") }}
			</v-btn>
		</v-col>
		<v-col cols="12" sm="6" v-if="pos_profile.custom_allow_select_sales_order == 1">
			<v-btn
				block
				color="info"
				theme="dark"
				prepend-icon="mdi-book-search"
				@click="$emit('select-order')"
				class="summary-btn"
				:loading="selectOrderLoading"
			>
				{{ __("Select S.O") }}
			</v-btn>
		</v-col>
		<v-col cols="12" sm="6">
			<v-btn
				block
				color="info"
				theme="dark"
				prepend-icon="mdi-folder-search-outline"
				@click="$emit('open-invoice-management')"
				class="summary-btn"
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
				class="summary-btn"
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
				class="summary-btn"
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
				class="summary-btn"
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
				class="summary-btn"
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
]);

const __ = window.__;
const showCustomerDisplayButton = computed(() =>
	parseBooleanSetting(props.pos_profile?.posa_enable_customer_display),
);
</script>

<style scoped>
.white-text-btn {
	color: var(--pos-text-primary) !important;
}

.white-text-btn :deep(.v-btn__content) {
	color: var(--pos-text-primary) !important;
}

/* Enhanced button styling with better performance */
.summary-btn {
	transition: all 0.2s ease !important;
	position: relative;
	overflow: hidden;
	min-height: max(44px, var(--pos-touch-target, 42px)) !important;
	border-radius: var(--pos-radius-sm) !important;
}

.summary-btn :deep(.v-btn__content) {
	white-space: normal !important;
	transition: all 0.2s ease;
	line-height: 1.2;
	text-align: center;
}

.summary-btn:hover {
	transform: translateY(-1px);
	box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
}

.summary-btn:active {
	transform: translateY(0);
}

/* Special styling for the PAY button */
.pay-btn {
	font-weight: 600 !important;
	font-size: 1rem !important;
	background: linear-gradient(135deg, #16a34a, #15803d) !important;
	box-shadow: 0 6px 14px rgba(22, 163, 74, 0.34) !important;
	min-height: 50px !important;
}

.pay-btn:hover {
	background: linear-gradient(135deg, #15803d, #166534) !important;
	box-shadow: 0 8px 18px rgba(22, 163, 74, 0.4) !important;
	transform: translateY(-2px);
}

/* Responsive optimizations */
@media (max-width: 768px) {
	.summary-btn {
		font-size: 0.88rem !important;
		padding: 8px 10px !important;
		min-height: 46px !important;
	}

	.pay-btn {
		font-size: 1rem !important;
		min-height: 52px !important;
	}
}

@media (max-width: 480px) {
	.summary-btn {
		font-size: 0.86rem !important;
		padding: 8px !important;
		min-height: 44px !important;
	}

	.pay-btn {
		font-size: 0.96rem !important;
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

.summary-btn:focus-visible {
	outline: 2px solid var(--pos-focus-ring);
	outline-offset: 2px;
}

.invoice-action-grid {
	row-gap: 6px;
}

@media (max-width: 768px) {
	.invoice-action-grid {
		row-gap: 8px;
	}
}

@media (hover: none) and (pointer: coarse) {
	.summary-btn {
		min-height: 46px !important;
	}
}
</style>
