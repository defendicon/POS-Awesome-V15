<!-- eslint-disable vue/multi-word-component-names -->
<template>
	<div :class="['payment-shell', { 'payment-shell--dialog': dialogMode }]">
		<v-card
			:class="[
				'selection mx-auto my-0 pos-themed-card payment-card',
				dialogMode ? 'payment-card--dialog' : 'mt-3',
			]"
		>
			<v-progress-linear
				:active="loading"
				:indeterminate="loading"
				absolute
				location="top"
				color="info"
			></v-progress-linear>
			<div ref="paymentContainer" class="overflow-y-auto payment-scroll">
				<div :class="['payment-sections', { 'payment-sections--dialog': dialogMode }]">
					<section class="payment-section payment-section--summary">
						<div class="payment-section__header">
							<h3 class="payment-section__title">{{ __("Payment Summary") }}</h3>
						</div>
						<PaymentSummary
							:invoice_doc="invoice_doc"
							:total_payments_display="total_payments_display"
							:diff_payment_display="diff_payment_display"
							:diff_label="diff_label"
							:diff-payment="diff_payment"
							:change_due="change_due"
							:paid_change="paid_change"
							:credit_change="credit_change"
							:paid_change_rules="paid_change_rules"
							:currencySymbol="currencySymbol"
							:formatCurrency="formatCurrency"
							:gift-card-applied-amount="giftCardAppliedAmount"
							:gift-card-code="giftCardRedemptions[0]?.gift_card_code || ''"
							@show-paid-amount="showPaidAmount"
							@show-diff-payment="showDiffPayment"
							@show-paid-change="showPaidChange"
							@update-credit-change="handleCreditChangeUpdate"
						/>
					</section>

					<section
						v-if="is_cashback && invoice_doc"
						class="payment-section payment-section--methods"
					>
						<div class="payment-section__header">
							<h3 class="payment-section__title">{{ __("Payment Methods") }}</h3>
						</div>
						<PaymentMethods
							:payments="visiblePaymentMethods"
							:currency="invoice_doc.currency"
							:isReturn="invoice_doc.is_return"
							:requestPaymentField="request_payment_field"
							:currencySymbol="currencySymbol"
							:formatCurrency="formatCurrency"
							:isNumber="isNumber"
							:getVisibleDenominations="getVisibleDenominations"
							:isCashLikePayment="isCashLikePayment"
							:isMpesaC2bPayment="is_mpesa_c2b_payment"
							:isGiftCardPayment="isGiftCardPayment"
							@update-amount="handlePaymentAmountChange"
							@set-full-amount="set_full_amount"
							@set-denomination="setPaymentToDenomination"
							@mpesa-dialog="mpesa_c2b_dialog"
							@request-payment="request_payment"
							@set-rest-amount="set_rest_amount"
							@open-gift-card="openGiftCardDialog"
						/>
						<PaymentGiftCardSection
							:enabled="Boolean(pos_profile?.posa_use_gift_cards)"
							:expanded="giftCardInlineExpanded"
							:applied-amount="giftCardAppliedAmount"
							:card-code="giftCardCode || giftCardRedemptions[0]?.gift_card_code || ''"
							:redeem-amount="giftCardAmount"
							:balance="giftCardBalance"
							:status="giftCardStatus"
							:loading="giftCardLoading"
							:error-message="giftCardError"
							:format-currency="(value) => formatCurrency(value, invoice_doc.currency)"
							@toggle="toggleGiftCardInline"
							@update:card-code="giftCardCode = $event"
							@update:redeem-amount="giftCardAmount = $event"
							@check-balance="checkGiftCardBalance"
							@apply="applyGiftCardRedemption"
							@clear="clearGiftCardRedemption"
						/>
					</section>

					<section class="payment-section payment-section--adjustments">
						<div class="payment-section__header">
							<h3 class="payment-section__title">{{ __("Redemption and Totals") }}</h3>
						</div>
						<PaymentRedemption
							:invoice-doc="invoice_doc"
							:customer-info="customer_info"
							:pos-profile="pos_profile"
							:available-points-amount="available_points_amount"
							:loyalty-amount="loyalty_amount"
							:available-customer-credit="available_customer_credit"
							:redeem-customer-credit="redeem_customer_credit"
							:redeemed-customer-credit="redeemed_customer_credit"
							:format-currency="formatCurrency"
							:format-float="formatFloat"
							:currency-symbol="currencySymbol"
							@set-formatted-currency="handleRedemptionFormattedCurrency"
						/>
						<InvoiceTotals
							:invoice_doc="invoice_doc"
							:displayCurrency="displayCurrency"
							:diff_payment="diff_payment"
							:diff_label="diff_label"
							:item-discount-total="paymentItemDiscountTotal"
							:currencySymbol="currencySymbol"
							:formatCurrency="formatCurrency"
						/>
						<div class="payment-section__subsection">
							<h3 class="payment-section__title payment-section__title--subsection">
								{{ __("Fulfillment Details") }}
							</h3>
						</div>
						<PaymentAdditionalInfo
							:invoice-doc="invoice_doc"
							:pos-profile="pos_profile"
							:invoice-type="invoiceType"
							:return-validity-enabled="returnValidityEnabled"
							:return-validity-min-date="returnValidityMinDate"
							:addresses="addresses"
							:new-delivery-date="new_delivery_date"
							:return-valid-upto-date="return_valid_upto_date"
							:address-filter="addressFilter"
							@update:new-delivery-date="
								(val) => {
									new_delivery_date = val;
									update_delivery_date();
								}
							"
							@update:return-valid-upto-date="
								(val) => {
									return_valid_upto_date = val;
									updateReturnValidUpto();
								}
							"
							@new-address="new_address"
						/>
						<PaymentPurchaseOrder
							:invoice-doc="invoice_doc"
							:pos-profile="pos_profile"
							:new-po-date="new_po_date"
							@update:new-po-date="
								(val) => {
									new_po_date = val;
									update_po_date();
								}
							"
						/>
					</section>

					<section class="payment-section payment-section--settlement">
						<div class="payment-section__header">
							<h3 class="payment-section__title">{{ __("Credit and Output") }}</h3>
						</div>
						<PaymentOptions
							:invoice-doc="invoice_doc"
							:pos-profile="pos_profile"
							:diff-payment="diff_payment"
							:credit-change="credit_change"
							:is-write-off-change="is_write_off_change"
							:is-credit-sale="is_credit_sale"
							:is-cashback="is_cashback"
							:is-credit-return="is_credit_return"
							:new-credit-due-date="new_credit_due_date"
							:credit-due-days="credit_due_days"
							:credit-due-presets="credit_due_presets"
							:write-off-amount="invoice_doc.write_off_amount || Math.max(diff_payment, 0)"
							:write-off-max-amount="writeOffProfileLimit"
							:redeem-customer-credit="redeem_customer_credit"
							:available-customer-credit="available_customer_credit"
							:redeemed-customer-credit="redeemed_customer_credit"
							:customer-credit-sources="customer_credit_dict.length"
							:format-currency="formatCurrency"
							@update:is-write-off-change="is_write_off_change = $event"
							@update:is-credit-sale="is_credit_sale = $event"
							@update:is-cashback="is_cashback = $event"
							@update:is-credit-return="is_credit_return = $event"
							@update:new-credit-due-date="
								(val) => {
									new_credit_due_date = val;
									update_credit_due_date();
								}
							"
							@update:credit-due-days="credit_due_days = $event"
							@update:write-off-amount="handleWriteOffAmountUpdate"
							@apply-due-preset="applyDuePreset"
							@update:redeem-customer-credit="redeem_customer_credit = $event"
							@get-available-credit="get_available_credit"
						/>
						<PaymentCustomerCreditDetails
							:invoice-doc="invoice_doc"
							:available-customer-credit="available_customer_credit"
							:redeem-customer-credit="redeem_customer_credit"
							:customer-credit-dict="customer_credit_dict"
							:credit-source-label="creditSourceLabel"
							:format-currency="formatCurrency"
							:currency-symbol="currencySymbol"
							@set-formatted-currency="
								(data) =>
									setFormatedCurrency(data.target, data.field, null, false, data.value)
							"
						/>
					</section>

					<section class="payment-section payment-section--meta">
						<div class="payment-section__header">
							<h3 class="payment-section__title">{{ __("Sales Person and Print") }}</h3>
						</div>
						<PaymentSelectionFields
							:sales-persons="sales_persons"
							:sales-person="sales_person"
							:readonly="readonly"
							:print-formats="print_formats"
							:print-format="print_format"
							:show-print-format="
								parseBooleanSetting(pos_profile?.posa_allow_select_print_format_in_payments)
							"
							@update:sales-person="sales_person = $event"
							@update:print-format="print_format = $event"
						/>
					</section>
				</div>
			</div>
		</v-card>

		<div :class="['payment-footer', { 'payment-footer--dialog': dialogMode }]">
			<PaymentActionButtons
				ref="submitButton"
				:loading="loading"
				:validatePayment="validatePayment"
				:highlightSubmit="highlightSubmit"
				:compact="dialogMode"
				@submit="submit"
				@submit-and-print="submit(undefined, false, true)"
				@cancel="back_to_invoice"
			/>
		</div>
		<!-- Dialogs Section (Custom Days, Phone Payment) -->
		<PaymentDialogs
			:custom-days-dialog="custom_days_dialog"
			:custom-days-value="custom_days_value"
			:phone-dialog="phone_dialog"
			:invoice-doc="invoice_doc"
			@update:custom-days-dialog="custom_days_dialog = $event"
			@update:custom-days-value="custom_days_value = $event"
			@apply-custom-days="applyCustomDays"
			@update:phone-dialog="phone_dialog = $event"
			@request-payment="request_payment"
		/>
		<GiftCardDialog
			:model-value="giftCardDialogOpen"
			:card-code="giftCardCode"
			:redeem-amount="giftCardAmount"
			:balance="giftCardBalance"
			:status="giftCardStatus"
			:is-supervisor="Boolean(currentCashier?.is_supervisor)"
			:loading="giftCardLoading"
			:mode="giftCardMode"
			:error-message="giftCardError"
			@update:model-value="giftCardDialogOpen = $event"
			@update:card-code="giftCardCode = $event"
			@update:redeem-amount="giftCardAmount = $event"
			@set-mode="setGiftCardMode"
			@check-balance="checkGiftCardBalance"
			@apply-redemption="applyGiftCardRedemption"
			@issue-card="issueGiftCard"
			@top-up-card="topUpGiftCard"
		/>
	</div>
