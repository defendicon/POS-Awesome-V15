import { isOffline } from "./db";
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

const CASH_MOVEMENT_ENTITY: OfflineEntityType = "cash_movement";

const CREATE_EXPENSE_METHOD =
	"posawesome.posawesome.api.cash_movement.service.create_pos_expense";
const CREATE_DEPOSIT_METHOD =
	"posawesome.posawesome.api.cash_movement.service.create_cash_deposit";

export async function saveOfflineCashMovement(entry: AnyRecord) {
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (error) {
		console.error("Failed to serialize offline cash movement", error);
		throw error;
	}

	return enqueueWriteQueueEntry(CASH_MOVEMENT_ENTITY, cleanEntry);
}

export function getOfflineCashMovements() {
	return getQueuedPayloadSnapshots(CASH_MOVEMENT_ENTITY);
}

export async function clearOfflineCashMovements() {
	await clearWriteQueueEntries(CASH_MOVEMENT_ENTITY);
}

export async function deleteOfflineCashMovement(index: number) {
	await deleteWriteQueueEntryByIndex(CASH_MOVEMENT_ENTITY, index);
}

export function getPendingOfflineCashMovementCount() {
	return getQueuedPayloadCount(CASH_MOVEMENT_ENTITY);
}

function resolveMethod(entry: AnyRecord) {
	if (entry?.method) {
		return entry.method;
	}
	const movementType = String(
		entry?.payload?.movement_type || entry?.args?.payload?.movement_type || "",
	).toLowerCase();
	return movementType === "deposit"
		? CREATE_DEPOSIT_METHOD
		: CREATE_EXPENSE_METHOD;
}

function resolveArgs(entry: AnyRecord) {
	if (entry?.args?.payload) {
		return entry.args;
	}
	return {
		payload: entry.payload || {},
	};
}

export async function syncOfflineCashMovements() {
	const queue = getOfflineCashMovements();
	if (!queue.length) {
		return { pending: 0, synced: 0 };
	}
	if (isOffline()) {
		return { pending: queue.length, synced: 0 };
	}

	const claimedEntries = await claimRetryableQueueEntries(CASH_MOVEMENT_ENTITY);
	if (!claimedEntries.length) {
		return { pending: getPendingOfflineCashMovementCount(), synced: 0 };
	}

	let synced = 0;

	for (const entry of claimedEntries) {
		try {
			await frappe.call({
				method: resolveMethod(entry.payload),
				args: resolveArgs(entry.payload),
			});
			synced += 1;
			await markWriteQueueEntrySynced(
				CASH_MOVEMENT_ENTITY,
				Number(entry.queue_id),
				entry.last_attempt_at,
			);
		} catch (error) {
			console.error("Failed to sync offline cash movement", error);
			await markWriteQueueEntryFailed(
				CASH_MOVEMENT_ENTITY,
				Number(entry.queue_id),
				error,
				entry.last_attempt_at,
			);
		}
	}

	return { pending: getPendingOfflineCashMovementCount(), synced };
}
