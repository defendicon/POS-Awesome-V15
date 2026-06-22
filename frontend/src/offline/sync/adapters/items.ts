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
	startAfter?: string | null;
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

function getLastItemCursor(response: SyncResponse) {
	const changes = Array.isArray(response?.changes) ? response.changes : [];
	for (let index = changes.length - 1; index >= 0; index -= 1) {
		const itemCode = String(changes[index]?.data?.item_code || "").trim();
		if (itemCode) {
			return itemCode;
		}
		const key = String(changes[index]?.key || "").trim();
		if (key.startsWith("item::")) {
			return key.slice("item::".length);
		}
	}
	return null;
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
	let startAfter: string | null = null;
	let latestWatermark = watermark;
	let schemaVersionSeen = schemaVersion || null;
	let lastResponse: SyncResponse = {};

	while (true) {
		const response = await args.fetcher({
			posProfile: args.posProfile,
			priceList: args.priceList || null,
			customer: args.customer || null,
			watermark,
			startAfter,
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

		if (!response?.has_more || watermark) {
			break;
		}

		const nextStartAfter = getLastItemCursor(response);
		if (!nextStartAfter || nextStartAfter === startAfter) {
			throw new Error("Item sync pagination cursor did not advance");
		}
		startAfter = nextStartAfter;
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
	await persistItemSyncState(status, args, response, effectiveWatermark);
	return buildResourceSyncResult(
		"items",
		status,
		response,
		effectiveWatermark,
	);
}
