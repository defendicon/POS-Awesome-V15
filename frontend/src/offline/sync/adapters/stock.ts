import {
	clearLocalStockCache,
	removeLocalStockEntries,
	setStockCacheReady,
	updateLocalStockCache,
} from "../../stock";
import { getSyncResourceState } from "../syncState";
import {
	buildResourceDiagnostics,
	buildResourceSyncResult,
	buildScopeSignature,
	persistResourceSyncState,
	refreshSnapshotFromSync,
	resolveCursor,
	type ResourceSyncResult,
	type SyncResponse,
	type SyncScopedProfile,
} from "./common";

type StockFetcher = (args: {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
	cursor?: string | null;
	schemaVersion?: string | null;
}) => Promise<SyncResponse>;

type StockSyncArgs = {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
	schemaVersion?: string | null;
	fetcher: StockFetcher;
};

function extractChangedStockRows(response: SyncResponse) {
	return (response?.changes || [])
		.map((entry) => entry?.data)
		.filter((row): row is Record<string, any> => !!row?.item_code);
}

function extractDeletedStockCodes(response: SyncResponse) {
	return (response?.deleted || [])
		.map((entry) => {
			const key = String(entry?.key || "");
			return key.startsWith("stock::") ? key.slice("stock::".length) : "";
		})
		.filter(Boolean);
}

async function hasStockScopeChanged(posProfile: SyncScopedProfile) {
	const nextScopeSignature = buildScopeSignature(posProfile);
	const currentState = await getSyncResourceState("stock");
	return !!(
		currentState?.scopeSignature &&
		currentState.scopeSignature !== nextScopeSignature
	);
}

export async function syncStockResource(
	args: StockSyncArgs,
): Promise<ResourceSyncResult> {
	const scopeChanged = await hasStockScopeChanged(args.posProfile);
	const effectiveWatermark = scopeChanged ? null : args.watermark;
	const existingState = await getSyncResourceState("stock");
	const existingDiagnostics = existingState?.diagnostics || null;
	const shouldContinueRepair = !!existingDiagnostics?.nextCursor;
	const shouldStartFullRepair =
		scopeChanged ||
		shouldContinueRepair ||
		existingDiagnostics?.completeness !== "complete";
	const initialWatermark =
		shouldStartFullRepair || scopeChanged ? null : effectiveWatermark;

	if (shouldStartFullRepair && !shouldContinueRepair) {
		clearLocalStockCache();
	}

	let response = await args.fetcher({
		posProfile: args.posProfile,
		watermark: initialWatermark,
		cursor: shouldContinueRepair ? existingDiagnostics?.nextCursor || null : null,
		schemaVersion: args.schemaVersion,
	});

	if (response?.full_resync_required) {
		const diagnostics = buildResourceDiagnostics({
			completeness: "limited",
			mode: "full",
			currentAction: "Rebuild required",
			repairRecommended: true,
			limitedReason: "schema_mismatch",
			scopeKey: args.posProfile?.warehouse || args.posProfile?.name || null,
		});
		await persistResourceSyncState({
			resourceId: "stock",
			status: "limited",
			posProfile: args.posProfile,
			response,
			watermark: initialWatermark,
			diagnostics,
		});
		return {
			...buildResourceSyncResult("stock", "limited", response, initialWatermark),
			diagnostics,
		};
	}

	let pagesFetched = 0;
	let cursor = shouldContinueRepair ? existingDiagnostics?.nextCursor || null : null;
	let localCount =
		Number.isFinite(Number(existingDiagnostics?.localCount))
			? Number(existingDiagnostics?.localCount)
			: null;

	while (true) {
		pagesFetched += 1;
		const changedRows = extractChangedStockRows(response);
		if (changedRows.length) {
			updateLocalStockCache(changedRows);
		}

		const deletedItemCodes = extractDeletedStockCodes(response);
		if (deletedItemCodes.length) {
			removeLocalStockEntries(deletedItemCodes);
		}

		localCount =
			(localCount || 0) + changedRows.length - deletedItemCodes.length;
		cursor = resolveCursor(response, null);

		if (!response?.has_more) {
			break;
		}

		await persistResourceSyncState({
			resourceId: "stock",
			status: "repairing",
			posProfile: args.posProfile,
			response,
			watermark: null,
			diagnostics: buildResourceDiagnostics({
				completeness: "incomplete",
				mode: "full",
				currentAction: "Repairing stock cache",
				localCount,
				pagesFetched,
				batchCount: changedRows.length,
				hasMore: true,
				nextCursor: cursor,
				repairRecommended: true,
				scopeKey: args.posProfile?.warehouse || args.posProfile?.name || null,
			}),
			lastSyncedAt: null,
		});

		response = await args.fetcher({
			posProfile: args.posProfile,
			watermark: null,
			cursor,
			schemaVersion: args.schemaVersion,
		});
	}

	setStockCacheReady(true);
	const diagnostics = buildResourceDiagnostics({
		completeness: "complete",
		mode: shouldStartFullRepair ? "full" : "delta",
		currentAction: "Ready",
		localCount,
		pagesFetched,
		batchCount: extractChangedStockRows(response).length,
		hasMore: false,
		nextCursor: null,
		lastVerifiedAt: new Date().toISOString(),
		lastCompletedAt: new Date().toISOString(),
		lastRepairAt: shouldStartFullRepair ? new Date().toISOString() : null,
		lastRecoveryReason: shouldStartFullRepair
			? scopeChanged
				? "scope_changed"
				: response?.has_more
					? "delta_batch_limited"
					: "verification_required"
			: null,
		scopeKey: args.posProfile?.warehouse || args.posProfile?.name || null,
	});
	refreshSnapshotFromSync({
		posProfile: args.posProfile,
		cacheState: {
			stockCacheReady: true,
		},
	});

	await persistResourceSyncState({
		resourceId: "stock",
		status: "fresh",
		posProfile: args.posProfile,
		response,
		watermark: initialWatermark,
		diagnostics,
	});
	return {
		...buildResourceSyncResult("stock", "fresh", response, initialWatermark),
		diagnostics,
	};
}
