<template>
	<v-dialog v-model="dialog" max-width="600" persistent>
		<v-card class="pos-themed-card purchase-payment-dialog-card">
			<v-card-title class="bg-primary text-white d-flex align-center py-3">
				<span class="text-h6">{{ __("Payment") }}</span>
				<v-spacer></v-spacer>
				<span class="text-subtitle-1 font-weight-bold">
					{{ formatCurrency(totalAmount, currency) }}
				</span>
			</v-card-title>

			<v-card-text class="pa-0 overflow-y-auto purchase-payment-dialog__content">
				<!-- Payment Summary -->
				<v-row v-if="totalAmount > 0" class="pa-3 ma-0" dense>
					<v-col cols="6">
						<v-text-field
							variant="solo"
							color="primary"
							:label="frappe._('Paid Amount')"
							class="sleek-field pos-themed-input"
							hide-details
							:model-value="formatCurrency(paidAmount, currency)"
							readonly
							:prefix="currencySymbol(currency)"
							density="compact"
						></v-text-field>
					</v-col>
					<v-col cols="6">
						<v-text-field
							variant="solo"
							color="primary"
							:label="remainingAmount > 0 ? __('To Be Paid') : __('Change')"
							class="sleek-field pos-themed-input"
							hide-details
							:model-value="formatCurrency(Math.abs(remainingAmount), currency)"
							:prefix="currencySymbol(currency)"
							density="compact"
							readonly
							:class="remainingAmount > 0 ? 'text-error' : 'text-success'"
						></v-text-field>
					</v-col>
				</v-row>

				<v-divider class="mx-3"></v-divider>

				<!-- Payment Inputs -->
				<div class="pa-3">
					<v-row
						v-for="(payment, index) in paymentLines"
						:key="payment.mode_of_payment"
						class="payments pa-1 ma-0 align-center"
						dense
					>
						<v-col cols="6">
							<v-text-field
								density="compact"
								variant="solo"
								color="primary"
								:label="frappe._(payment.mode_of_payment)"
								class="sleek-field pos-themed-input"
								hide-details
								:model-value="formatCurrency(payment.amount, currency)"
								@change="handlePaymentAmountChange(payment, $event)"
								:prefix="currencySymbol(currency)"
								@focus="set_rest_amount(payment)"
								inputmode="decimal"
							></v-text-field>
						</v-col>
						<v-col cols="6">
							<v-btn
								block
								color="primary"
								theme="dark"
								class="payment-method-btn pos-touch-target pos-focus-ring"
								@click="set_full_amount(payment)"
								size="small"
							>
								{{ payment.mode_of_payment }}
							</v-btn>
						</v-col>

						<!-- Cash Denomination Buttons -->
						<v-col
							cols="12"
							v-if="isCashLikePayment(payment) && getVisibleDenominations(payment).length"
							class="py-0 px-2 mt-2 mb-2"
						>
							<div class="d-flex flex-wrap gap-2">
								<v-btn
									v-for="d in getVisibleDenominations(payment)"
									:key="d"
									size="x-small"
									class="mr-1 mb-1 purchase-denomination-btn pos-focus-ring"
									color="secondary"
									variant="tonal"
									@click="setPaymentToDenomination(payment, d)"
								>
									{{ formatCurrency(d, currency) }}
								</v-btn>
							</div>
						</v-col>
					</v-row>
				</div>

				<v-divider class="mx-3"></v-divider>

				<!-- Invoice Totals -->
				<v-row class="pa-3 ma-0" dense>
					<v-col cols="6">
						<v-text-field
							density="compact"
							variant="solo"
							color="primary"
							:label="frappe._('Net Total')"
							class="sleek-field pos-themed-input"
							:model-value="formatCurrency(totalAmount, currency)"
							readonly
							:prefix="currencySymbol(currency)"
							hide-details
						></v-text-field>
					</v-col>
					<v-col cols="6">
						<v-text-field
							density="compact"
							variant="solo"
							color="primary"
							:label="frappe._('Total Amount')"
							class="sleek-field pos-themed-input"
							hide-details
							:model-value="formatCurrency(totalAmount, currency)"
							readonly
							:prefix="currencySymbol(currency)"
						></v-text-field>
					</v-col>
				</v-row>

				<!-- Print Format Selection -->
				<v-row class="pa-3 ma-0" dense>
					<v-col cols="12" v-if="createInvoice">
						<v-switch
							v-model="printInvoice"
							density="compact"
							color="primary"
							hide-details
							:label="__('Print Purchase Invoice instead of PO')"
							class="ma-0 mb-2"
						></v-switch>
					</v-col>
					<v-col cols="12">
						<v-select
							v-model="selectedPrintFormat"
							:items="printFormats"
							:label="printInvoice ? __('Print Format (Invoice)') : __('Print Format (Order)')"
							density="compact"
							variant="solo"
							color="primary"
							hide-details
							class="sleek-field pos-themed-input"
							clearable
						></v-select>
					</v-col>
				</v-row>
			</v-card-text>

			<v-card-actions class="pa-4 border-t bg-surface">
				<v-row align="start" no-gutters class="w-100">
					<v-col cols="6" class="pr-1">
						<v-btn
							block
							size="large"
							color="primary"
							theme="dark"
							class="submit-btn pos-touch-target pos-focus-ring"
							@click="submit(false)"
							:loading="loading"
							:disabled="loading || !isPaymentValid"
						>
							{{ __("Submit") }}
						</v-btn>
					</v-col>
					<v-col cols="6" class="pl-1">
						<v-btn
							block
							size="large"
							color="success"
							theme="dark"
							class="pos-touch-target pos-focus-ring"
							@click="submit(true)"
							:loading="loading"
							:disabled="loading || !isPaymentValid"
						>
							{{ __("Submit & Print") }}
						</v-btn>
					</v-col>
					<v-col cols="12" class="mt-2">
						<v-btn
							block
							size="large"
							color="error"
							theme="dark"
							variant="outlined"
							class="pos-touch-target pos-focus-ring"
							@click="close"
						>
							{{ __("Cancel Payment") }}
						</v-btn>
					</v-col>
				</v-row>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { formatUtils } from "../../../format";