</template>

<script setup>
import GiftCardDialog from "./wallet/GiftCardDialog.vue";
import PaymentSummary from "./payments/PaymentSummary.vue";
import InvoiceTotals from "./payments/InvoiceTotals.vue";
import PaymentActionButtons from "./payments/PaymentActionButtons.vue";
import PaymentMethods from "./payments/PaymentMethods.vue";
import PaymentGiftCardSection from "./payments/PaymentGiftCardSection.vue";
import PaymentRedemption from "./payments/PaymentRedemption.vue";
import PaymentAdditionalInfo from "./payments/PaymentAdditionalInfo.vue";
import PaymentPurchaseOrder from "./payments/PaymentPurchaseOrder.vue";
import PaymentCustomerCreditDetails from "./payments/PaymentCustomerCreditDetails.vue";
import PaymentOptions from "./payments/PaymentOptions.vue";
import PaymentSelectionFields from "./payments/PaymentSelectionFields.vue";
import PaymentDialogs from "./payments/PaymentDialogs.vue";
import { parseBooleanSetting } from "../../utils/stock";
import { usePaymentsScreen } from "../../composables/pos/payments/usePaymentsScreen";

defineProps({
	dialogMode: {
		type: Boolean,
		default: false,
	},
});

const {
	__,
	invoice_doc,
	loading,
	paymentContainer,
	pos_profile,
	total_payments_display,
	diff_payment_display,
	diff_label,
	diff_payment,
	change_due,
	paid_change,
	credit_change,
	paid_change_rules,
	currencySymbol,
	formatCurrency,
	formatFloat,
	isNumber,
	setFormatedCurrency,
	giftCardAppliedAmount,
	giftCardRedemptions,
	showPaidAmount,
	showDiffPayment,
	showPaidChange,
	handleCreditChangeUpdate,
	is_cashback,
	visiblePaymentMethods,
	request_payment_field,
	getVisibleDenominations,
	isCashLikePayment,
	is_mpesa_c2b_payment,
	isGiftCardPayment,
	handlePaymentAmountChange,
	set_full_amount,
	setPaymentToDenomination,
	mpesa_c2b_dialog,
	request_payment,
	set_rest_amount,
	openGiftCardDialog,
	giftCardInlineExpanded,
	giftCardCode,
	giftCardAmount,
	giftCardBalance,
	giftCardStatus,
	giftCardLoading,
	giftCardError,
	toggleGiftCardInline,
	checkGiftCardBalance,
	applyGiftCardRedemption,
	clearGiftCardRedemption,
	customer_info,
	available_points_amount,
	loyalty_amount,
	available_customer_credit,
	redeem_customer_credit,
	redeemed_customer_credit,
	handleRedemptionFormattedCurrency,
	displayCurrency,
	paymentItemDiscountTotal,
	invoiceType,
	returnValidityEnabled,
	returnValidityMinDate,
	addresses,
	new_delivery_date,
	return_valid_upto_date,
	addressFilter,
	update_delivery_date,
	updateReturnValidUpto,
	new_address,
	new_po_date,
	update_po_date,
	update_credit_due_date,
	is_write_off_change,
	is_credit_sale,
	is_credit_return,
	new_credit_due_date,
	credit_due_days,
	credit_due_presets,
	writeOffProfileLimit,
	customer_credit_dict,
	handleWriteOffAmountUpdate,
	applyDuePreset,
	get_available_credit,
	sales_persons,
	sales_person,
	readonly,
	print_formats,
	print_format,
	submitButton,
	validatePayment,
	highlightSubmit,
	submit,
	back_to_invoice,
	custom_days_dialog,
	custom_days_value,
	phone_dialog,
	applyCustomDays,
	giftCardDialogOpen,
	currentCashier,
	giftCardMode,
	setGiftCardMode,
	issueGiftCard,
	topUpGiftCard,
	creditSourceLabel,
} = usePaymentsScreen();

