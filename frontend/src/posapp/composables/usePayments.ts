import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject, reactive, unref, type Ref, type ComputedRef } from 'vue';
import { storeToRefs } from "pinia";
import { useInvoiceStore } from "../stores/invoiceStore";
import { useCustomersStore } from "../stores/customersStore";
import { useUIStore } from "../stores/uiStore";
import { useSyncStore } from "../stores/syncStore";
import { useToastStore } from "../stores/toastStore";
import { useRtl } from "./useRtl";
import { formatUtils } from "../format";
import { getSmartTenderSuggestions } from "../../utils/smartTender";
import {
	isOffline,
	getSalesPersonsStorage,
	setSalesPersonsStorage,
	updateLocalStock,
} from "../../offline/index";
import {
	isDebugPrintEnabled,
} from "../plugins/print";
import stockCoordinator from "../utils/stockCoordinator";
import { parseBooleanSetting } from "../utils/stock";

declare const window: any;
declare const frappe: any;
declare const __: (str: string, args?: any[]) => string;
declare const get_currency_symbol: (currency?: string) => string;

export function usePayments() {
    // Globals
    const eventBus = inject('eventBus') as any;

    // Stores
    const invoiceStore = useInvoiceStore();
    const customersStore = useCustomersStore();
    const uiStore = useUIStore();
    const toastStore = useToastStore();
    const syncStore = useSyncStore();

    // Store Refs
    const { selectedCustomer, customerInfo, refreshToken: customerRefreshToken } = storeToRefs(customersStore);
    const { isFrozen, freezeTitle, freezeMessage, activeView } = storeToRefs(uiStore);
    const { isRtl, rtlStyles, rtlClasses } = useRtl();

    // State (Data)
    const loading = ref(false);
    const pos_profile = ref<any>(null);
    const pos_settings = ref<any>({});
    const stock_settings = ref<any>(null);
    const invoiceType = ref("Invoice");
    const is_return = ref(false);
    const loyalty_amount = ref(0);
    const redeemed_customer_credit = ref(0);
    const credit_change = ref(0);
    const paid_change = ref(0);
    const is_credit_sale = ref(false);
    const is_write_off_change = ref(false);
    const is_cashback = ref(true);
    const is_credit_return = ref(false);
    const redeem_customer_credit = ref(false);
    const customer_credit_dict = ref<any[]>([]);
    const paid_change_rules = ref<string[]>([]);
    const phone_dialog = ref(false);
    const custom_days_dialog = ref(false);
    const custom_days_value = ref<number | null>(null);
    const new_delivery_date = ref<string | null>(null);
    const new_po_date = ref<string | null>(null);
    const new_credit_due_date = ref<string | null>(null);
    const credit_due_days = ref<number | null>(null);
    const credit_due_presets = ref([7, 14, 30]);
    const return_valid_upto_date = ref<string | null>(null);
    const mpesa_modes = ref<string[]>([]);
    const sales_persons = ref<any[]>([]);
    const sales_person = ref("");
    const print_formats = ref<any[]>([]);
    const print_format = ref("");
    const addresses = ref<any[]>([]);
    const is_user_editing_paid_change = ref(false);
    const highlightSubmit = ref(false);
    const last_payment_change_was_cash = ref<boolean | null>(null);
    const backgroundStatusCheck = ref<any>(null);
    const paymentVisible = ref(false);
    const _shortcutHandlers: Record<string, any> = {};

    // Formatting Mixin Logic
    const float_precision = ref(2);
    const currency_precision = ref(2);

    const flt = (value: any, precision?: number, number_format?: string, rounding_method?: string): number => {
        if (!precision && precision !== 0) {
            precision = currency_precision.value || 2;
        }
        if (!rounding_method) {
            rounding_method = "Banker's Rounding (legacy)";
        }
        return (window.flt ? window.flt(value, precision, number_format, rounding_method) : parseFloat(String(value)) || 0);
    };

    const formatCurrency = (value: any, precision?: number): string => {
        if (value === null || value === undefined) {
            value = 0;
        }
        let number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
        if (isNaN(number)) number = 0;
        let prec = precision != null ? Number(precision) : Number(currency_precision.value) || 2;
        if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
            prec = Math.min(Math.max(parseInt(String(prec)) || 2, 0), 20);
        }

        const locale = formatUtils.getNumberLocale();
        let formatted = number.toLocaleString(locale, {
            minimumFractionDigits: prec,
            maximumFractionDigits: prec,
            useGrouping: true,
        });

        formatted = formatUtils.toArabicNumerals(formatted);
        return formatted;
    };

    const formatFloat = (value: any, precision?: number): string => {
        if (value === null || value === undefined) {
            value = 0;
        }
        let number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
        if (isNaN(number)) number = 0;
        let prec = precision != null ? Number(precision) : Number(float_precision.value) || 2;
        if (!Number.isInteger(prec) || prec < 0 || prec > 20) {
            prec = Math.min(Math.max(parseInt(String(prec)) || 2, 0), 20);
        }

        const locale = formatUtils.getNumberLocale();
        let formatted = number.toLocaleString(locale, {
            minimumFractionDigits: prec,
            maximumFractionDigits: prec,
            useGrouping: true,
        });

        formatted = formatUtils.toArabicNumerals(formatted);
        return formatted;
    };

    const setFormatedCurrency = (el: any, field_name: string, precision?: number, no_negative = false, event?: any) => {
        let input_val = event && event.target ? event.target.value : event;
        if (typeof input_val === "string") {
            input_val = formatUtils.fromArabicNumerals(input_val);
            input_val = input_val.replace(/,/g, "");
        }
        let value = parseFloat(input_val);
        if (isNaN(value)) {
            value = 0;
        } else if (no_negative && value < 0) {
            value = Math.abs(value);
        }
        
        if (field_name === 'loyalty_amount') loyalty_amount.value = value;
        else if (field_name === 'redeemed_customer_credit') redeemed_customer_credit.value = value;
        else if (field_name === 'credit_change') credit_change.value = value;
        else if (field_name === 'credit_to_redeem' && typeof el === 'object' && el !== null) el[field_name] = value;
        
        return formatCurrency(value, precision);
    };

    const isNumber = (value: any) => {
        const westernValue = formatUtils.fromArabicNumerals(String(value));
        const pattern = /^-?(\d+|\d{1,3}(\.\d{3})*)(,\d+)?$/;
        return pattern.test(westernValue) || "invalid number";
    };

    // Computed
    const invoice_doc = computed({
        get() {
            return invoiceStore.invoiceDoc;
        },
        set(value) {
            invoiceStore.setInvoiceDoc(value);
        },
    });

    const currencySymbol = computed(() => {
        return (currency?: string) => {
            const fallbackCurrency = invoice_doc.value ? invoice_doc.value.currency : undefined;
            return get_currency_symbol(currency || fallbackCurrency);
        };
    });

    const displayCurrency = computed(() => {
        return invoice_doc.value ? invoice_doc.value.currency : "";
    });

    const blockSaleBeyondAvailableQty = computed(() => {
        if (["Order", "Quotation"].includes(invoiceType.value)) {
            return false;
        }
        return parseBooleanSetting(pos_profile.value?.posa_block_sale_beyond_available_qty);
    });

    const paymentAmountSummary = computed(() => {
        const payments = Array.isArray(invoice_doc.value?.payments) ? invoice_doc.value.payments : [];
        let total = 0;
        const amountByPayment = new Map<any, number>();

        payments.forEach((payment) => {
            const amount = parseFloat(formatUtils.fromArabicNumerals(String(payment?.amount))) || 0;
            amountByPayment.set(payment, amount);
            total += amount;
        });

        return {
            payments,
            amountByPayment,
            total: flt(total, currency_precision.value),
        };
    });

    const total_payments = computed(() => {
        let total = paymentAmountSummary.value.total;
        const doc = invoice_doc.value;

        if (loyalty_amount.value && doc) {
            if (doc.currency && doc.currency !== pos_profile.value.currency) {
                total += flt(loyalty_amount.value / (doc.conversion_rate || 1), currency_precision.value);
            } else {
                total += parseFloat(formatUtils.fromArabicNumerals(String(loyalty_amount.value))) || 0;
            }
        }

        if (redeemed_customer_credit.value && doc) {
            if (doc.currency && doc.currency !== pos_profile.value.currency) {
                total += flt(redeemed_customer_credit.value / (doc.conversion_rate || 1), currency_precision.value);
            } else {
                total += parseFloat(formatUtils.fromArabicNumerals(String(redeemed_customer_credit.value))) || 0;
            }
        }

        return flt(total, currency_precision.value);
    });

    const diff_payment = computed(() => {
        if (!invoice_doc.value) return 0;
        let invoice_total;
        if (pos_profile.value.posa_allow_multi_currency && invoice_doc.value.currency !== pos_profile.value.currency) {
            invoice_total = flt(invoice_doc.value.grand_total, currency_precision.value);
        } else {
            invoice_total = flt(invoice_doc.value.rounded_total || invoice_doc.value.grand_total, currency_precision.value);
        }
        let diff = flt(invoice_total - total_payments.value, currency_precision.value);
        if (invoice_doc.value.is_return) {
            return diff >= 0 ? diff : 0;
        }
        return diff;
    });

    const change_due = computed(() => {
        if (!invoice_doc.value) return 0;
        let invoice_total;
        if (pos_profile.value.posa_allow_multi_currency && invoice_doc.value.currency !== pos_profile.value.currency) {
            invoice_total = flt(invoice_doc.value.grand_total, currency_precision.value);
        } else {
            invoice_total = flt(invoice_doc.value.rounded_total || invoice_doc.value.grand_total, currency_precision.value);
        }
        let change = flt(total_payments.value - invoice_total, currency_precision.value);
        return change > 0 ? change : 0;
    });

    const shouldAutoApplyCreditChange = computed(() => {
        if (!invoice_doc.value || invoice_doc.value.is_return) return false;
        if (change_due.value <= 0) return false;
        
        const { payments, amountByPayment } = paymentAmountSummary.value;
        const totals = payments.reduce((accumulator: any, payment: any) => {
            if (!payment) return accumulator;
            const amount = flt(amountByPayment.get(payment) || 0, currency_precision.value);
            if (isCashLikePayment(payment)) {
                accumulator.cash += amount;
            } else {
                accumulator.nonCash += amount;
            }
            return accumulator;
        }, { cash: 0, nonCash: 0 });

        return totals.nonCash > 0 && totals.cash === 0;
    });

    const diff_label = computed(() => {
        return diff_payment.value > 0
            ? `To Be Paid (${displayCurrency.value})`
            : `Change (${displayCurrency.value})`;
    });

    const total_payments_display = computed(() => formatCurrency(total_payments.value, currency_precision.value));
    const diff_payment_display = computed(() => {
        const value = diff_payment.value < 0 ? -diff_payment.value : diff_payment.value;
        return formatCurrency(value, currency_precision.value);
    });

    const available_points_amount = computed(() => {
        let amount = 0;
        const doc = invoice_doc.value;
        if (customerInfo.value.loyalty_points && doc) {
            amount = customerInfo.value.loyalty_points * customerInfo.value.conversion_factor;
            if (doc.currency !== pos_profile.value.currency) {
                amount = flt(amount / (doc.conversion_rate || 1), currency_precision.value);
            }
        }
        return amount;
    });

    const available_customer_credit = computed(() => {
        return customer_credit_dict.value.reduce((total, row) => total + flt(row.total_credit), 0);
    });
    
    const request_payment_field = computed(() => {
        return pos_settings.value?.invoice_fields?.some(
            (el: any) => el.fieldtype === "Button" && el.fieldname === "request_for_payment"
        ) || false;
    });

    const returnValidityEnabled = computed(() => {
        return Boolean(pos_profile.value?.posa_enable_return_validity || pos_settings.value?.posa_enable_return_validity);
    });

    const returnValidityMinDate = computed(() => {
        const postingDate = invoice_doc.value?.posting_date || (typeof frappe !== "undefined" ? frappe.datetime?.nowdate?.() : null);
        if (!postingDate) return new Date();
        const parsed = new Date(postingDate);
        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    });

    // Helper Methods
    const isCashLikePayment = (payment: any) => {
        if (!payment) return false;
        const configuredCashMOP = String(pos_profile.value?.posa_cash_mode_of_payment || "").toLowerCase();
        const type = String(payment.type || "").toLowerCase();
        if (type === "cash") return true;
        const mode = String(payment.mode_of_payment || "").toLowerCase();
        if (configuredCashMOP && mode === configuredCashMOP) return true;
        return mode.includes("cash");
    };

    const getVisibleDenominations = (payment: any) => {
        if (!invoice_doc.value || !payment) return [];
        const currency = invoice_doc.value.currency;
        const current_total_paid = total_payments.value;
        const { amountByPayment } = paymentAmountSummary.value;
        const current_payment_amount = amountByPayment.get(payment) || 0;
        const other_payments = current_total_paid - current_payment_amount;
        const invoice_total = flt(invoice_doc.value.rounded_total || invoice_doc.value.grand_total, currency_precision.value);
        const amount_to_pay = invoice_total - other_payments;
        if (amount_to_pay <= 0) return [];
        return getSmartTenderSuggestions(amount_to_pay, currency);
    };

    const validatePayment = () => {
        if (!pos_profile.value.posa_allow_sales_order) return false;
        if (invoiceType.value !== "Order") return false;
        const doc = invoice_doc.value;
        return !doc || !doc.posa_delivery_date;
    };

    // Navigation & UI Methods
    const back_to_invoice = () => {
        uiStore.setActiveView("items");
        nextTick(() => {
            uiStore.triggerItemSearchFocus();
        });
    };

    const finishSubmissionNavigation = (clearInvoice = false) => {
        back_to_invoice();
        if (clearInvoice) {
            addresses.value = [];
            invoiceStore.clear();
            invoiceStore.resetPostingDate();
        }
    };

    const handleShowPayment = () => {
        paymentVisible.value = true;
        nextTick(() => {
            setTimeout(() => {
                highlightSubmit.value = true;
            }, 100);
        });
    };

    // Submissions
    const submit = async (/* args */) => {
        // Implementation of submit logic
        // This is simplified but should include the main online/offline flow
        loading.value = true;
        try {
            // ... online/offline submission logic
            toastStore.show({ title: __("Submitting invoice..."), color: "info" });
            // ...
            finishSubmissionNavigation(true);
        } catch (error: any) {
            toastStore.show({ title: __("Submission failed"), detail: error.message, color: "error" });
        } finally {
            loading.value = false;
        }
    };

    // Lifecycle
    onMounted(() => {
        // Init logic
    });

    onUnmounted(() => {
        // Cleanup logic
    });

    return {
        loading,
        pos_profile,
        pos_settings,
        stock_settings,
        invoiceType,
        is_return,
        loyalty_amount,
        redeemed_customer_credit,
        credit_change,
        paid_change,
        is_credit_sale,
        is_write_off_change,
        is_cashback,
        is_credit_return,
        redeem_customer_credit,
        customer_credit_dict,
        paid_change_rules,
        phone_dialog,
        custom_days_dialog,
        custom_days_value,
        new_delivery_date,
        new_po_date,
        new_credit_due_date,
        credit_due_days,
        credit_due_presets,
        return_valid_upto_date,
        mpesa_modes,
        sales_persons,
        sales_person,
        print_formats,
        print_format,
        addresses,
        is_user_editing_paid_change,
        highlightSubmit,
        paymentVisible,
        
        invoice_doc,
        currencySymbol,
        displayCurrency,
        total_payments,
        diff_payment,
        change_due,
        diff_label,
        total_payments_display,
        diff_payment_display,
        available_points_amount,
        available_customer_credit,
        request_payment_field,
        returnValidityEnabled,
        returnValidityMinDate,
        
        flt,
        formatCurrency,
        formatFloat,
        setFormatedCurrency,
        isNumber,
        isCashLikePayment,
        getVisibleDenominations,
        validatePayment,
        back_to_invoice,
        submit
    };
}
