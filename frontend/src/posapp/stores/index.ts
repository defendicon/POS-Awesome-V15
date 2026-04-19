/**
 * Pinia store registry for the POS application.
 *
 * Re-exports all application stores from a single entry point. Import stores
 * from here rather than directly from their individual files.
 *
 * **Stores:**
 * - `useCustomersStore` — customer list and active customer selection for the
 *   current POS session.
 * - `useEmployeeStore` — current cashier/employee identity used for shift
 *   ownership and cashier assignment.
 * - `useItemsStore` — item catalogue with multi-layer caching, search, and
 *   pagination; the primary data source for the item selector component.
 * - `useInvoiceStore` — active POS invoice document and cart items (normalized
 *   Map-based storage); the central state shared by the cart and payment views.
 * - `useUpdateStore` / `formatBuildVersion` — tracks available application
 *   updates and provides build-version string formatting for display.
 * - `usePricingRulesStore` — offline pricing-rules snapshot and rule evaluation
 *   applied to cart items during price calculation.
 */

import { createPinia } from "pinia";

// Create and export pinia instance
export const pinia = createPinia();

// Export stores
export { useCustomersStore } from "./customersStore";
export { useEmployeeStore } from "./employeeStore";
export { useItemsStore } from "./itemsStore";
export { useInvoiceStore } from "./invoiceStore";
export { useUpdateStore, formatBuildVersion } from "./updateStore";
export { usePricingRulesStore } from "./pricingRulesStore";

export default pinia;
