import { memory, persist, isOffline } from "./db";

type AnyRecord = Record<string, any>;

const CREATE_EXPENSE_METHOD = "posawesome.posawesome.api.cash_movement.service.create_pos_expense";
const CREATE_DEPOSIT_METHOD = "posawesome.posawesome.api.cash_movement.service.create_cash_deposit";

export function saveOfflineCashMovement(entry: AnyRecord) {
	const key = "offline_cash_movements";
	const entries = memory.offline_cash_movements || [];
	let cleanEntry;
	try {
		cleanEntry = JSON.parse(JSON.stringify(entry));
	} catch (e) {
		console.error("Failed to serialize offline cash movement", e);
		throw e;
	}
	entries.push(cleanEntry);
	memory.offline_cash_movements = entries;
	persist(key);
}

export function getOfflineCashMovements() {
	return memory.offline_cash_movements || [];
}

export function clearOfflineCashMovements() {
	memory.offline_cash_movements = [];
	persist("offline_cash_movements");
}

export function deleteOfflineCashMovement(index: number) {
	if (
		Array.isArray(memory.offline_cash_movements) &&
		index >= 0 &&
		index < memory.offline_cash_movements.length
	) {
		memory.offline_cash_movements.splice(index, 1);
		persist("offline_cash_movements");
	}
}

export function getPendingOfflineCashMovementCount() {
	return (memory.offline_cash_movements || []).length;
}

function resolveMethod(entry: AnyRecord) {
	if (entry?.method) {
		return entry.method;
	}
	const movementType = String(
		entry?.payload?.movement_type || entry?.args?.payload?.movement_type || "",
	).toLowerCase();
	return movementType === "deposit" ? CREATE_DEPOSIT_METHOD : CREATE_EXPENSE_METHOD;
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

	const failures: AnyRecord[] = [];
	let synced = 0;

	for (const movement of queue) {
		try {
			await frappe.call({
				method: resolveMethod(movement),
				args: resolveArgs(movement),
			});
			synced++;
		} catch (error) {
			console.error("Failed to sync offline cash movement", error);
			failures.push(movement);
		}
	}

	if (failures.length) {
		memory.offline_cash_movements = failures;
		persist("offline_cash_movements");
	} else {
		clearOfflineCashMovements();
	}

	return { pending: failures.length, synced };
}
