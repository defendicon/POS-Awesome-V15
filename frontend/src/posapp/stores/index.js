/**
 * Pinia Store Setup for POSAwesome
 */

import { createPinia } from "pinia";

// Create and export pinia instance
export const pinia = createPinia();

// Export stores
export { useCustomersStore } from "./customersStore.js";
export { useItemsStore } from "./itemsStore.js";
export { useInvoiceStore } from "./invoiceStore.js";
export { useUpdateStore, formatBuildVersion } from "./updateStore.js";

export default pinia;
