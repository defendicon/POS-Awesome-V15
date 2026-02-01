/**
 * Pinia Store Setup for POSAwesome
 */

import { createPinia } from "pinia";

// Create and export pinia instance
export const pinia = createPinia();

// Export stores
export { useCustomersStore } from "./customersStore";
export { useItemsStore } from "./itemsStore";
export { useInvoiceStore } from "./invoiceStore";
export { useUpdateStore, formatBuildVersion } from "./updateStore";
export { usePricingRulesStore } from "./pricingRulesStore";

export default pinia;