import { getSmartTenderSuggestions } from "../../../../utils/smartTender";

defineOptions({
	name: "PurchasePaymentDialog",
});

const __ = window.__ || ((text) => text);

const props = defineProps({
	modelValue: Boolean,
	totalAmount: {
		type: Number,
		required: true,
	},
	currency: {
		type: String,
		default: "",
	},
	posProfile: {
		type: Object,
		required: true,
	},
	createInvoice: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(["update:modelValue", "submit"]);
const currency_precision = ref(2);

const paymentLines = ref([]);
const printFormats = ref([]);
const selectedPrintFormat = ref(null);
const printInvoice = ref(props.createInvoice);
const loading = ref(false);

const dialog = computed({
	get() {
		return props.modelValue;
	},
	set(val) {
		emit("update:modelValue", val);
	},
});

const paidAmount = computed(() =>
	paymentLines.value.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0),
);

const remainingAmount = computed(() => props.totalAmount - paidAmount.value);

const isPaymentValid = computed(() => {
	const hasNegativePayment = paymentLines.value.some((p) => (parseFloat(p.amount) || 0) < 0);
	if (hasNegativePayment) return false;

	// Allow submitting Purchase Order even with zero payment.
	// If any payment is entered, keep full-settlement behavior.
	if (paidAmount.value <= 0) return true;
	return remainingAmount.value <= 0;
});

watch(
	() => props.modelValue,
	(val) => {
		if (val) {
			printInvoice.value = props.createInvoice;
			initializePayments();
			fetchPrintFormats();
			loading.value = false;
		}
	},
);

watch(printInvoice, () => {
	fetchPrintFormats();
});

const flt = (value, precision, number_format, rounding_method) => {
	if (!precision && precision != 0) {
		precision = currency_precision.value || 2;
	}
	if (!rounding_method) {
		rounding_method = "Banker's Rounding (legacy)";
	}
	return window.flt(value, precision, number_format, rounding_method);
};

function formatCurrency(value, precision) {
	if (value === null || value === undefined) {
		value = 0;
	}
	let number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
	if (isNaN(number)) number = 0;
	let prec = precision != null ? Number(precision) : Number(currency_precision.value) || 2;
	if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
		prec = Math.min(Math.max(parseInt(prec) || 2, 0), 20);
	}

	const locale = formatUtils.getNumberLocale();
	let formatted = number.toLocaleString(locale, {
		minimumFractionDigits: prec,
		maximumFractionDigits: prec,
		useGrouping: true,
	});

	formatted = formatUtils.toArabicNumerals(formatted);
	return formatted;
}

function initializePayments() {
	const modes = props.posProfile.payments || [];
	paymentLines.value = modes.map((m) => ({
		mode_of_payment: m.mode_of_payment,
		amount: 0,
		default: m.default,
		type: m.type,
	}));

	// Auto-fill default payment method if exists
	const defaultMode = paymentLines.value.find((p) => p.default) || paymentLines.value[0];
	if (defaultMode) {
		defaultMode.amount = props.totalAmount;
	}
}

function set_full_amount(payment) {
	// Reset all other payments
	paymentLines.value.forEach((p) => {
		if (p !== payment) {
			p.amount = 0;
		}
	});
	// Set this payment to total amount
	payment.amount = props.totalAmount;
}

function set_rest_amount(payment) {
	// If payment is 0 and there's remaining amount, auto-fill
	if (payment.amount === 0 && remainingAmount.value > 0) {
		payment.amount = remainingAmount.value;
	}
}

function handlePaymentAmountChange(payment, event) {
	const val = parseFloat(event) || 0;
	payment.amount = val;

	// Auto-balance: if this payment exceeds remaining, reduce others
	if (remainingAmount.value < 0) {
		autoBalancePayments(payment);
	}
}

