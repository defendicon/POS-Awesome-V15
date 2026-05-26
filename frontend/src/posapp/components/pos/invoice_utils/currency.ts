import {
	fromCompanyCurrency,
	getCompanyCurrency,
	getPlcConversionRate,
	toCompanyCurrency,
} from "../../../utils/erpnextCurrency";

type InvoiceContext = any;

/**
 * Currency Utils
 * Handles conversion between Company Currency (CC), Price List Currency (PLC), and Selected Currency (SC).
 * 
 * Context requirements:
 * - context.conversion_rate
 * - context.exchange_rate
 * - context.company
 * - context.pos_profile
 * - context.price_list_currency
 */

export function _toBaseCurrency(context: InvoiceContext, value: unknown) {
	return toCompanyCurrency(context, value);
}

export function _fromBaseCurrency(context: InvoiceContext, value: unknown) {
	return fromCompanyCurrency(context, value);
}

export function convert_amount(context: InvoiceContext, value: unknown) {
    return _toBaseCurrency(context, value);
}

export function _getPlcConversionRate(context: InvoiceContext) {
    const companyCurrency = getCompanyCurrency(context);
    const priceListCurrency = context.price_list_currency || companyCurrency;
    if (priceListCurrency === companyCurrency) {
        return 1;
    }
    return getPlcConversionRate(context);
}

export function _buildPriceListSnapshot(context: InvoiceContext, items: any[] = []) {
    // Benchmark note: keep debug snapshots lightweight to avoid expensive deep clones.
    if (!Array.isArray(items)) {
        return [];
    }
    return items.map((item) => ({
        item_code: item.item_code,
        price_list_rate: item.price_list_rate,
        base_price_list_rate: item.base_price_list_rate,
    }));
}

export function _isPriceDebugEnabled() {
    try {
        if (typeof window === "undefined" || !window.location) {
            return false;
        }
        const params = new URLSearchParams(window.location.search || "");
        return params.get("debug_price") === "1";
    } catch {
        return false;
    }
}

export function _logPriceListDebug(context: InvoiceContext, tag: string, payload: any) {
    if (!_isPriceDebugEnabled()) {
        return;
    }
    console.log("[POSA][PriceList]", tag, payload);
}
