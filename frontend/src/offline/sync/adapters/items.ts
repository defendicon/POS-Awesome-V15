import {
	clearItemDetailsCache,
	clearPriceListCache,
	clearStoredItems,
	deleteStoredItemsByCodes,
	getStoredItemsCountByScope,
	mergeCachedPriceListItems,
	removeCachedPriceListItems,
	removeItemDetailsCacheEntries,
	saveItemDetailsCache,
	saveItemsBulk,
	setItemsLastSync,
} from "../../cache";
import {
	getOperationalItemsCountByScope,
	hydrateOperationalIndexFromSnapshot,
} from "../../inventoryEngine";
import { bucketCount, startPerfMeasure } from "../../../posapp/utils/perf";
import { getSyncResourceState } from "../syncState";
import {
	buildResourceSyncResult,
	buildScopeSignature,
	persistResourceSyncState,
	refreshSnapshotFromSync,
	resolveWatermark,
	type ResourceSyncResult,
	type SyncResponse,
	type SyncScopedProfile,
} from "./common";

type ItemsFetcher = (_args: {
	posProfile: SyncScopedProfile;
	priceList?: string | null;
	customer?: string | null;
	watermark?: string | null;
	schemaVersion?: string | null;
}) => Promise<SyncResponse>;

type ItemsSyncArgs = {
	posProfile: SyncScopedProfile;
	priceList?: string | null;
	customer?: string | null;
	watermark?: string | null;
	schemaVersion?: string | null;
	fetcher: ItemsFetcher;
};

function buildItemStorageScope(posProfile: SyncScopedProfile) {
	const profileName = posProfile?.name || "no_profile";
	const warehouse = posProfile?.warehouse || "no_warehouse";
	return `${profileName}_${warehouse}`;
}

function extractChangedItems(response: SyncResponse) {
	return (response?.changes || [])
		.map((entry) => entry?.data)
		.filter((row): row is Record<string, any> => !!row?.item_code);
}

function extractDeletedItemCodes(response: SyncResponse) {
	return (response?.deleted || [])
		.map((entry) => {
			const key = String(entry?.key || "");
			return key.startsWith("item::") ? key.slice("item::".length) : "";
		})
		.filter(Boolean);
}

async function hasItemScopeChanged(posProfile: SyncScopedProfile) {
	const nextScopeSignature = buildScopeSignature(posProfile);
	for (const resourceId of ["items", "item_prices"] as const) {
		const currentState = await getSyncResourceState(resourceId);
		if (
			currentState?.scopeSignature &&
			currentState.scopeSignature !== nextScopeSignature
		) {
			return true;
		}
	}
	return false;
}

async function persistItemSyncStates(
	status: "fresh" | "limited",
	args: ItemsSyncArgs,
	response: SyncResponse,
	watermark?: string | null,
) {
	for (const resourceId of ["items", "item_prices"] as const) {
		await persistResourceSyncState({
			resourceId,
			status,
			posProfile: args.posProfile,
			response,
			watermark,
		});
	}
}

async function ensureItemStorageIntegrity(
	storageScope: string,
	watermark?: string | null,
) {
	let rawCount = await getStoredItemsCountByScope(storageScope);
	let operationalCount = await getOperationalItemsCountByScope(storageScope);

	if (rawCount > 0 && operationalCount === 0) {
		const rebuildMetric = startPerfMeasure(
			"pos.offline.rebuild_operational_from_raw",
			{
				resource: "items",
				source: "sync_preflight",
				cache_hit: true,
			},
		);
		try {
			const diagnostics =
				await hydrateOperationalIndexFromSnapshot(storageScope);
			operationalCount = diagnostics.indexedItemCount;
			rebuildMetric.finish("success", {
				item_result_count: bucketCount(operationalCount),
			});
		} catch (error) {
			rebuildMetric.fail(error);
		}
	}

	const cursorUnsafe = Boolean(
		watermark && (rawCount === 0 || operationalCount === 0),
	);
	if (cursorUnsafe) {
		startPerfMeasure("pos.offline.initial_cursor_reset", {
			resource: "items",
			raw_count: bucketCount(rawCount),
			operational_count: bucketCount(operationalCount),
		}).finish("success");
		return {
			watermark: null,
			rawCount,
			operationalCount,
			cursorReset: true,
		};
	}

	return {
		watermark,
		rawCount,
		operationalCount,
		cursorReset: false,
	};
}

