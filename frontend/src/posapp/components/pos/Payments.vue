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
			<div
				ref="paymentContainer"
				class="overflow-y-auto payment-scroll"
			>
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
					</section>

					<section
						v-if="is_cashback && invoice_doc"
						class="payment-section payment-section--methods"
					>
						<div class="payment-section__header">
							<h3 class="payment-section__title">{{ __("Payment Methods") }}</h3>
						</div>
						<PaymentMethods
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
							(data) => setFormatedCurrency(data.target, data.field, null, false, data.value)
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
	</div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, getCurrentInstance, nextTick } from "vue";
import { storeToRefs } from "pinia";

// Stores
import { useInvoiceStore } from "../../stores/invoiceStore.js";
import { useCustomersStore } from "../../stores/customersStore.js";
import { useUIStore } from "../../stores/uiStore.js";
import { useToastStore } from "../../stores/toastStore.js";
import { useSyncStore } from "../../stores/syncStore.ts";

// Composables
import { usePaymentCalculations } from "../../composables/pos/payments/usePaymentCalculations";
import { usePaymentSubmission } from "../../composables/pos/payments/usePaymentSubmission";
import { useRedemptionLogic } from "../../composables/pos/payments/useRedemptionLogic";
import { usePaymentPrinting } from "../../composables/pos/payments/usePaymentPrinting";
import { usePaymentMethods } from "../../composables/pos/payments/usePaymentMethods";
import { useInvoiceDetails } from "../../composables/pos/invoice/useInvoiceDetails";
import { useFormat } from "../../format";
import { isOffline } from "../../../offline/index";
import { initializePaymentLinesForDialog } from "../../utils/paymentInitialization";

// Components
import PaymentSummary from "./payments/PaymentSummary.vue";
import InvoiceTotals from "./payments/InvoiceTotals.vue";
import PaymentActionButtons from "./payments/PaymentActionButtons.vue";
import PaymentMethods from "./payments/PaymentMethods.vue";
import PaymentRedemption from "./payments/PaymentRedemption.vue";
import PaymentAdditionalInfo from "./payments/PaymentAdditionalInfo.vue";
import PaymentPurchaseOrder from "./payments/PaymentPurchaseOrder.vue";
import PaymentCustomerCreditDetails from "./payments/PaymentCustomerCreditDetails.vue";
import PaymentOptions from "./payments/PaymentOptions.vue";
import PaymentSelectionFields from "./payments/PaymentSelectionFields.vue";
import PaymentDialogs from "./payments/PaymentDialogs.vue";

const props = defineProps({
	dialogMode: {
		type: Boolean,
		default: false,
	},
});

const { proxy } = getCurrentInstance();
const eventBus = proxy.eventBus;
const __ = window.__;

const invoiceStore = useInvoiceStore();
const customersStore = useCustomersStore();
const uiStore = useUIStore();
const toastStore = useToastStore();
const syncStore = useSyncStore();

// Destructure format utilities
const {
	currency_precision,
	formatCurrency,
	formatFloat,
	currencySymbol,
	isNumber,
	flt,
	setFormatedCurrency,
} = useFormat();

const { selectedCustomer, customerInfo } = storeToRefs(customersStore);
const { activeView, paymentDialogOpen } = storeToRefs(uiStore);

// State
const is_return = ref(false);
const is_credit_sale = ref(false);
const is_write_off_change = ref(false);
const redeem_customer_credit = ref(false);
const pos_profile = ref("");
const stock_settings = ref("");
const pos_settings = ref({});
const invoiceType = ref("Invoice");
const is_cashback = ref(true);
const paid_change = ref(0);
const credit_change = ref(0);
const loading = ref(false);
const show_change_dialog = ref(false);
const sales_person = ref("");
const is_credit_return = ref(false);
const customer_info = ref("");
const print_format = ref("");
const print_formats = ref([]);
const paid_change_rules = ref([]);
const is_user_editing_paid_change = ref(false);
const highlightSubmit = ref(false);
const last_payment_change_was_cash = ref(null);
const backgroundStatusCheck = ref(null);
const paymentVisible = ref(false);
const paymentContainer = ref(null);
const submitButton = ref(null);
const _shortcutHandlers = ref({});
const readonly = ref(false); // Add missing readonly ref
const submissionInFlight = ref(false);
const queuedShortcutSubmit = ref(null);

