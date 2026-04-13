<template>
	<div fluid :class="rtlClasses">
		<AppLoadingOverlay
			:visible="isPaymentRouteLocked"
			:message="paymentsLoadingMessage"
		/>
		<v-row>
			<v-col md="8" cols="12" class="pb-2 pr-0">
				<v-card
					class="main mx-auto mt-3 p-3 pb-16 overflow-y-auto pos-themed-card"
					style="max-height: calc(100dvh - 32px); height: calc(100dvh - 32px)"
				>
					<div class="pay-mode-controls">
						<div class="pay-mode-controls__group">
							<div class="pay-mode-controls__label">{{ __("Payment Entry Type") }}</div>
							<v-btn-toggle
								v-model="paymentEntryType"
								mandatory
								density="comfortable"
								class="pay-mode-toggle pay-mode-toggle--entry"
							>
								<v-btn
									value="Receive"
									class="pay-mode-btn pay-mode-btn--receive"
								>
									{{ __("Receive") }}
								</v-btn>
								<v-btn
									value="Pay"
									class="pay-mode-btn pay-mode-btn--pay"
								>
									{{ __("Pay") }}
								</v-btn>
							</v-btn-toggle>
						</div>

						<div class="pay-mode-controls__group">
							<div class="pay-mode-controls__label">{{ __("Party Type") }}</div>
							<v-btn-toggle
								v-model="partyType"
								mandatory
								density="comfortable"
								class="pay-mode-toggle pay-mode-toggle--party"
							>
								<v-btn
									v-for="option in allowedPartyTypes"
									:key="option"
									:value="option"
									:class="[
										'pay-mode-btn',
										option === 'Customer'
											? 'pay-mode-btn--customer'
											: option === 'Supplier'
												? 'pay-mode-btn--supplier'
												: 'pay-mode-btn--employee',
									]"
								>
									{{ __(option) }}
								</v-btn>
							</v-btn-toggle>
						</div>
					</div>

					<v-row class="pay-customer-row" dense>
						<v-col
							cols="12"
							:md="pos_profile?.posa_allow_change_posting_date ? 9 : 12"
							class="pb-0"
						>
							<Customer v-if="isCustomerPartyType"></Customer>
							<PayPartySelector
								v-else
								v-model="customer_name"
								:party-type="partyType"
								:items="currentPartyOptions"
								:loading="partySearchLoading"
								@search="handlePartySearch"
							/>
						</v-col>
						<v-col
							v-if="pos_profile?.posa_allow_change_posting_date"
							cols="12"
							md="3"
							class="pb-0"
						>
							<VueDatePicker
								v-model="postingDateDisplay"
								model-type="format"
								format="dd-MM-yyyy"
								auto-apply
								teleport
								:placeholder="__('Posting Date')"
								class="sleek-field posting-date-input pos-themed-input pay-posting-date"
							/>
						</v-col>
					</v-row>
					<v-divider></v-divider>

					<PayInvoicesTable
						v-if="showReconciliationSections"
						v-model:pos-profile-search="pos_profile_search"
						v-model:currency-filter="currency_filter"
						:invoices="outstanding_invoices"
						:filtered-invoices="filtered_outstanding_invoices"
						:pos-profile="pos_profile"
						:pos-profiles-list="pos_profiles_list"
						:currencies="invoice_currencies"
						:outstanding-by-currency="outstanding_by_currency"
						:total-outstanding="total_outstanding_amount"
						:total-selected="total_selected_invoices"
						:selected-count="selected_invoices.length"
						:loading="invoices_loading"
						:auto-reconcile-loading="auto_reconcile_loading"
						:auto-reconcile-summary="auto_reconcile_summary"
						:party-name="customer_name"
						:section-title="invoiceSectionTitle"
						:is-invoice-selected="isInvoiceSelected"
						:item-class="isSelected"
						:currency-symbol="currencySymbol"
						:format-currency="formatCurrency"
						:headers="invoices_headers"
						@search="get_outstanding_invoices"
						@clear-selection="selected_invoices = []"
						@auto-reconcile="autoReconcile"
						@select-row="handleInvoiceSelection"
					/>

					<PayUnallocatedTable
						v-if="showReconciliationSections"
						v-model:selected-payments="selected_payments"
						:payments="unallocated_payments"
						:pos-profile="pos_profile"
						:total-unallocated="total_unallocated_amount"
						:total-selected="total_selected_payments"
						:loading="unallocated_payments_loading"
						:headers="unallocated_payments_headers"
						:section-title="paymentSectionTitle"
						:currency-symbol="currencySymbol"
						:format-currency="formatCurrency"
						:payment-row-class="paymentRowClass"
					/>

					<PayMpesaSection
						v-if="showMpesaSection"
						v-model:selected-payments="selected_mpesa_payments"
						v-model:search-name="mpesa_search_name"
						v-model:search-mobile="mpesa_search_mobile"
						:payments="mpesa_payments"
						:total-selected="total_selected_mpesa_payments"
						:loading="mpesa_payments_loading"
						:pos-profile="pos_profile"
						:headers="mpesa_payment_headers"
						:currency-symbol="currencySymbol"
						:format-currency="formatCurrency"
						@search="get_draft_mpesa_payments_register(payment_methods_list)"
					/>
				</v-card>
			</v-col>

			<v-col md="4" cols="12" class="pb-3">
				<v-card
					class="invoices mx-auto mt-3 p-3 pos-themed-card"
					style="max-height: calc(100dvh - 32px); height: calc(100dvh - 32px)"
				>
					<PayTotalsSidebar
						v-model:exchange-rate="exchangeRate"
						v-model:auto-allocate-payment-amount="autoAllocatePaymentAmount"
						v-model:reference-no="referenceNo"
						v-model:reference-date="referenceDate"
						:pos-profile="pos_profile"
						:total-selected-invoices="total_selected_invoices"
						:selected-invoices-count="selected_invoices.length"
						:total-selected-payments="total_selected_payments"
						:total-selected-mpesa="total_selected_mpesa_payments"
						:payment-methods="payment_methods"
						:filtered-payment-methods="filtered_payment_methods"
						:invoice-total-currency="invoiceTotalCurrency"
						:payment-total-currency="paymentTotalCurrency"
						:mpesa-total-currency="mpesaTotalCurrency"
						:company-currency="companyCurrency"
						:exchange-rate-loading="exchangeRateLoading"
						:exchange-rate-error="exchangeRateError"
						:requires-exchange-rate="requiresExchangeRate"
						:total-of-diff="total_of_diff"
						:currency-symbol="currencySymbol"
						:format-currency="formatCurrency"
						:get-payment-method-currency="getPaymentMethodCurrency"
						@validate-exchange-rate="validateExchangeRate"
						@fetch-exchange-rate="fetchExchangeRate"
					/>

					<PayActionButtons
						:loading="isSubmitting"
						:disabled="false"
						@submit="submit"
						@submit-and-print="submit_and_print"
					/>
				</v-card>
			</v-col>
		</v-row>
	</div>
