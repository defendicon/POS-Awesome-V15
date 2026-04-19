import { isOffline } from "./db";
import { syncOfflineCustomers } from "./customers";
import {
	claimRetryableQueueEntries,
	clearWriteQueueEntries,
	deleteWriteQueueEntryByIndex,
	enqueueWriteQueueEntry,
	getQueuedPayloadCount,
	getQueuedPayloadSnapshots,
	markWriteQueueEntryFailed,
	markWriteQueueEntrySynced,
	type OfflineEntityType,
} from "./writeQueue";

type AnyRecord = Record<string, any>;

const PAYMENT_ENTITY: OfflineEntityType = "payment";

function prepareOfflinePaymentEntry(entry: AnyRecord) {
	const nextEntry = JSON.parse(JSON.stringify(entry));

	if (nextEntry?.args?.payload?.pos_profile) {
		const profile = nextEntry.args.payload.pos_profile;
		nextEntry.args.payload.pos_profile = {
			posa_use_pos_awesome_payments:
				profile.posa_use_pos_awesome_payments,
			posa_allow_make_new_payments: profile.posa_allow_make_new_payments,
			posa_allow_reconcile_payments:
				profile.posa_allow_reconcile_payments,
			posa_allow_mpesa_reconcile_payments:
				profile.posa_allow_mpesa_reconcile_payments,
			cost_center: profile.cost_center,
			posa_cash_mode_of_payment: profile.posa_cash_mode_of_payment,
			name: profile.name,
		};
	}

	return nextEntry;
}

export async function saveOfflinePayment(entry: AnyRecord) {
	try {
		const cleanEntry = prepareOfflinePaymentEntry(entry);
		return await enqueueWriteQueueEntry(PAYMENT_ENTITY, cleanEntry);
	} catch (error) {
		console.error("Failed to serialize offline payment", error);
		throw error;
	}
}

export function getOfflinePayments() {
	return getQueuedPayloadSnapshots(PAYMENT_ENTITY);
}

export async function clearOfflinePayments() {
	await clearWriteQueueEntries(PAYMENT_ENTITY);
}

export async function deleteOfflinePayment(index: number) {
	await deleteWriteQueueEntryByIndex(PAYMENT_ENTITY, index);
}

export function getPendingOfflinePaymentCount() {
	return getQueuedPayloadCount(PAYMENT_ENTITY);
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

	const claimedEntries = await claimRetryableQueueEntries(PAYMENT_ENTITY);
	if (!claimedEntries.length) {
		return { pending: getPendingOfflinePaymentCount(), synced: 0 };
	}

	let synced = 0;

	for (const entry of claimedEntries) {
		try {
			await frappe.call({
				method: "posawesome.posawesome.api.payment_entry.process_pos_payment",
				args: entry.payload.args,
			});
			synced += 1;
			await markWriteQueueEntrySynced(
				PAYMENT_ENTITY,
				Number(entry.queue_id),
				entry.last_attempt_at,
			);
		} catch (error) {
			console.error("Failed to submit payment", error);
			await markWriteQueueEntryFailed(
				PAYMENT_ENTITY,
				Number(entry.queue_id),
				error,
				entry.last_attempt_at,
			);
		}
	}

	return { pending: getPendingOfflinePaymentCount(), synced };
}
