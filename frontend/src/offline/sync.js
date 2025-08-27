/* global frappe */
import { memory, resetOfflineState, setLastSyncTotals, MAX_QUEUE_ITEMS, reduceCacheUsage } from "./cache.js";
import { persist } from "./core.js";
import { updateLocalStock } from "./stock.js";

// Flag to avoid concurrent invoice syncs which can cause duplicate submissions
let invoiceSyncInProgress = false;

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
	// Prevent concurrent syncs which can lead to duplicate submissions
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