</template>

<script>
import { ref, computed, watch, onMounted, onBeforeUnmount, getCurrentInstance } from "vue";
import { storeToRefs } from "pinia";
import VueDatePicker from "@vuepic/vue-datepicker";
import format from "../../../../posapp/format";
import { normalizeDateForBackend } from "../../../../posapp/format";
import Customer from "../../../customers/components/Customer.vue";
import {
	isOffline,
	getPendingOfflinePaymentCount,
	syncOfflinePayments,
} from "../../../../offline/index";
import {
	isDebugPrintEnabled,
	appendDebugPrintParam,
	silentPrint,
	watchPrintWindow,
} from "../../../../posapp/plugins/print";
import { printDocumentViaQz } from "../../../../posapp/services/qzTray";

import { useRtl } from "../../../../posapp/composables/core/useRtl";
import { useCustomersStore } from "../../../../posapp/stores/customersStore.js";
import { useUIStore } from "../../../../posapp/stores/uiStore.js";
import { useToastStore } from "../../../../posapp/stores/toastStore.js";
import { usePaymentRouteCheckoutState } from "../../domain/paymentRouteCheckoutState";

// Composables
import { usePosPayData } from "../../composables/workspace/usePosPayData";
import { usePosPaySelection } from "../../composables/workspace/usePosPaySelection";
import { usePosPaySubmission } from "../../composables/workspace/usePosPaySubmission";
import {
	getAllowedPartyTypes,
	normalizePartyTypeForPaymentType,
	shouldShowReconciliationSections,
} from "./paymentModes";

// Sub-components
import PayInvoicesTable from "./PayInvoicesTable.vue";
import PayUnallocatedTable from "./PayUnallocatedTable.vue";
import PayMpesaSection from "./PayMpesaSection.vue";
import PayTotalsSidebar from "./PayTotalsSidebar.vue";
import PayActionButtons from "./PayActionButtons.vue";
import PayPartySelector from "./PayPartySelector.vue";
import AppLoadingOverlay from "../../../../posapp/components/ui/LoadingOverlay.vue";
import {
	buildPaymentRouteLoadingMessage,
	isPaymentRouteLocked as resolvePaymentRouteLocked,
} from "../../../../posapp/utils/paymentRouteReadiness";
import { loadPaymentMethodCurrencyMap } from "../../../../posapp/utils/paymentMethodCurrencyCache";

const getTodayDate = () => frappe?.datetime?.nowdate?.() || new Date().toISOString().slice(0, 10);
const formatDisplayDate = (date) => {
	if (!date) return "";
	const parts = String(date).split("-");
	if (parts.length === 3) {
		return `${parts[2]}-${parts[1]}-${parts[0]}`;
	}
	return String(date);
};

