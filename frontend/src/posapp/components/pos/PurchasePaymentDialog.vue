<template>
	<v-dialog v-model="dialog" max-width="600px" persistent>
		<v-card class="pos-themed-card" style="max-height: 80vh; overflow: hidden;">
			<v-card-title class="bg-primary text-white d-flex align-center py-3">
				<span class="text-h6">{{ __("Payment") }}</span>
				<v-spacer></v-spacer>
				<span class="text-subtitle-1 font-weight-bold">
					{{ formatCurrency(totalAmount, currency) }}
				</span>
			</v-card-title>

			<v-card-text class="pa-0 overflow-y-auto" style="max-height: 60vh;">
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
								class="payment-method-btn"
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
									class="mr-1 mb-1"
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
							class="submit-btn"
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

<script>
/* global __, frappe */
import format from "../../format";
import { getSmartTenderSuggestions } from "../../../utils/smartTender.js";

export default {
	name: "PurchasePaymentDialog",
	mixins: [format],
	props: {
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
	},
	emits: ["update:modelValue", "submit"],
	data() {
		return {
			paymentLines: [],
			printFormats: [],
			selectedPrintFormat: null,
			printInvoice: this.createInvoice,
			loading: false,
			cashMOP: null, // Will be set to the cash mode of payment
		};
	},
	computed: {
		dialog: {
			get() {
				return this.modelValue;
			},
			set(val) {
				this.$emit("update:modelValue", val);
			},
		},
		paidAmount() {
			return this.paymentLines.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
		},
		remainingAmount() {
			return this.totalAmount - this.paidAmount;
		},
		isPaymentValid() {
			// For purchases, we typically want exact payment or overpayment (change)
			// Or we could allow partial payments if configured
			return this.paidAmount > 0 && this.remainingAmount <= 0;
		},
	},
	watch: {
		dialog(val) {
			if (val) {
				this.printInvoice = this.createInvoice;
				this.initializePayments();
				this.fetchPrintFormats();
				this.loading = false;
			}
		},
		printInvoice() {
			this.fetchPrintFormats();
		},
	},
	methods: {
		initializePayments() {
			const modes = this.posProfile.payments || [];
			this.paymentLines = modes.map((m) => ({
				mode_of_payment: m.mode_of_payment,
				amount: 0,
				default: m.default,
				type: m.type,
			}));

			// Identify cash payment method
			this.cashMOP = this.paymentLines.find(p => 
				p.mode_of_payment.toLowerCase().includes('cash') || p.type === 'Cash'
			);

			// Auto-fill default payment method if exists
			const defaultMode = this.paymentLines.find((p) => p.default) || this.paymentLines[0];
			if (defaultMode) {
				defaultMode.amount = this.totalAmount;
			}
		},
		set_full_amount(payment) {
			// Reset all other payments
			this.paymentLines.forEach((p) => {
				if (p !== payment) {
					p.amount = 0;
				}
			});
			// Set this payment to total amount
			payment.amount = this.totalAmount;
		},
		set_rest_amount(payment) {
			// If payment is 0 and there's remaining amount, auto-fill
			if (payment.amount === 0 && this.remainingAmount > 0) {
				payment.amount = this.remainingAmount;
			}
		},
		handlePaymentAmountChange(payment, event) {
			const val = parseFloat(event) || 0;
			payment.amount = val;
			
			// Auto-balance: if this payment exceeds remaining, reduce others
			if (this.remainingAmount < 0) {
				this.autoBalancePayments(payment);
			}
		},
		setPaymentToDenomination(payment, amount) {
			payment.amount = amount;
			// Auto-balance other payments if needed
			if (this.remainingAmount < 0) {
				this.autoBalancePayments(payment);
			}
		},
		autoBalancePayments(excludePayment) {
			const excess = Math.abs(this.remainingAmount);
			if (excess <= 0) return;

			// Find other payments with amount > 0 to reduce
			const otherPayments = this.paymentLines.filter(
				(p) => p !== excludePayment && parseFloat(p.amount) > 0
			);

			// Sort by amount descending to reduce larger chunks first
			otherPayments.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));

			let remainingExcess = excess;

			for (const other of otherPayments) {
				if (remainingExcess <= 0) break;
				
				const otherAmount = parseFloat(other.amount) || 0;
				const reduction = Math.min(otherAmount, remainingExcess);
				
				other.amount = this.flt(otherAmount - reduction, this.currency_precision);
				remainingExcess = this.flt(remainingExcess - reduction, this.currency_precision);
			}
		},
		isCashLikePayment(payment) {
			if (!payment) return false;
			
			// Check if it's the configured cash MOP or contains "cash" in name
			const configuredCashMOP = String(this.posProfile?.posa_cash_mode_of_payment || "").toLowerCase();
			const mode = String(payment.mode_of_payment || "").toLowerCase();
			const type = String(payment.type || "").toLowerCase();
			
			if (type === "cash") return true;
			if (configuredCashMOP && mode === configuredCashMOP) return true;
			return mode.includes("cash");
		},
		getVisibleDenominations(payment) {
			if (!this.isCashLikePayment(payment)) return [];
			
			const currentTotalPaid = this.paidAmount;
			const currentPaymentAmount = parseFloat(payment.amount) || 0;
			const otherPayments = currentTotalPaid - currentPaymentAmount;
			const amountToPay = this.totalAmount - otherPayments;

			if (amountToPay <= 0) return [];

			return getSmartTenderSuggestions(amountToPay, this.currency);
		},
		currencySymbol(curr) {
			return curr || "";
		},
		close() {
			this.dialog = false;
		},
		submit(doPrint) {
			this.loading = true;
			const payments = this.paymentLines
				.filter((p) => p.amount > 0)
				.map((p) => ({
					mode_of_payment: p.mode_of_payment,
					amount: p.amount,
				}));
			
			this.$emit("submit", {
				payments,
				print: doPrint,
				print_format: this.selectedPrintFormat,
				print_invoice: this.printInvoice,
			});
		},
		async fetchPrintFormats() {
			try {
				const doctype = this.printInvoice ? "Purchase Invoice" : "Purchase Order";
				const { message } = await frappe.call({
					method: "posawesome.posawesome.api.print_formats.get_print_formats",
					args: {
						doctype: doctype,
					},
				});
				this.printFormats = message || [];
				this.selectedPrintFormat = null;

				if (this.printFormats.length) {
					if (
						this.posProfile.print_format &&
						this.printFormats.includes(this.posProfile.print_format)
					) {
						this.selectedPrintFormat = this.posProfile.print_format;
					} else {
						this.selectedPrintFormat = this.printFormats[0];
					}
				}
			} catch (e) {
				console.error("Failed to fetch print formats", e);
			}
		},
	},
};
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

/* Payment method button styling - matches Payments.vue */
.payment-method-btn {
	position: relative;
	text-transform: none;
	font-weight: 500;
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
</style>
