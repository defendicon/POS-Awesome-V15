import {
	getBootstrapSnapshot,
	setBootstrapSnapshot,
} from "../../cache";
import { refreshBootstrapSnapshotFromCaches } from "../../bootstrapSnapshot";
import { setSyncResourceState } from "../syncState";
import type {
	SyncResourceCompleteness,
	SyncLifecycleState,
	SyncResourceDiagnostics,
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
	next_cursor?: string | null;
	has_more?: boolean;
	total_count?: number | null;
	sync_mode?: "full" | "delta" | null;
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
	diagnostics?: SyncResourceDiagnostics | null;
	lastSyncedAt?: string | null;
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
	diagnostics?: SyncResourceDiagnostics | null;
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

export function resolveCursor(
	response: SyncResponse,
	fallback: string | null | undefined = null,
) {
	return response?.next_cursor || fallback || null;
}

export function countMissingRecords(
	serverCount: number | null | undefined,
	localCount: number | null | undefined,
) {
	const expected = Number(serverCount);
	const actual = Number(localCount);
	if (!Number.isFinite(expected) || expected < 0) {
		return null;
	}
	if (!Number.isFinite(actual) || actual < 0) {
		return expected;
	}
	return Math.max(0, expected - actual);
}

export function buildResourceDiagnostics(input: {
	completeness: SyncResourceCompleteness;
	mode?: "full" | "delta" | "verification" | null;
	currentAction?: string | null;
	detail?: string | null;
	localCount?: number | null;
	serverCount?: number | null;
	pagesFetched?: number | null;
	batchCount?: number | null;
	hasMore?: boolean;
	nextCursor?: string | null;
	lastVerifiedAt?: string | null;
	lastRepairAt?: string | null;
	lastCompletedAt?: string | null;
	lastRecoveryReason?: string | null;
	repairRecommended?: boolean;
	limitedReason?: string | null;
	scopeKey?: string | null;
}) {
	const localCount = Number.isFinite(Number(input.localCount))
		? Number(input.localCount)
		: null;
	const serverCount = Number.isFinite(Number(input.serverCount))
		? Number(input.serverCount)
		: null;
	return {
		completeness: input.completeness,
		mode: input.mode || null,
		currentAction: input.currentAction || null,
		detail: input.detail || null,
		localCount,
		serverCount,
		missingCount: countMissingRecords(serverCount, localCount),
		pagesFetched: Number.isFinite(Number(input.pagesFetched))
			? Number(input.pagesFetched)
			: null,
		batchCount: Number.isFinite(Number(input.batchCount))
			? Number(input.batchCount)
			: null,
		hasMore: !!input.hasMore,
		nextCursor: input.nextCursor || null,
		lastVerifiedAt: input.lastVerifiedAt || null,
		lastRepairAt: input.lastRepairAt || null,
		lastCompletedAt: input.lastCompletedAt || null,
		lastRecoveryReason: input.lastRecoveryReason || null,
		repairRecommended:
			typeof input.repairRecommended === "boolean"
				? input.repairRecommended
				: false,
		limitedReason: input.limitedReason || null,
		scopeKey: input.scopeKey || null,
	} satisfies SyncResourceDiagnostics;
}

export async function persistResourceSyncState({
	resourceId,
	status,
	posProfile,
	response,
	watermark,
	error = null,
	diagnostics = null,
	lastSyncedAt = null,
}: PersistSyncStateArgs) {
	await setSyncResourceState({
		resourceId,
		status,
		lastSyncedAt: lastSyncedAt || new Date().toISOString(),
		watermark: resolveWatermark(response, watermark),
		lastSuccessHash: null,
		lastError: error,
		consecutiveFailures: status === "error" ? 1 : 0,
		scopeSignature: buildScopeSignature(posProfile),
		schemaVersion: response?.schema_version || null,
		diagnostics,
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
		diagnostics: null,
	};
}
