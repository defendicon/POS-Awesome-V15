/**
 * Pinia Store Setup for POSAwesome
 */

import { createPinia } from "pinia";

// Create and export pinia instance
export const pinia = createPinia();

// Export stores
export { useCustomersStore } from "./customersStore";
export { useEmployeeStore } from "./employeeStore";
export { useCatalogStore } from "./catalogStore";
export { useCartStore } from "./cartStore";
export { useUpdateStore, formatBuildVersion } from "./updateStore";
export { usePricingRulesStore } from "./pricingRulesStore";

export default pinia;