export default {
	mixins: [format],
	components: {
		Customer,
		VueDatePicker,
		PayInvoicesTable,
		PayUnallocatedTable,
		PayMpesaSection,
		PayTotalsSidebar,
		PayActionButtons,
		PayPartySelector,
		AppLoadingOverlay,
	},
	setup() {
		const { proxy } = getCurrentInstance();
		const customersStore = useCustomersStore();
		const uiStore = useUIStore();
		const toastStore = useToastStore();
		const { checkoutStage } = usePaymentRouteCheckoutState();
		const { rtlStyles, rtlClasses } = useRtl();
		const {
			selectedCustomer,
			refreshToken,
			loadingCustomers,
			isCustomerBackgroundLoading,
			customersLoaded,
			loadProgress,
		} = storeToRefs(customersStore);
		const { paymentRouteTarget } = storeToRefs(uiStore);

		// Core Data & State
		const pos_profile = ref({});
		const pos_opening_shift = ref("");
		const paymentEntryType = ref("Receive");
		const partyType = ref("Customer");
		const customer_name = ref("");
		const postingDate = ref(getTodayDate());
		const supplierOptions = ref([]);
		const employeeOptions = ref([]);
		const partySearchLoading = ref(false);
		const company = ref("");
		const pos_profile_search = ref("");
		const currency_filter = ref("ALL");
		const autoAllocatePaymentAmount = ref(true);
		const exchangeRate = ref(null);
		const companyCurrency = ref(null);
		const referenceNo = ref("");
		const referenceDate = ref("");
		const exchangeRateLoading = ref(false);
		const exchangeRateError = ref(null);
		const payment_method_currencies = ref({});
		const payment_methods_list = ref([]);

		const mpesa_payment_headers = [
			{ title: __("Payment ID"), align: "start", sortable: true, key: "transid" },
			{ title: __("Full Name"), align: "start", sortable: true, key: "full_name" },
			{ title: __("Nobile Number"), align: "start", sortable: true, key: "mobile_no" },
			{ title: __("Date"), align: "start", sortable: true, key: "posting_date" },
			{ title: __("Amount"), align: "end", sortable: true, key: "amount" },
		];

		// Formatting helpers
		const formatCurrencyLocal = (val, precision) => {
			if (val === null || val === undefined) val = 0;
			let number = parseFloat(String(val).replace(/,/g, ""));
			if (isNaN(number)) number = 0;

			let prec = precision != null ? Number(precision) : 2;
			if (typeof frappe !== "undefined" && frappe.defaults) {
				const defaultPrec = frappe.defaults.get_default("currency_precision");
				if (defaultPrec != null) prec = Number(defaultPrec);
			}

			return number.toLocaleString("en-US", {
				minimumFractionDigits: prec,
				maximumFractionDigits: prec,
				useGrouping: true,
			});
		};
		const currencySymbol = (currency) => get_currency_symbol(currency || pos_profile.value?.currency);

		// Initialize Composables
		const {
			outstanding_invoices,
			unallocated_payments,
			mpesa_payments,
			invoices_loading,
			unallocated_payments_loading,
			mpesa_payments_loading,
			auto_reconcile_loading,
			auto_reconcile_summary,
			customer_info,
			pos_profiles_list,
			mpesa_search_name,
			mpesa_search_mobile,
			get_outstanding_invoices,
			get_unallocated_payments,
			get_draft_mpesa_payments_register,
			get_pos_profiles,
			autoReconcile,
			fetch_customer_details,
			set_mpesa_search_params,
		} = usePosPayData({
			posProfile: pos_profile,
			company,
			customerName: customer_name,
			partyType,
			paymentType: paymentEntryType,
			toastStore,
			eventBus: proxy?.eventBus,
			currencySymbol,
			formatCurrency: formatCurrencyLocal,
		});

		const {
			selected_invoices,
			selected_payments,
			selected_mpesa_payments,
			payment_methods,
			total_selected_invoices,
			total_selected_payments,
			total_selected_mpesa_payments,
			total_payment_methods,
			total_of_diff,
			toggleInvoiceSelection,
			isInvoiceSelected,
			clearSelections,
			resetPaymentMethodAmounts,
		} = usePosPaySelection({
			outstanding_invoices,
			unallocated_payments,
			mpesa_payments,
			posProfile: pos_profile,
			currency_filter,
		});

		const load_print_page = async (payment_name) => {
			if (!payment_name) return;
			const debugPrint = isDebugPrintEnabled();
			let url =
				frappe.urllib.get_base_url() +
				"/printview?doctype=Payment%20Entry&name=" +
				payment_name +
				"&trigger_print=1";
			url = appendDebugPrintParam(url, debugPrint);
			const printOptions = { allowOfflineFallback: isOffline(), triggerPrint: "1", debugPrint };
			if (pos_profile.value?.posa_silent_print) {
				if (!isOffline()) {
					try {
						await printDocumentViaQz({
							doctype: "Payment Entry",
							name: payment_name,
							printFormat: "Standard",
							noLetterhead: 1,
						});
						return;
					} catch (error) {
						console.warn("QZ Tray print failed, falling back to browser print", error);
					}
				}
				silentPrint(url, printOptions);
			} else {
				const printWindow = window.open(url, "_blank");
				watchPrintWindow(printWindow, printOptions);
			}
		};

		// Computed Values
		const invoiceTotalCurrency = computed(() => {
			if (currency_filter.value && currency_filter.value !== "ALL") return currency_filter.value;
			if (selected_invoices && selected_invoices.value.length > 0) {
				const first = selected_invoices.value[0];
				return first.party_account_currency || first.currency || pos_profile.value.currency;
			}
			return pos_profile.value.currency;
		});

		const paymentTotalCurrency = computed(() => {
			if (selected_payments && selected_payments.value.length > 0)
				return selected_payments.value[0].currency || pos_profile.value.currency;
			return pos_profile.value.currency;
		});

		const mpesaTotalCurrency = computed(() => {
			if (selected_mpesa_payments && selected_mpesa_payments.value.length > 0)
				return selected_mpesa_payments.value[0].currency || pos_profile.value.currency;
			return pos_profile.value.currency;
		});

		const companyCurrencyLocal = computed(
			() => companyCurrency.value || pos_profile.value?.currency || "USD",
		);
		const requiresExchangeRate = computed(
			() => invoiceTotalCurrency.value !== companyCurrencyLocal.value,
		);

		const total_outstanding_amount = computed(() => {
			if (!outstanding_invoices.value.length) return 0;
			return outstanding_invoices.value.reduce(
				(acc, cur) => acc + flt(cur?.outstanding_amount || 0),
				0,
			);
		});

		const total_unallocated_amount = computed(() => {
			if (!unallocated_payments.value.length) return 0;
			return unallocated_payments.value.reduce(
				(acc, cur) => acc + flt(cur?.unallocated_amount || 0),
				0,
			);
		});

		const invoice_currencies = computed(() => {
			const currencies = new Set();
			if (pos_profile.value?.currency) currencies.add(pos_profile.value.currency);
			if (companyCurrency.value) currencies.add(companyCurrency.value);

			// Add currencies from payment methods
			if (pos_profile.value?.payments) {
				pos_profile.value.payments.forEach((p) => {
					const curr = payment_method_currencies.value[p.mode_of_payment];
					if (curr) currencies.add(curr);
				});
			}

			outstanding_invoices.value.forEach((inv) => {
				currencies.add(inv.currency || pos_profile.value.currency);
			});
			return Array.from(currencies).filter(Boolean).sort();
		});

		const outstanding_by_currency = computed(() => {
			const summary = {};
			outstanding_invoices.value.forEach((inv) => {
				const partyCurr = inv.party_account_currency || inv.currency || pos_profile.value.currency;
				const invoiceCurr = inv.currency || pos_profile.value.currency;
				const key = `${partyCurr}-${invoiceCurr}`;
				if (!summary[key]) {
					summary[key] = {
						amount: 0,
						symbol: currencySymbol(partyCurr),
						party_currency: partyCurr,
						invoice_currency: invoiceCurr,
					};
				}
				summary[key].amount += flt(inv.outstanding_amount || 0);
			});
			return summary;
		});

		const filtered_outstanding_invoices = computed(() => {
			if (currency_filter.value === "ALL" || !currency_filter.value) return outstanding_invoices.value;
			return outstanding_invoices.value.filter(
				(inv) => (inv.currency || pos_profile.value.currency) === currency_filter.value,
			);
		});

		const getPaymentMethodCurrency = (mode) =>
			payment_method_currencies.value[mode] || pos_profile.value.currency;

		const filtered_payment_methods = computed(() => {
			if (!payment_methods.value.length) return [];
			if (!selected_invoices.value.length) return payment_methods.value;
			const target =
				selected_invoices.value[0]?.party_account_currency ||
				selected_invoices.value[0]?.currency ||
				pos_profile.value.currency;
			return payment_methods.value.filter(
				(m) => getPaymentMethodCurrency(m.mode_of_payment) === target,
			);
		});
		const postingDateDisplay = computed({
			get: () => formatDisplayDate(postingDate.value),
			set: (value) => {
				const normalized = normalizeDateForBackend(value);
				postingDate.value = normalized || getTodayDate();
			},
		});
		const allowedPartyTypes = computed(() =>
			getAllowedPartyTypes(paymentEntryType.value),
		);
		const resolvedPartyLabel = computed(() => {
			if (partyType.value === "Supplier") return __("Supplier");
			if (partyType.value === "Employee") return __("Employee");
			return __("Customer");
		});
		const invoiceSectionTitle = computed(() =>
			partyType.value === "Supplier"
				? __("Supplier Invoices")
				: __("Invoices"),
		);
		const paymentSectionTitle = computed(() =>
			partyType.value === "Supplier"
				? __("Supplier Payments")
				: __("Payments"),
		);
		const invoices_headers = computed(() => [
			{ title: "", align: "start", sortable: false, key: "actions", width: "50px" },
			{ title: __("Invoice"), align: "start", sortable: true, key: "voucher_no" },
			{ title: __("Type"), align: "start", sortable: true, key: "voucher_type" },
			{ title: resolvedPartyLabel.value, align: "start", sortable: true, key: "party_name" },
			{ title: __("Date"), align: "start", sortable: true, key: "posting_date" },
			{ title: __("Due Date"), align: "start", sortable: true, key: "due_date" },
			{ title: __("Total"), align: "end", sortable: true, key: "invoice_amount" },
			{ title: __("Outstanding"), align: "end", sortable: true, key: "outstanding_amount" },
		]);
		const unallocated_payments_headers = computed(() => [
			{ title: "", align: "center", sortable: false, key: "select", width: "50px" },
			{ title: __("Payment ID"), align: "start", sortable: true, key: "name" },
			{ title: resolvedPartyLabel.value, align: "start", sortable: true, key: "party_name" },
			{ title: __("Date"), align: "start", sortable: true, key: "posting_date" },
			{ title: __("Mode"), align: "start", sortable: true, key: "mode_of_payment" },
			{ title: __("Reference"), align: "start", sortable: false, key: "reference_invoice" },
			{ title: __("Paid"), align: "end", sortable: true, key: "paid_amount" },
			{ title: __("Unallocated"), align: "end", sortable: true, key: "unallocated_amount" },
		]);
		const isCustomerPartyType = computed(() => partyType.value === "Customer");
		const showReconciliationSections = computed(() =>
			shouldShowReconciliationSections(paymentEntryType.value, partyType.value),
		);
		const showMpesaSection = computed(
			() => isCustomerPartyType.value && paymentEntryType.value === "Receive",
		);
		const currentPartyOptions = computed(() =>
			partyType.value === "Supplier"
				? supplierOptions.value
				: partyType.value === "Employee"
					? employeeOptions.value
					: [],
		);
		const isPaymentRouteLocked = computed(() =>
			resolvePaymentRouteLocked({
				customersLoaded: !!customersLoaded.value,
				loadingCustomers: !!loadingCustomers.value,
				isCustomerBackgroundLoading: !!isCustomerBackgroundLoading.value,
				checkoutStage: checkoutStage.value,
			}),
		);
		const paymentsLoadingMessage = computed(() =>
			buildPaymentRouteLoadingMessage(
				loadProgress.value,
				checkoutStage.value,
			),
		);

		const { isSubmitting, processPayment } = usePosPaySubmission({
			customerName: customer_name,
			partyName: customer_name,
			partyType,
			paymentType: paymentEntryType,
			company,
			posProfile: pos_profile,
			posOpeningShift: pos_opening_shift,
			postingDate,
			exchangeRate,
			invoiceTotalCurrency,
			referenceNo,
			referenceDate,
			payment_methods,
			selected_invoices,
			selected_payments,
			selected_mpesa_payments,
			total_selected_invoices,
			total_selected_payments,
			total_selected_mpesa_payments,
			total_payment_methods,
			clearSelections,
			resetPaymentMethodAmounts,
			load_print_page,
			eventBus: proxy?.eventBus,
			get_outstanding_invoices: refreshOutstandingInvoices,
			get_unallocated_payments,
			get_draft_mpesa_payments_register,
			set_mpesa_search_params,
			autoAllocatePaymentAmount,
			autoReconcile,
		});

		const fetchCompanyCurrency = async () => {
			if (!company.value) return;
			try {
				const r = await frappe.call({
					method: "frappe.client.get_value",
					args: {
						doctype: "Company",
						filters: { name: company.value },
						fieldname: "default_currency",
					},
				});
				companyCurrency.value = r.message?.default_currency || pos_profile.value?.currency || "USD";
			} catch (e) {
				console.error("Failed to fetch company currency", e);
				companyCurrency.value = pos_profile.value?.currency || "USD";
			}
		};

		const fetchExchangeRate = async () => {
			if (exchangeRateLoading.value || !requiresExchangeRate.value) {
				exchangeRate.value = 1;
				return;
			}
			if (!invoiceTotalCurrency.value || !companyCurrencyLocal.value) {
				return;
			}
			exchangeRateLoading.value = true;
			exchangeRateError.value = null;
			try {
				const r = await frappe.call({
					method: "erpnext.setup.utils.get_exchange_rate",
					args: {
						from_currency: invoiceTotalCurrency.value,
						to_currency: companyCurrencyLocal.value,
						transaction_date: postingDate.value || getTodayDate(),
						args: "for_selling",
					},
				});
				exchangeRate.value = flt(r.message || 1);
			} catch (e) {
				exchangeRateError.value = e.message;
				exchangeRate.value = 1;
			} finally {
				exchangeRateLoading.value = false;
			}
		};

		const validateExchangeRate = () => {
			if (!exchangeRate.value || exchangeRate.value <= 0) exchangeRate.value = 1;
		};

		const set_payment_methods = () => {
			if (!pos_profile.value?.posa_allow_make_new_payments) return;
			payment_methods.value = pos_profile.value.payments.map((m) => ({
				mode_of_payment: m.mode_of_payment,
				amount: 0,
				row_id: m.name,
			}));
		};

		const loadPaymentMethodCurrencies = async () => {
			if (!pos_profile.value?.payments?.length || !company.value) return;
			const modes = pos_profile.value.payments
				.map((p) => p.mode_of_payment)
				.filter(Boolean);
			payment_method_currencies.value = await loadPaymentMethodCurrencyMap({
				company: company.value,
				offline: isOffline(),
				fetcher: async () => {
					const r = await frappe.call({
						method: "posawesome.posawesome.api.payment_processing.utils.get_mode_of_payment_accounts",
						args: { company: company.value, mode_of_payments: modes },
					});
					return { ...(r.message || {}) };
				},
			});
		};

		const applySessionData = async (data) => {
			if (!data) {
				pos_profile.value = {};
				pos_opening_shift.value = "";
				company.value = "";
				companyCurrency.value = null;
				payment_methods.value = [];
				payment_methods_list.value = [];
				return;
			}
			pos_profile.value = data.pos_profile;
			pos_opening_shift.value = data.pos_opening_shift;
			company.value = data.company?.name || data.pos_profile?.company || "";
			companyCurrency.value =
				data.company?.default_currency || data.pos_profile?.currency || null;
			uiStore.setRegisterData(data);
			proxy?.eventBus?.emit("payments_register_pos_profile", data);
			set_payment_methods();
			await loadPaymentMethodCurrencies();
			payment_methods_list.value = Array.isArray(pos_profile.value?.payments)
				? pos_profile.value.payments.map((p) => p.mode_of_payment)
				: [];
		};

		const syncPendingPayments = async () => {
			const pending = getPendingOfflinePaymentCount();
			if (pending) {
				proxy?.eventBus?.emit("show_message", {
					title: `${pending} payment(s) pending for sync`,
					color: "warning",
				});
			}
			if (!isOffline()) {
				const result = await syncOfflinePayments();
				if (result?.synced) {
					proxy?.eventBus?.emit("show_message", {
						title: `${result.synced} offline payment(s) synced`,
						color: "success",
					});
				}
			}
		};

		const paymentRowClass = (item) => (item?.is_credit_note ? "credit-note-row" : "");
		const isSelected = (item) => (isInvoiceSelected(item) ? "selected-row bg-primary bg-lighten-4" : "");
		const searchSuppliers = async (searchText = "") => {
			partySearchLoading.value = true;
			try {
				const r = await frappe.call({
					method: "posawesome.posawesome.api.purchase_orders.search_suppliers",
					args: {
						search_text: searchText || "",
						limit: 20,
					},
				});
				supplierOptions.value = Array.isArray(r.message) ? r.message : [];
			} catch (error) {
				console.error("Failed to search suppliers", error);
				supplierOptions.value = [];
			} finally {
				partySearchLoading.value = false;
			}
		};
		const searchEmployees = async (searchText = "") => {
			partySearchLoading.value = true;
			try {
				const likeValue = `%${(searchText || "").trim()}%`;
				const r = await frappe.call({
					method: "frappe.client.get_list",
					args: {
						doctype: "Employee",
						fields: ["name", "employee_name"],
						filters: { status: ["!=", "Left"] },
						or_filters: searchText
							? [
									{ name: ["like", likeValue] },
									{ employee_name: ["like", likeValue] },
							  ]
							: undefined,
						limit_page_length: 20,
						order_by: "employee_name asc",
					},
				});
				employeeOptions.value = Array.isArray(r.message) ? r.message : [];
			} catch (error) {
				console.error("Failed to search employees", error);
				employeeOptions.value = [];
			} finally {
				partySearchLoading.value = false;
			}
		};
		const handlePartySearch = (searchText = "") => {
			if (partyType.value === "Supplier") {
				void searchSuppliers(searchText);
				return;
			}
			if (partyType.value === "Employee") {
				void searchEmployees(searchText);
			}
		};
		const resetPartyContext = () => {
			clearSelections();
			outstanding_invoices.value = [];
			unallocated_payments.value = [];
			mpesa_payments.value = [];
			customer_name.value = "";
			customer_info.value = "";
			mpesa_search_name.value = "";
			mpesa_search_mobile.value = "";
			exchangeRate.value = null;
			auto_reconcile_summary.value = "";
			if (selectedCustomer.value) {
				customersStore.setSelectedCustomer(null);
			}
		};
		function refreshOutstandingInvoices() {
			return get_outstanding_invoices(pos_profile_search.value || null);
		}
		function handleInvoiceSelection(item) {
			toggleInvoiceSelection(item, customer_name, (cust) => {
				if (isCustomerPartyType.value) {
					customersStore.setSelectedCustomer(cust);
					return;
				}
				customer_name.value = cust;
			});
		}
		async function syncCustomerPaymentContext(normalized, { forceReload = false } = {}) {
			if (!normalized) {
				customer_name.value = "";
				referenceNo.value = "";
				referenceDate.value = "";
				clearSelections();
				outstanding_invoices.value = [];
				unallocated_payments.value = [];
				mpesa_payments.value = [];
				exchangeRate.value = null;
				return;
			}
			if (normalized === customer_name.value && !forceReload) {
				if (
					company.value &&
					!outstanding_invoices.value.length &&
					!unallocated_payments.value.length
				) {
					refreshOutstandingInvoices();
					get_unallocated_payments();
					get_draft_mpesa_payments_register(payment_methods_list.value);
				}
				return;
			}
			clearSelections();
			outstanding_invoices.value = [];
			unallocated_payments.value = [];
			mpesa_payments.value = [];
			customer_name.value = normalized;
			if (!companyCurrency.value) await fetchCompanyCurrency();
			fetch_customer_details();
			refreshOutstandingInvoices();
			get_unallocated_payments();
			get_draft_mpesa_payments_register(payment_methods_list.value);
		}

		function applyPaymentRouteTarget() {
			const target = paymentRouteTarget.value;
			if (!target?.invoiceName || !Array.isArray(outstanding_invoices.value)) {
				return;
			}

			const matchedInvoice = outstanding_invoices.value.find(
				(invoice) => invoice?.voucher_no === target.invoiceName,
			);
			if (!matchedInvoice) {
				return;
			}

			clearSelections();
			selected_invoices.value = [matchedInvoice];
			currency_filter.value =
				matchedInvoice.party_account_currency ||
				matchedInvoice.currency ||
				pos_profile.value.currency ||
				"ALL";
			uiStore.clearPaymentRouteTarget();
		}

		const submit = () => processPayment({ printAfter: false });
		const submit_and_print = () => processPayment({ printAfter: true });

		// Lifecycle & Watchers
		onMounted(() => {
			if (proxy?.eventBus) {
				proxy.eventBus.on("network-online", syncPendingPayments);
				proxy.eventBus.on("server-online", syncPendingPayments);
			}
		});

		onBeforeUnmount(() => {
			if (proxy?.eventBus) {
				proxy.eventBus.off("network-online", syncPendingPayments);
				proxy.eventBus.off("server-online", syncPendingPayments);
			}
		});

		watch(
			selectedCustomer,
			async (val) => {
				const normalized = val || "";
				if (isPaymentRouteLocked.value || !isCustomerPartyType.value) {
					return;
				}
				await syncCustomerPaymentContext(normalized);
			},
			{ immediate: true },
		);

		watch(
			customer_name,
			async (val, oldVal) => {
				if (isPaymentRouteLocked.value || isCustomerPartyType.value) {
					return;
				}
				const normalized = val || "";
				if (normalized === (oldVal || "")) {
					return;
				}
				await syncCustomerPaymentContext(normalized);
			},
		);

		watch(refreshToken, () => {
			if (isPaymentRouteLocked.value || !isCustomerPartyType.value) return;
			if (customer_name.value) fetch_customer_details();
		});

		watch(
			isPaymentRouteLocked,
			(locked) => {
				if (locked) return;
				void syncCustomerPaymentContext(
					selectedCustomer.value || customer_name.value || "",
					{ forceReload: true },
				);
			},
			{ immediate: true },
		);

		watch(
			paymentEntryType,
			(newVal, oldVal) => {
				const normalizedPartyType = normalizePartyTypeForPaymentType(
					newVal,
					partyType.value,
				);
				if (normalizedPartyType !== partyType.value) {
					partyType.value = normalizedPartyType;
					return;
				}
				if (typeof oldVal !== "undefined" && newVal !== oldVal) {
					resetPartyContext();
				}
			},
			{ immediate: true },
		);

		watch(
			partyType,
			(newVal, oldVal) => {
				const normalized = normalizePartyTypeForPaymentType(
					paymentEntryType.value,
					newVal,
				);
				if (normalized !== newVal) {
					partyType.value = normalized;
					return;
				}
				if (typeof oldVal !== "undefined" && newVal !== oldVal) {
					resetPartyContext();
					handlePartySearch("");
				} else if (typeof oldVal === "undefined" && !isCustomerPartyType.value) {
					handlePartySearch("");
				}
			},
			{ immediate: true },
		);

		watch(
			() => pos_profile.value?.posa_allow_reconcile_payments,
			(enabled) => {
				if (isPaymentRouteLocked.value) return;
				if (
					!enabled ||
					!customer_name.value ||
					!company.value ||
					!showReconciliationSections.value
				) return;
				if (!unallocated_payments.value.length) {
					get_unallocated_payments();
				}
			},
			{ immediate: true },
		);

		watch(company, (newCompany, oldCompany) => {
			if (isPaymentRouteLocked.value) return;
			if (!newCompany || newCompany === oldCompany || !customer_name.value) return;
			refreshOutstandingInvoices();
			get_unallocated_payments();
			get_draft_mpesa_payments_register(payment_methods_list.value);
		});

		watch(invoiceTotalCurrency, fetchExchangeRate, { immediate: true });
		watch(companyCurrency, fetchExchangeRate, { immediate: true });
		watch(postingDate, fetchExchangeRate, { immediate: true });
		watch([paymentRouteTarget, outstanding_invoices], () => {
			applyPaymentRouteTarget();
		});
		watch(
			() => ({
				pos_profile: uiStore.posProfile,
				pos_opening_shift: uiStore.posOpeningShift,
				company: uiStore.companyDoc,
				stock_settings: uiStore.stockSettings,
			}),
			async (sessionData) => {
				await applySessionData(sessionData?.pos_profile ? sessionData : null);
				if (!sessionData?.pos_profile?.name) {
					return;
				}
				get_pos_profiles();
				if (customer_name.value) {
					refreshOutstandingInvoices();
					get_unallocated_payments();
					get_draft_mpesa_payments_register(payment_methods_list.value);
				}
			},
			{ deep: true, immediate: true },
		);

		return {
			pos_profile,
			pos_opening_shift,
			paymentEntryType,
			partyType,
			allowedPartyTypes,
			resolvedPartyLabel,
			isCustomerPartyType,
			showReconciliationSections,
			showMpesaSection,
			invoiceSectionTitle,
			paymentSectionTitle,
			customer_name,
			postingDateDisplay,
			currentPartyOptions,
			partySearchLoading,
			company,
			pos_profile_search,
			currency_filter,
			autoAllocatePaymentAmount,
			exchangeRate,
			companyCurrency,
			referenceNo,
			referenceDate,
			exchangeRateLoading,
			exchangeRateError,
			payment_method_currencies,
			payment_methods_list,
			invoices_headers,
			unallocated_payments_headers,
			mpesa_payment_headers,
			formatCurrency: formatCurrencyLocal,
			currencySymbol,
			outstanding_invoices,
			unallocated_payments,
			mpesa_payments,
			invoices_loading,
			unallocated_payments_loading,
			mpesa_payments_loading,
			auto_reconcile_loading,
			auto_reconcile_summary,
			customer_info,
			pos_profiles_list,
			mpesa_search_name,
			mpesa_search_mobile,
			get_outstanding_invoices,
			get_unallocated_payments,
			get_draft_mpesa_payments_register,
			get_pos_profiles,
			autoReconcile,
			fetch_customer_details,
			set_mpesa_search_params,
			selected_invoices,
			selected_payments,
			selected_mpesa_payments,
			payment_methods,
			total_selected_invoices,
			total_selected_payments,
			total_selected_mpesa_payments,
			total_payment_methods,
			total_of_diff,
			toggleInvoiceSelection,
			isInvoiceSelected,
			clearSelections,
			isSubmitting,
			processPayment,
			invoiceTotalCurrency,
			paymentTotalCurrency,
			mpesaTotalCurrency,
			requiresExchangeRate,
			total_outstanding_amount,
			total_unallocated_amount,
			invoice_currencies,
			outstanding_by_currency,
			filtered_outstanding_invoices,
			filtered_payment_methods,
			isPaymentRouteLocked,
			paymentsLoadingMessage,
			getPaymentMethodCurrency,
			fetchCompanyCurrency,
			fetchExchangeRate,
			validateExchangeRate,
			set_payment_methods,
			loadPaymentMethodCurrencies,
			syncPendingPayments,
			paymentRowClass,
			isSelected,
			handlePartySearch,
			handleInvoiceSelection,
			submit,
			submit_and_print,
			rtlStyles,
			rtlClasses,
			customersStore,
			paymentRouteTarget,
		};
	},
};
</script>

