/* global frappe */
import {
        memory,
        resetOfflineState,
        setLastSyncTotals,
        MAX_QUEUE_ITEMS,
        reduceCacheUsage,
        getLastSyncTotals,
} from "./cache.js";
import { persist } from "./core.js";
import { updateLocalStock } from "./stock.js";

// Flag to avoid concurrent invoice syncs which can cause duplicate submissions
let invoiceSyncInProgress = false;

// --- Cross-tab invoice sync coordination -----------------------------------

const SYNC_CHANNEL_NAME = "posawesome:invoice-sync";
const SYNC_REQUEST_TIMEOUT_MS = 12_000;
const SYNC_HEARTBEAT_INTERVAL_MS = 5_000;
const SYNC_HEARTBEAT_STALE_MS = SYNC_HEARTBEAT_INTERVAL_MS * 3;

const tabId = (() => {
        if (typeof crypto !== "undefined") {
                if (typeof crypto.randomUUID === "function") {
                        return crypto.randomUUID();
                }
                try {
                        const buf = new Uint32Array(4);
                        crypto.getRandomValues(buf);
                        return Array.from(buf, (n) => n.toString(16).padStart(8, "0")).join("-");
                } catch (e) {
                        // Fall through to timestamp-based id
                }
        }
        return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
})();

const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(SYNC_CHANNEL_NAME) : null;

let syncLeaderId = null;
let isSyncLeader = false;
let heartbeatTimer = null;
let heartbeatLastReceived = 0;
let leaderProbeTimeout = null;
let currentSyncPromise = null;
let remoteSyncInProgress = false;

const pendingSyncResolvers = new Map();
const broadcastResultListeners = new Set();
const outstandingRemoteRequests = new Map();

function broadcast(message) {
        if (!syncChannel || !message) {
                return;
        }
        syncChannel.postMessage({ ...message, scope: SYNC_CHANNEL_NAME });
}

function shouldYieldTo(remoteId) {
        if (!remoteId) {
                return false;
        }
        return tabId.localeCompare(remoteId) > 0;
}

function isHeartbeatStale() {
        if (!heartbeatLastReceived) {
                return true;
        }
        return Date.now() - heartbeatLastReceived > SYNC_HEARTBEAT_STALE_MS;
}

function startHeartbeat() {
        if (!syncChannel || heartbeatTimer) {
                return;
        }
        heartbeatLastReceived = Date.now();
        broadcast({ type: "leader-announcement", leaderId: tabId });
        broadcast({ type: "heartbeat", leaderId: tabId, timestamp: heartbeatLastReceived });
        heartbeatTimer = setInterval(() => {
                const timestamp = Date.now();
                broadcast({ type: "heartbeat", leaderId: tabId, timestamp });
        }, SYNC_HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
        if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
        }
}

function becomeLeader() {
        if (isSyncLeader) {
                return;
        }
        isSyncLeader = true;
        syncLeaderId = tabId;
        remoteSyncInProgress = false;
        stopHeartbeat();
        startHeartbeat();
}

function scheduleLeaderProbe(delay = 200) {
        if (!syncChannel) {
                becomeLeader();
                return;
        }
        if (leaderProbeTimeout) {
                clearTimeout(leaderProbeTimeout);
        }
        leaderProbeTimeout = setTimeout(() => {
                leaderProbeTimeout = null;
                if (!syncLeaderId) {
                        becomeLeader();
                }
        }, delay);
}

function releaseLeadership() {
        if (!isSyncLeader) {
                return;
        }
        stopHeartbeat();
        broadcast({ type: "leader-release", leaderId: tabId });
        isSyncLeader = false;
        syncLeaderId = null;
        remoteSyncInProgress = false;
}

function handleSyncResultMessage(message) {
        const { requestId, requesterId, totals, leaderId } = message;
        if (totals) {
                setLastSyncTotals(totals);
        }
        if (leaderId && leaderId !== tabId) {
                syncLeaderId = leaderId;
                isSyncLeader = false;
                heartbeatLastReceived = Date.now();
        }
        if (requestId && requesterId === tabId && pendingSyncResolvers.has(requestId)) {
                const entry = pendingSyncResolvers.get(requestId);
                pendingSyncResolvers.delete(requestId);
                if (entry.timeoutId) {
                        clearTimeout(entry.timeoutId);
                }
                entry.resolve(totals || getFallbackTotals());
        }
        if (!requestId) {
                const listeners = Array.from(broadcastResultListeners);
                broadcastResultListeners.clear();
                listeners.forEach((listener) => {
                        try {
                                listener(totals || getFallbackTotals());
                        } catch (err) {
                                console.error("Failed to deliver broadcast sync result", err);
                        }
                });
        }
        if (leaderId && leaderId !== tabId) {
                remoteSyncInProgress = false;
        }
}