// Computed Properties
const invoice_doc = computed({
	get: () => invoiceStore.invoiceDoc || {},
	set: (value) => invoiceStore.setInvoiceDoc(value),
});

const displayCurrency = computed(() => (invoice_doc.value ? invoice_doc.value.currency : ""));
const isPaymentOpen = computed(() => activeView.value === "payment" || paymentDialogOpen.value);

const validatePayment = computed(() => {
	const profile = pos_profile.value;
	if (!profile || !profile.posa_allow_sales_order) {
		return false;
	}
	if (invoiceType.value !== "Order") {
		return false;
	}
	const doc = invoice_doc.value;
	return !doc || !doc.posa_delivery_date;
});

const getWriteOffLimit = (profile) => {
	if (!profile) return null;

	const possibleLimitFields = [
		"write_off_limit",
		"posa_max_write_off_amount",
		"max_write_off_amount",
		"write_off_amount",
		"posa_write_off_limit",
	];

	for (const field of possibleLimitFields) {
		const rawValue = profile?.[field];
		if (rawValue === undefined || rawValue === null || rawValue === "") {
			continue;
		}

		const parsed = flt(rawValue, currency_precision.value);
		if (parsed > 0) {
			return parsed;
		}
	}

	return null;
};

const writeOffProfileLimit = computed(() => getWriteOffLimit(pos_profile.value));

const request_payment_field = computed(() => {
	return (
		pos_settings.value?.invoice_fields?.some(
			(el) => el.fieldtype === "Button" && el.fieldname === "request_for_payment",
		) || false
	);
});

const returnValidityEnabled = computed(() => {
	return Boolean(
		pos_profile.value?.posa_enable_return_validity || pos_settings.value?.posa_enable_return_validity,
	);
});

const returnValidityMinDate = computed(() => {
	const postingDate = invoice_doc.value?.posting_date || frappe.datetime?.nowdate?.();
	if (!postingDate) {
		return new Date();
	}
	const parsed = new Date(postingDate);
	if (Number.isNaN(parsed.getTime())) {
		return new Date();
	}
	return parsed;
});

// Logic Composables
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
	customerInfo: customer_info,
	currencyPrecision: currency_precision,
	formatFloat: (val, prec) => flt(val, prec),
	stores: { toastStore },
	onClearAmounts: () => {},
});

const { loadPrintPage, printOfflineInvoice } = usePaymentPrinting({
	invoiceDoc: computed(() => invoiceStore.invoiceDoc),
	posProfile: pos_profile,
	invoiceType: invoiceType,
	printFormat: print_format,
});

const paymentCalculations = usePaymentCalculations({
	invoiceDoc: computed(() => invoiceStore.invoiceDoc),
	posProfile: pos_profile,
	currencyPrecision: currency_precision,
	loyaltyAmount: loyalty_amount,
	redeemedCustomerCredit: redeemed_customer_credit,
	customerCreditDict: customer_credit_dict,
	customerInfo: customer_info,
	formatCurrency: (val, _curr) => formatCurrency(val, currency_precision.value),
});

const { diff_payment, total_payments, total_payments_display, diff_payment_display, diff_label, change_due } =
	paymentCalculations;

const {
	phone_dialog,
	get_mpesa_modes,
	is_mpesa_c2b_payment,
	mpesa_c2b_dialog,
	set_mpesa_payment,
	set_full_amount,
	set_rest_amount,
	request_payment,
	autoBalancePayments,
	getVisibleDenominations,
	isCashLikePayment,
} = usePaymentMethods({
	invoiceDoc: computed(() => invoiceStore.invoiceDoc),
	posProfile: pos_profile,
	diffPayment: diff_payment,
	formatFloat: (val) => flt(val, currency_precision.value),
	stores: {
		toastStore,
		uiStore,
	},
	eventBus: eventBus,
	onSubmit: (args, submitPrint) => {
		submitInvoiceWrapper(null, {
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
			},
		});
	},
	setRedeemCustomerCredit: (val) => {
		redeem_customer_credit.value = val;
	},
	customerCreditDict: customer_credit_dict,
	redeemedCustomerCredit: redeemed_customer_credit,
	isCashback: is_cashback,
	getTotalChange: () => Math.max(-diff_payment.value, 0),
	getPaidChange: () => paid_change.value,
	getCreditChange: () => credit_change.value,
	onBackToInvoice: () => eventBus.emit("change_active_view", "Invoice"),
});

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
	eventBus: eventBus,
});