<style>
.selected-row {
	background-color: #e3f2fd !important;
}

.credit-note-row {
	background-color: rgba(76, 175, 80, 0.08) !important;
}

.totals-wrapper {
	font-weight: bold;
}

.pay-mode-controls {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
	margin-bottom: 14px;
}

.pay-mode-controls__group {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.pay-mode-controls__label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--pos-text-secondary, var(--text-secondary));
}

.pay-mode-toggle {
	width: fit-content;
	max-width: 100%;
	gap: 8px;
	flex-wrap: wrap;
	background: transparent !important;
}

.pay-mode-btn {
	--v-theme-overlay-multiplier: 0 !important;
	min-height: 44px;
	border-radius: 999px !important;
	padding-inline: 18px !important;
	font-weight: 700;
	letter-spacing: 0.01em;
	text-transform: none;
	border: 1px solid transparent !important;
	transition:
		background-color 0.18s ease,
		color 0.18s ease,
		border-color 0.18s ease,
		box-shadow 0.18s ease,
		transform 0.18s ease,
		opacity 0.18s ease !important;
	opacity: 0.88;
}

.pay-mode-btn:hover,
.pay-mode-btn:focus,
.pay-mode-btn:focus-visible {
	transform: translateY(-1px);
	box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12) !important;
}