function handleChannelMessage(event) {
        const message = event?.data;
        if (!message || message.scope !== SYNC_CHANNEL_NAME) {
                return;
        }
        switch (message.type) {
                case "leader-announcement": {
                        const { leaderId } = message;
                        if (leaderId === tabId) {
                                becomeLeader();
                                break;
                        }
                        if (shouldYieldTo(leaderId)) {
                                syncLeaderId = leaderId;
                                isSyncLeader = false;
                                heartbeatLastReceived = Date.now();
                                stopHeartbeat();
                        } else {
                                syncLeaderId = tabId;
                                if (!isSyncLeader) {
                                        becomeLeader();
                                } else {
                                        broadcast({ type: "leader-announcement", leaderId: tabId });
                                }
                        }
                        break;
                }
                case "leader-release": {
                        if (message.leaderId !== tabId && syncLeaderId === message.leaderId) {
                                syncLeaderId = null;
                                heartbeatLastReceived = 0;
                                remoteSyncInProgress = false;
                                scheduleLeaderProbe();
                        }
                        break;
                }
                case "leader-query": {
                        if (isSyncLeader) {
                                broadcast({ type: "leader-announcement", leaderId: tabId });
                        }
                        break;
                }
                case "heartbeat": {
                        if (message.leaderId !== tabId && shouldYieldTo(message.leaderId)) {
                                syncLeaderId = message.leaderId;
                                heartbeatLastReceived = Date.now();
                                isSyncLeader = false;
                                stopHeartbeat();
                        } else if (message.leaderId === tabId) {
                                becomeLeader();
                        }
                        break;
                }
                case "sync-request": {
                        const { requestId, requesterId } = message;
                        if (!requestId) {
                                break;
                        }
                        if (
                                !isSyncLeader &&
                                (!syncLeaderId || isHeartbeatStale() || !shouldYieldTo(syncLeaderId))
                        ) {
                                becomeLeader();
                        }
                        if (isSyncLeader) {
                                outstandingRemoteRequests.set(requestId, requesterId);
                                runLeaderSync();
                        }
                        break;
                }
                case "sync-status": {
                        if (message.leaderId !== tabId) {
                                if (message.leaderId) {
                                        syncLeaderId = message.leaderId;
                                        heartbeatLastReceived = Date.now();
                                }
                                remoteSyncInProgress = message.status === "running";
                                if (!remoteSyncInProgress && message.status === "idle") {
                                        heartbeatLastReceived = Date.now();
                                }
                        }
                        break;
                }
                case "sync-result": {
                        handleSyncResultMessage(message);
                        break;
                }
                default:
                        break;
        }
}

function ensureSyncLeadership(force = false) {
        if (!syncChannel) {
                if (!isSyncLeader) {
                        becomeLeader();
                }
                return true;
        }
        if (isSyncLeader) {
                return true;
        }
        if (!syncLeaderId || force || isHeartbeatStale()) {
                        becomeLeader();
                        return true;
        }
        return false;
}

function getFallbackTotals() {
        return (
                getLastSyncTotals() || {
                        pending: getPendingOfflineInvoiceCount(),
                        synced: 0,
                        drafted: 0,
                }
        );
}

function waitForBroadcastResult() {
        return new Promise((resolve) => {
                let timeoutId = null;
                const listener = (totals) => {
                        if (timeoutId !== null) {
                                clearTimeout(timeoutId);
                        }
                        if (broadcastResultListeners.has(listener)) {
                                broadcastResultListeners.delete(listener);
                        }
                        remoteSyncInProgress = false;
                        resolve(totals);
                };
                broadcastResultListeners.add(listener);
                timeoutId = setTimeout(async () => {
                        if (broadcastResultListeners.has(listener)) {
                                broadcastResultListeners.delete(listener);
                        }
                        if (ensureSyncLeadership(true)) {
                                try {
                                        const totals = await runLeaderSync();
                                        remoteSyncInProgress = false;
                                        resolve(totals);
                                        return;
                                } catch (err) {
                                        console.error("Failed to run fallback sync", err);
                                }
                        }
                        remoteSyncInProgress = false;
                        resolve(getFallbackTotals());
                }, SYNC_REQUEST_TIMEOUT_MS);
        });
}