const { ensureReturnPaymentsAreNegative, validateSubmission, submitInvoice } = usePaymentSubmission({
	invoiceDoc: computed(() => invoiceStore.invoiceDoc),
	posProfile: pos_profile,
	stockSettings: stock_settings,
	invoiceType: invoiceType,
	is_write_off_change: is_write_off_change,
	isCashback: is_cashback,
	paidChange: paid_change,
	creditChange: credit_change,
	redeemedCustomerCredit: redeemed_customer_credit,
	customerCreditDict: customer_credit_dict,
	diff_payment: diff_payment,
	is_credit_sale: is_credit_sale,
	loyaltyAmount: loyalty_amount,
	formatFloat: (val, prec) => flt(val, prec),
	stores: {
		toastStore,
		syncStore,
		customersStore,
		uiStore,
		invoiceStore,
	},
	currencyPrecision: currency_precision,
});

// Methods

const get_print_formats = () => {
	frappe.call({
		method: "posawesome.posawesome.api.print_formats.get_print_formats",
		args: { doctype: "Sales Invoice" },
		callback: (r) => {
			const formats = r.message || [];
			print_formats.value = formats.map((pf) => (typeof pf === "object" && pf.name ? pf.name : pf));
		},
	});
};

const set_print_format = () => {
	print_format.value = "";
	if (pos_profile.value.posa_print_format_rules && customer_info.value) {
		const rule = pos_profile.value.posa_print_format_rules.find(
			(r) => r.customer_group === customer_info.value.customer_group,
		);
		if (rule) {
			print_format.value = rule.print_format;
		}
	}
};

const releaseActiveFocus = () => {
	if (typeof document === "undefined") {
		return;
	}
	const active = document.activeElement;
	if (active instanceof HTMLElement && active !== document.body) {
		active.blur();
	}
};

const queueSearchRefocusRecovery = () => {
	if (typeof window === "undefined") {
		return;
	}

	let recovered = false;
	let fallbackTimer = null;
	const recover = () => {
		if (recovered) return;
		recovered = true;
		if (fallbackTimer) {
			clearTimeout(fallbackTimer);
			fallbackTimer = null;
		}
		nextTick(() => {
			uiStore.triggerItemSearchFocus();
			if (eventBus && typeof eventBus.emit === "function") {
				eventBus.emit("focus_item_search");
			}
		});
	};

	const onWindowFocus = () => {
		window.removeEventListener("focus", onWindowFocus);
		recover();
	};

	window.addEventListener("focus", onWindowFocus, { once: true });
	fallbackTimer = setTimeout(() => {
		window.removeEventListener("focus", onWindowFocus);
		recover();
	}, 900);
};

const back_to_invoice = () => {
	releaseActiveFocus();
	paymentVisible.value = false;
	if (paymentDialogOpen.value) {
		uiStore.closePaymentDialog();
	}
	if (activeView.value === "payment") {
		uiStore.setActiveView("items");
	}
	queueSearchRefocusRecovery();
};

const finishSubmissionNavigation = (clearInvoice = false) => {
	const submittedType = invoiceType.value;
	back_to_invoice();
	if (clearInvoice) {
		addresses.value = [];
		invoiceStore.clear();
		invoiceStore.resetPostingDate();
		if (eventBus && typeof eventBus.emit === "function") {
			eventBus.emit("clear_invoice");
		}

		if (submittedType !== "Invoice") {
			invoiceType.value = "Invoice";
			if (eventBus && typeof eventBus.emit === "function") {
				eventBus.emit("reset_invoice_type_to_invoice");
			}
		}
	}
};

const buildProfilePaymentLines = () => {
	const profilePayments = Array.isArray(pos_profile.value?.payments)
		? pos_profile.value.payments
		: [];

	return profilePayments
		.filter((payment) => payment?.mode_of_payment)
		.map((payment, index) => ({
			mode_of_payment: payment.mode_of_payment,
			amount: 0,
			base_amount: 0,
			account: payment.account,
			type: payment.type,
			default:
				payment.default === 1 || payment.default === true || index === 0
					? 1
					: 0,
		}));
};