.pay-mode-btn:active {
	transform: translateY(0);
}

.pay-mode-btn.v-btn--active,
.pay-mode-btn.v-btn--selected,
.pay-mode-btn[aria-pressed="true"] {
	opacity: 1;
	box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18) !important;
	border-width: 2px !important;
	transform: translateY(-1px);
}

.pay-mode-btn .v-btn__overlay,
.pay-mode-btn .v-btn__underlay {
	opacity: 0 !important;
	background: transparent !important;
}

.pay-mode-btn--receive {
	background: rgba(var(--v-theme-success), 0.14) !important;
	color: rgb(var(--v-theme-success)) !important;
	border-color: rgba(var(--v-theme-success), 0.24) !important;
}

.pay-mode-btn--receive.v-btn--active,
.pay-mode-btn--receive.v-btn--selected,
.pay-mode-btn--receive[aria-pressed="true"] {
	background: rgb(var(--v-theme-success)) !important;
	color: #ffffff !important;
	border-color: rgba(var(--v-theme-success), 0.92) !important;
}

.pay-mode-btn--pay {
	background: rgba(var(--v-theme-warning), 0.16) !important;
	color: rgb(var(--v-theme-warning)) !important;
	border-color: rgba(var(--v-theme-warning), 0.28) !important;
}

