
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

export function _toBaseCurrency(context, value) {
    const rate = Number.parseFloat(context.conversion_rate || 1) || 1;
    if (!rate || rate === 0) {
        return Number.parseFloat(value || 0) || 0;
    }
    return Number.parseFloat(value || 0) * rate;
}

export function _fromBaseCurrency(context, value) {
    const rate = Number.parseFloat(context.conversion_rate || 1) || 1;
    const numeric = Number.parseFloat(value || 0) || 0;
    return rate ? numeric / rate : numeric;
}

export function convert_amount(context, value) {
    return _toBaseCurrency(context, value);
}

export function _getPlcConversionRate(context) {
    const companyCurrency = (context.company && context.company.default_currency) || context.pos_profile.currency;
    const priceListCurrency = context.price_list_currency || companyCurrency;
    if (priceListCurrency === companyCurrency) {
        return 1;
    }
    const exchangeRate = Number.parseFloat(context.exchange_rate || 1) || 1;
    const conversionRate = Number.parseFloat(context.conversion_rate || 1) || 1;
    return exchangeRate * conversionRate;
}

export function _buildPriceListSnapshot(context, items = []) {
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

export function _logPriceListDebug(context, tag, payload) {
    if (!_isPriceDebugEnabled()) {
        return;
    }
    console.log("[POSA][PriceList]", tag, payload);
}