const syncPreferredPaymentToCurrentTotal = (doc = invoice_doc.value) => {
	if (!doc || !Array.isArray(doc.payments) || !doc.payments.length || is_credit_sale.value) {
		return null;
	}

	const payments = doc.payments.filter((payment) => payment?.mode_of_payment);
	if (!payments.length) {
		return null;
	}

	const preferredPayment =
		payments.find((payment) => payment.default === 1 || payment.default === true) ||
		payments.find((payment) => isCashLikePayment(payment)) ||
		payments[0];

	if (!preferredPayment) {
		return null;
	}

	const otherMeaningfulPayments = payments.filter((payment) => {
		if (payment === preferredPayment) {
			return false;
		}
		return Math.abs(flt(payment.amount || 0, currency_precision.value)) > 0.0001;
	});

	if (otherMeaningfulPayments.length) {
		return preferredPayment;
	}

	const total = flt(doc.rounded_total || doc.grand_total, currency_precision.value);
	const normalizedTotal = doc.is_return ? -Math.abs(total) : Math.abs(total);
	const conversionRate = flt(doc.conversion_rate || 1, currency_precision.value);

	payments.forEach((payment) => {
		if (payment !== preferredPayment) {
			payment.amount = 0;
			if (payment.base_amount !== undefined) {
				payment.base_amount = 0;
			}
		}
	});

	preferredPayment.amount = normalizedTotal;
	if (preferredPayment.base_amount !== undefined) {
		preferredPayment.base_amount = flt(
			normalizedTotal * conversionRate,
			currency_precision.value,
		);
	}

	return preferredPayment;
};

const ensurePaymentLinesInitialized = (doc = invoice_doc.value) => {
	if (!doc) {
		return null;
	}

	if (!Array.isArray(doc.payments) || !doc.payments.length) {
		const fallbackPayments = buildProfilePaymentLines();
		if (fallbackPayments.length) {
			doc.payments = fallbackPayments;
		}
	}

	const initializedPayment = initializePaymentLinesForDialog(
		doc,
		currency_precision.value,
		isCashLikePayment,
	);

	if (doc.is_return) {
		ensureReturnPaymentsAreNegative();
	}

	syncPreferredPaymentToCurrentTotal(doc);

	return initializedPayment;
};

const restorePaymentLinesAfterFailedSubmit = () => {
	const doc = invoice_doc.value;
	if (!doc) {
		return;
	}

	ensurePaymentLinesInitialized(doc);
	is_credit_sale.value = false;
};

const handleShowPayment = () => {
	paymentVisible.value = true;
	nextTick(() => {
		setTimeout(() => {
			const btn = submitButton.value;
			const el = btn && btn.$el ? btn.$el : btn;
			if (el) {
				el.scrollIntoView({ behavior: "smooth", block: "center" });
				el.focus();
				highlightSubmit.value = true;
			}
			if (eventBus && typeof eventBus.emit === "function") {
				eventBus.emit("payment_ui_ready");
			}
			if (queuedShortcutSubmit.value) {
				const payload = queuedShortcutSubmit.value;
				queuedShortcutSubmit.value = null;
				handleSubmitPaymentShortcut(payload || {});
			}
		}, 100);
	});
};

const handleCreditChangeUpdate = (value) => {
	setFormatedCurrency(credit_change, "value", null, false, value);
	updateCreditChange(credit_change.value);
};

const handleWriteOffAmountUpdate = (value) => {
	if (!invoice_doc.value) return;

	let nextAmount = flt(value || 0, currency_precision.value);
	const profileCap = writeOffProfileLimit.value;
	const diffCap = Math.max(diff_payment.value || 0, 0);
	const maxAmount =
		profileCap && profileCap > 0 ? Math.min(diffCap, profileCap) : diffCap;

	if (nextAmount < 0) {
		nextAmount = 0;
	}
	if (profileCap && profileCap > 0 && nextAmount > profileCap) {
		toastStore.show({
			title: __(
				"Write off amount cannot exceed the POS profile maximum of {0}",
				[formatCurrency(profileCap)],
			),
			color: "error",
		});
		nextAmount = maxAmount;
	}
	if (nextAmount > maxAmount) {
		nextAmount = maxAmount;
	}

	invoice_doc.value.write_off_amount = nextAmount;
};

const handleRedemptionFormattedCurrency = (data) => {
	if (!data?.field) return;

	if (data.field === "loyalty_amount") {
		setFormatedCurrency(loyalty_amount, "value", null, false, data.value);
		return;
	}

	if (data.field === "redeemed_customer_credit") {
		setFormatedCurrency(redeemed_customer_credit, "value", null, false, data.value);
	}
};