.pay-mode-btn--pay.v-btn--active,
.pay-mode-btn--pay.v-btn--selected,
.pay-mode-btn--pay[aria-pressed="true"] {
	background: rgb(var(--v-theme-warning)) !important;
	color: #1f1300 !important;
	border-color: rgba(var(--v-theme-warning), 0.96) !important;
}

.pay-mode-btn--customer {
	background: rgba(var(--v-theme-primary), 0.14) !important;
	color: rgb(var(--v-theme-primary)) !important;
	border-color: rgba(var(--v-theme-primary), 0.24) !important;
}

.pay-mode-btn--customer.v-btn--active,
.pay-mode-btn--customer.v-btn--selected,
.pay-mode-btn--customer[aria-pressed="true"] {
	background: rgb(var(--v-theme-primary)) !important;
	color: #ffffff !important;
	border-color: rgba(var(--v-theme-primary), 0.92) !important;
}

.pay-mode-btn--supplier {
	background: rgba(var(--v-theme-secondary), 0.14) !important;
	color: rgb(var(--v-theme-secondary)) !important;
	border-color: rgba(var(--v-theme-secondary), 0.24) !important;
}

.pay-mode-btn--supplier.v-btn--active,
.pay-mode-btn--supplier.v-btn--selected,
.pay-mode-btn--supplier[aria-pressed="true"] {
	background: rgb(var(--v-theme-secondary)) !important;
	color: #ffffff !important;
	border-color: rgba(var(--v-theme-secondary), 0.92) !important;
}

