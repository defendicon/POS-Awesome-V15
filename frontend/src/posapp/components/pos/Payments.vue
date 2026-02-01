<!-- eslint-disable vue/multi-word-component-names -->
<template>
	<div class="pa-0">
		<v-card
			class="selection mx-auto pa-1 my-0 mt-3 pos-themed-card"
			style="max-height: 68vh; height: 68vh"
		>
			<v-progress-linear
				:active="loading"
				:indeterminate="loading"
				absolute
				location="top"
				color="info"
			></v-progress-linear>
			<div ref="paymentContainer" class="overflow-y-auto pa-2" style="max-height: 67vh">
				<!-- Payment Summary (Paid, To Be Paid, Change) -->
				<PaymentSummary
					:invoice_doc="invoice_doc"
					:total_payments_display="total_payments_display"
					:diff_payment_display="diff_payment_display"
					:diff_label="diff_label"
					:change_due="change_due"
					:paid_change="paid_change"
					:credit_change="credit_change"
					:paid_change_rules="paid_change_rules"
					:currencySymbol="currencySymbol"
					:formatCurrency="formatCurrency"
					@show-paid-amount="showPaidAmount"
					@show-diff-payment="showDiffPayment"
					@show-paid-change="showPaidChange"
					@update-credit-change="handleCreditChangeUpdate"
				/>

				<v-divider></v-divider>

				<!-- Payment Inputs (All Payment Methods) -->
				<PaymentMethods
					v-if="is_cashback && invoice_doc"
					:payments="invoice_doc.payments"
					:currency="invoice_doc.currency"
					:isReturn="invoice_doc.is_return"
					:requestPaymentField="request_payment_field"
					:currencySymbol="currencySymbol"
					:formatCurrency="formatCurrency"
					:isNumber="isNumber"
					:getVisibleDenominations="getVisibleDenominations"
					:isCashLikePayment="isCashLikePayment"
					:isMpesaC2bPayment="is_mpesa_c2b_payment"
					@update-amount="handlePaymentAmountChange"
					@set-full-amount="set_full_amount"
					@set-denomination="setPaymentToDenomination"
					@mpesa-dialog="mpesa_c2b_dialog"
					@request-payment="request_payment"
					@set-rest-amount="set_rest_amount"
				/>

				<!-- Loyalty Points Redemption -->
				<!-- Redemption Section (Loyalty Points, Customer Credit) -->
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
					@set-formatted-currency="(data) => setFormatedCurrency(null, data.field, null, false, data.value)"
				/>

				<v-divider></v-divider>

				<!-- Invoice Totals (Net, Tax, Total, Discount, Grand, Rounded) -->
				<InvoiceTotals
					:invoice_doc="invoice_doc"
					:displayCurrency="displayCurrency"
					:diff_payment="diff_payment"
					:diff_label="diff_label"
					:currencySymbol="currencySymbol"
					:formatCurrency="formatCurrency"
				/>

				<!-- Additional Info Section (Delivery, Address, Notes, Authorization) -->
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
					@update:new-delivery-date="(val) => { new_delivery_date = val; update_delivery_date(); }"
					@update:return-valid-upto-date="(val) => { return_valid_upto_date = val; updateReturnValidUpto(); }"
					@new-address="new_address"
				/>

				<!-- Purchase Order Section -->
				<PaymentPurchaseOrder
					:invoice-doc="invoice_doc"
					:pos-profile="pos_profile"
					:new-po-date="new_po_date"
					@update:new-po-date="(val) => { new_po_date = val; update_po_date(); }"
				/>

				<v-divider></v-divider>

				<!-- Payment Options Section (Switches: Write Off, Credit Sale, Cashback, etc.) -->
				<PaymentOptions
					:invoice-doc="invoice_doc"
					:pos-profile="pos_profile"
					:credit-change="credit_change"
					:is-write-off-change="is_write_off_change"
					:is-credit-sale="is_credit_sale"
					:is-cashback="is_cashback"
					:is-credit-return="is_credit_return"
					:new-credit-due-date="new_credit_due_date"
					:credit-due-days="credit_due_days"
					:credit-due-presets="credit_due_presets"
					:redeem-customer-credit="redeem_customer_credit"
					@update:is-write-off-change="is_write_off_change = $event"
					@update:is-credit-sale="is_credit_sale = $event"
					@update:is-cashback="is_cashback = $event"
					@update:is-credit-return="is_credit_return = $event"
					@update:new-credit-due-date="(val) => { new_credit_due_date = val; update_credit_due_date(); }"
					@update:credit-due-days="credit_due_days = $event"
					@apply-due-preset="applyDuePreset"
					@update:redeem-customer-credit="redeem_customer_credit = $event"
					@get-available-credit="get_available_credit"
				/>

				<!-- Customer Credit Detailed Redemption List -->
				<PaymentCustomerCreditDetails
					:invoice-doc="invoice_doc"
					:available-customer-credit="available_customer_credit"
					:redeem-customer-credit="redeem_customer_credit"
					:customer-credit-dict="customer_credit_dict"
					:credit-source-label="creditSourceLabel"
					:format-currency="formatCurrency"
					:currency-symbol="currencySymbol"
					@set-formatted-currency="(data) => setFormatedCurrency(data.target, data.field, null, false, data.value)"
				/>

				<v-divider></v-divider>

				<!-- Selection Fields Section (Sales Person, Print Format) -->
				<PaymentSelectionFields
					:sales-persons="sales_persons"
					:sales-person="sales_person"
					:readonly="readonly"
					:print-formats="print_formats"
					:print-format="print_format"
					@update:sales-person="sales_person = $event"
					@update:print-format="print_format = $event"
				/>
			</div>
		</v-card>

		<!-- Action Buttons -->
		<PaymentActionButtons
			:loading="loading"
			:validatePayment="validatePayment"
			:highlightSubmit="highlightSubmit"
			@submit="submit"
			@submit-and-print="submit(undefined, false, true)"
			@cancel="back_to_invoice"
		/>
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
	</div>
</template>

<script>
/* global frappe, __, get_currency_symbol */
// Importing format mixin for currency and utility functions
import format, { formatUtils } from "../../format";
import { getSmartTenderSuggestions } from "../../../utils/smartTender.js";
import { useSyncStore } from "../../stores/syncStore.js";
import {
	saveOfflineInvoice,
	syncOfflineInvoices,
	getPendingOfflineInvoiceCount,
	isOffline,
	getSalesPersonsStorage,
	setSalesPersonsStorage,
	updateLocalStock,
} from "../../../offline/index.js";

