export * from "./db.js";
export * from "./stock.js";
export * from "./invoices.js";
export * from "./customers.js";
export * from "./payments.js";
export * from "./cache.js";

// Aliases for backward compatibility
import { initPromise } from "./db.js";
export const memoryInitPromise = initPromise;
