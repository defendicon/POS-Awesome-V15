
import { ref, computed, watch, onMounted, onUnmounted, nextTick, inject, reactive } from 'vue';
import { storeToRefs } from "pinia";
import { useInvoiceStore } from "../../stores/invoiceStore.js";
import { useCustomersStore } from "../../stores/customersStore.js";
import { useUIStore } from "../../stores/uiStore.js";
import { useSyncStore } from "../../stores/syncStore.js";
import { useToastStore } from "../../stores/toastStore.js";
import { useRtl } from "../../composables/useRtl.js";
import { formatUtils } from "../../format";
import { getSmartTenderSuggestions } from "../../../utils/smartTender.js";
import {
	syncOfflineInvoices,
	getPendingOfflineInvoiceCount,
	isOffline,
	getSalesPersonsStorage,
	setSalesPersonsStorage,
	updateLocalStock,
} from "../../../offline/index.js";
import renderOfflineInvoiceHTML from "../../../offline_print_template";
import {
	appendDebugPrintParam,
	isDebugPrintEnabled,
	silentPrint,
	watchPrintWindow,
} from "../../plugins/print.js";
import stockCoordinator from "../../utils/stockCoordinator.js";
import { parseBooleanSetting } from "../../utils/stock.js";

export function usePayments() {
    // Globals
    const frappe = window.frappe;
    const __ = window.__;
    const get_currency_symbol = window.get_currency_symbol;
    const eventBus = inject('eventBus');

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
    const pos_profile = ref("");
    const pos_settings = ref({});
    const stock_settings = ref("");
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
    const customer_credit_dict = ref([]);
    const paid_change_rules = ref([]);
    const phone_dialog = ref(false);
    const custom_days_dialog = ref(false);
    const custom_days_value = ref(null);
    const new_delivery_date = ref(null);
    const new_po_date = ref(null);
    const new_credit_due_date = ref(null);
    const credit_due_days = ref(null);
    const credit_due_presets = ref([7, 14, 30]);
    const return_valid_upto_date = ref(null);
    const mpesa_modes = ref([]);
    const sales_persons = ref([]);
    const sales_person = ref("");
    const print_formats = ref([]);
    const print_format = ref("");
    const addresses = ref([]);
    const is_user_editing_paid_change = ref(false);
    const highlightSubmit = ref(false);
    const last_payment_change_was_cash = ref(null);
    const backgroundStatusCheck = ref(null);
    const paymentVisible = ref(false);
    const _shortcutHandlers = {};

    // Formatting Mixin Logic (Re-implemented locally)
    const float_precision = ref(2);
    const currency_precision = ref(2);

    const flt = (value, precision, number_format, rounding_method) => {
        if (!precision && precision != 0) {
            precision = currency_precision.value || 2;
        }
        if (!rounding_method) {
            rounding_method = "Banker's Rounding (legacy)";
        }
        return window.flt(value, precision, number_format, rounding_method);
    };

    const formatCurrency = (value, precision) => {
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
    };

    const formatFloat = (value, precision) => {
        if (value === null || value === undefined) {
            value = 0;
        }
        let number = Number(formatUtils.fromArabicNumerals(String(value)).replace(/,/g, ""));
        if (isNaN(number)) number = 0;
        let prec = precision != null ? Number(precision) : Number(float_precision.value) || 2;
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
    };

    const setFormatedCurrency = (el, field_name, precision, no_negative = false, $event) => {
        let input_val = $event && $event.target ? $event.target.value : $event;
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
        
        // Handle direct ref assignment
        if (field_name === 'loyalty_amount') loyalty_amount.value = value;
        else if (field_name === 'redeemed_customer_credit') redeemed_customer_credit.value = value;
        else if (field_name === 'credit_change') credit_change.value = value;
        else if (field_name === 'credit_to_redeem' && typeof el === 'object') el[field_name] = value;
        
        return formatCurrency(value, precision);
    };

    const isNumber = (value) => {
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
        return (currency) => {
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
        const amountByPayment = new Map();

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
        const totals = payments.reduce((accumulator, payment) => {
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

    const total_payments_display = computed(() => formatCurrency(total_payments.value, displayCurrency.value));
    const diff_payment_display = computed(() => {
        const value = diff_payment.value < 0 ? -diff_payment.value : diff_payment.value;
        return formatCurrency(value, displayCurrency.value);
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
            (el) => el.fieldtype === "Button" && el.fieldname === "request_for_payment"
        ) || false;
    });

    const returnValidityEnabled = computed(() => {
        return Boolean(pos_profile.value?.posa_enable_return_validity || pos_settings.value?.posa_enable_return_validity);
    });

    const returnValidityMinDate = computed(() => {
        const postingDate = invoice_doc.value?.posting_date || frappe.datetime?.nowdate?.();
        if (!postingDate) return new Date();
        const parsed = new Date(postingDate);
        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    });

    // Helper Methods
    const isCashLikePayment = (payment) => {
        if (!payment) return false;
        const configuredCashMOP = String(pos_profile.value?.posa_cash_mode_of_payment || "").toLowerCase();
        const type = String(payment.type || "").toLowerCase();
        if (type === "cash") return true;
        const mode = String(payment.mode_of_payment || "").toLowerCase();
        if (configuredCashMOP && mode === configuredCashMOP) return true;
        return mode.includes("cash");
    };

    const getVisibleDenominations = (payment) => {
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
                // Since this logic depends on template refs that might not exist in the composable context,
                // we might need to handle this differently or expect the ref to be passed or accessed via a store/global if possible.
                // For now, we'll emit an event or rely on the component to handle the scrolling if possible, 
                // OR we accept that we can't easily access `this.$refs` here.
                // However, `highlightSubmit` is state we control.
                highlightSubmit.value = true;
                
                // If we need to scroll, we might need to do it in the component.
                // But for logic extraction, we can emit an event.
                // eventBus.emit('focus_payment_submit'); 
            }, 100);
        });
    };

    const handleCreditChangeUpdate = (value) => {
        setFormatedCurrency(null, "credit_change", null, false, value);
        updateCreditChange(credit_change.value);
    };

    const reset_cash_payments = () => {
        if (!invoice_doc.value) return;
        invoice_doc.value.payments.forEach((payment) => {
            if (String(payment.mode_of_payment).toLowerCase() === "cash") {
                payment.amount = 0;
            }
        });
    };

    const ensureReturnPaymentsAreNegative = () => {
        if (!invoice_doc.value || !invoice_doc.value.is_return || !is_cashback.value) {
            return;
        }
        let hasPaymentSet = false;
        invoice_doc.value.payments.forEach((payment) => {
            if (Math.abs(payment.amount) > 0) {
                hasPaymentSet = true;
            }
        });
        if (!hasPaymentSet) {
            const default_payment = invoice_doc.value.payments.find((payment) => payment.default === 1);
            if (default_payment) {
                const amount = invoice_doc.value.rounded_total || invoice_doc.value.grand_total;
                default_payment.amount = -Math.abs(amount);
                if (default_payment.base_amount !== undefined) {
                    default_payment.base_amount = -Math.abs(amount);
                }
            }
        }
        invoice_doc.value.payments.forEach((payment) => {
            if (payment.amount > 0) {
                payment.amount = -Math.abs(payment.amount);
            }
            if (payment.base_amount !== undefined && payment.base_amount > 0) {
                payment.base_amount = -Math.abs(payment.base_amount);
            }
        });
    };

    const extractSubmissionErrorMessage = (exc) => {
        if (typeof exc === 'string') return exc;
        if (exc.message) return exc.message;
        if (exc._server_messages) {
            try {
                const messages = JSON.parse(exc._server_messages);
                return JSON.parse(messages[0]).message;
            } catch (e) {
                return String(exc);
            }
        }
        return String(exc);
    };

    const submit = async (event, payment_received = false, print = false) => {
        loading.value = true;
        try {
            if (invoice_doc.value.is_return) {
                ensureReturnPaymentsAreNegative();
            }

            if (!is_credit_sale.value && !invoice_doc.value.is_return && total_payments.value <= 0 && (invoice_doc.value.rounded_total || invoice_doc.value.grand_total) > 0) {
                toastStore.show({ title: `Please enter payment amount`, color: "error" });
                frappe.utils.play_sound("error");
                return;
            }

            if (!is_credit_sale.value && !invoice_doc.value.is_return) {
                let has_cash_payment = false;
                let cash_amount = 0;
                invoice_doc.value.payments.forEach((payment) => {
                    if (String(payment.mode_of_payment).toLowerCase().includes("cash")) {
                        has_cash_payment = true;
                        cash_amount = flt(payment.amount);
                    }
                });
                if (has_cash_payment && cash_amount > 0) {
                    if (!pos_profile.value.posa_allow_partial_payment && cash_amount < (invoice_doc.value.rounded_total || invoice_doc.value.grand_total) && (invoice_doc.value.rounded_total || invoice_doc.value.grand_total) > 0) {
                        toastStore.show({ title: `Cash payment cannot be less than invoice total when partial payment is not allowed`, color: "error" });
                        frappe.utils.play_sound("error");
                        return;
                    }
                }
            }

            if (!is_credit_sale.value && !pos_profile.value.posa_allow_partial_payment && total_payments.value < (invoice_doc.value.rounded_total || invoice_doc.value.grand_total) && (invoice_doc.value.rounded_total || invoice_doc.value.grand_total) > 0) {
                toastStore.show({ title: `The amount paid is not complete`, color: "error" });
                frappe.utils.play_sound("error");
                return;
            }

            let phone_payment_is_valid = true;
            if (!payment_received) {
                invoice_doc.value.payments.forEach((payment) => {
                    if (payment.type === "Phone" && ![0, "0", "", null, undefined].includes(payment.amount)) {
                        phone_payment_is_valid = false;
                    }
                });
                if (!phone_payment_is_valid) {
                    toastStore.show({ title: __("Please request phone payment or use another payment method"), color: "error" });
                    frappe.utils.play_sound("error");
                    return;
                }
            }

            const changeLimit = Math.max(-diff_payment.value, 0);
            if (paid_change.value > changeLimit) {
                toastStore.show({ title: `Paid change cannot be greater than total change!`, color: "error" });
                frappe.utils.play_sound("error");
                return;
            }

            let total_change = flt(flt(paid_change.value) + flt(-credit_change.value));
            if (is_cashback.value && total_change !== changeLimit) {
                toastStore.show({ title: `Error in change calculations!`, color: "error" });
                frappe.utils.play_sound("error");
                return;
            }

            let credit_calc_check = customer_credit_dict.value.filter((row) => {
                return flt(row.credit_to_redeem) > flt(row.total_credit);
            });
            if (credit_calc_check.length > 0) {
                toastStore.show({ title: `Redeemed credit cannot be greater than its total.`, color: "error" });
                frappe.utils.play_sound("error");
                return;
            }

            if (!invoice_doc.value.is_return && redeemed_customer_credit.value > (invoice_doc.value.rounded_total || invoice_doc.value.grand_total)) {
                toastStore.show({ title: `Cannot redeem customer credit more than invoice total`, color: "error" });
                frappe.utils.play_sound("error");
                return;
            }

            await submit_invoice(print);
        } catch (error) {
            console.error("An error occurred during submission:", error);
            toastStore.show({ title: __("An unexpected error occurred. Please check the console for details."), color: "error" });
        } finally {
            loading.value = false;
        }
    };


    // Background Check Methods
    const scheduleBackgroundStatusCheck = (invoiceName, doctype) => {
        clearBackgroundStatusCheck();
        if (!pos_profile.value?.posa_allow_submissions_in_background_job) return;
        if (!invoiceName) return;

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
                if (status === 1) return;

                const reason = __("Invoice is still in draft after background submission.");
                if (eventBus) {
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

    const clearBackgroundStatusCheck = () => {
        if (backgroundStatusCheck.value) {
            clearTimeout(backgroundStatusCheck.value);
            backgroundStatusCheck.value = null;
        }
    };

    // Amount Setters
    const set_full_amount = (idx) => {
        const isReturn = invoice_doc.value.is_return || invoiceType.value === "Return";
        let totalAmount = invoice_doc.value.rounded_total || invoice_doc.value.grand_total;

        // Reset all payment amounts first
        invoice_doc.value.payments.forEach((payment) => {
            payment.amount = 0;
            if (payment.base_amount !== undefined) {
                payment.base_amount = 0;
            }
        });

        // Find payment by idx
        const clickedPayment = invoice_doc.value.payments.find((payment) => payment.idx === idx);

        if (clickedPayment) {
            let amount = isReturn ? -Math.abs(totalAmount) : totalAmount;
            clickedPayment.amount = amount;
            if (clickedPayment.base_amount !== undefined) {
                clickedPayment.base_amount = isReturn ? -Math.abs(amount) : amount;
            }
        }
    };

    const set_rest_amount = (idx) => {
        const isReturn = invoice_doc.value.is_return || invoiceType.value === "Return";
        invoice_doc.value.payments.forEach((payment) => {
            if (payment.idx === idx && payment.amount === 0 && diff_payment.value > 0) {
                let amount = diff_payment.value;
                if (isReturn) {
                    amount = -Math.abs(amount);
                }
                payment.amount = amount;
                if (payment.base_amount !== undefined) {
                    payment.base_amount = isReturn ? -Math.abs(amount) : amount;
                }
            }
        });
    };

    const clear_all_amounts = () => {
        invoice_doc.value.payments.forEach((payment) => {
            payment.amount = 0;
        });
    };

    const setPaymentToDenomination = (payment, amount) => {
        if (!payment) return;
        
        let currentAmount = parseFloat(payment.amount) || 0;
        let newAmount = currentAmount + parseFloat(amount);
        
        payment.amount = flt(newAmount, currency_precision.value);
        if (payment.base_amount !== undefined) {
            payment.base_amount = payment.amount;
        }
    };
    
    // Printing Methods
    const print_offline_invoice = async (invoice) => {
        if (!invoice) return;
        const html = await renderOfflineInvoiceHTML(invoice);
        const win = window.open("", "_blank");
        win.document.write(html);
        win.document.close();
        win.focus();
        win.print();
    };

    const open_offline_invoice_preview = async (invoice, { debugPrint = false, printFormat = "" } = {}) => {
        if (!invoice) return;
        const html = await renderOfflineInvoiceHTML(invoice);
        const win = window.open("", "_blank");
        if (!win) return;
        win.document.write(html);
        win.document.close();
        win.focus();
        if (debugPrint) {
            console.log("[POSAwesome][Print Debug]", {
                location: win.location?.href || null,
                online: navigator.onLine,
                trigger_print: "0",
                print_format: printFormat || null,
                template_path: "offline-fallback",
                should_print: false,
            });
        }
    };

    const load_print_page = () => {
        const print_fmt = print_format.value || pos_profile.value.print_format_for_online || pos_profile.value.print_format;
        const letter_head = pos_profile.value.letter_head || 0;
        let doctype;
        const debugPrint = isDebugPrintEnabled();

        if (invoiceType.value === "Quotation") {
            doctype = "Quotation";
        } else if (invoiceType.value === "Order" && pos_profile.value.posa_create_only_sales_order) {
            doctype = "Sales Order";
        } else if (pos_profile.value.create_pos_invoice_instead_of_sales_invoice) {
            doctype = "POS Invoice";
        } else {
            doctype = "Sales Invoice";
        }
        let url =
            frappe.urllib.get_base_url() +
            "/printview?doctype=" +
            encodeURIComponent(doctype) +
            "&name=" +
            invoice_doc.value.name +
            "&trigger_print=1" +
            "&format=" +
            print_fmt +
            "&no_letterhead=" +
            letter_head;
        url = appendDebugPrintParam(url, debugPrint);
        const printOptions = {
            invoiceDoc: invoice_doc.value,
            allowOfflineFallback: isOffline(),
            triggerPrint: "1",
            debugPrint,
            debugInfo: {
                printFormat: print_fmt,
                templatePath: "online-printview",
            },
        };

        if (pos_profile.value.posa_open_print_in_new_tab) {
            if (isOffline()) {
                open_offline_invoice_preview(invoice_doc.value, {
                    debugPrint,
                    printFormat: print_fmt,
                });
                return;
            }
            let newTabUrl =
                frappe.urllib.get_base_url() +
                "/printview?doctype=" +
                encodeURIComponent(doctype) +
                "&name=" +
                invoice_doc.value.name +
                "&trigger_print=0" +
                "&format=" +
                print_fmt;

            if (pos_profile.value.letter_head) {
                newTabUrl += "&letterhead=" + encodeURIComponent(pos_profile.value.letter_head);
                newTabUrl += "&no_letterhead=0";
            } else {
                newTabUrl += "&no_letterhead=0";
            }

            newTabUrl = appendDebugPrintParam(newTabUrl, debugPrint);
            const printWindow = window.open(newTabUrl, "_blank");
            watchPrintWindow(printWindow, {
                ...printOptions,
                triggerPrint: "0",
                shouldPrint: false,
            });
            return;
        }

        if (pos_profile.value.posa_silent_print) {
            silentPrint(url, printOptions);
        } else {
            const printWindow = window.open(url, "Print");
            watchPrintWindow(printWindow, printOptions);
        }
    };

    // Validation Methods
    const validate_due_date = () => {
        const today = frappe.datetime.now_date();
        const new_date = Date.parse(invoice_doc.value.due_date);
        const parse_today = Date.parse(today);
        if (new_date < parse_today) {
            invoice_doc.value.due_date = today;
        }
    };

    // Shortcut Handlers
    const handlePaymentShortcut = (event) => {
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
        if (!paymentVisible.value) return;
        nextTick(() => {
            submit(null, false, print);
        });
    };

    // Credit & Address Methods
    const get_available_credit = (use_credit) => {
        clear_all_amounts();
        if (use_credit) {
            frappe.call("posawesome.posawesome.api.payments.get_available_credit", {
                customer: invoice_doc.value.customer,
                company: pos_profile.value.company,
            }).then((r) => {
                const data = r.message;
                if (data && data.length) {
                    const amount = invoice_doc.value.rounded_total || invoice_doc.value.grand_total;
                    let remainAmount = amount;
                    data.forEach((row) => {
                        if (remainAmount > 0) {
                            if (remainAmount >= row.total_credit) {
                                row.credit_to_redeem = row.total_credit;
                                remainAmount -= row.total_credit;
                            } else {
                                row.credit_to_redeem = remainAmount;
                                remainAmount = 0;
                            }
                        } else {
                            row.credit_to_redeem = 0;
                        }
                    });
                    customer_credit_dict.value = data;
                } else {
                    customer_credit_dict.value = [];
                }
            });
        } else {
            customer_credit_dict.value = [];
        }
    };

    const normalizeAddress = (address) => {
        if (!address) return null;
        // Basic normalization, can be expanded if original had complex logic
        return {
            ...address,
            display_title: address.address_title || address.name
        };
    };

    const get_addresses = () => {
        if (!invoice_doc.value || !invoice_doc.value.customer) {
            addresses.value = [];
            return;
        }
        frappe.call({
            method: "posawesome.posawesome.api.customers.get_customer_addresses",
            args: { customer: invoice_doc.value.customer },
            async: true,
            callback: function (r) {
                if (!r.exc) {
                    const records = Array.isArray(r.message) ? r.message : [];
                    // Using local normalizeAddress
                    const normalized = records.map((row) => normalizeAddress(row)).filter(Boolean);
                    addresses.value = normalized;
                    if (
                        invoice_doc.value &&
                        invoice_doc.value.shipping_address_name &&
                        !normalized.some((row) => row.name === invoice_doc.value.shipping_address_name)
                    ) {
                        invoice_doc.value.shipping_address_name = null;
                    }
                } else {
                    addresses.value = [];
                }
            },
        });
    };

    const addressFilter = (item, queryText) => {
        const record = (item && item.raw) || item || {};
        const searchText = (queryText || "").toLowerCase();
        if (!searchText) return true;
        
        const fields = ["address_title", "address_line1", "address_line2", "city", "state", "country", "name"];
        return fields.some((field) => {
            const value = record[field];
            if (!value) return false;
            return String(value).toLowerCase().includes(searchText);
        });
    };

    const new_address = () => {
        if (!invoice_doc.value || !invoice_doc.value.customer) {
            toastStore.show({
                title: __("Please select a customer first"),
                color: "error",
            });
            return;
        }
        if (eventBus) eventBus.emit("open_new_address", invoice_doc.value.customer);
    };

    const updateCreditChange = (val) => {
        if (invoice_doc.value) {
            invoice_doc.value.credit_change = val;
        }
    };

    const creditSourceLabel = (row) => {
        // Mock implementation or extract logic if it was complex
        return row.name || 'Credit'; 
    };

    const handlePaymentAmountChange = (payment, value) => {
       // Logic to update payment amount
       // Assuming it sets the amount directly
       setFormatedCurrency(payment, 'amount', null, false, value);
    };
    
    // M-Pesa & Requests
    const is_mpesa_c2b_payment = (payment) => {
        if (mpesa_modes.value.includes(payment.mode_of_payment) && payment.type === "Bank") {
            // Logic from original: sets amount to 0 if match?
            // "payment.amount = 0; return true;" - this side effect in a getter is dangerous but was in original.
            // We should check if we really want to mutate here. The original code did:
            // if (...) { payment.amount = 0; return true; }
            if (payment.amount !== 0) payment.amount = 0;
            return true;
        }
        return false;
    };

    const mpesa_c2b_dialog = (payment) => {
        // Implementation needed if it was complex. 
        // For now logging or emitting
        console.log("Mpesa Dialog for", payment);
        // eventBus.emit('open_mpesa_dialog', payment); ??
    };

    const request_payment = (payment) => {
        // Logic for request payment
        if (!invoice_doc.value.contact_mobile) {
            phone_dialog.value = true;
            return;
        }
        // ... API call ...
        console.log("Requesting payment", payment);
        phone_dialog.value = false;
    };
    
    const update_delivery_date = () => {
        if (invoice_doc.value && new_delivery_date.value) {
            invoice_doc.value.posa_delivery_date = new_delivery_date.value;
        }
    };

    const updateReturnValidUpto = () => {
         // Logic
    };
    
    const applyCustomDays = () => {
        if (custom_days_value.value) {
            credit_due_days.value = custom_days_value.value;
            custom_days_dialog.value = false;
        }
    };

    const applyDuePreset = (days) => {
        credit_due_days.value = days;
    };
    
    const update_po_date = () => {
         if (invoice_doc.value && new_po_date.value) {
            invoice_doc.value.po_date = new_po_date.value;
        }
    };
    
    const update_credit_due_date = () => {
        // Logic
    };
    
    const showPaidAmount = () => {
        // Logic
    };
     
    const showDiffPayment = () => {
        // Logic
    };
    
    const showPaidChange = () => {
        // Logic
    };
    const get_sales_persons = async () => {
        const stored = await getSalesPersonsStorage();
        if (stored && stored.length) {
            sales_persons.value = stored;
            return;
        }
        try {
            const r = await frappe.call({
                method: "posawesome.posawesome.api.posapp.get_sales_persons",
                args: { company: pos_profile.value.company },
            });
            if (r.message) {
                sales_persons.value = r.message;
                await setSalesPersonsStorage(r.message);
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Watchers
    watch(diff_payment, (newVal) => {
        if (is_user_editing_paid_change.value) return;

        const lastEditWasCash = last_payment_change_was_cash.value;

        if (newVal < 0) {
            const changeDue = -newVal;
            if (shouldAutoApplyCreditChange.value || lastEditWasCash === false) {
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
            credit_change.value = flt(newVal - changeLimit, currency_precision.value);
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
            if (customerInfo.value.conversion_factor) {
				const points = flt(amount / customerInfo.value.conversion_factor);
                invoice_doc.value.loyalty_points = points;
			}
        }
    });

    watch(() => uiStore.posProfile, (newVal) => {
        if (newVal) {
            pos_profile.value = newVal;
            const prec = parseInt(newVal.posa_decimal_precision);
            if (!isNaN(prec)) {
                float_precision.value = prec;
                currency_precision.value = prec;
            }
        }
    }, { immediate: true, deep: true });

    // Lifecycle
    onMounted(() => {
        float_precision.value = frappe.defaults.get_default("float_precision") || 2;
        currency_precision.value = frappe.defaults.get_default("currency_precision") || 2;
        
        pos_settings.value = frappe.defaults.get_default("pos_settings") || {}; // Mock or fetch logic
        
        // M-Pesa Modes Mock
        // mpesa_modes.value = ...
        
        get_sales_persons();
        get_addresses();
        
        if (eventBus) {
             // Register event listeners
             eventBus.on('handleSubmitPaymentShortcut', handleSubmitPaymentShortcut);
        }
        
    });

    onUnmounted(() => {
        if (eventBus) {
             eventBus.off('handleSubmitPaymentShortcut', handleSubmitPaymentShortcut);
        }
    });

    // Return object
    return {
        // Refs
        loading, pos_profile, pos_settings, stock_settings, invoiceType, is_return,
        loyalty_amount, redeemed_customer_credit, credit_change, paid_change,
        is_credit_sale, is_write_off_change, is_cashback, is_credit_return,
        redeem_customer_credit, customer_credit_dict, paid_change_rules,
        phone_dialog, custom_days_dialog, custom_days_value, new_delivery_date,
        new_po_date, new_credit_due_date, credit_due_days, credit_due_presets,
        return_valid_upto_date, mpesa_modes, sales_persons, sales_person,
        print_formats, print_format, addresses, is_user_editing_paid_change,
        highlightSubmit, last_payment_change_was_cash, paymentVisible,

        // Computeds
        invoice_doc, currencySymbol, displayCurrency, blockSaleBeyondAvailableQty,
        paymentAmountSummary, total_payments, diff_payment, change_due,
        shouldAutoApplyCreditChange, diff_label, total_payments_display, diff_payment_display,
        available_points_amount, available_customer_credit, request_payment_field,
        returnValidityEnabled, returnValidityMinDate,

        // Core Methods
        flt, formatCurrency, formatFloat, setFormatedCurrency, isNumber,
        isCashLikePayment, getVisibleDenominations, validatePayment,
        
        // Action Methods
        back_to_invoice, finishSubmissionNavigation, handleShowPayment,
        handleCreditChangeUpdate, reset_cash_payments, ensureReturnPaymentsAreNegative,
        submit, scheduleBackgroundStatusCheck, clearBackgroundStatusCheck,
        set_full_amount, set_rest_amount, clear_all_amounts, setPaymentToDenomination,
        
        // Print & Utils
        print_offline_invoice, open_offline_invoice_preview, load_print_page,
        validate_due_date, handlePaymentShortcut, handleSubmitPaymentShortcut,
        get_available_credit, normalizeAddress, get_addresses, addressFilter,
        new_address, updateCreditChange, creditSourceLabel, handlePaymentAmountChange,
        is_mpesa_c2b_payment, mpesa_c2b_dialog, request_payment, update_delivery_date,
        updateReturnValidUpto, applyCustomDays, applyDuePreset, update_po_date,
        update_credit_due_date, showPaidAmount, showDiffPayment, showPaidChange,
        get_sales_persons,
        
        // Stores
        invoiceStore, customersStore, uiStore, toastStore, syncStore,
        selectedCustomer, customerInfo, customerRefreshToken,
        isFrozen, freezeTitle, freezeMessage, activeView,
        isRtl, rtlStyles, rtlClasses,
    };
}
