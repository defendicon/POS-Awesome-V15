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
	const currentState = await getSyncResourceState("items");
	if (
		currentState?.scopeSignature &&
		currentState.scopeSignature !== nextScopeSignature
	) {
		return true;
	}
	return false;
}

async function persistItemSyncState(
	status: "fresh" | "limited",
	args: ItemsSyncArgs,
	response: SyncResponse,
	watermark?: string | null,
) {
	await persistResourceSyncState({
		resourceId: "items",
		status,
		posProfile: args.posProfile,
		response,
		watermark,
	});
}

export async function syncItemsResource(
	args: ItemsSyncArgs,
): Promise<ResourceSyncResult> {
	const scopeChanged = await hasItemScopeChanged(args.posProfile);
	const effectiveWatermark = scopeChanged ? null : args.watermark;
	const storageScope = buildItemStorageScope(args.posProfile);
	const response = await args.fetcher({
		posProfile: args.posProfile,
		priceList: args.priceList || null,
		customer: args.customer || null,
		watermark: effectiveWatermark,
		schemaVersion: args.schemaVersion,
	});

	if (response?.full_resync_required) {
		await persistItemSyncState(
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
		await saveItemsBulk(changedItems, storageScope);
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

	await persistItemSyncState("fresh", args, response, effectiveWatermark);
	return buildResourceSyncResult(
		"items",
		"fresh",
		response,
		effectiveWatermark,
	);
}