const updateCreditChange = (rawValue) => {
	const changeLimit = Math.max(-diff_payment.value, 0);
	let requestedCredit = flt(Math.abs(rawValue) || 0, currency_precision.value);

	if (requestedCredit > changeLimit) {
		requestedCredit = changeLimit;
	}

	const remainingPaidChange = flt(changeLimit - requestedCredit, currency_precision.value);

	credit_change.value = requestedCredit;
	paid_change.value = remainingPaidChange;

	if (invoice_doc.value) {
		invoice_doc.value.credit_change = requestedCredit;
		invoice_doc.value.paid_change = remainingPaidChange;
	}
};

const handlePaymentAmountChange = (payment, event) => {
	last_payment_change_was_cash.value = isCashLikePayment(payment);
	setFormatedCurrency(payment, "amount", null, false, event);

	nextTick(() => {
		autoBalancePayments(payment);
	});
};

const setPaymentToDenomination = (payment, amount) => {
	payment.amount = amount;
	if (payment.base_amount !== undefined) {
		const conversion_rate = invoice_doc.value.conversion_rate || 1;
		payment.base_amount = flt(amount * conversion_rate, currency_precision.value);
	}
	last_payment_change_was_cash.value = isCashLikePayment(payment);
	nextTick(() => {
		autoBalancePayments(payment);
	});
};

// UI Feedback Methods
const showPaidAmount = () => {
	toastStore.show({
		title: `Total Paid Amount: ${formatCurrency(total_payments.value)}`,
		color: "info",
	});
};

const creditSourceLabel = (row) => {
	if (!row) return "";
	const sourceLabel = row.source_type ? __(row.source_type) : null;
	if (sourceLabel) return `${sourceLabel}: ${row.credit_origin}`;
	return row.credit_origin;
};

const showDiffPayment = () => {
	if (!invoice_doc.value) return;
	toastStore.show({
		title: `To Be Paid: ${formatCurrency(
			diff_payment.value < 0 ? -diff_payment.value : diff_payment.value,
		)}`,
		color: "info",
	});
};

const showPaidChange = () => {
	toastStore.show({
		title: `Paid Change: ${formatCurrency(paid_change.value)}`,
		color: "info",
	});
};

// Background Check
const clearBackgroundStatusCheck = () => {
	if (backgroundStatusCheck.value) {
		clearTimeout(backgroundStatusCheck.value);
		backgroundStatusCheck.value = null;
	}
};

const scheduleBackgroundStatusCheck = (invoiceName, doctype) => {
	clearBackgroundStatusCheck();
	if (!pos_profile.value?.posa_allow_submissions_in_background_job) {
		return;
	}
	if (!invoiceName) {
		return;
	}
	backgroundStatusCheck.value = setTimeout(async () => {
		try {
			const result = await frappe.call({
				method: "frappe.client.get_value",
				args: {
					doctype: doctype || invoice_doc.value?.doctype || "Sales Invoice",
					filters: { name: invoiceName },
					fieldname: ["docstatus"],
				},
			});
			const status = result?.message?.docstatus;
			if (status === 1) {
				return;
			}
			const reason = __("Invoice is still in draft after background submission.");
			if (eventBus && typeof eventBus.emit === "function") {
				eventBus.emit("invoice_submission_failed", {
					invoice: invoiceName,
					reason,
				});
			}
			toastStore.show({
				title: __("Error submitting invoice: {0}", [invoiceName]),
				color: "error",
				detail: reason,
			});
		} catch (err) {
			console.error("Background status check failed", err);
		} finally {
			clearBackgroundStatusCheck();
		}
	}, 10000);
};

// Submission Wrapper
const submit = async (_event, payment_received = false, print = false) => {
	await submitInvoiceWrapper(print, undefined, {
		paymentReceived: payment_received,
	});
};

