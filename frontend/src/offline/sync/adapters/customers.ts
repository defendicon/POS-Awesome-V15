import {
	clearCustomerStorage,
	getCustomerStorageCount,
	setCustomersLastSync,
} from "../../cache";
import {
	deleteCustomerStorageByNames,
	setCustomerStorage,
} from "../../customers";
import { getSyncResourceState, setSyncResourceState } from "../syncState";
import {
	buildResourceDiagnostics,
	buildResourceSyncResult,
	buildScopeSignature,
	persistResourceSyncState,
	refreshSnapshotFromSync,
	resolveCursor,
	resolveWatermark,
	type ResourceSyncResult,
	type SyncResponse,
	type SyncScopedProfile,
} from "./common";
import type { SyncResourceCompleteness } from "../types";

type CustomersFetcher = (args: {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
	cursor?: string | null;
	schemaVersion?: string | null;
}) => Promise<SyncResponse>;

type CustomersSyncArgs = {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
	schemaVersion?: string | null;
	fetcher: CustomersFetcher;
};

function extractChangedCustomers(response: SyncResponse) {
	return (response?.changes || [])
		.map((entry) => entry?.data)
		.filter((row): row is Record<string, any> => !!row?.name);
}

function extractDeletedCustomerNames(response: SyncResponse) {
	return (response?.deleted || [])
		.map((entry) => {
			const key = String(entry?.key || "");
			return key.startsWith("customer::")
				? key.slice("customer::".length)
				: "";
		})
		.filter(Boolean);
}

function buildCustomersDiagnostics(args: {
	mode: "full" | "delta";
	action: string;
	localCount: number;
	serverCount?: number | null;
	pagesFetched: number;
	batchCount: number;
	hasMore: boolean;
	nextCursor?: string | null;
	completeness: SyncResourceCompleteness;
	lastRepairAt?: string | null;
	lastCompletedAt?: string | null;
	lastVerifiedAt?: string | null;
	lastRecoveryReason?: string | null;
	limitedReason?: string | null;
	scopeKey?: string | null;
}) {
	return buildResourceDiagnostics({
		completeness: args.completeness,
		mode: args.mode,
		currentAction: args.action,
		localCount: args.localCount,
		serverCount: args.serverCount ?? null,
		pagesFetched: args.pagesFetched,
		batchCount: args.batchCount,
		hasMore: args.hasMore,
		nextCursor: args.nextCursor || null,
		lastRepairAt: args.lastRepairAt || null,
		lastCompletedAt: args.lastCompletedAt || null,
		lastVerifiedAt: args.lastVerifiedAt || null,
		lastRecoveryReason: args.lastRecoveryReason || null,
		repairRecommended:
			args.completeness === "incomplete" || args.completeness === "limited",
		limitedReason: args.limitedReason || null,
		scopeKey: args.scopeKey || null,
		detail:
			args.serverCount && args.localCount >= 0
				? `${args.localCount}/${args.serverCount} customers cached`
				: `${args.localCount} customers cached`,
	});
}

async function hasCustomerScopeChanged(posProfile: SyncScopedProfile) {
	const nextScopeSignature = buildScopeSignature(posProfile);
	const currentState = await getSyncResourceState("customers");
	return !!(
		currentState?.scopeSignature &&
		currentState.scopeSignature !== nextScopeSignature
	);
}

async function writeInterimCustomerState(args: {
	posProfile: SyncScopedProfile;
	status: "repairing" | "partial" | "limited";
	action: string;
	localCount: number;
	serverCount?: number | null;
	pagesFetched: number;
	batchCount: number;
	hasMore: boolean;
	nextCursor?: string | null;
	schemaVersion?: string | null;
	lastRecoveryReason?: string | null;
	limitedReason?: string | null;
}) {
	const diagnostics = buildCustomersDiagnostics({
		mode: "full",
		action: args.action,
		localCount: args.localCount,
		serverCount: args.serverCount ?? null,
		pagesFetched: args.pagesFetched,
		batchCount: args.batchCount,
		hasMore: args.hasMore,
		nextCursor: args.nextCursor || null,
		completeness:
			args.status === "limited"
				? "limited"
				: args.hasMore
					? "incomplete"
					: "complete",
		lastRepairAt:
			args.status === "repairing" || args.status === "partial"
				? new Date().toISOString()
				: null,
		lastRecoveryReason: args.lastRecoveryReason || null,
		limitedReason: args.limitedReason || null,
		scopeKey: args.posProfile?.name || null,
	});

	await setSyncResourceState({
		resourceId: "customers",
		status: args.status,
		lastSyncedAt: null,
		watermark: null,
		lastSuccessHash: null,
		lastError: null,
		consecutiveFailures: 0,
		lastAttemptAt: new Date().toISOString(),
		nextRetryAt: null,
		cooldownMs: null,
		lastTrigger: null,
		scopeSignature: buildScopeSignature(args.posProfile),
		schemaVersion: args.schemaVersion || null,
		diagnostics,
	});
}