import {
	isDebugPrintEnabled,
} from "../../plugins/print.js";
import { useInvoiceStore } from "../../stores/invoiceStore.js";
import { useCustomersStore } from "../../stores/customersStore.js";
import { useUIStore } from "../../stores/uiStore.js";
import { useRtl } from "../../composables/useRtl.js";
import { storeToRefs } from "pinia";
import stockCoordinator from "../../utils/stockCoordinator.js";
import { parseBooleanSetting } from "../../utils/stock.js";
import { useToastStore } from "../../stores/toastStore.js";
import invoiceService from "../../services/invoiceService.js";
import PaymentSummary from "./PaymentSummary.vue";
import InvoiceTotals from "./InvoiceTotals.vue";
import PaymentActionButtons from "./PaymentActionButtons.vue";
import PaymentMethods from "./PaymentMethods.vue";
import PaymentRedemption from "./PaymentRedemption.vue";
import PaymentAdditionalInfo from "./PaymentAdditionalInfo.vue";
import PaymentPurchaseOrder from "./PaymentPurchaseOrder.vue";
import PaymentCustomerCreditDetails from "./PaymentCustomerCreditDetails.vue";
import PaymentOptions from "./PaymentOptions.vue";
import PaymentSelectionFields from "./PaymentSelectionFields.vue";
import PaymentDialogs from "./PaymentDialogs.vue";
import { usePaymentCalculations } from "../../composables/usePaymentCalculations.js";
import { usePaymentSubmission } from "../../composables/usePaymentSubmission.js";
import { useRedemptionLogic } from "../../composables/useRedemptionLogic.js";
import { usePaymentPrinting } from "../../composables/usePaymentPrinting.js";
import { usePaymentMethods } from "../../composables/usePaymentMethods.js";
import { useInvoiceDetails } from "../../composables/useInvoiceDetails.js";
import { ref, computed, getCurrentInstance } from "vue";