</script>

<style scoped>
/* Remove readonly styling */
.v-text-field--readonly {
	cursor: text;
}

.v-text-field--readonly:hover {
	background-color: transparent;
}

.cards {
	background-color: var(--pos-surface-muted) !important;
}

.payment-shell {
	padding: 0;
}

.payment-shell--dialog {
	height: calc(100dvh - 48px);
	display: flex;
	flex-direction: column;
	gap: var(--pos-space-2);
}

.payment-card {
	padding: var(--pos-space-2);
}

.payment-card--dialog {
	flex: 1 1 auto;
	min-height: 0;
	height: auto;
	max-height: none;
	margin-top: 0;
	display: flex;
	flex-direction: column;
}

.payment-scroll {
	padding: var(--pos-space-3);
	display: flex;
	flex-direction: column;
	gap: var(--pos-space-3);
	flex: 1 1 auto;
	min-height: 0;
}

.payment-sections {
	display: flex;
	flex-direction: column;
	gap: var(--pos-space-3);
}

.payment-sections--dialog {
	display: grid;
	grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
	gap: var(--pos-space-2);
	align-items: start;
	grid-template-areas:
		"summary adjustments"
		"methods adjustments"
		"settlement adjustments"
		"settlement meta";
}

.payment-section {
	background: var(--pos-surface-muted);
	border: 1px solid var(--pos-border-light);
	border-radius: var(--pos-radius-md);
	padding: var(--pos-space-3);
	display: flex;
	flex-direction: column;
	gap: var(--pos-space-3);
}