function requestLeaderSync() {
        const requestId = `${tabId}:${Date.now().toString(36)}:${Math.random().toString(16).slice(2)}`;
        if (!syncChannel) {
                return Promise.resolve(getFallbackTotals());
        }
        return new Promise((resolve) => {
                const entry = {
                        resolve: (totals) => {
                                if (entry.timeoutId) {
                                        clearTimeout(entry.timeoutId);
                                }
                                if (pendingSyncResolvers.has(requestId)) {
                                        pendingSyncResolvers.delete(requestId);
                                }
                                remoteSyncInProgress = false;
                                resolve(totals);
                        },
                        timeoutId: null,
                };
                pendingSyncResolvers.set(requestId, entry);
                remoteSyncInProgress = true;
                broadcast({ type: "sync-request", requestId, requesterId: tabId });
                entry.timeoutId = setTimeout(async () => {
                        if (!pendingSyncResolvers.has(requestId)) {
                                return;
                        }
                        pendingSyncResolvers.delete(requestId);
                        if (ensureSyncLeadership(true)) {
                                try {
                                        const totals = await runLeaderSync();
                                        remoteSyncInProgress = false;
                                        resolve(totals);
                                        return;
                                } catch (err) {
                                        console.error("Failed to run fallback leader sync", err);
                                }
                        }
                        remoteSyncInProgress = false;
                        resolve(getFallbackTotals());
                }, SYNC_REQUEST_TIMEOUT_MS);
        });
}

function broadcastSyncStatus(status) {
        if (!syncChannel) {
                return;
        }
        broadcast({ type: "sync-status", status, leaderId: tabId });
}

function broadcastSyncResult(totals) {
        setLastSyncTotals(totals);
        if (!syncChannel) {
                outstandingRemoteRequests.clear();
                return totals;
        }
        for (const [requestId, requesterId] of outstandingRemoteRequests.entries()) {
                broadcast({ type: "sync-result", requestId, requesterId, totals, leaderId: tabId });
        }
        outstandingRemoteRequests.clear();
        broadcast({ type: "sync-result", requestId: null, requesterId: null, totals, leaderId: tabId });
        return totals;
}

function getOrCreateSyncPromise() {
        if (currentSyncPromise) {
                return currentSyncPromise;
        }
        currentSyncPromise = (async () => {
                broadcastSyncStatus("running");
                try {
                        const totals = await performInvoiceSync();
                        broadcastSyncResult(totals);
                        return totals;
                } finally {
                        broadcastSyncStatus("idle");
                        currentSyncPromise = null;
                }
        })();
        return currentSyncPromise;
}

function runLeaderSync() {
        const promise = getOrCreateSyncPromise();
        if (syncChannel) {
                promise
                        .then((totals) => {
                                if (outstandingRemoteRequests.size) {
                                        broadcastSyncResult(totals);
                                }
                                return totals;
                        })
                        .catch((err) => {
                                console.error("Failed to broadcast sync result", err);
                        });
        }
        return promise;
}

if (syncChannel) {
        syncChannel.addEventListener("message", handleChannelMessage);
        broadcast({ type: "leader-query", from: tabId });
        scheduleLeaderProbe();
}

if (typeof window !== "undefined") {
        window.addEventListener("beforeunload", () => {
                releaseLeadership();
        });
}

export function saveOfflineInvoice(entry) {
	// Validate that invoice has items before saving
	if (!entry.invoice || !Array.isArray(entry.invoice.items) || !entry.invoice.items.length) {
		throw new Error("Cart is empty. Add items before saving.");
	}

	const key = "offline_invoices";
	const entries = memory.offline_invoices;
	// Clone the entry before storing to strip Vue reactivity
	// and other non-serializable properties. IndexedDB only
	// supports structured cloneable data, so reactive proxies
	// cause a DataCloneError without this step.
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (e) {
		console.error("Failed to serialize offline invoice", e);
		throw e;
	}

	entries.push(cleanEntry);
	if (entries.length > MAX_QUEUE_ITEMS) {
		entries.splice(0, entries.length - MAX_QUEUE_ITEMS);
	}
	memory.offline_invoices = entries;
	persist(key, memory.offline_invoices);

	// Update local stock quantities
	if (entry.invoice && entry.invoice.items) {
		updateLocalStock(entry.invoice.items);
	}
}

