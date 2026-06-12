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
	offset?: number;
	limit?: number;
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

const ITEM_SYNC_PAGE_SIZE = 1000;

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

function laterWatermark(
	current: string | null,
	candidate: string | null | undefined,
) {
	if (!candidate) {
		return current;
	}
	if (!current) {
		return candidate;
	}
	return candidate > current ? candidate : current;
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

async function applyItemSyncResponse(
	args: ItemsSyncArgs,
	response: SyncResponse,
	storageScope: string,
) {
	const changedItems = extractChangedItems(response);
	if (changedItems.length) {
		await saveItemsBulk(changedItems, storageScope);
		if (args.priceList) {
			saveItemDetailsCache(
				args.posProfile.name,
				args.priceList,
				changedItems,
			);
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
}

async function fetchAndStoreItemPages({
	args,
	watermark,
	schemaVersion,
	storageScope,
}: {
	args: ItemsSyncArgs;
	watermark: string | null;
	schemaVersion?: string | null;
	storageScope: string;
}) {
	let offset = 0;
	let latestWatermark = watermark;
	let schemaVersionSeen = schemaVersion || null;
	let lastResponse: SyncResponse = {};

	while (true) {
		const response = await args.fetcher({
			posProfile: args.posProfile,
			priceList: args.priceList || null,
			customer: args.customer || null,
			watermark,
			offset,
			limit: ITEM_SYNC_PAGE_SIZE,
			schemaVersion,
		});
		lastResponse = response || {};

		if (response?.full_resync_required) {
			return response;
		}

		await applyItemSyncResponse(args, response, storageScope);
		latestWatermark = laterWatermark(
			latestWatermark,
			response?.next_watermark,
		);
		schemaVersionSeen =
			response?.schema_version || schemaVersionSeen || null;

		// Initial snapshots page by offset so duplicate item names cannot be skipped.
		// Delta responses use a timestamp watermark and remain limited when truncated.
		if (!response?.has_more || watermark) {
			break;
		}

		const pageSize = extractChangedItems(response).length;
		if (!pageSize) {
			throw new Error("Item sync pagination offset did not advance");
		}
		offset += pageSize;
	}

	return {
		...lastResponse,
		changes: [],
		deleted: [],
		has_more: Boolean(lastResponse?.has_more && watermark),
		next_watermark:
			lastResponse?.has_more && watermark ? watermark : latestWatermark,
		schema_version: schemaVersionSeen,
	};
}

export async function syncItemsResource(
	args: ItemsSyncArgs,
): Promise<ResourceSyncResult> {
	const scopeChanged = await hasItemScopeChanged(args.posProfile);
	let effectiveWatermark = scopeChanged ? null : args.watermark || null;
	const storageScope = buildItemStorageScope(args.posProfile);

	if (scopeChanged) {
		await clearStoredItems();
		clearPriceListCache();
		clearItemDetailsCache();
	}

	let response = await fetchAndStoreItemPages({
		args,
		watermark: effectiveWatermark,
		schemaVersion: args.schemaVersion,
		storageScope,
	});

	if (response?.full_resync_required) {
		effectiveWatermark = null;
		if (!scopeChanged) {
			await clearStoredItems();
			clearPriceListCache();
			clearItemDetailsCache();
		}
		response = await fetchAndStoreItemPages({
			args,
			watermark: effectiveWatermark,
			schemaVersion: null,
			storageScope,
		});
	}

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

	const itemsCount = await getStoredItemsCountByScope(storageScope);
	refreshSnapshotFromSync({
		posProfile: args.posProfile,
		cacheState: {
			itemsCount,
		},
	});

	const nextWatermark = resolveWatermark(response, effectiveWatermark);
	if (nextWatermark) {
		setItemsLastSync(nextWatermark);
	}

	const status = response?.has_more ? "limited" : "fresh";
	await persistItemSyncStates(status, args, response, effectiveWatermark);
	return buildResourceSyncResult(
		"items",
		status,
		response,
		effectiveWatermark,
	);
}
