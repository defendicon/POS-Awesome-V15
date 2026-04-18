import { db } from "../db";
import type { SyncResourceId, SyncResourceState } from "./types";

const SYNC_STATE_KEY_PREFIX = "posa_sync_state::";

type StoredSyncStateRow = {
	key: string;
	value: SyncResourceState;
};

export function buildSyncStateStorageKey(resourceId: SyncResourceId) {
	return `${SYNC_STATE_KEY_PREFIX}${resourceId}`;
}

function cloneSyncState(
	state: SyncResourceState | null | undefined,
): SyncResourceState | null {
	if (!state) {
		return null;
	}
	return JSON.parse(JSON.stringify(state));
}

function readLocalSyncState(
	resourceId: SyncResourceId,
): SyncResourceState | null {
	if (typeof localStorage === "undefined") {
		return null;
	}
	const rawValue = localStorage.getItem(buildSyncStateStorageKey(resourceId));
	if (!rawValue) {
		return null;
	}
	try {
		return JSON.parse(rawValue);
	} catch {
		return null;
	}
}

export async function setSyncResourceState(state: SyncResourceState) {
	const clonedState = cloneSyncState(state);
	if (!clonedState) {
		return;
	}
	const key = buildSyncStateStorageKey(clonedState.resourceId);
	await db.table("sync_state").put({
		key,
		value: clonedState,
	});
}

export async function getSyncResourceState(
	resourceId: SyncResourceId,
): Promise<SyncResourceState | null> {
	const key = buildSyncStateStorageKey(resourceId);
	const storedRow = (await db
		.table("sync_state")
		.get(key)) as StoredSyncStateRow | undefined;
	if (storedRow?.value) {
		return cloneSyncState(storedRow.value);
	}
	return cloneSyncState(readLocalSyncState(resourceId));
}

export async function listSyncResourceStates(): Promise<SyncResourceState[]> {
	const rows = ((await db.table("sync_state").toArray()) ||
		[]) as StoredSyncStateRow[];
	return rows
		.map((row) => cloneSyncState(row?.value))
		.filter((row): row is SyncResourceState => !!row?.resourceId)
		.sort((left, right) => left.resourceId.localeCompare(right.resourceId));
}

export async function clearSyncResourceState(resourceId: SyncResourceId) {
	const key = buildSyncStateStorageKey(resourceId);
	await db.table("sync_state").delete(key);
}