export default {
	// Using format mixin for shared formatting methods
	mixins: [format],
	components: {
		PaymentSummary,
		InvoiceTotals,
		PaymentActionButtons,
		PaymentMethods,
		PaymentRedemption,
		PaymentAdditionalInfo,
		PaymentPurchaseOrder,
		PaymentCustomerCreditDetails,
		PaymentOptions,
		PaymentSelectionFields,
		PaymentDialogs,
	},
	setup() {
		const invoiceStore = useInvoiceStore();
		const customersStore = useCustomersStore();
		const uiStore = useUIStore();
		const toastStore = useToastStore();
		const syncStore = useSyncStore();
		const { isRtl, rtlStyles, rtlClasses } = useRtl();
		const { selectedCustomer, customerInfo, refreshToken } = storeToRefs(customersStore);
		const { isFrozen, freezeTitle, freezeMessage, activeView } = storeToRefs(uiStore);

		const { proxy } = getCurrentInstance();

		// Component State migrated from data() for usePaymentCalculations & usePaymentSubmission
		const pos_profile = ref("");
		const stock_settings = ref("");
		const pos_settings = ref({}); // Migrated from data
		const invoiceType = ref("Invoice");
		const is_cashback = ref(true);
		const paid_change = ref(0);
		const credit_change = ref(0);
		const loading = ref(false);
		const show_change_dialog = ref(false);
		const sales_person = ref("");
		const is_credit_return = ref(false);
		const customer_info = ref("");
		const currency_precision = ref(2);
		const print_format = ref(""); // Migrated from data
		const print_formats = ref([]); // Migrated from data

		// Initialize redemption logic
		const {
			loyalty_amount,
			redeemed_customer_credit,
			customer_credit_dict,
			available_customer_credit,
			available_points_amount,
			get_available_credit,
		} = useRedemptionLogic({
			invoiceDoc: computed(() => invoiceStore.invoiceDoc),
			posProfile: pos_profile,
			currencyPrecision: currency_precision,
			formatFloat: (val, prec) => proxy.formatFloat(val, prec),
			stores: {
				toastStore,
			},
			onClearAmounts: () => {
				// We can expose a clear function or logic here if needed, 
				// but for now let's just use the composable's logic
			}
		});

		// Initialize printing composable
		const {
			loadPrintPage,
			printOfflineInvoice,
			openOfflineInvoicePreview,
		} = usePaymentPrinting({
			invoiceDoc: computed(() => invoiceStore.invoiceDoc),
			posProfile: pos_profile,
			invoiceType: invoiceType,
			printFormat: print_format,
		});

		// Initialize calculations composable
		const paymentCalculations = usePaymentCalculations({
			invoiceDoc: computed(() => invoiceStore.invoiceDoc),
			posProfile: pos_profile,
			currencyPrecision: currency_precision,
			loyaltyAmount: loyalty_amount,
			redeemedCustomerCredit: redeemed_customer_credit,
			customerCreditDict: customer_credit_dict,
			customerInfo: customer_info,
			formatCurrency: (val, curr) => proxy.formatCurrency(val, curr),
		});

		const { diff_payment } = paymentCalculations;

		// Initialize Payment Methods
		const {
			mpesa_modes,
			phone_dialog,
			get_mpesa_modes,
			is_mpesa_c2b_payment,
			mpesa_c2b_dialog,
			set_mpesa_payment,
			set_full_amount,
			set_rest_amount,
			clear_all_amounts,
			request_payment,
		} = usePaymentMethods({
			invoiceDoc: computed(() => invoiceStore.invoiceDoc),
			posProfile: pos_profile,
			diffPayment: diff_payment,
			formatFloat: (val) => proxy.formatFloat(val, currency_precision.value),
			stores: {
				toastStore,
				uiStore,
			},
			eventBus: proxy.eventBus,
			onSubmit: (args, submitPrint) => {
				// Call the exposed submitInvoice logic
				// submitInvoice(print, callbacks)
				// Here call the wrapper or composable function
				submitInvoice(null, {
					onPrint: (doc) => {
						if (submitPrint) {
							if (isOffline()) {
								printOfflineInvoice(doc);
							} else {
								loadPrintPage();
							}
						}
					},
					onSuccess: () => {
						eventBus.emit("focus_item_search");
					}
				});
			},
			setRedeemCustomerCredit: (val) => { redeem_customer_credit.value = val; },
			customerCreditDict: customer_credit_dict,
			redeemedCustomerCredit: redeemed_customer_credit,
			isCashback: is_cashback,
			// Getters for request_payment payload
			getTotalChange: () => Math.max(-diff_payment.value, 0),
			getPaidChange: () => paid_change.value,
			getCreditChange: () => credit_change.value,
			onBackToInvoice: () => eventBus.emit("change_active_view", "Invoice"),
		});

		// Initialize Invoice Details
		const {
			addresses,
			sales_persons,
			new_delivery_date,
			new_po_date,
			new_credit_due_date,
			credit_due_days,
			credit_due_presets,
			custom_days_dialog,
			custom_days_value,
			return_valid_upto_date,
			get_addresses,
			new_address,
			addressFilter,
			normalizeAddress,
			get_sales_person_names,
			update_delivery_date,
			update_po_date,
			update_credit_due_date,
			applyDuePreset,
			applyCustomDays,
			initializeReturnValidity,
			updateReturnValidUpto,
			formatDate,
			formatDateDisplay,
		} = useInvoiceDetails({
			invoiceDoc: computed(() => invoiceStore.invoiceDoc),
			posProfile: pos_profile,
			invoiceType: invoiceType,
			posSettings: pos_settings,
			stores: {
				toastStore,
				invoiceStore,
			},
			eventBus: proxy.eventBus,
		});


		const {
			validateDueDate,
			extractSubmissionErrorMessage,
			formatStockErrors,
			ensureReturnPaymentsAreNegative,
			submitInvoice,
		} = usePaymentSubmission({
			invoiceDoc: computed(() => invoiceStore.invoiceDoc),
			posProfile: pos_profile,
			stockSettings: stock_settings,
			invoiceType: invoiceType,
			isCashback: is_cashback,
			paidChange: paid_change,
			creditChange: credit_change,
			redeemedCustomerCredit: redeemed_customer_credit,
			customerCreditDict: customer_credit_dict,
			diffPayment: diff_payment,
			formatFloat: (val, prec) => proxy.formatFloat(val, prec),
			stores: {
				toastStore,
				syncStore,
				customersStore,
				uiStore,
				invoiceStore,
			},
			currencyPrecision: currency_precision,
		});

		return {
			invoiceStore,
			customersStore,
			selectedCustomer,
			customerInfoFromStore: customerInfo,
			customerRefreshToken: refreshToken,
			uiStore,
			activeView,
			toastStore,
			isFrozen,
			freezeTitle,
			freezeMessage,
			isRtl,
			rtlStyles,
			rtlClasses,
			// Expose state for bi-directional binding in Options API
			pos_profile,
			stock_settings,
			invoiceType,
			is_cashback,
			paid_change,
			credit_change,
			loading,
			show_change_dialog,
			sales_person,
			is_credit_return,
			loyalty_amount,
			// Redemption
			redeemed_customer_credit,
			customer_credit_dict,
			available_customer_credit,
			available_points_amount,
			get_available_credit,
			customer_info,
			currency_precision,
			// Printing
			load_print_page: loadPrintPage,
			print_offline_invoice: printOfflineInvoice,
			open_offline_invoice_preview: openOfflineInvoicePreview,
			// Payment Methods
			mpesa_modes,
			phone_dialog,
			get_mpesa_modes,
			is_mpesa_c2b_payment,
			mpesa_c2b_dialog,
			set_mpesa_payment,
			set_full_amount,
			set_rest_amount,
			clear_all_amounts,
			request_payment,
			// Invoice Details & Dates
			pos_settings,
			addresses,
			sales_persons,
			new_delivery_date,
			new_po_date,
			new_credit_due_date,
			credit_due_days,
			credit_due_presets,
			custom_days_dialog,
			custom_days_value,
			return_valid_upto_date,
			get_addresses,
			new_address,
			addressFilter, // used in template? usually v-autocomplete needs it exposed
			normalizeAddress, // used in template? maybe
			get_sales_person_names,
			update_delivery_date,
			update_po_date,
			update_credit_due_date,
			applyDuePreset,
			applyCustomDays,
			initializeReturnValidity,
			// Expose calculated properties from composable
			...paymentCalculations,
			// Expose submission logic
			validate_due_date: validateDueDate,
			extractSubmissionErrorMessage,
			ensureReturnPaymentsAreNegative,
			submitInvoice,
			print_formats,
			print_format,
			syncStore,
		};
	},
	data() {
		return {
			// pos_settings moved to setup
			is_return: false, // Is this a return invoice?
			is_credit_sale: false, // Is this a credit sale?
			is_write_off_change: false, // Write-off for change enabled
			redeem_customer_credit: false, // Redeem customer credit?
			paid_change_rules: [], // Validation rules for paid change
			// phone_dialog moved to usePaymentMethods
			// custom_days_dialog moved to useInvoiceDetails
			// custom_days_value moved to useInvoiceDetails
			// new_delivery_date moved to useInvoiceDetails
			// new_po_date moved to useInvoiceDetails
			// new_credit_due_date moved to useInvoiceDetails
			// credit_due_days moved to useInvoiceDetails
			// credit_due_presets moved to useInvoiceDetails
			// return_valid_upto_date moved to useInvoiceDetails
			// mpesa_modes moved to usePaymentMethods
			// sales_persons moved to useInvoiceDetails
			// sales_person moved to setup
			// addresses moved to useInvoiceDetails
			is_user_editing_paid_change: false, // User interaction flag
			highlightSubmit: false, // Highlight state for submit button
			last_payment_change_was_cash: null, // Track last edited payment type
			backgroundStatusCheck: null,
			paymentVisible: false,
			_shortcutHandlers: {},
		};
	},
	computed: {
		invoice_doc: {
			get() {
				return this.invoiceStore.invoiceDoc;
			},
			set(value) {
				this.invoiceStore.setInvoiceDoc(value);
			},
		},
		// Get currency symbol for given or current currency
		currencySymbol() {
			return (currency) => {
				const fallbackCurrency = this.invoice_doc ? this.invoice_doc.currency : undefined;
				return get_currency_symbol(currency || fallbackCurrency);
			};
		},
		// Display currency for invoice
		displayCurrency() {
			return this.invoice_doc ? this.invoice_doc.currency : "";
		},
		blockSaleBeyondAvailableQty() {
			if (["Order", "Quotation"].includes(this.invoiceType)) {
				return false;
			}
			return parseBooleanSetting(this.pos_profile?.posa_block_sale_beyond_available_qty);
		},
		// Validate if payment can be submitted
		validatePayment() {
			const profile = this.pos_profile;
			if (!profile || !profile.posa_allow_sales_order) {
				return false;
			}

			if (this.invoiceType !== "Order") {
				return false;
			}

			const doc = this.invoice_doc;
			return !doc || !doc.posa_delivery_date;
		},
		// Should request payment field be shown?
		request_payment_field() {
			return (
				this.pos_settings?.invoice_fields?.some(
					(el) => el.fieldtype === "Button" && el.fieldname === "request_for_payment",
				) || false
			);
		},
		returnValidityEnabled() {
			return Boolean(
				this.pos_profile?.posa_enable_return_validity ||
					this.pos_settings?.posa_enable_return_validity,
			);
		},
		returnValidityMinDate() {
			const postingDate = this.invoice_doc?.posting_date || frappe.datetime?.nowdate?.();
			if (!postingDate) {
				return new Date();
			}
			const parsed = new Date(postingDate);
			if (Number.isNaN(parsed.getTime())) {
				return new Date();
			}
			return parsed;
		},
	},
	watch: {
		// Watch diff_payment to update paid_change
		diff_payment(newVal) {
			if (this.is_user_editing_paid_change) {
				return;
			}

			const lastEditWasCash = this.last_payment_change_was_cash;

			if (newVal < 0) {
				const changeDue = -newVal;

				if (this.shouldAutoApplyCreditChange || lastEditWasCash === false) {
					this.paid_change = this.flt(changeDue, this.currency_precision);
					this.credit_change = 0;
				} else {
					this.paid_change = changeDue;
				}
			} else {
				this.updateCreditChange(0);
			}

			this.last_payment_change_was_cash = null;
		},
		// Watch paid_change to validate and update credit_change
		paid_change(newVal) {
			const changeLimit = Math.max(-this.diff_payment, 0);
			if (newVal > changeLimit) {
				this.paid_change = changeLimit;
				this.credit_change = 0;
				this.paid_change_rules = ["Paid change can not be greater than total change!"];
			} else {
				this.paid_change_rules = [];
				this.credit_change = this.flt(newVal - changeLimit, this.currency_precision);
			}

			const effectivePaid = Math.min(this.paid_change, changeLimit);
			const creditAmount = this.flt(changeLimit - effectivePaid, this.currency_precision);

			if (this.invoice_doc) {
				this.invoice_doc.paid_change = effectivePaid;
				this.invoice_doc.credit_change = creditAmount > 0 ? creditAmount : 0;
			}
		},
		// Watch loyalty_amount to handle loyalty points redemption
		loyalty_amount(value) {
			if (!this.invoice_doc) {
				return;
			}
			const amount = parseFloat(value) || 0;
			// Use epsilon to handle floating point comparison issues
			if (amount > this.available_points_amount + 0.001) {
				this.invoice_doc.loyalty_amount = 0;
				this.invoice_doc.redeem_loyalty_points = 0;
				this.invoice_doc.loyalty_points = 0;
				this.loyalty_amount = 0;
				this.toastStore.show({
					title: `Loyalty Amount can not be more than ${this.available_points_amount}`,
					color: "error",
				});
			} else {
				this.invoice_doc.loyalty_amount = this.flt(this.loyalty_amount);
				this.invoice_doc.redeem_loyalty_points = 1;

				// Calculate points to redeem, handling currency conversion if needed
				let baseAmount = amount;
				const docCurrency = this.invoice_doc.currency;
				const baseCurrency = this.pos_profile.currency;

				if (docCurrency && baseCurrency && docCurrency !== baseCurrency) {
					baseAmount = amount * (this.invoice_doc.conversion_rate || 1);
				}

				this.invoice_doc.loyalty_points = parseInt(
					baseAmount / (this.customer_info.conversion_factor || 1),
				);

				if (!this.is_credit_sale && this.invoice_doc.payments) {
					const default_payment = this.invoice_doc.payments.find((p) => p.default === 1);
					if (default_payment) {
						const invoice_total = this.invoice_doc.rounded_total || this.invoice_doc.grand_total;
						const other_payments = this.invoice_doc.payments.reduce((sum, p) => {
							if (p !== default_payment) {
								return sum + this.flt(p.amount);
							}
							return sum;
						}, 0);
						const loyalty = this.flt(this.invoice_doc.loyalty_amount);
						const credit = this.flt(this.redeemed_customer_credit);

						let new_amount = invoice_total - loyalty - credit - other_payments;
						if (new_amount < 0) new_amount = 0;

						default_payment.amount = this.flt(new_amount, this.currency_precision);
					}
				}
			}
		},
		// Watch sales_person to update sales_team
		sales_person(newVal) {
			if (!this.invoice_doc) {
				return;
			}
			if (newVal) {
				this.invoice_doc.sales_team = [
					{
						sales_person: newVal,
						allocated_percentage: 100,
					},
				];
				console.log("Updated sales_team with sales_person:", newVal);
			} else {
				this.invoice_doc.sales_team = [];
				console.log("Cleared sales_team");
			}
		},
		// Watch is_credit_sale to reset cash payments
		is_credit_sale(newVal) {
			if (!this.invoice_doc) {
				return;
			}
			if (newVal) {
				// If credit sale is enabled, set cash payment to 0
				this.invoice_doc.payments.forEach((payment) => {
					if (payment.mode_of_payment.toLowerCase() === "cash") {
						payment.amount = 0;
					}
				});
			} else {
				// If credit sale is disabled, set cash payment to invoice total
				this.invoice_doc.payments.forEach((payment) => {
					if (payment.mode_of_payment.toLowerCase() === "cash") {
						payment.amount = this.invoice_doc.rounded_total || this.invoice_doc.grand_total;
					}
				});
			}
		},
		// Watch is_credit_return to toggle cashback payments
		is_credit_return(newVal) {
			if (!this.invoice_doc) {
				return;
			}
			if (newVal) {
				this.is_cashback = false;
				// Clear any payment amounts
				this.invoice_doc.payments.forEach((payment) => {
					payment.amount = 0;
					if (payment.base_amount !== undefined) {
						payment.base_amount = 0;
					}
				});
			} else {
				this.is_cashback = true;
				// Ensure default negative payment for returns
				this.ensureReturnPaymentsAreNegative();
			}
		},
		"invoice_doc.customer"(customer, previous) {
			if (customer && customer !== previous) {
				this.get_addresses();
				this.set_print_format();
			} else if (!customer) {
				this.addresses = [];
				this.print_format = "";
			}
		},
		activeView(newVal) {
			if (newVal === "payment") {
				this.handleShowPayment();
			} else {
				this.paymentVisible = false;
				this.highlightSubmit = false;
			}
		},
		"invoice_doc.posa_delivery_date"(date) {
			if (!date) {
				if (this.invoice_doc) {
					this.invoice_doc.shipping_address_name = null;
				}
				this.addresses = [];
				return;
			}
			if (this.invoice_doc && this.invoice_doc.customer) {
				this.get_addresses();
			}
		},
		customerInfoFromStore(newInfo) {
			this.customer_info = newInfo || "";
		},
		selectedCustomer(newCustomer, oldCustomer) {
			if (newCustomer === oldCustomer) {
				return;
			}
			this.customer_credit_dict = [];
			this.redeem_customer_credit = false;
			this.is_cashback = true;
			this.is_credit_return = false;
		},
	},
	methods: {
		// Go back to invoice view and reset customer readonly
		back_to_invoice() {
			this.uiStore.setActiveView("items");
			// this.eventBus.emit("set_customer_readonly", false);
			this.$nextTick(() => {
				this.uiStore.triggerItemSearchFocus();
			});
		},
		finishSubmissionNavigation(clearInvoice = false) {
			this.back_to_invoice();
			if (clearInvoice) {
				this.addresses = [];
				this.invoiceStore.clear();
				this.invoiceStore.resetPostingDate();
			}
		},
		handleShowPayment() {
			this.paymentVisible = true;
			this.$nextTick(() => {
				setTimeout(() => {
					const btn = this.$refs.submitButton;
					const el = btn && btn.$el ? btn.$el : btn;
					if (el) {
						el.scrollIntoView({ behavior: "smooth", block: "center" });
						el.focus();
						this.highlightSubmit = true;
					}
				}, 100);
			});
		},
		handleCreditChangeUpdate(value) {
			this.setFormatedCurrency(this, "credit_change", null, false, value);
			this.updateCreditChange(this.credit_change);
		},
		// Reset all cash payments to zero
		reset_cash_payments() {
			this.invoice_doc.payments.forEach((payment) => {
				if (payment.mode_of_payment.toLowerCase() === "cash") {
					payment.amount = 0;
				}
			});
		},
		// Submit payment after validation
		async submit(event, payment_received = false, print = false) {
			this.loading = true;
			try {
				// For return invoices, ensure payment amounts are negative
				if (this.invoice_doc.is_return) {
					this.ensureReturnPaymentsAreNegative();
				}
				// Validate total payments only if not credit sale and invoice total is not zero
				if (
					!this.is_credit_sale &&
					!this.invoice_doc.is_return &&
					this.total_payments <= 0 &&
					(this.invoice_doc.rounded_total || this.invoice_doc.grand_total) > 0
				) {
					this.toastStore.show({
						title: `Please enter payment amount`,
						color: "error",
					});
					frappe.utils.play_sound("error");
					return;
				}
				// Validate cash payments when credit sale is off
				if (!this.is_credit_sale && !this.invoice_doc.is_return) {
					let has_cash_payment = false;
					let cash_amount = 0;
					this.invoice_doc.payments.forEach((payment) => {
						if (payment.mode_of_payment.toLowerCase().includes("cash")) {
							has_cash_payment = true;
							cash_amount = this.flt(payment.amount);
						}
					});
					if (has_cash_payment && cash_amount > 0) {
						if (
							!this.pos_profile.posa_allow_partial_payment &&
							cash_amount < (this.invoice_doc.rounded_total || this.invoice_doc.grand_total) &&
							(this.invoice_doc.rounded_total || this.invoice_doc.grand_total) > 0
						) {
							this.toastStore.show({
								title: `Cash payment cannot be less than invoice total when partial payment is not allowed`,
								color: "error",
							});
							frappe.utils.play_sound("error");
							return;
						}
					}
				}
				// Validate partial payments only if not credit sale and invoice total is not zero
				if (
					!this.is_credit_sale &&
					!this.pos_profile.posa_allow_partial_payment &&
					this.total_payments < (this.invoice_doc.rounded_total || this.invoice_doc.grand_total) &&
					(this.invoice_doc.rounded_total || this.invoice_doc.grand_total) > 0
				) {
					this.toastStore.show({
						title: `The amount paid is not complete`,
						color: "error",
					});
					frappe.utils.play_sound("error");
					return;
				}
				// Validate phone payment
				let phone_payment_is_valid = true;
				if (!payment_received) {
					this.invoice_doc.payments.forEach((payment) => {
						if (
							payment.type === "Phone" &&
							![0, "0", "", null, undefined].includes(payment.amount)
						) {
							phone_payment_is_valid = false;
						}
					});
					if (!phone_payment_is_valid) {
						this.toastStore.show({
							title: __("Please request phone payment or use another payment method"),
							color: "error",
						});
						frappe.utils.play_sound("error");
						return;
					}
				}
				// Validate paid_change
				const changeLimit = Math.max(-this.diff_payment, 0);
				if (this.paid_change > changeLimit) {
					this.toastStore.show({
						title: `Paid change cannot be greater than total change!`,
						color: "error",
					});
					frappe.utils.play_sound("error");
					return;
				}
				// Validate cashback
				let total_change = this.flt(this.flt(this.paid_change) + this.flt(-this.credit_change));
				if (this.is_cashback && total_change !== changeLimit) {
					this.toastStore.show({
						title: `Error in change calculations!`,
						color: "error",
					});
					frappe.utils.play_sound("error");
					return;
				}
				// Validate customer credit redemption
				let credit_calc_check = this.customer_credit_dict.filter((row) => {
					return this.flt(row.credit_to_redeem) > this.flt(row.total_credit);
				});
				if (credit_calc_check.length > 0) {
					this.toastStore.show({
						title: `Redeemed credit cannot be greater than its total.`,
						color: "error",
					});
					frappe.utils.play_sound("error");
					return;
				}
				if (
					!this.invoice_doc.is_return &&
					this.redeemed_customer_credit >
						(this.invoice_doc.rounded_total || this.invoice_doc.grand_total)
				) {
					this.toastStore.show({
						title: `Cannot redeem customer credit more than invoice total`,
						color: "error",
					});
					frappe.utils.play_sound("error");
					return;
				}
				// Proceed to submit the invoice
				// We rely on backend validation in submit_invoice to catch stock issues
				await this.submit_invoice(print);
			} catch (error) {
				console.error("An error occurred during submission:", error);
				// Optionally, emit a generic error message to the user
				this.toastStore.show({
					title: __("An unexpected error occurred. Please check the console for details."),
					color: "error",
				});
			} finally {
				this.loading = false;
			}
		},

		// Submit invoice to backend after all validations
		async submit_invoice(print) {
			this.loading = true;
			try {
				await this.submitInvoice(print, {
					onPrint: (doc) => {
						if (print) {
							// If online, load_print_page uses state, doesn't imply arg
							// But here we rely on global/component state mostly.
							// For offline, it calls print_offline_invoice
							if (isOffline()) {
								this.print_offline_invoice(doc);
							} else {
								this.load_print_page();
							}
						}
					},
					onSuccess: (message) => {
						this.customer_credit_dict = [];
						this.redeem_customer_credit = false;
						this.is_cashback = true;
						this.show_change_dialog = true;
						this.is_credit_return = false;
						this.sales_person = "";
					},
					onFinishNavigation: (clearInvoice) => {
						this.finishSubmissionNavigation(clearInvoice);
					},
					onScheduleBackgroundCheck: (name, doctype) => {
						this.scheduleBackgroundStatusCheck(name, doctype);
					}
				});
			} catch (error) {
				// Error handled in composable (toasts shown)
				// We just ensure loading is false
				console.error("Submission failed propagate:", error);
			} finally {
				this.loading = false;
			}
		},
		scheduleBackgroundStatusCheck(invoiceName, doctype) {
			this.clearBackgroundStatusCheck();
			if (!this.pos_profile?.posa_allow_submissions_in_background_job) {
				return;
			}
			if (!invoiceName) {
				return;
			}
			this.backgroundStatusCheck = setTimeout(async () => {
				try {
					const result = await frappe.call({
						method: "frappe.client.get_value",
						args: {
							doctype: doctype || this.invoice_doc?.doctype || "Sales Invoice",
							filters: { name: invoiceName },
							fieldname: ["docstatus"],
						},
					});
					const status = result?.message?.docstatus;
					if (status === 1) {
						return;
					}
					const reason = this.__("Invoice is still in draft after background submission.");
					if (this.eventBus && typeof this.eventBus.emit === "function") {
						this.eventBus.emit("invoice_submission_failed", {
							invoice: invoiceName,
							reason,
						});
					}
					this.toastStore.show({
						title: __("Error submitting invoice: {0}", [invoiceName]),
						color: "error",
						detail: reason,
					});
				} catch (err) {
					console.error("Background status check failed", err);
				} finally {
					this.clearBackgroundStatusCheck();
				}
			}, 10000);
		},
		clearBackgroundStatusCheck() {
			if (this.backgroundStatusCheck) {
				clearTimeout(this.backgroundStatusCheck);
				this.backgroundStatusCheck = null;
			}
		},
		// Keyboard shortcuts for payment submit (Alt+X) and submit+print (Alt+P)
		handlePaymentShortcut(event) {
			if (!this.paymentVisible) {
				return;
			}

			const isAltOnly = event.altKey && !event.ctrlKey && !event.metaKey;
			const key = event.key.toLowerCase();

			if (isAltOnly && key === "p") {
				event.preventDefault();
				event.stopPropagation();
				this.submit(null, false, true);
				return;
			}

			if ((isAltOnly || event.ctrlKey || event.metaKey) && key === "x") {
				event.preventDefault();
				event.stopPropagation();
				this.submit(null, false, false);
			}
		},
		handleSubmitPaymentShortcut({ print = false } = {}) {
			if (!this.paymentVisible) {
				return;
			}

			this.$nextTick(() => {
				this.submit(null, false, print);
			});
		},
		// Get customer addresses for shipping
		get_addresses() {
			const vm = this;
			if (!vm.invoice_doc || !vm.invoice_doc.customer) {
				vm.addresses = [];
				return;
			}
			frappe.call({
				method: "posawesome.posawesome.api.customers.get_customer_addresses",
				args: { customer: vm.invoice_doc.customer },
				async: true,
				callback: function (r) {
					if (!r.exc) {
						const records = Array.isArray(r.message) ? r.message : [];
						const normalized = records.map((row) => vm.normalizeAddress(row)).filter(Boolean);
						vm.addresses = normalized;
						if (
							vm.invoice_doc &&
							vm.invoice_doc.shipping_address_name &&
							!normalized.some((row) => row.name === vm.invoice_doc.shipping_address_name)
						) {
							vm.invoice_doc.shipping_address_name = null;
						}
					} else {
						vm.addresses = [];
					}
				},
			});
		},
		// Format date to YYYY-MM-DD
		formatDate(date) {
			if (!date) return null;
			if (typeof date === "string") {
				const western = formatUtils.fromArabicNumerals(date);
				if (/^\d{4}-\d{2}-\d{2}$/.test(western)) {
					return western;
				}
				if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(western)) {
					const [d, m, y] = western.split("-");
					return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
				}
				date = western;
			}
			const d = new Date(formatUtils.fromArabicNumerals(String(date)));
			if (!isNaN(d.getTime())) {
				const year = d.getFullYear();
				const month = `0${d.getMonth() + 1}`.slice(-2);
				const day = `0${d.getDate()}`.slice(-2);
				return `${year}-${month}-${day}`;
			}
			return formatUtils.fromArabicNumerals(String(date));
		},

		formatDateDisplay(date) {
			if (!date) return "";
			const western = formatUtils.fromArabicNumerals(String(date));
			if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(western)) {
				const [y, m, d] = western.split("-");
				return formatUtils.toArabicNumerals(`${d}-${m}-${y}`);
			}
			const d = new Date(western);
			if (!isNaN(d.getTime())) {
				const year = d.getFullYear();
				const month = `0${d.getMonth() + 1}`.slice(-2);
				const day = `0${d.getDate()}`.slice(-2);
				return formatUtils.toArabicNumerals(`${day}-${month}-${year}`);
			}
			return formatUtils.toArabicNumerals(western);
		},
		// Show paid amount info message
		showPaidAmount() {
			this.toastStore.show({
				title: `Total Paid Amount: ${this.formatCurrency(this.total_payments)}`,
				color: "info",
			});
		},
		// Format customer credit source label for display
		creditSourceLabel(row) {
			if (!row) {
				return "";
			}
			const sourceLabel = row.source_type ? this.__(row.source_type) : null;
			if (sourceLabel) {
				return `${sourceLabel}: ${row.credit_origin}`;
			}
			return row.credit_origin;
		},
		// Show diff payment info message
		showDiffPayment() {
			if (!this.invoice_doc) return;
			this.toastStore.show({
				title: `To Be Paid: ${this.formatCurrency(
					this.diff_payment < 0 ? -this.diff_payment : this.diff_payment,
				)}`,
				color: "info",
			});
		},
		// Show paid change info message
		showPaidChange() {
			this.toastStore.show({
				title: `Paid Change: ${this.formatCurrency(this.paid_change)}`,
				color: "info",
			});
		},
		// Show credit change info message
		showCreditChange(value) {
			const sanitizedValue = this.flt(value || 0, this.currency_precision);
			if (sanitizedValue > 0) {
				this.updateCreditChange(sanitizedValue);
			} else {
				this.updateCreditChange(0);
			}
		},
		handlePaymentAmountChange(payment, event) {
			this.last_payment_change_was_cash = this.isCashLikePayment(payment);
			format.methods.setFormatedCurrency.call(this, payment, "amount", null, false, event);

			this.$nextTick(() => {
				this.autoBalancePayments(payment);
			});
		},
		setPaymentToDenomination(payment, amount) {
			payment.amount = amount;
			if (payment.base_amount !== undefined) {
				const conversion_rate = this.invoice_doc.conversion_rate || 1;
				payment.base_amount = this.flt(amount * conversion_rate, this.currency_precision);
			}
			this.last_payment_change_was_cash = this.isCashLikePayment(payment);
			this.$nextTick(() => {
				this.autoBalancePayments(payment);
			});
		},
		autoBalancePayments(excludePayment) {
			// Auto-subtract from other payments if we have an excess
			const invoice_total = this.invoice_doc.rounded_total || this.invoice_doc.grand_total;

			// Calculate current total paid
			const current_total_paid = this.paymentAmountSummary.total;

			const excess = this.flt(current_total_paid - invoice_total, this.currency_precision);

			if (excess > 0) {
				// Find other payments with amount > 0 to reduce
				// We filter out the current payment being edited to avoid circular issues
				const otherPayments = this.invoice_doc.payments.filter(
					(p) => p !== excludePayment && this.flt(p.amount) > 0,
				);

				// Sort by amount descending to reduce larger chunks first
				otherPayments.sort((a, b) => this.flt(b.amount) - this.flt(a.amount));

				let remaining_excess = excess;

				for (const other of otherPayments) {
					if (remaining_excess <= 0) break;

					const otherAmount = this.flt(other.amount, this.currency_precision);
					const reduction = Math.min(otherAmount, remaining_excess);
					const newAmount = this.flt(otherAmount - reduction, this.currency_precision);

					other.amount = newAmount;
					if (other.base_amount !== undefined) {
						// Approximate base amount update, though submit logic recalculates it
						other.base_amount = this.flt(
							newAmount / (this.exchange_rate || 1),
							this.currency_precision,
						);
					}

					remaining_excess = this.flt(remaining_excess - reduction, this.currency_precision);
				}
			}
		},
		getVisibleDenominations(payment) {
			if (!this.invoice_doc || !payment) return [];
			const currency = this.invoice_doc.currency;

			const current_total_paid = this.total_payments;
			const { amountByPayment } = this.paymentAmountSummary;
			const current_payment_amount = amountByPayment.get(payment) || 0;

			const other_payments = current_total_paid - current_payment_amount;

			const invoice_total = this.flt(
				this.invoice_doc.rounded_total || this.invoice_doc.grand_total,
				this.currency_precision,
			);

			const amount_to_pay = invoice_total - other_payments;

			if (amount_to_pay <= 0) return [];

			return getSmartTenderSuggestions(amount_to_pay, currency);
		},
		isCashLikePayment(payment) {
			if (!payment) {
				return false;
			}

			const configuredCashMOP = String(this.pos_profile?.posa_cash_mode_of_payment || "").toLowerCase();

			const type = String(payment.type || "").toLowerCase();
			if (type === "cash") {
				return true;
			}

			const mode = String(payment.mode_of_payment || "").toLowerCase();
			if (configuredCashMOP && mode === configuredCashMOP) {
				return true;
			}

			return mode.includes("cash");
		},
		updateCreditChange(rawValue) {
			const changeLimit = Math.max(-this.diff_payment, 0);
			let requestedCredit = this.flt(Math.abs(rawValue) || 0, this.currency_precision);

			if (requestedCredit > changeLimit) {
				requestedCredit = changeLimit;
			}

			const remainingPaidChange = this.flt(changeLimit - requestedCredit, this.currency_precision);

			this.credit_change = requestedCredit ? -requestedCredit : 0;
			this.paid_change = remainingPaidChange;

			if (this.invoice_doc) {
				this.invoice_doc.credit_change = requestedCredit;
				this.invoice_doc.paid_change = remainingPaidChange;
			}
		},
		// Format currency value
		formatCurrency(value) {
			return this.$options.mixins[0].methods.formatCurrency.call(this, value, this.currency_precision);
		},
		// Get change amount for display
		get_change_amount() {
			return Math.max(0, this.total_payments - this.invoice_doc.grand_total);
		},
		// Sync any invoices stored offline and show pending/synced counts
		async syncPendingInvoices() {
			const pending = getPendingOfflineInvoiceCount();
			if (pending) {
				this.toastStore.show({
					title: `${pending} invoice${pending > 1 ? "s" : ""} pending for sync`,
					color: "warning",
				});
				this.syncStore.updatePendingCount();
			}
			if (isOffline()) {
				// Don't attempt to sync while offline; just update the counter
				return;
			}
			const result = await syncOfflineInvoices();
			if (result && (result.synced || result.drafted)) {
				if (result.synced) {
					this.toastStore.show({
						title: `${result.synced} offline invoice${result.synced > 1 ? "s" : ""} synced`,
						color: "success",
					});
				}
				if (result.drafted) {
					this.toastStore.show({
						title: `${result.drafted} offline invoice${result.drafted > 1 ? "s" : ""} saved as draft`,
						color: "warning",
					});
				}
			}
			this.syncStore.updatePendingCount();
		},
		get_print_formats() {
			frappe.call({
				method: "posawesome.posawesome.api.print_formats.get_print_formats",
				args: {
					doctype: "Sales Invoice",
				},
				callback: (r) => {
					// Ensure we map to strings if objects are returned
					const formats = r.message || [];
					this.print_formats = formats.map((pf) => (typeof pf === "object" && pf.name ? pf.name : pf));
				},
			});
		},
		set_print_format() {
			this.print_format = "";
			if (this.pos_profile.posa_print_format_rules && this.customer_info) {
				const rule = this.pos_profile.posa_print_format_rules.find(
					(r) => r.customer_group === this.customer_info.customer_group,
				);
				if (rule) {
					this.print_format = rule.print_format;
				}
			}
		},
	},
	// Lifecycle hook: created
	created() {
		// Register keyboard shortcut for payment
		this._shortcutHandlers = this._shortcutHandlers || {};
		this._shortcutHandlers.handlePaymentShortcut = this.handlePaymentShortcut.bind(this);
		document.addEventListener("keydown", this._shortcutHandlers.handlePaymentShortcut);
		this.syncPendingInvoices();
		this.eventBus.on("network-online", this.syncPendingInvoices);
		this.eventBus.on("server-online", this.syncPendingInvoices);
		if (this.eventBus) {
			this.eventBus.on("send_invoice_doc_payment", (invoice_doc) => {
				this.invoiceStore.setInvoiceDoc(invoice_doc);
			});
			this.eventBus.on("register_pos_profile", (data) => {
				this.pos_profile = data.pos_profile;
				this.stock_settings = data.stock_settings;
			});
			this.eventBus.on("add_the_new_address", (data) => {
				this.get_addresses();
				this.invoice_doc.shipping_address_name = data.name;
			});
			this.eventBus.on("update_invoice_type", (data) => {
				this.invoiceType = data;
			});
			this.eventBus.on("set_pos_settings", (data) => {
				this.pos_settings = data;
			});
			this.eventBus.on("set_mpesa_payment", (data) => {
				this.set_mpesa_payment(data);
			});
			this.eventBus.on("submit_payment_shortcut", this.handleSubmitPaymentShortcut);
			// this.eventBus.on("clear_invoice", () => {
			// 	this.invoice_doc = "";
			// });
		}
	},
	beforeUnmount() {
		this.eventBus.off("send_invoice_doc_payment");
		this.eventBus.off("register_pos_profile");
		this.eventBus.off("add_the_new_address");
		this.eventBus.off("update_invoice_type");
		this.eventBus.off("set_pos_settings");
		this.eventBus.off("set_mpesa_payment");
		this.eventBus.off("submit_payment_shortcut", this.handleSubmitPaymentShortcut);
		// this.eventBus.off("clear_invoice");
		this.eventBus.off("network-online", this.syncPendingInvoices);
		this.eventBus.off("server-online", this.syncPendingInvoices);
		// this.eventBus.off("show_payment", this.handleShowPayment); // Removed
	},
	// Lifecycle hook: mounted
	mounted() {
		this.$nextTick(() => {
			// Listen to various event bus events for POS actions
			this.eventBus.on("send_invoice_doc_payment", (invoice_doc) => {
				this.invoice_doc = invoice_doc;
				const default_payment = this.invoice_doc.payments.find((payment) => payment.default === 1);
				const hasReturnPayments = this.invoice_doc.payments.some(
					(payment) => Math.abs(this.flt(payment.amount || 0, this.currency_precision)) > 0,
				);
				this.is_credit_sale = false;
				this.is_write_off_change = false;
				if (invoice_doc.is_return) {
					this.is_return = true;
					this.is_credit_return = false;
					if (!hasReturnPayments) {
						// Reset all payment amounts to zero for returns
						invoice_doc.payments.forEach((payment) => {
							payment.amount = 0;
							payment.base_amount = 0;
						});
						// Set default payment to negative amount for returns
						if (default_payment) {
							const amount = invoice_doc.rounded_total || invoice_doc.grand_total;
							default_payment.amount = -Math.abs(amount);
							if (default_payment.base_amount !== undefined) {
								default_payment.base_amount = -Math.abs(amount);
							}
						}
					} else {
						this.ensureReturnPaymentsAreNegative();
					}
				} else if (default_payment) {
					// For regular invoices, set positive amount
					default_payment.amount = this.flt(
						invoice_doc.rounded_total || invoice_doc.grand_total,
						this.currency_precision,
					);
					this.is_credit_return = false;
				}
				this.initializeReturnValidity(invoice_doc);
				this.loyalty_amount = 0;
				this.redeemed_customer_credit = 0;
				// Only get addresses if customer exists
				if (invoice_doc.customer) {
					this.get_addresses();
				}
				this.get_sales_person_names();
				this.get_sales_person_names();
			});
			/*
			this.eventBus.on("register_pos_profile", (data) => {
				this.pos_profile = data.pos_profile;
				this.stock_settings = data.stock_settings || {};
				this.get_mpesa_modes();
				this.get_print_formats();
			});
			*/
			// Watch Store
			this.$watch(
				() => this.uiStore.posProfile,
				(profile) => {
					if (profile) {
						this.pos_profile = profile;
						this.stock_settings = this.uiStore.stockSettings || {};
						this.get_mpesa_modes();
						this.get_print_formats();
					}
				},
				{ deep: true, immediate: true },
			);
			this.eventBus.on("add_the_new_address", (data) => {
				const normalized = this.normalizeAddress(data);
				if (normalized) {
					const existing = this.addresses.filter((addr) => addr.name !== normalized.name);
					this.addresses = [...existing, normalized];
					if (this.invoice_doc) {
						this.invoice_doc.shipping_address_name = normalized.name;
					}
				}
			});
			this.eventBus.on("update_invoice_type", (data) => {
				this.invoiceType = data;
				if (this.invoice_doc && data !== "Order") {
					this.invoice_doc.posa_delivery_date = null;
					this.invoice_doc.posa_notes = null;
					this.invoice_doc.posa_authorization_code = null;
					this.invoice_doc.shipping_address_name = null;
				} else if (this.invoice_doc && data === "Order") {
					// Initialize delivery date to today when switching to Order type
					this.new_delivery_date = this.formatDateDisplay(frappe.datetime.now_date());
					this.update_delivery_date();
				}
				// Handle return invoices properly
				if (this.invoice_doc && data === "Return") {
					this.invoice_doc.is_return = 1;
					// Ensure payments are negative for returns
					this.ensureReturnPaymentsAreNegative();
					this.is_credit_return = false;
					this.return_valid_upto_date = null;
				}
			});
			this.eventBus.on("set_pos_settings", (data) => {
				this.pos_settings = data || {};
				if (this.invoice_doc && !this.invoice_doc.is_return) {
					this.initializeReturnValidity(this.invoice_doc);
				}
			});
			this.eventBus.on("set_mpesa_payment", (data) => {
				this.set_mpesa_payment(data);
			});
			this.eventBus.on("submit_payment_shortcut", this.handleSubmitPaymentShortcut);
			// Clear any stored invoice when parent emits clear_invoice
			this.eventBus.on("clear_invoice", () => {
				this.invoice_doc = "";
				this.is_return = false;
				this.is_credit_return = false;
				this.return_valid_upto_date = null;
			});

			// Scroll to top when payment view is shown
			this.$watch(
				() => this.activeView,
				(view) => {
					if (view === "payment") {
						this.handleShowPayment("true");
					}
				},
			);
		});
	},
	// Lifecycle hook: beforeUnmount
	beforeUnmount() {
		// Remove all event listeners
		this.eventBus.off("send_invoice_doc_payment");
		this.eventBus.off("register_pos_profile");
		this.eventBus.off("add_the_new_address");
		this.eventBus.off("update_invoice_type");
		this.eventBus.off("set_pos_settings");
		this.eventBus.off("set_mpesa_payment");
		this.eventBus.off("submit_payment_shortcut", this.handleSubmitPaymentShortcut);
		this.eventBus.off("clear_invoice");
		this.eventBus.off("network-online", this.syncPendingInvoices);
		this.eventBus.off("server-online", this.syncPendingInvoices);
		// this.eventBus.off("show_payment", this.handleShowPayment); // Removed
		this.clearBackgroundStatusCheck();
	},
	// Lifecycle hook: unmounted
	unmounted() {
		// Remove keyboard shortcut listener
		if (!this._shortcutHandlers) {
			return;
		}
		document.removeEventListener("keydown", this._shortcutHandlers.handlePaymentShortcut);
		this._shortcutHandlers = {};
	},
};
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
	background-color: var(--surface-secondary) !important;
}