export function isOffline() {
	// Use cached data when running offline
	if (typeof window === "undefined") {
		// Not in a browser (SSR/Node), assume online (or handle explicitly if needed)
		return memory.manual_offline || false;
	}

	const { protocol, hostname, navigator } = window;
	const online = navigator.onLine;

	const serverOnline = typeof window.serverOnline === "boolean" ? window.serverOnline : true;

	const isIpAddress = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
	const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
	const isDnsName = !isIpAddress && !isLocalhost;

	if (memory.manual_offline) {
		return true;
	}

	if (protocol === "https:" && isDnsName) {
		return !online || !serverOnline;
	}

	return !online || !serverOnline;
}

export function getOfflineInvoices() {
	return memory.offline_invoices;
}

export function clearOfflineInvoices() {
	memory.offline_invoices = [];
	persist("offline_invoices", memory.offline_invoices);
}

export function deleteOfflineInvoice(index) {
	if (Array.isArray(memory.offline_invoices) && index >= 0 && index < memory.offline_invoices.length) {
		memory.offline_invoices.splice(index, 1);
		persist("offline_invoices", memory.offline_invoices);
	}
}

export function getPendingOfflineInvoiceCount() {
	return memory.offline_invoices.length;
}

export function saveOfflinePayment(entry) {
	const key = "offline_payments";
	const entries = memory.offline_payments;
	// Strip down POS Profile to essential fields to avoid
	// serialization errors from complex reactive objects
	if (entry?.args?.payload?.pos_profile) {
		const profile = entry.args.payload.pos_profile;
		entry.args.payload.pos_profile = {
			posa_use_pos_awesome_payments: profile.posa_use_pos_awesome_payments,
			posa_allow_make_new_payments: profile.posa_allow_make_new_payments,
			posa_allow_reconcile_payments: profile.posa_allow_reconcile_payments,
			posa_allow_mpesa_reconcile_payments: profile.posa_allow_mpesa_reconcile_payments,
			posa_force_server_items: profile.posa_force_server_items,
			cost_center: profile.cost_center,
			posa_cash_mode_of_payment: profile.posa_cash_mode_of_payment,
			name: profile.name,
		};
	}
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (e) {
		console.error("Failed to serialize offline payment", e);
		throw e;
	}
	entries.push(cleanEntry);
	if (entries.length > MAX_QUEUE_ITEMS) {
		entries.splice(0, entries.length - MAX_QUEUE_ITEMS);
	}
	memory.offline_payments = entries;
	persist(key, memory.offline_payments);
}

export function getOfflinePayments() {
	return memory.offline_payments;
}

export function clearOfflinePayments() {
	memory.offline_payments = [];
	persist("offline_payments", memory.offline_payments);
}

export function deleteOfflinePayment(index) {
	if (Array.isArray(memory.offline_payments) && index >= 0 && index < memory.offline_payments.length) {
		memory.offline_payments.splice(index, 1);
		persist("offline_payments", memory.offline_payments);
	}
}

export function getPendingOfflinePaymentCount() {
	return memory.offline_payments.length;
}

export function saveOfflineCustomer(entry) {
	const key = "offline_customers";
	const entries = memory.offline_customers;
	// Serialize to avoid storing reactive objects that IndexedDB
	// cannot clone.
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (e) {
		console.error("Failed to serialize offline customer", e);
		throw e;
	}
	entries.push(cleanEntry);
	if (entries.length > MAX_QUEUE_ITEMS) {
		entries.splice(0, entries.length - MAX_QUEUE_ITEMS);
	}
	memory.offline_customers = entries;
	persist(key, memory.offline_customers);
}

export function updateOfflineInvoicesCustomer(oldName, newName) {
	let updated = false;
	const invoices = memory.offline_invoices || [];
	invoices.forEach((inv) => {
		if (inv.invoice && inv.invoice.customer === oldName) {
			inv.invoice.customer = newName;
			if (inv.invoice.customer_name) {
				inv.invoice.customer_name = newName;
			}
			updated = true;
		}
	});
	if (updated) {
		memory.offline_invoices = invoices;
		persist("offline_invoices", memory.offline_invoices);
	}
}

export function getOfflineCustomers() {
	return memory.offline_customers;
}

export function clearOfflineCustomers() {
	memory.offline_customers = [];
	persist("offline_customers", memory.offline_customers);
}