export async function syncCustomersResource(
	args: CustomersSyncArgs,
): Promise<ResourceSyncResult> {
	const scopeChanged = await hasCustomerScopeChanged(args.posProfile);
	const existingState = await getSyncResourceState("customers");
	const existingDiagnostics = existingState?.diagnostics || null;
	const shouldContinueRepair = !!existingDiagnostics?.nextCursor;
	const shouldStartFullRepair =
		scopeChanged ||
		shouldContinueRepair ||
		existingDiagnostics?.completeness !== "complete";

	if (shouldStartFullRepair && !shouldContinueRepair) {
		await clearCustomerStorage();
	}

	let effectiveWatermark =
		shouldStartFullRepair || scopeChanged ? null : args.watermark;
	let cursor = shouldContinueRepair ? existingDiagnostics?.nextCursor || null : null;
	let pagesFetched = 0;
	let serverCount =
		Number.isFinite(Number(existingDiagnostics?.serverCount))
			? Number(existingDiagnostics?.serverCount)
			: null;
	let lastResponse: SyncResponse = {
		changes: [],
		deleted: [],
		next_watermark: effectiveWatermark,
		has_more: false,
		schema_version: args.schemaVersion || null,
	};
	let lastWatermark = effectiveWatermark;
	let repairReason = shouldContinueRepair
		? "continuing_incomplete_full_sync"
		: scopeChanged
			? "scope_changed"
			: existingDiagnostics?.completeness !== "complete"
				? "verification_required"
				: null;

	if (!shouldStartFullRepair) {
		const response = await args.fetcher({
			posProfile: args.posProfile,
			watermark: effectiveWatermark,
			cursor: null,
			schemaVersion: args.schemaVersion,
		});

		if (response?.full_resync_required) {
			const localCount = await getCustomerStorageCount();
			const diagnostics = buildCustomersDiagnostics({
				mode: "full",
				action: "Rebuild required",
				localCount,
				serverCount,
				pagesFetched: 0,
				batchCount: 0,
				hasMore: false,
				nextCursor: null,
				completeness: "limited",
				lastRecoveryReason: "schema_mismatch",
				limitedReason: "schema_mismatch",
				scopeKey: args.posProfile?.name || null,
			});
			await persistResourceSyncState({
				resourceId: "customers",
				status: "limited",
				posProfile: args.posProfile,
				response,
				watermark: effectiveWatermark,
				diagnostics,
			});
			return {
				...buildResourceSyncResult(
					"customers",
					"limited",
					response,
					effectiveWatermark,
				),
				diagnostics,
			};
		}

		if (!response?.has_more) {
			const changedCustomers = extractChangedCustomers(response);
			if (changedCustomers.length) {
				await setCustomerStorage(changedCustomers);
			}

			const deletedCustomerNames = extractDeletedCustomerNames(response);
			if (deletedCustomerNames.length) {
				await deleteCustomerStorageByNames(deletedCustomerNames);
			}

			const customersCount = await getCustomerStorageCount();
			const diagnostics = buildCustomersDiagnostics({
				mode: "delta",
				action: "Ready",
				localCount: customersCount,
				serverCount: existingDiagnostics?.serverCount ?? null,
				pagesFetched: 1,
				batchCount: changedCustomers.length,
				hasMore: false,
				nextCursor: null,
				completeness: existingDiagnostics?.completeness || "complete",
				lastVerifiedAt:
					existingDiagnostics?.lastVerifiedAt ||
					existingDiagnostics?.lastCompletedAt ||
					null,
				lastCompletedAt:
					existingDiagnostics?.lastCompletedAt || new Date().toISOString(),
				scopeKey: args.posProfile?.name || null,
			});
			refreshSnapshotFromSync({
				posProfile: args.posProfile,
				cacheState: {
					customersCount,
					customersState: diagnostics,
				},
			});
			lastWatermark = resolveWatermark(response, effectiveWatermark);
			if (lastWatermark) {
				setCustomersLastSync(lastWatermark);
			}
			await persistResourceSyncState({
				resourceId: "customers",
				status: "fresh",
				posProfile: args.posProfile,
				response,
				watermark: effectiveWatermark,
				diagnostics,
			});
			return {
				...buildResourceSyncResult(
					"customers",
					"fresh",
					response,
					effectiveWatermark,
				),
				diagnostics,
			};
		}

		repairReason = "delta_batch_limited";
		await clearCustomerStorage();
	}

	while (true) {
		const response = await args.fetcher({
			posProfile: args.posProfile,
			watermark: null,
			cursor,
			schemaVersion: args.schemaVersion,
		});
		lastResponse = response;
		pagesFetched += 1;
		serverCount =
			Number.isFinite(Number(response?.total_count))
				? Number(response.total_count)
				: serverCount;

		if (response?.full_resync_required) {
			const localCount = await getCustomerStorageCount();
			const diagnostics = buildCustomersDiagnostics({
				mode: "full",
				action: "Rebuild required",
				localCount,
				serverCount,
				pagesFetched,
				batchCount: 0,
				hasMore: false,
				nextCursor: null,
				completeness: "limited",
				lastRecoveryReason: repairReason,
				limitedReason: "schema_mismatch",
				scopeKey: args.posProfile?.name || null,
			});
			await persistResourceSyncState({
				resourceId: "customers",
				status: "limited",
				posProfile: args.posProfile,
				response,
				watermark: null,
				diagnostics,
			});
			return {
				...buildResourceSyncResult("customers", "limited", response, null),
				diagnostics,
			};
		}

		const changedCustomers = extractChangedCustomers(response);
		if (changedCustomers.length) {
			await setCustomerStorage(changedCustomers);
		}

		const deletedCustomerNames = extractDeletedCustomerNames(response);
		if (deletedCustomerNames.length) {
			await deleteCustomerStorageByNames(deletedCustomerNames);
		}

		const nextCursor = resolveCursor(response, null);
		const localCount = await getCustomerStorageCount();
		await writeInterimCustomerState({
			posProfile: args.posProfile,
			status: response?.has_more ? "repairing" : "partial",
			action:
				response?.has_more
					? "Repairing missing customers"
					: "Verifying customers",
			localCount,
			serverCount,
			pagesFetched,
			batchCount: changedCustomers.length,
			hasMore: !!response?.has_more,
			nextCursor,
			schemaVersion: response?.schema_version || args.schemaVersion || null,
			lastRecoveryReason: repairReason,
		});

		lastWatermark = resolveWatermark(response, lastWatermark);
		cursor = nextCursor;

		if (!response?.has_more) {
			const completedAt = new Date().toISOString();
			const diagnostics = buildCustomersDiagnostics({
				mode: "full",
				action: "Ready",
				localCount,
				serverCount,
				pagesFetched,
				batchCount: changedCustomers.length,
				hasMore: false,
				nextCursor: null,
				completeness:
					serverCount !== null && localCount !== serverCount
						? "incomplete"
						: "complete",
				lastRepairAt: repairReason ? completedAt : existingDiagnostics?.lastRepairAt,
				lastCompletedAt: completedAt,
				lastVerifiedAt: completedAt,
				lastRecoveryReason: repairReason,
				scopeKey: args.posProfile?.name || null,
			});

			refreshSnapshotFromSync({
				posProfile: args.posProfile,
				cacheState: {
					customersCount: localCount,
					customersState: diagnostics,
				},
			});

			if (lastWatermark) {
				setCustomersLastSync(lastWatermark);
			}

			const finalStatus =
				diagnostics.completeness === "complete" ? "fresh" : "limited";
			await persistResourceSyncState({
				resourceId: "customers",
				status: finalStatus,
				posProfile: args.posProfile,
				response: {
					...response,
					next_watermark: lastWatermark,
				},
				watermark: null,
				diagnostics,
			});
			return {
				...buildResourceSyncResult("customers", finalStatus, response, null),
				diagnostics,
			};
		}
	}
}