.submit-btn {
	position: relative;
}

.submit-btn:hover,
.submit-btn:focus,
.submit-btn:focus-visible,
.submit-btn:active {
	background-color: rgb(var(--v-theme-primary)) !important;
	color: rgb(var(--v-theme-on-primary)) !important;
	box-shadow: none;
}

.submit-btn:focus-visible {
	outline: 2px solid rgb(var(--v-theme-primary));
	outline-offset: 2px;
}

.submit-btn::before,
.submit-btn:hover::before,
.submit-btn:focus::before,
.submit-btn:focus-visible::before,
.submit-btn:active::before {
	opacity: 0 !important;
}

.submit-highlight {
	box-shadow: 0 0 0 4px rgb(var(--v-theme-primary));
	transition: box-shadow 0.3s ease-in-out;
}

.payment-method-btn:hover,
.payment-method-btn:focus,
.payment-method-btn:focus-visible,
.payment-method-btn:active {
	background-color: rgb(var(--v-theme-primary)) !important;
	color: rgb(var(--v-theme-on-primary)) !important;
	box-shadow: none;
}

.payment-method-btn::before,
.payment-method-btn:hover::before,
.payment-method-btn:focus::before,
.payment-method-btn:focus-visible::before,
.payment-method-btn:active::before {
	opacity: 0 !important;
}
</style>
