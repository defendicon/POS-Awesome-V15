/**
 * Public barrel for the POS offline layer.
 *
 * Import all offline functionality from this module rather than from individual
 * sub-modules. The layer is composed of four levels:
 *
 * - **`db`** — storage primitives: the Dexie IndexedDB instance (`db`), the
 *   in-memory store (`memory`), `persist()`, network-status helpers, and
 *   cache-clear utilities. Every other sub-module in this layer depends on these.
 *
 * - **Domain queues** (`invoices`, `customers`, `payments`, `cash_movements`,
 *   `stock`) — per-domain read/write helpers for data queued while the device is
 *   offline and replayed to the server when connectivity is restored.
 *
 * - **`cache`** — named key-value accessors for reference data fetched from the
 *   server (offers, price lists, exchange rates, item details, etc.). Every write
 *   goes through `memory` and calls `persist()`.
 *
 * - **`sync/*`** — background sync engine composed of `types`, `resourceRegistry`,
 *   `syncState`, `SyncCoordinator`, `useSyncCoordinator`, and per-resource
 *   `adapters`.
 *
 * `memoryInitPromise` is a backward-compatible alias for `initPromise` (from `db`).
 * Await it before reading any `memory` value at application startup.
 *
 * @module offline
 */
export * from "./db";
export * from "./writeQueue";
export * from "./stock";
export * from "./invoices";
export * from "./customers";
export * from "./payments";
export * from "./cash_movements";
export * from "./cache";
export * from "./sync/types";
export * from "./sync/resourceRegistry";
export * from "./sync/syncState";
export * from "./sync/SyncCoordinator";
export * from "./sync/useSyncCoordinator";
export * from "./sync/adapters";

// Aliases for backward compatibility
import { initPromise } from "./db";
export const memoryInitPromise = initPromise;