.pay-mode-btn--employee {
	background: rgba(var(--v-theme-info), 0.14) !important;
	color: rgb(var(--v-theme-info)) !important;
	border-color: rgba(var(--v-theme-info), 0.24) !important;
}

.pay-mode-btn--employee.v-btn--active,
.pay-mode-btn--employee.v-btn--selected,
.pay-mode-btn--employee[aria-pressed="true"] {
	background: rgb(var(--v-theme-info)) !important;
	color: #ffffff !important;
	border-color: rgba(var(--v-theme-info), 0.92) !important;
}

[data-theme="dark"] .pay-mode-btn--pay.v-btn--active,
[data-theme="dark"] .pay-mode-btn--pay.v-btn--selected,
[data-theme="dark"] .pay-mode-btn--pay[aria-pressed="true"] {
	color: #ffffff !important;
}

.pay-mode-btn.v-btn--active .v-btn__content,
.pay-mode-btn.v-btn--selected .v-btn__content,
.pay-mode-btn[aria-pressed="true"] .v-btn__content {
	color: inherit !important;
	font-weight: 800;
}

.pay-customer-row {
	align-items: start;
}

.pay-customer-row .customer-input-wrapper {
	padding-right: 0;
}

.pay-posting-date .dp__input_wrap {
	width: 100%;
}

.pay-posting-date .dp__input {
	width: 100%;
	min-height: 48px;
	border-radius: 12px;
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
	background-color: var(--field-bg);
	color: var(--text-primary);
	padding: 10px 12px;
}

.pay-posting-date:hover .dp__input {
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.pay-posting-date .dp__input_icon {
	inset-inline-start: auto;
	inset-inline-end: 30px;
}

.pay-posting-date .dp__input_icon_pad {
	padding-inline-start: 12px;
}

.pay-posting-date .dp__input {
	padding-right: calc(30px + var(--dp-input-icon-padding));
}

@media (max-width: 768px) {
	.pay-mode-controls {
		grid-template-columns: 1fr;
	}
}
</style>
