import { ref, watch } from "vue";
import _ from "lodash";

/**
 * useLastInvoiceRate
 * 
 * Manages fetching and caching of historical rates for items based on the selected customer.
 * Provides a way to show users what the customer paid last time.
 */
export function useLastInvoiceRate() {
    const lastInvoiceRates = ref({});
    const isFetchingRates = ref(false);
    const ctx = {
        selectedCustomer: null,
        posProfile: null,
    };

    const registerContext = (newContext) => {
        Object.assign(ctx, newContext);
    };

    const fetchLastInvoiceRates = async (itemCodes) => {
        const customer = ctx.selectedCustomer?.value || ctx.selectedCustomer;
        if (!customer || !itemCodes?.length) return;

        isFetchingRates.value = true;
        try {
            const res = await frappe.call({
                method: "posawesome.posawesome.api.items.get_last_invoice_rates",
                args: {
                    customer: customer,
                    items: itemCodes
                }
            });
            if (res.message) {
                lastInvoiceRates.value = {
                    ...lastInvoiceRates.value,
                    ...res.message
                };
            }
        } catch (error) {
            console.error("Failed to fetch last invoice rates:", error);
        } finally {
            isFetchingRates.value = false;
        }
    };

    const scheduleLastInvoiceRateRefresh = _.debounce(async (items) => {
        if (!items || !items.length) return;
        const codes = items.map(it => it.item_code).filter(Boolean);
        await fetchLastInvoiceRates(codes);
    }, 500);

    const clearRates = () => {
        lastInvoiceRates.value = {};
    };

    const getLastInvoiceRate = (itemCode) => {
        return lastInvoiceRates.value[itemCode] || null;
    };

    return {
        lastInvoiceRates,
        isFetchingRates,
        registerContext,
        fetchLastInvoiceRates,
        scheduleLastInvoiceRateRefresh,
        clearRates,
        getLastInvoiceRate,
    };
}