const submitInvoiceWrapper = async (print, callbackOverrides = {}, options = {}) => {
	if (submissionInFlight.value) {
		return;
	}

	submissionInFlight.value = true;
	loading.value = true;
	try {
		await validateSubmission(options.paymentReceived || false);
		await submitInvoice(print, {
			onPrint: (doc) => {
				if (print) {
					if (isOffline()) {
						printOfflineInvoice(doc);
					} else {
						loadPrintPage();
					}
				}
			},
			onSuccess: () => {
				customer_credit_dict.value = [];
				redeem_customer_credit.value = false;
				is_cashback.value = true;
				show_change_dialog.value = true;
				is_credit_return.value = false;
				sales_person.value = "";
			},
			onFinishNavigation: (clearInvoice) => {
				finishSubmissionNavigation(clearInvoice);
			},
			onScheduleBackgroundCheck: (name, doctype) => {
				scheduleBackgroundStatusCheck(name, doctype);
			},
			...callbackOverrides,
		});
	} catch (error) {
		console.error("Submission failed propagate:", error);
		restorePaymentLinesAfterFailedSubmit();

		if (error?.message) {
			toastStore.show({
				title: error.message,
				color: "error",
			});
			frappe.utils.play_sound("error");
		}
	} finally {
		loading.value = false;
		submissionInFlight.value = false;
	}
};

// Keyboard Shortcuts
const handlePaymentShortcut = (event) => {
	if (event.defaultPrevented || submissionInFlight.value || loading.value) return;
	if (event.repeat) return;
	if (!paymentVisible.value) return;

	const isAltOnly = event.altKey && !event.ctrlKey && !event.metaKey;
	const key = event.key.toLowerCase();

	if (isAltOnly && key === "p") {
		event.preventDefault();
		event.stopPropagation();
		submit(null, false, true);
		return;
	}

	if ((isAltOnly || event.ctrlKey || event.metaKey) && key === "x") {
		event.preventDefault();
		event.stopPropagation();
		submit(null, false, false);
	}
};

const handleSubmitPaymentShortcut = ({ print = false } = {}) => {
	if (!paymentVisible.value || submissionInFlight.value || loading.value) return;
	nextTick(() => {
		submit(null, false, print);
	});
};

const queueShortcutSubmit = (payload = {}) => {
	queuedShortcutSubmit.value = payload;
	if (isPaymentOpen.value) {
		nextTick(() => {
			setTimeout(() => {
				if (!queuedShortcutSubmit.value) {
					return;
				}
				const pendingPayload = queuedShortcutSubmit.value;
				queuedShortcutSubmit.value = null;
				handleSubmitPaymentShortcut(pendingPayload || {});
			}, 150);
		});
	}
};

// Watchers
watch(
	() => uiStore.posProfile,
	(p) => {
		if (p) {
			pos_profile.value = p;
			stock_settings.value = uiStore.stockSettings || {};
			get_mpesa_modes();
			get_print_formats();
		}
	},
	{ immediate: true },
);

watch(diff_payment, (newVal) => {
	if (is_user_editing_paid_change.value) return;

	const lastEditWasCash = last_payment_change_was_cash.value;

	if (newVal < 0) {
		const changeDue = -newVal;
		if (lastEditWasCash === false) {
			paid_change.value = flt(changeDue, currency_precision.value);
			credit_change.value = 0;
		} else {
			paid_change.value = changeDue;
		}
	} else {
		updateCreditChange(0);
	}

	last_payment_change_was_cash.value = null;
});

watch(paid_change, (newVal) => {
	const changeLimit = Math.max(-diff_payment.value, 0);
	if (newVal > changeLimit) {
		paid_change.value = changeLimit;
		credit_change.value = 0;
		paid_change_rules.value = ["Paid change can not be greater than total change!"];
	} else {
		paid_change_rules.value = [];
		credit_change.value = flt(changeLimit - newVal, currency_precision.value);
	}

	const effectivePaid = Math.min(paid_change.value, changeLimit);
	const creditAmount = flt(changeLimit - effectivePaid, currency_precision.value);

	if (invoice_doc.value) {
		invoice_doc.value.paid_change = effectivePaid;
		invoice_doc.value.credit_change = creditAmount > 0 ? creditAmount : 0;
	}
});