.payment-sections--dialog .payment-section {
	padding: 10px;
	gap: 10px;
}

.payment-sections--dialog .payment-section--summary {
	grid-area: summary;
}

.payment-sections--dialog .payment-section--methods {
	grid-area: methods;
}

.payment-sections--dialog .payment-section--settlement {
	grid-area: settlement;
}

.payment-sections--dialog .payment-section--adjustments {
	grid-area: adjustments;
}

.payment-sections--dialog .payment-section--meta {
	grid-area: meta;
}

.payment-section--summary {
	background: linear-gradient(180deg, rgba(var(--v-theme-primary), 0.08) 0%, var(--pos-surface-muted) 100%);
}

.payment-section__header {
	display: flex;
	flex-direction: column;
	gap: 0;
}

.payment-section__subsection {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-top: var(--pos-space-1);
	border-top: 1px solid var(--pos-border-light);
}

.payment-section__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	line-height: 1.2;
	color: var(--pos-text-primary);
}

.payment-section__title--subsection {
	font-size: 0.92rem;
}

:deep(.payment-section .v-divider) {
	display: none;
}

:deep(.payment-section .v-field) {
	border-radius: var(--pos-radius-sm);
}

.payment-footer {
	flex: 0 0 auto;
	position: sticky;
	bottom: 0;
	z-index: 8;
	padding-top: 8px;
	background: linear-gradient(180deg, rgba(255, 255, 255, 0), var(--pos-surface) 30%);
}

