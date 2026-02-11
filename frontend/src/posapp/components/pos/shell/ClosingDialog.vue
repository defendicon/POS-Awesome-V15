<template>
	<v-dialog v-model="closingDialog" max-width="900px" persistent>
		<v-card elevation="8" class="closing-dialog-card">
			<ClosingHeader @close="closeDialog" />

			<v-card-text class="pa-0 white-background">
				<v-container class="pa-6">
					<v-row class="mb-6">
						<v-col cols="12" class="pa-1">
							<ShiftOverview
								:loading="overviewLoading"
								:primary-insights="primaryInsights"
								:secondary-insights="secondaryInsights"
								:multi-currency-totals="multiCurrencyTotals"
								:credit-invoices-by-currency="creditInvoicesByCurrency"
								:returns-by-currency="returnsByCurrency"
								:change-returned-rows="changeReturnedRows"
								:cash-expected-by-currency="cashExpectedByCurrency"
								:cash-movement-summary="cashMovementSummary"
								:payments-by-mode="paymentsByMode"
								:overview-company-currency="overviewCompanyCurrency"
								:format-currency-with-symbol="formatCurrencyWithSymbol"
								:should-show-company-equivalent="shouldShowCompanyEquivalent"
								:show-exchange-rates="showExchangeRates"
								:format-exchange-rates="formatExchangeRates"
								:is-cash-mode="isCashMode"
								:overpayment-deduction-for-currency="overpaymentDeductionForCurrency"
							/>
						</v-col>
					</v-row>
					<v-row>
						<v-col cols="12" class="pa-1">
							<PaymentReconciliation
								:payments="dialog_data.payment_reconciliation"
								:headers="headers"
								:items-per-page="itemsPerPage"
								:company-currency-symbol="companyCurrencySymbol"
								:format-currency="formatCurrency"
								:format-float="formatFloat"
							/>
						</v-col>
					</v-row>
				</v-container>
			</v-card-text>

			<v-divider></v-divider>
			<v-card-actions class="dialog-actions-container">
				<v-spacer></v-spacer>
				<v-btn
					theme="dark"
					@click="closeDialog"
					class="pos-action-btn cancel-action-btn"
					size="large"
					elevation="2"
				>
					<v-icon start>mdi-close-circle-outline</v-icon>
					<span>{{ __("Close") }}</span>
				</v-btn>
				<v-btn
					theme="dark"
					@click="submitDialog"
					class="pos-action-btn submit-action-btn"
					size="large"
					elevation="2"
				>
					<v-icon start>mdi-check-circle-outline</v-icon>
					<span>{{ __("Submit") }}</span>
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
import { useUIStore } from "../../../stores/uiStore.js";
import { ref, inject, onMounted, onBeforeUnmount, watch } from "vue";
import { useClosingShift } from "../../../composables/pos/closing/useClosingShift";
import { useClosingSummary } from "../../../composables/pos/closing/useClosingSummary";

import ClosingHeader from "../closing/ClosingHeader.vue";
import ShiftOverview from "../closing/ShiftOverview.vue";
import PaymentReconciliation from "../closing/PaymentReconciliation.vue";

export default {
	name: "ClosingDialog",
	components: {
		ClosingHeader,
		ShiftOverview,
		PaymentReconciliation,
	},
	setup() {
		const uiStore = useUIStore();
		const eventBus = inject("eventBus");
		const __ = window.__ || ((t) => t);

		// Initialize composables
		const {
			closingDialog,
			dialog_data,
			overview,
			overviewLoading,
			pos_profile,
			closeDialog,
			fetchOverview,
			submitDialog,
		} = useClosingShift(eventBus);

		// Formatters
		const formatCurrency = (v) => window.format_currency(v);
		const formatFloat = (v, d) => window.flt(v, d);
		const currencySymbol = (c) => window.get_currency_symbol(c);
		const translate = (t) => window.__(t);

		const summaryFormatters = {
			formatCurrencyWithSymbol: (amount, currency) => {
				const resolvedCurrency = currency || "";
				const symbol = currencySymbol(resolvedCurrency);
				const formatted = formatCurrency(amount || 0);
				if (symbol) return `${symbol} ${formatted}`;
				return `${resolvedCurrency} ${formatted}`.trim();
			},
			formatCount: (value) => formatFloat(value || 0, 0),
			formatCurrency,
			currencySymbol,
			__: translate,
		};

		const summary = useClosingSummary(overview, pos_profile, dialog_data, summaryFormatters);

		const headers = ref([]);
		const baseHeaders = [
			{
				title: __("Mode of Payment"),
				value: "mode_of_payment",
				align: "start",
				sortable: true,
			},
			{
				title: __("Opening Amount"),
				align: "end",
				sortable: true,
				value: "opening_amount",
			},
			{
				title: __("Closing Amount"),
				value: "closing_amount",
				align: "end",
				sortable: true,
			},
		];
		const extendedHeaders = [
			{
				title: __("Expected Amount (In Company Currency)"),
				value: "expected_amount",
				align: "end",
				sortable: false,
			},
			{
				title: __("Difference (In Company Currency)"),
				value: "difference",
				align: "end",
				sortable: false,
			},
			{
				title: __("Variance %"),
				value: "variance_percent",
				align: "end",
				sortable: false,
			},
		];

		const handleKeydown = (event) => {
			if (event.key === "Escape" && closingDialog.value) {
				closeDialog();
			}
		};

		onMounted(() => {
			headers.value = [...baseHeaders];
			window.addEventListener("keydown", handleKeydown);

			if (eventBus) {
				eventBus.on("open_ClosingDialog", (data) => {
					closingDialog.value = true;
					dialog_data.value = data;
					fetchOverview(data.pos_opening_shift, pos_profile.value?.currency);
				});
			} else {
				console.error("ClosingDialog: eventBus not provided");
			}
		});

		onBeforeUnmount(() => {
			window.removeEventListener("keydown", handleKeydown);
			if (eventBus) {
				eventBus.off("open_ClosingDialog");
			}
		});

		watch(
			() => uiStore.posProfile,
			(profile) => {
				if (profile) {
					pos_profile.value = profile;
					if (!pos_profile.value.hide_expected_amount) {
						headers.value = [...baseHeaders, ...extendedHeaders];
					} else {
						headers.value = [...baseHeaders];
					}
				}
			},
			{ deep: true, immediate: true },
		);

		return {
			uiStore,
			eventBus,
			closingDialog,
			dialog_data,
			overview,
			overviewLoading,
			pos_profile,
			closeDialog,
			fetchOverview,
			submitDialog,
			...summary,
			// Expose formatters used in template
			formatCurrency,
			formatFloat,
			formatCurrencyWithSymbol: summaryFormatters.formatCurrencyWithSymbol,
			shouldShowCompanyEquivalent: summary.shouldShowCompanyEquivalent,
			showExchangeRates: summary.showExchangeRates,
			formatExchangeRates: summary.formatExchangeRates,
			isCashMode: summary.isCashMode,
			overpaymentDeductionForCurrency: summary.overpaymentDeductionForCurrency,
			headers,
			itemsPerPage: 20,
		};
	},
};
</script>

<style scoped>
.closing-dialog-card {
	border-radius: 16px;
	overflow: hidden;
}

.white-background {
	background-color: rgb(var(--v-theme-surface));
}

.dialog-actions-container {
	padding: 16px 24px;
	border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.pos-action-btn {
	border-radius: 8px;
	text-transform: none;
	font-weight: 600;
	letter-spacing: 0.5px;
	padding: 0 24px;
}

.cancel-action-btn {
	border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.submit-action-btn {
	margin-left: 16px;
}
</style>