watch(loyalty_amount, (value) => {
	if (!invoice_doc.value) return;
	const amount = parseFloat(value) || 0;
	if (amount > available_points_amount.value + 0.001) {
		invoice_doc.value.loyalty_amount = 0;
		invoice_doc.value.redeem_loyalty_points = 0;
		invoice_doc.value.loyalty_points = 0;
		loyalty_amount.value = 0;
		toastStore.show({
			title: `Loyalty Amount can not be more than ${available_points_amount.value}`,
			color: "error",
		});
	} else {
		invoice_doc.value.loyalty_amount = flt(loyalty_amount.value);
		invoice_doc.value.redeem_loyalty_points = 1;

		let baseAmount = amount;
		const docCurrency = invoice_doc.value.currency;
		const baseCurrency = pos_profile.value.currency;

		if (docCurrency && baseCurrency && docCurrency !== baseCurrency) {
			baseAmount = amount * (invoice_doc.value.conversion_rate || 1);
		}

		invoice_doc.value.loyalty_points = parseInt(
			baseAmount / (customer_info.value.conversion_factor || 1),
		);

		if (!is_credit_sale.value && invoice_doc.value.payments) {
			const default_payment = invoice_doc.value.payments.find((p) => p.default === 1);
			if (default_payment) {
				const invoice_total = invoice_doc.value.rounded_total || invoice_doc.value.grand_total;
				const other_payments = invoice_doc.value.payments.reduce((sum, p) => {
					if (p !== default_payment) {
						return sum + flt(p.amount);
					}
					return sum;
				}, 0);
				const loyalty = flt(invoice_doc.value.loyalty_amount);
				const credit = flt(redeemed_customer_credit.value);

				let new_amount = invoice_total - loyalty - credit - other_payments;
				if (new_amount < 0) new_amount = 0;

				default_payment.amount = flt(new_amount, currency_precision.value);
			}
		}
	}
});

watch(sales_person, (newVal) => {
	if (!invoice_doc.value) return;
	if (newVal) {
		invoice_doc.value.sales_team = [
			{
				sales_person: newVal,
				allocated_percentage: 100,
			},
		];
	} else {
		invoice_doc.value.sales_team = [];
	}
});

watch(is_credit_sale, (newVal) => {
	if (!invoice_doc.value || !Array.isArray(invoice_doc.value.payments)) return;

	const doc = invoice_doc.value;
	const conversionRate = doc.conversion_rate || 1;

	// Always clear all payment methods first to prevent stale paid amounts.
	doc.payments.forEach((payment) => {
		payment.amount = 0;
		if (payment.base_amount !== undefined) {
			payment.base_amount = 0;
		}
	});

	if (!newVal && doc.payments.length) {
		const amount = flt(doc.rounded_total || doc.grand_total, currency_precision.value);
		const defaultPayment =
			doc.payments.find((payment) => payment.default === 1) ||
			doc.payments.find((payment) => isCashLikePayment(payment)) ||
			doc.payments[0];

		if (defaultPayment) {
			defaultPayment.amount = amount;
			if (defaultPayment.base_amount !== undefined) {
				defaultPayment.base_amount = flt(amount * conversionRate, currency_precision.value);
			}
		}
	}
});

watch(is_credit_return, (newVal) => {
	if (!invoice_doc.value) return;
	if (newVal) {
		is_cashback.value = false;
		invoice_doc.value.payments.forEach((payment) => {
			payment.amount = 0;
			if (payment.base_amount !== undefined) {
				payment.base_amount = 0;
			}
		});
	} else {
		is_cashback.value = true;
		ensureReturnPaymentsAreNegative();
	}
});

watch(
	() => invoice_doc.value.customer,
	(customer, previous) => {
		if (customer && customer !== previous) {
			get_addresses();
			set_print_format();
		} else if (!customer) {
			addresses.value = [];
			print_format.value = "";
		}
	},
);

watch(isPaymentOpen, (isOpen) => {
	if (isOpen) {
		ensurePaymentLinesInitialized();
		handleShowPayment();
	} else {
		releaseActiveFocus();
		paymentVisible.value = false;
		highlightSubmit.value = false;
		queuedShortcutSubmit.value = null;
	}
});

watch(
	() => invoice_doc.value.posa_delivery_date,
	(date) => {
		if (!date) {
			if (invoice_doc.value) {
				invoice_doc.value.shipping_address_name = null;
			}
			addresses.value = [];
			return;
		}
		if (invoice_doc.value && invoice_doc.value.customer) {
			get_addresses();
		}
	},
);

watch(customerInfo, (newInfo) => {
	customer_info.value = newInfo || "";
});

watch(selectedCustomer, (newCustomer, oldCustomer) => {
	if (newCustomer === oldCustomer) return;
	customer_credit_dict.value = [];
	redeem_customer_credit.value = false;
	is_cashback.value = true;
	is_credit_return.value = false;
	loyalty_amount.value = 0;

	if (invoice_doc.value) {
		invoice_doc.value.loyalty_amount = 0;
		invoice_doc.value.redeem_loyalty_points = 0;
		invoice_doc.value.loyalty_points = 0;
	}
});