.payment-footer--dialog {
	margin-top: 0;
}

:deep(.payment-footer--dialog .cards) {
	margin-top: 0 !important;
}

:deep(.payment-footer--dialog .v-btn) {
	min-height: 42px;
}

:deep(.payment-shell--dialog .payment-methods) {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: var(--pos-space-2);
}

:deep(.payment-shell--dialog .payment-method-card) {
	padding: 10px;
	gap: 10px;
}

:deep(.payment-shell--dialog .payment-summary-grid),
:deep(.payment-shell--dialog .invoice-totals-grid),
:deep(.payment-shell--dialog .payments),
:deep(.payment-shell--dialog .selection-fields .v-row) {
	row-gap: 6px;
}

:deep(.payment-shell--dialog .selection-fields p) {
	display: none;
}

:deep(.payment-shell--dialog .payment-summary-grid .v-col),
:deep(.payment-shell--dialog .invoice-totals-grid .v-col),
:deep(.payment-shell--dialog .payments .v-col),
:deep(.payment-shell--dialog .selection-fields .v-col) {
	padding-top: 2px;
	padding-bottom: 2px;
}

:deep(.payment-shell--dialog .payment-section .v-field__input) {
	min-height: 34px;
	padding-top: 4px;
	padding-bottom: 4px;
}

:deep(.payment-shell--dialog .payment-section .v-label) {
	font-size: 0.78rem;
}

:deep(.payment-shell--dialog .payment-section .v-input) {
	font-size: 0.86rem;
}

:deep(.payment-shell--dialog .v-switch) {
	margin-top: 0;
	margin-bottom: 0;
}

:deep(.payment-shell--dialog .v-switch .v-label) {
	font-size: 0.82rem;
}

.submit-highlight {
	box-shadow: 0 0 0 4px rgb(var(--v-theme-primary));
	transition: box-shadow 0.3s ease-in-out;
}

.pos-themed-card {
	background-color: rgb(var(--v-theme-surface));
	color: rgb(var(--v-theme-on-surface));
}

@media (max-width: 768px) {
	.payment-shell {
		display: flex;
		flex-direction: column;
		gap: var(--pos-space-2);
		overflow: visible;
	}

	.payment-card {
		padding: var(--pos-space-1);
		height: auto !important;
		max-height: none !important;
		overflow: visible !important;
	}

	.payment-shell--dialog {
		height: auto;
	}

	.payment-scroll {
		padding: var(--pos-space-2);
		gap: var(--pos-space-2);
		overflow: visible !important;
		min-height: auto;
		max-height: none;
	}

	.payment-sections {
		overflow: visible;
	}

	.payment-sections--dialog {
		grid-template-columns: 1fr;
	}

	:deep(.payment-shell--dialog .payment-methods) {
		grid-template-columns: 1fr;
	}

	.payment-section {
		padding: var(--pos-space-2);
		gap: var(--pos-space-2);
	}

	.payment-footer {
		position: sticky;
		margin-top: 0;
		padding-bottom: calc(env(safe-area-inset-bottom) + 4px);
	}
}
</style>
