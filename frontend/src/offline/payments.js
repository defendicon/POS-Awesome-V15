import { memory, persist, isOffline } from "./db.js";
import { syncOfflineCustomers } from "./customers.js";

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
	memory.offline_payments = entries;
	persist(key);
}

export function getOfflinePayments() {
	return memory.offline_payments;
}

export function clearOfflinePayments() {
	memory.offline_payments = [];
	persist("offline_payments");
}

export function deleteOfflinePayment(index) {
	if (Array.isArray(memory.offline_payments) && index >= 0 && index < memory.offline_payments.length) {
		memory.offline_payments.splice(index, 1);
		persist("offline_payments");
	}
}

export function getPendingOfflinePaymentCount() {
	return memory.offline_payments.length;
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
		persist("offline_payments");
	} else {
		clearOfflinePayments();
	}

	return { pending: failures.length, synced };
}
