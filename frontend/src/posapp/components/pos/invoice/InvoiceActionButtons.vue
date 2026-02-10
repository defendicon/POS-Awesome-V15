<template>
	<v-row dense>
		<v-col cols="6">
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
		<v-col cols="6">
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
		<v-col cols="6" v-if="pos_profile.custom_allow_select_sales_order == 1">
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
		<v-col cols="6">
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

		<v-col cols="6" v-if="pos_profile.posa_allow_return == 1">
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
		<v-col cols="6" v-if="pos_profile.posa_allow_print_draft_invoices">
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
		<v-col cols="6">
			<v-btn
				block
				color="info"
				theme="dark"
				prepend-icon="mdi-tag"
				@click="$emit('apply-offers')"
				class="summary-btn"
				:loading="applyOffersLoading"
			>
				{{ __("Apply Offers") }}
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
defineProps({
	pos_profile: {
		type: Object,
		required: true,
		default: () => ({}),
	},
	saveLoading: Boolean,
	loadDraftsLoading: Boolean,
	selectOrderLoading: Boolean,
	cancelLoading: Boolean,
	returnsLoading: Boolean,
	printLoading: Boolean,
	applyOffersLoading: Boolean,
	paymentLoading: Boolean,
});

defineEmits([
	"save-and-clear",
	"load-drafts",
	"select-order",
	"cancel-sale",
	"open-returns",
	"print-draft",
	"apply-offers",
	"show-payment",
]);

const __ = window.__;
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
}

.summary-btn :deep(.v-btn__content) {
	white-space: normal !important;
	transition: all 0.2s ease;
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
	font-size: 1.1rem !important;
	background: linear-gradient(135deg, #4caf50, #45a049) !important;
	box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3) !important;
}

.pay-btn:hover {
	background: linear-gradient(135deg, #45a049, #3d8b40) !important;
	box-shadow: 0 6px 16px rgba(76, 175, 80, 0.4) !important;
	transform: translateY(-2px);
}

/* Responsive optimizations */
@media (max-width: 768px) {
	.summary-btn {
		font-size: 0.875rem !important;
		padding: 8px 12px !important;
	}

	.pay-btn {
		font-size: 1rem !important;
	}
}

@media (max-width: 480px) {
	.summary-btn {
		font-size: 0.8rem !important;
		padding: 6px 8px !important;
	}

	.pay-btn {
		font-size: 0.95rem !important;
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