// Lifecycle
onMounted(() => {
	_shortcutHandlers.value.handlePaymentShortcut = handlePaymentShortcut.bind(this);
	document.addEventListener("keydown", _shortcutHandlers.value.handlePaymentShortcut);

	syncStore.syncPendingInvoices();
	eventBus.on("network-online", () => syncStore.syncPendingInvoices());
	eventBus.on("server-online", () => syncStore.syncPendingInvoices());

	if (eventBus) {
		eventBus.on("send_invoice_doc_payment", (doc) => {
			invoiceStore.setInvoiceDoc(doc);
			paid_change.value = flt(doc.paid_change || 0, currency_precision.value);
			credit_change.value = flt(doc.credit_change || 0, currency_precision.value);
			last_payment_change_was_cash.value = null;
			is_credit_sale.value = false;
			is_write_off_change.value = false;

			const initializedPayment = ensurePaymentLinesInitialized(doc);

			if (doc.is_return) {
				is_return.value = true;
				is_credit_return.value = false;
			} else if (initializedPayment) {
				is_credit_return.value = false;
			}
			initializeReturnValidity(doc);
			loyalty_amount.value = 0;
			redeemed_customer_credit.value = 0;
			if (doc.customer) {
				get_addresses();
			}
			get_sales_person_names();
		});

		eventBus.on("register_pos_profile", (data) => {
			pos_profile.value = data.pos_profile;
			stock_settings.value = data.stock_settings;
		});
		eventBus.on("add_the_new_address", (data) => {
			const normalized = normalizeAddress(data);
			if (normalized) {
				const existing = addresses.value.filter((addr) => addr.name !== normalized.name);
				addresses.value = [...existing, normalized];
				if (invoice_doc.value) {
					invoice_doc.value.shipping_address_name = normalized.name;
				}
			}
		});
		eventBus.on("update_invoice_type", (data) => {
			invoiceType.value = data;
			if (invoice_doc.value && data !== "Order") {
				invoice_doc.value.posa_delivery_date = null;
				invoice_doc.value.posa_notes = null;
				invoice_doc.value.posa_authorization_code = null;
				invoice_doc.value.shipping_address_name = null;
			} else if (invoice_doc.value && data === "Order") {
				new_delivery_date.value = formatDateDisplay(frappe.datetime.now_date());
				update_delivery_date();
			}
			if (invoice_doc.value && data === "Return") {
				invoice_doc.value.is_return = 1;
				ensureReturnPaymentsAreNegative();
				is_credit_return.value = false;
				return_valid_upto_date.value = null;
			}
		});
		eventBus.on("set_pos_settings", (data) => {
			pos_settings.value = data || {};
			if (invoice_doc.value && !invoice_doc.value.is_return) {
				initializeReturnValidity(invoice_doc.value);
			}
		});
		eventBus.on("set_mpesa_payment", (data) => {
			set_mpesa_payment(data);
		});
		eventBus.on("queue_submit_payment_shortcut", queueShortcutSubmit);
		eventBus.on("submit_payment_shortcut", handleSubmitPaymentShortcut);
		eventBus.on("clear_invoice", () => {
			invoiceStore.clear();
			invoiceStore.resetPostingDate();
			is_return.value = false;
			is_credit_return.value = false;
			return_valid_upto_date.value = null;
		});
	}

	if (isPaymentOpen.value) {
		handleShowPayment("true");
	}
});

onBeforeUnmount(() => {
	eventBus.off("send_invoice_doc_payment");
	eventBus.off("register_pos_profile");
	eventBus.off("add_the_new_address");
	eventBus.off("update_invoice_type");
	eventBus.off("set_pos_settings");
	eventBus.off("set_mpesa_payment");
	eventBus.off("queue_submit_payment_shortcut", queueShortcutSubmit);
	eventBus.off("submit_payment_shortcut", handleSubmitPaymentShortcut);
	eventBus.off("clear_invoice");
	eventBus.off("network-online");
	eventBus.off("server-online");
	clearBackgroundStatusCheck();

	if (_shortcutHandlers.value.handlePaymentShortcut) {
		document.removeEventListener("keydown", _shortcutHandlers.value.handlePaymentShortcut);
	}
});
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
	height: calc(100vh - 48px);
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
	background: linear-gradient(
		180deg,
		rgba(var(--v-theme-primary), 0.08) 0%,
		var(--pos-surface-muted) 100%
	);
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
		position: static;
		margin-top: 0;
	}
}
</style>