async function assertItemsPersistedAfterSync({
	storageScope,
	changedItemsCount,
	response,
}: {
	storageScope: string;
	changedItemsCount: number;
	response: SyncResponse;
}) {
	const rawCount = await getStoredItemsCountByScope(storageScope);
	const operationalCount = await getOperationalItemsCountByScope(storageScope);

	if (changedItemsCount > 0 && (rawCount === 0 || operationalCount === 0)) {
		const error = new Error("Item sync completed without persisted item rows");
		startPerfMeasure("pos.offline.resource_empty_after_sync", {
			resource: "items",
			raw_count: bucketCount(rawCount),
			operational_count: bucketCount(operationalCount),
			change_count: bucketCount(changedItemsCount),
		}).fail(error);
		throw error;
	}

	if (
		rawCount === 0 &&
		operationalCount === 0 &&
		!response?.has_more &&
		!changedItemsCount
	) {
		startPerfMeasure("pos.offline.resource_empty_after_sync", {
			resource: "items",
			raw_count: "0",
			operational_count: "0",
			change_count: "0",
		}).finish("success");
	}

	return {
		rawCount,
		operationalCount,
	};
}

export async function syncItemsResource(
	args: ItemsSyncArgs,
): Promise<ResourceSyncResult> {
	const scopeChanged = await hasItemScopeChanged(args.posProfile);
	const storageScope = buildItemStorageScope(args.posProfile);
	if (scopeChanged) {
		startPerfMeasure("pos.offline.scope_mismatch_detected", {
			resource: "items",
		}).finish("success");
	}
	const integrity = scopeChanged
		? {
				watermark: null,
				rawCount: 0,
				operationalCount: 0,
				cursorReset: false,
			}
		: await ensureItemStorageIntegrity(storageScope, args.watermark);
	const effectiveWatermark = integrity.watermark;
	const response = await args.fetcher({
		posProfile: args.posProfile,
		priceList: args.priceList || null,
		customer: args.customer || null,
		watermark: effectiveWatermark,
		schemaVersion: args.schemaVersion,
	});

	if (response?.full_resync_required) {
		await persistItemSyncStates(
			"limited",
			args,
			response,
			effectiveWatermark,
		);
		return buildResourceSyncResult(
			"items",
			"limited",
			response,
			effectiveWatermark,
		);
	}

	if (scopeChanged) {
		await clearStoredItems();
		clearPriceListCache();
		clearItemDetailsCache();
	}

	const changedItems = extractChangedItems(response);
	if (changedItems.length) {
		const writeMetric = startPerfMeasure("pos.offline.raw_items_write", {
			resource: "items",
			item_result_count: bucketCount(changedItems.length),
		});
		await saveItemsBulk(changedItems, storageScope);
		writeMetric.finish("success");
		startPerfMeasure("pos.offline.operational_items_write", {
			resource: "items",
			item_result_count: bucketCount(changedItems.length),
		}).finish("success");
		if (args.priceList) {
			saveItemDetailsCache(args.posProfile.name, args.priceList, changedItems);
			mergeCachedPriceListItems(args.priceList, changedItems);
		}
	}

	const deletedItemCodes = extractDeletedItemCodes(response);
	if (deletedItemCodes.length) {
		await deleteStoredItemsByCodes(deletedItemCodes, storageScope);
		removeItemDetailsCacheEntries(
			args.posProfile.name,
			deletedItemCodes,
			args.priceList || null,
		);
		removeCachedPriceListItems(
			deletedItemCodes,
			args.priceList || null,
		);
	}

	const { rawCount: itemsCount, operationalCount } =
		await assertItemsPersistedAfterSync({
			storageScope,
			changedItemsCount: changedItems.length,
			response,
		});
	refreshSnapshotFromSync({
		posProfile: args.posProfile,
		cacheState: {
			itemsCount: Math.max(itemsCount, operationalCount),
		},
	});

	const nextWatermark = resolveWatermark(response, effectiveWatermark);
	if (nextWatermark) {
		setItemsLastSync(nextWatermark);
	}

	await persistItemSyncStates("fresh", args, response, effectiveWatermark);
	return buildResourceSyncResult(
		"items",
		"fresh",
		response,
		effectiveWatermark,
	);
}
