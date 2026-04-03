<template>
	<div fluid :class="rtlClasses">
		<AppLoadingOverlay
			:visible="isPaymentRouteLocked"
			:message="paymentsLoadingMessage"
		/>
		<v-row v-show="!dialog">
			<v-col md="8" cols="12" class="pb-2 pr-0">
				<v-card
					class="main mx-auto mt-3 p-3 pb-16 overflow-y-auto pos-themed-card"
					style="max-height: calc(100dvh - 32px); height: calc(100dvh - 32px)"
				>
					<Customer></Customer>
					<v-divider></v-divider>

					<PayInvoicesTable
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
						:customer-name="customer_name"
						:is-invoice-selected="isInvoiceSelected"
						:item-class="isSelected"
						:currency-symbol="currencySymbol"
						:format-currency="formatCurrency"
						:headers="invoices_headers"
						@search="get_outstanding_invoices"
						@clear-selection="selected_invoices = []"
						@auto-reconcile="autoReconcile"
						@select-row="
							toggleInvoiceSelection($event, customer_name, (cust) =>
								customersStore.setSelectedCustomer(cust),
							)
						"
					/>

					<PayUnallocatedTable
						v-model:selected-payments="selected_payments"
						:payments="unallocated_payments"
						:pos-profile="pos_profile"
						:total-unallocated="total_unallocated_amount"
						:total-selected="total_selected_payments"
						:loading="unallocated_payments_loading"
						:headers="unallocated_payments_headers"
						:currency-symbol="currencySymbol"
						:format-currency="formatCurrency"
						:payment-row-class="paymentRowClass"
					/>

					<PayMpesaSection
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
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, getCurrentInstance } from "vue";
import { storeToRefs } from "pinia";
import format from "../../../format";
import Customer from "../customer/Customer.vue";
import {
	initPromise,
	checkDbHealth,
	setOpeningStorage,
	getOpeningStorage,
	clearOpeningStorage,
	isOffline,
	getPendingOfflinePaymentCount,
	syncOfflinePayments,
} from "../../../../offline/index";
import {
	isDebugPrintEnabled,
	appendDebugPrintParam,
	silentPrint,
	watchPrintWindow,
} from "../../../plugins/print";
import { printDocumentViaQz } from "../../../services/qzTray";

import { useRtl } from "../../../composables/core/useRtl";
import { useCustomersStore } from "../../../stores/customersStore.js";
import { useUIStore } from "../../../stores/uiStore.js";
import { useToastStore } from "../../../stores/toastStore.js";
import { getValidCachedOpeningForCurrentUser } from "../../../utils/openingCache";

// Composables
import { usePosPayData } from "../../../composables/pos/payments/usePosPayData";
import { usePosPaySelection } from "../../../composables/pos/payments/usePosPaySelection";
import { usePosPaySubmission } from "../../../composables/pos/payments/usePosPaySubmission";

// Sub-components
import PayInvoicesTable from "../../pos_pay/PayInvoicesTable.vue";
import PayUnallocatedTable from "../../pos_pay/PayUnallocatedTable.vue";
import PayMpesaSection from "../../pos_pay/PayMpesaSection.vue";
import PayTotalsSidebar from "../../pos_pay/PayTotalsSidebar.vue";
import PayActionButtons from "../../pos_pay/PayActionButtons.vue";
import AppLoadingOverlay from "../../ui/LoadingOverlay.vue";
import {
	buildPaymentRouteLoadingMessage,
	isPaymentRouteLocked as resolvePaymentRouteLocked,
} from "../../../utils/paymentRouteReadiness";

