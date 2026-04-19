import {
	getBootstrapSnapshot,
	setBootstrapSnapshot,
} from "../../cache";
import { refreshBootstrapSnapshotFromCaches } from "../../bootstrapSnapshot";
import { setSyncResourceState } from "../syncState";
import type {
	SyncLifecycleState,
	SyncResourceId,
} from "../types";

export type SyncScopedProfile = {
	name: string;
	company?: string | null;
	warehouse?: string | null;
	modified?: string | null;
	payments?: unknown[] | null;
};

export type SyncChangeRecord<T = any> = {
	key: string;
	modified?: string | null;
	data?: T;
};

export type SyncDeleteRecord = {
	key: string;
};

export type SyncResponse<T = any> = {
	changes?: SyncChangeRecord<T>[];
	deleted?: SyncDeleteRecord[];
	next_watermark?: string | null;
	has_more?: boolean;
	schema_version?: string | null;
	full_resync_required?: boolean;
};

type PersistSyncStateArgs = {
	resourceId: SyncResourceId;
	status: SyncLifecycleState;
	posProfile: SyncScopedProfile;
	response: SyncResponse;
	watermark?: string | null;
	error?: string | null;
};

type RefreshSnapshotArgs = {
	posProfile: SyncScopedProfile;
	cacheState?: Record<string, any>;
};

export type ResourceSyncResult = {
	resourceId: SyncResourceId;
	status: SyncLifecycleState;
	watermark: string | null;
	schemaVersion: string | null;
	response: SyncResponse;
};

export function buildScopeSignature(posProfile: SyncScopedProfile) {
	return JSON.stringify({
		profile: posProfile?.name || null,
		company: posProfile?.company || null,
		warehouse: posProfile?.warehouse || null,
	});
}

export function resolveWatermark(
	response: SyncResponse,
	fallback: string | null | undefined = null,
) {
	return response?.next_watermark || fallback || null;
}

export async function persistResourceSyncState({
	resourceId,
	status,
	posProfile,
	response,
	watermark,
	error = null,
}: PersistSyncStateArgs) {
	await setSyncResourceState({
		resourceId,
		status,
		lastSyncedAt: new Date().toISOString(),
		watermark: resolveWatermark(response, watermark),
		lastSuccessHash: null,
		lastError: error,
		consecutiveFailures: status === "error" ? 1 : 0,
		scopeSignature: buildScopeSignature(posProfile),
		schemaVersion: response?.schema_version || null,
	});
}

export function refreshSnapshotFromSync({
	posProfile,
	cacheState = {},
}: RefreshSnapshotArgs) {
	const nextSnapshot = refreshBootstrapSnapshotFromCaches({
		currentSnapshot: getBootstrapSnapshot(),
		registerData: {
			pos_profile: {
				name: posProfile?.name || null,
				modified: posProfile?.modified || null,
			},
		},
		cacheState: ({
			...cacheState,
			profileName: posProfile?.name || null,
			paymentMethods: Array.isArray(posProfile?.payments)
				? posProfile.payments
				: cacheState?.paymentMethods,
		} as any),
	});
	setBootstrapSnapshot(nextSnapshot);
	return nextSnapshot;
}

export function buildResourceSyncResult(
	resourceId: SyncResourceId,
	status: SyncLifecycleState,
	response: SyncResponse,
	watermark?: string | null,
): ResourceSyncResult {
	return {
		resourceId,
		status,
		watermark: resolveWatermark(response, watermark),
		schemaVersion: response?.schema_version || null,
		response,
	};
}