// Add sync function to clear local cache when invoices are successfully synced
export async function syncOfflineInvoices() {
        if (ensureSyncLeadership()) {
                return await runLeaderSync();
        }

        if (!syncChannel) {
                return await performInvoiceSync();
        }

        if (remoteSyncInProgress) {
                return await waitForBroadcastResult();
        }

        return await requestLeaderSync();
}

async function performInvoiceSync() {
        if (invoiceSyncInProgress) {
                return { pending: getPendingOfflineInvoiceCount(), synced: 0, drafted: 0 };
        }
        invoiceSyncInProgress = true;
        try {
                // Ensure any offline customers are synced first so that invoices
                // referencing them do not fail during submission
                await syncOfflineCustomers();

                const invoices = getOfflineInvoices();
                if (!invoices.length) {
                        // No invoices to sync; clear last totals to avoid repeated messages
                        const totals = { pending: 0, synced: 0, drafted: 0 };
                        setLastSyncTotals(totals);
                        return totals;
                }
                if (isOffline()) {
                        // When offline just return the pending count without attempting a sync
                        return { pending: invoices.length, synced: 0, drafted: 0 };
                }

                const failures = [];
                let synced = 0;
                let drafted = 0;

                for (const inv of invoices) {
                        try {
                                await frappe.call({
                                        method: "posawesome.posawesome.api.invoices.submit_invoice",
                                        args: {
                                                invoice: inv.invoice,
                                                data: inv.data,
                                        },
                                });
                                synced++;
                        } catch (error) {
                                console.error("Failed to submit invoice, saving as draft", error);
                                try {
                                        await frappe.call({
                                                method: "posawesome.posawesome.api.invoices.update_invoice",
                                                args: { data: inv.invoice },
                                        });
                                        drafted += 1;
                                } catch (draftErr) {
                                        console.error("Failed to save invoice as draft", draftErr);
                                        failures.push(inv);
                                }
                        }
                }

                // Reset saved invoices and totals after successful sync
                if (synced > 0) {
                        resetOfflineState();
                }

                const pendingLeft = failures.length;

                if (pendingLeft) {
                        memory.offline_invoices = failures;
                        persist("offline_invoices", memory.offline_invoices);
                } else {
                        clearOfflineInvoices();
                        if (synced > 0 && drafted === 0) {
                                reduceCacheUsage();
                        }
                }

                const totals = { pending: pendingLeft, synced, drafted };
                if (pendingLeft || drafted) {
                        // Persist totals only if there are invoices still pending or drafted
                        setLastSyncTotals(totals);
                } else {
                        // Clear totals so success message only shows once
                        setLastSyncTotals({ pending: 0, synced: 0, drafted: 0 });
                }
                return totals;
        } finally {
                invoiceSyncInProgress = false;
        }
}

export async function syncOfflineCustomers() {
	const customers = getOfflineCustomers();
	if (!customers.length) {
		return { pending: 0, synced: 0 };
	}
	if (isOffline()) {
		return { pending: customers.length, synced: 0 };
	}

	const failures = [];
	let synced = 0;

	for (const cust of customers) {
		try {
			const result = await frappe.call({
				method: "posawesome.posawesome.api.customers.create_customer",
				args: cust.args,
			});
			synced++;
			if (
				result &&
				result.message &&
				result.message.name &&
				result.message.name !== cust.args.customer_name
			) {
				updateOfflineInvoicesCustomer(cust.args.customer_name, result.message.name);
			}
		} catch (error) {
			console.error("Failed to create customer", error);
			failures.push(cust);
		}
	}

	if (failures.length) {
		memory.offline_customers = failures;
		persist("offline_customers", memory.offline_customers);
	} else {
		clearOfflineCustomers();
	}

	return { pending: failures.length, synced };
}

export async function syncOfflinePayments() {
	await syncOfflineCustomers();

	const payments = getOfflinePayments();
	if (!payments.length) {
		return { pending: 0, synced: 0 };
	}
	if (isOffline()) {
		return { pending: payments.length, synced: 0 };
	}

	const failures = [];
	let synced = 0;

	for (const pay of payments) {
		try {
			await frappe.call({
				method: "posawesome.posawesome.api.payment_entry.process_pos_payment",
				args: pay.args,
			});
			synced++;
		} catch (error) {
			console.error("Failed to submit payment", error);
			failures.push(pay);
		}
	}

	if (failures.length) {
		memory.offline_payments = failures;
		persist("offline_payments", memory.offline_payments);
	} else {
		clearOfflinePayments();
	}

	return { pending: failures.length, synced };
}