export default {
	mixins: [format],
	components: {
		Customer,
		PayInvoicesTable,
		PayUnallocatedTable,
		PayMpesaSection,
		PayTotalsSidebar,
		PayActionButtons,
		AppLoadingOverlay,
	},
	setup() {
		const { proxy } = getCurrentInstance();
		const customersStore = useCustomersStore();
		const uiStore = useUIStore();
		const toastStore = useToastStore();
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
		const dialog = ref(false);
		const pos_profile = ref({});
		const pos_opening_shift = ref("");
		const customer_name = ref("");
		const company = ref("");
		const pos_profile_search = ref("");
		const currency_filter = ref("ALL");
		const autoAllocatePaymentAmount = ref(true);
		const exchangeRate = ref(null);
		const companyCurrency = ref(null);
		const exchangeRateLoading = ref(false);
		const exchangeRateError = ref(null);
		const payment_method_currencies = ref({});
		const payment_methods_list = ref([]);

		// Headers
		const invoices_headers = [
			{ title: "", align: "start", sortable: false, key: "actions", width: "50px" },
			{ title: __("Invoice"), align: "start", sortable: true, key: "voucher_no" },
			{ title: __("Type"), align: "start", sortable: true, key: "voucher_type" },
			{ title: __("Customer"), align: "start", sortable: true, key: "customer_name" },
			{ title: __("Date"), align: "start", sortable: true, key: "posting_date" },
			{ title: __("Due Date"), align: "start", sortable: true, key: "due_date" },
			{ title: __("Total"), align: "end", sortable: true, key: "invoice_amount" },
			{ title: __("Outstanding"), align: "end", sortable: true, key: "outstanding_amount" },
		];

		const unallocated_payments_headers = [
			{ title: "", align: "center", sortable: false, key: "select", width: "50px" },
			{ title: __("Payment ID"), align: "start", sortable: true, key: "name" },
			{ title: __("Customer"), align: "start", sortable: true, key: "customer_name" },
			{ title: __("Date"), align: "start", sortable: true, key: "posting_date" },
			{ title: __("Mode"), align: "start", sortable: true, key: "mode_of_payment" },
			{ title: __("Reference"), align: "start", sortable: false, key: "reference_invoice" },
			{ title: __("Paid"), align: "end", sortable: true, key: "paid_amount" },
			{ title: __("Unallocated"), align: "end", sortable: true, key: "unallocated_amount" },
		];

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
							printerName: unref(pos_profile.value?.custom_pos_printer || null),
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
		const isPaymentRouteLocked = computed(() =>
			resolvePaymentRouteLocked({
				customersLoaded: !!customersLoaded.value,
				loadingCustomers: !!loadingCustomers.value,
				isCustomerBackgroundLoading: !!isCustomerBackgroundLoading.value,
			}),
		);
		const paymentsLoadingMessage = computed(() =>
			buildPaymentRouteLoadingMessage(loadProgress.value),
		);

		const { isSubmitting, processPayment } = usePosPaySubmission({
			customerName: customer_name,
			company,
			posProfile: pos_profile,
			posOpeningShift: pos_opening_shift,
			exchangeRate,
			invoiceTotalCurrency,
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
						transaction_date: frappe.datetime.nowdate(),
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
			try {
				const modes = pos_profile.value.payments.map((p) => p.mode_of_payment).filter(Boolean);
				// Call standard ERPNext method instead of missing custom method
				const r = await frappe.call({
					method: "posawesome.posawesome.api.payment_processing.utils.get_mode_of_payment_accounts",
					args: { company: company.value, mode_of_payments: modes },
				});
				payment_method_currencies.value = { ...r.message };
			} catch (e) {
				console.error("Failed to load payment method currencies", e);
			}
		};

		const applyOpeningData = async (data) => {
			if (!data) {
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

		const check_opening_entry = async () => {
			await initPromise;
			await checkDbHealth();
			const cachedOpening = getValidCachedOpeningForCurrentUser(
				getOpeningStorage(),
				frappe?.session?.user,
			);
			if (cachedOpening) {
				await applyOpeningData(cachedOpening);
			}
			try {
				const r = await frappe.call("posawesome.posawesome.api.shifts.check_opening_shift", {
					user: frappe.session.user,
				});
				if (r.message) {
					await applyOpeningData(r.message);
					setOpeningStorage(r.message);
				} else {
					clearOpeningStorage();
				}
				get_pos_profiles();
				if (customer_name.value) {
					refreshOutstandingInvoices();
					get_unallocated_payments();
					get_draft_mpesa_payments_register(payment_methods_list.value);
				}
			} catch (e) {
				console.error("Error checking opening entry", e);
				const cached =
					cachedOpening ||
					getValidCachedOpeningForCurrentUser(
						getOpeningStorage(),
						frappe?.session?.user,
					);
				if (cached) {
					await applyOpeningData(cached);
					return;
				}
				if (!isOffline()) {
					clearOpeningStorage();
				}
			}
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
		function refreshOutstandingInvoices() {
			return get_outstanding_invoices(pos_profile_search.value || null);
		}
		async function syncCustomerPaymentContext(normalized, { forceReload = false } = {}) {
			if (!normalized) {
				customer_name.value = "";
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
			nextTick(() => check_opening_entry());
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
				if (isPaymentRouteLocked.value) {
					return;
				}
				await syncCustomerPaymentContext(normalized);
			},
			{ immediate: true },
		);

		watch(refreshToken, () => {
			if (isPaymentRouteLocked.value) return;
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
			() => pos_profile.value?.posa_allow_reconcile_payments,
			(enabled) => {
				if (isPaymentRouteLocked.value) return;
				if (!enabled || !customer_name.value || !company.value) return;
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
		watch([paymentRouteTarget, outstanding_invoices], () => {
			applyPaymentRouteTarget();
		});

		return {
			dialog,
			pos_profile,
			pos_opening_shift,
			customer_name,
			company,
			pos_profile_search,
			currency_filter,
			autoAllocatePaymentAmount,
			exchangeRate,
			companyCurrency,
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
			check_opening_entry,
			syncPendingPayments,
			paymentRowClass,
			isSelected,
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
</style>