function setPaymentToDenomination(payment, amount) {
	payment.amount = amount;
	// Auto-balance other payments if needed
	if (remainingAmount.value < 0) {
		autoBalancePayments(payment);
	}
}

function autoBalancePayments(excludePayment) {
	const excess = Math.abs(remainingAmount.value);
	if (excess <= 0) return;

	// Find other payments with amount > 0 to reduce
	const otherPayments = paymentLines.value.filter((p) => p !== excludePayment && parseFloat(p.amount) > 0);

	// Sort by amount descending to reduce larger chunks first
	otherPayments.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

	let remainingExcess = excess;

	for (const other of otherPayments) {
		if (remainingExcess <= 0) break;

		const otherAmount = parseFloat(other.amount) || 0;
		const reduction = Math.min(otherAmount, remainingExcess);

		other.amount = flt(otherAmount - reduction, currency_precision.value);
		remainingExcess = flt(remainingExcess - reduction, currency_precision.value);
	}
}

function isCashLikePayment(payment) {
	if (!payment) return false;

	// Check if it's the configured cash MOP or contains "cash" in name
	const configuredCashMOP = String(props.posProfile?.posa_cash_mode_of_payment || "").toLowerCase();
	const mode = String(payment.mode_of_payment || "").toLowerCase();
	const type = String(payment.type || "").toLowerCase();

	if (type === "cash") return true;
	if (configuredCashMOP && mode === configuredCashMOP) return true;
	return mode.includes("cash");
}

function getVisibleDenominations(payment) {
	if (!isCashLikePayment(payment)) return [];

	const currentTotalPaid = paidAmount.value;
	const currentPaymentAmount = parseFloat(payment.amount) || 0;
	const otherPayments = currentTotalPaid - currentPaymentAmount;
	const amountToPay = props.totalAmount - otherPayments;

	if (amountToPay <= 0) return [];

	return getSmartTenderSuggestions(amountToPay, props.currency);
}

function currencySymbol(curr) {
	return curr || "";
}

function close() {
	dialog.value = false;
}

function submit(doPrint) {
	loading.value = true;
	const payments = paymentLines.value
		.filter((p) => p.amount > 0)
		.map((p) => ({
			mode_of_payment: p.mode_of_payment,
			amount: p.amount,
		}));

	emit("submit", {
		payments,
		print: doPrint,
		print_format: selectedPrintFormat.value,
		print_invoice: printInvoice.value,
	});
}

async function fetchPrintFormats() {
	try {
		const doctype = printInvoice.value ? "Purchase Invoice" : "Purchase Order";
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.print_formats.get_print_formats",
			args: {
				doctype: doctype,
			},
		});
		printFormats.value = message || [];
		selectedPrintFormat.value = null;

		if (printFormats.value.length) {
			if (props.posProfile.print_format && printFormats.value.includes(props.posProfile.print_format)) {
				selectedPrintFormat.value = props.posProfile.print_format;
			} else {
				selectedPrintFormat.value = printFormats.value[0];
			}
		}
	} catch (e) {
		console.error("Failed to fetch print formats", e);
	}
}
</script>

<style scoped>
.v-text-field {
	composes: pos-form-field;
}

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

.pos-themed-card {
	border-radius: 12px;
}

.purchase-payment-dialog-card {
	width: min(600px, calc(100vw - 24px));
	max-height: min(82dvh, 760px);
	overflow: hidden;
	display: flex;
	flex-direction: column;
}

.purchase-payment-dialog__content {
	flex: 1 1 auto;
	max-height: none;
}

/* Payment method button styling - matches Payments.vue */
.payment-method-btn {
	position: relative;
	text-transform: none;
	font-weight: 500;
	min-height: var(--pos-touch-target-min);
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

/* Submit button styling - matches Payments.vue */
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

/* Sleek field styling for right-aligned text */
.sleek-field :deep(.v-field__input) {
	text-align: right;
}

/* Payment row spacing */
.payments {
	margin-bottom: 8px;
}

/* Denomination buttons container */
.d-flex.flex-wrap {
	display: flex;
	flex-wrap: wrap;
}

.gap-2 {
	gap: 8px;
}

.purchase-denomination-btn {
	min-height: var(--pos-touch-target-min);
	text-transform: none;
	font-weight: 700;
}

/* Dialog specific adjustments */
.v-dialog .v-card-text {
	scrollbar-width: thin;
	scrollbar-color: var(--v-theme-primary) transparent;
}

.v-dialog .v-card-text::-webkit-scrollbar {
	width: 6px;
}

.v-dialog .v-card-text::-webkit-scrollbar-track {
	background: transparent;
}

.v-dialog .v-card-text::-webkit-scrollbar-thumb {
	background-color: rgb(var(--v-theme-primary));
	border-radius: 3px;
}

@media (max-width: 600px) {
	.purchase-payment-dialog-card {
		width: min(600px, calc(100vw - 16px));
		max-height: min(88dvh, 760px);
	}
}
</style>
