import { computed } from "vue";
import type { Ref } from "vue";
import { useInvoiceStore } from "../stores/invoiceStore";
import { useToastStore } from "../stores/toastStore";
import { useUIStore } from "../stores/uiStore";
import { useStockUtils } from "./useStockUtils";
import { useItemAddition } from "./useItemAddition";
import { parseBooleanSetting } from "../utils/stock";
import format from "../format";

// @ts-ignore
const __ = window.__ || ((s) => s);

export function useInvoiceItems(invoiceType: Ref<string>) {
    const invoiceStore = useInvoiceStore();
    const toastStore = useToastStore();
    const uiStore = useUIStore();
    const { calc_stock_qty } = useStockUtils();
    const { removeItem } = useItemAddition();

    const pos_profile = computed(() => uiStore.posProfile);
    const stock_settings = computed(() => uiStore.stockSettings);

    const isReturnInvoice = computed(() => {
        return invoiceType.value === "Return" || (invoiceStore.invoiceDoc && invoiceStore.invoiceDoc.is_return);
    });

    const blockSaleBeyondAvailableQty = computed(() => {
        if (["Order", "Quotation"].includes(invoiceType.value)) {
            return false;
        }
        return parseBooleanSetting(pos_profile.value?.posa_block_sale_beyond_available_qty);
    });

    // Helper for formatting
    const formatFloat = (val: any) => {
        // @ts-ignore
        return format.methods.formatFloat(val, pos_profile.value?.posa_decimal_precision || 2);
    };

    const shouldEnforceStockLimits = (item: any) => {
        // Respect global setting to ignore stock limits
        if (
            pos_profile.value &&
            !parseBooleanSetting(pos_profile.value.posa_validate_stock)
        ) {
            return false;
        }

        // Service items and non-stock items usually don't track stock,
        // but ERPNext allows checking "Maintain Stock" on them. 
        // We assume if is_stock_item is false/0, we skip.
        if (item.is_stock_item === 0 || item.is_stock_item === false) {
            // Check bundle children if any are stock items
            if (item.is_bundle) {
                const bundleChildren = invoiceStore.packedItems.filter(
                    (ch: any) => ch.bundle_id === item.bundle_id
                );
                return bundleChildren.some((ch: any) => ch.is_stock_item !== 0);
            }
            return false;
        }

        return true;
    };

    const updateBundleChildrenQty = (item: any) => {
        if (!item || !item.is_bundle) {
            return;
        }

        const multiplier = item.qty || 0;
        const packedItems = invoiceStore.packedItems;

        packedItems
            .filter((it: any) => it.bundle_id === item.bundle_id)
            .forEach((ch: any) => {
                ch.qty = multiplier * (ch.child_qty_per_bundle || 1);
                calc_stock_qty(ch, ch.qty);
            });
    };

    const add_one = (item: any) => {
        const enforceStockLimits = shouldEnforceStockLimits(item);
        const allowNegativeStock =
            (parseBooleanSetting(stock_settings.value?.allow_negative_stock) ||
                parseBooleanSetting(item?.allow_negative_stock)) &&
            !blockSaleBeyondAvailableQty.value;

        if (isReturnInvoice.value) {
            // For returns, make quantity more negative
            item.qty--;
        } else {
            const proposed = item.qty + 1;
            const blockSale =
                enforceStockLimits && (blockSaleBeyondAvailableQty.value || !allowNegativeStock);
            const exceedsAvailable =
                enforceStockLimits && item.max_qty !== undefined && proposed > item.max_qty;

            if (blockSale && exceedsAvailable) {
                item.qty = item.max_qty;
                calc_stock_qty(item, item.qty);
                toastStore.show({
                    title: __("Maximum available quantity is {0}. Quantity adjusted to match stock.", [
                        formatFloat(item.max_qty),
                    ]),
                    color: "error",
                });
                return;
            }
            if (!blockSale && exceedsAvailable) {
                toastStore.show({
                    title: __(
                        `{0}: requested quantity exceeds available stock. Negative stock is allowed—proceed carefully.`,
                        [item.item_name || item.item_code],
                    ),
                    color: "warning",
                });
            }
            item.qty = proposed;
        }

        if (item.qty == 0) {
            removeItem(item, { invoiceStore, items: invoiceStore.items, expanded: [], pos_profile: pos_profile.value });
        }

        calc_stock_qty(item, item.qty);
        updateBundleChildrenQty(item);
    };

    const subtract_one = (item: any) => {
        if (isReturnInvoice.value) {
            // For returns, move quantity toward zero
            item.qty++;
        } else {
            item.qty--;
        }

        if (item.qty == 0) {
            removeItem(item, { invoiceStore, items: invoiceStore.items, expanded: [], pos_profile: pos_profile.value });
        }

        calc_stock_qty(item, item.qty);
        updateBundleChildrenQty(item);
    };

    return {
        shouldEnforceStockLimits,
        updateBundleChildrenQty,
        add_one,
        subtract_one,
        blockSaleBeyondAvailableQty
    };
}
