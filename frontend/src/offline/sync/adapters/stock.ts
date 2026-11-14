import {
	clearLocalStockCache,
	removeLocalStockEntries,
	setStockCacheReady,
	updateLocalStockCache,
} from "../../stock";
import { getSyncResourceState } from "../syncState";
import {
	buildResourceSyncResult,
	buildScopeSignature,
	persistResourceSyncState,
	refreshSnapshotFromSync,
	type ResourceSyncResult,
	type SyncResponse,
	type SyncScopedProfile,
} from "./common";

type StockFetcher = (args: {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
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
	const response = await args.fetcher({
		posProfile: args.posProfile,
		watermark: effectiveWatermark,
		schemaVersion: args.schemaVersion,
	});

	if (response?.full_resync_required) {
		await persistResourceSyncState({
			resourceId: "stock",
			status: "limited",
			posProfile: args.posProfile,
			response,
			watermark: effectiveWatermark,
		});
		return buildResourceSyncResult(
			"stock",
			"limited",
			response,
			effectiveWatermark,
		);
	}

	if (scopeChanged) {
		clearLocalStockCache();
	}

	const changedRows = extractChangedStockRows(response);
	if (changedRows.length) {
		updateLocalStockCache(changedRows, args.posProfile);
	}

	const deletedItemCodes = extractDeletedStockCodes(response);
	if (deletedItemCodes.length) {
		removeLocalStockEntries(deletedItemCodes);
	}

	setStockCacheReady(true);
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
		watermark: effectiveWatermark,
	});
	return buildResourceSyncResult(
		"stock",
		"fresh",
		response,
		effectiveWatermark,
	);
}
