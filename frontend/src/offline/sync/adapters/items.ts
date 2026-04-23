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
import { setSyncResourceState, getSyncResourceState } from "../syncState";
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

type ItemsFetcher = (args: {
	posProfile: SyncScopedProfile;
	priceList?: string | null;
	customer?: string | null;
	watermark?: string | null;
	cursor?: string | null;
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

function buildItemsDiagnostics(args: {
	mode: "full" | "delta";
	action: string;
	storageScope: string;
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
		scopeKey: args.storageScope,
		detail:
			args.serverCount && args.localCount >= 0
				? `${args.localCount}/${args.serverCount} items cached`
				: `${args.localCount} items cached`,
	});
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

async function writeInterimItemState(args: {
	posProfile: SyncScopedProfile;
	storageScope: string;
	status: "syncing" | "repairing" | "partial" | "limited";
	action: string;
	localCount: number;
	serverCount?: number | null;
	pagesFetched: number;
	batchCount: number;
	hasMore: boolean;
	nextCursor?: string | null;
	lastError?: string | null;
	watermark?: string | null;
	schemaVersion?: string | null;
	lastRecoveryReason?: string | null;
	limitedReason?: string | null;
}) {
	const diagnostics = buildItemsDiagnostics({
		mode: "full",
		action: args.action,
		storageScope: args.storageScope,
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
	});

	for (const resourceId of ["items", "item_prices"] as const) {
		await setSyncResourceState({
			resourceId,
			status: args.status,
			lastSyncedAt: null,
			watermark: args.watermark || null,
			lastSuccessHash: null,
			lastError: args.lastError || null,
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
}

async function persistFinalItemSyncStates(
	status: "fresh" | "limited",
	args: ItemsSyncArgs,
	response: SyncResponse,
	watermark: string | null,
	diagnostics: ReturnType<typeof buildItemsDiagnostics>,
) {
	for (const resourceId of ["items", "item_prices"] as const) {
		await persistResourceSyncState({
			resourceId,
			status,
			posProfile: args.posProfile,
			response,
			watermark,
			diagnostics,
			lastSyncedAt: new Date().toISOString(),
		});
	}
}

export async function syncItemsResource(
	args: ItemsSyncArgs,
): Promise<ResourceSyncResult> {
	const scopeChanged = await hasItemScopeChanged(args.posProfile);
	const storageScope = buildItemStorageScope(args.posProfile);
	const existingState = await getSyncResourceState("items");
	const existingDiagnostics = existingState?.diagnostics || null;
	const shouldContinueRepair = !!existingDiagnostics?.nextCursor;
	const shouldStartFullRepair =
		scopeChanged ||
		shouldContinueRepair ||
		existingDiagnostics?.completeness !== "complete";
	const shouldClearForFullSync = scopeChanged || !shouldContinueRepair;

	if (shouldStartFullRepair && shouldClearForFullSync) {
		await clearStoredItems(storageScope);
		clearPriceListCache();
		clearItemDetailsCache();
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
			priceList: args.priceList || null,
			customer: args.customer || null,
			watermark: effectiveWatermark,
			cursor: null,
			schemaVersion: args.schemaVersion,
		});

		if (response?.full_resync_required) {
			const diagnostics = buildItemsDiagnostics({
				mode: "full",
				action: "Rebuild required",
				storageScope,
				localCount: await getStoredItemsCountByScope(storageScope),
				serverCount,
				pagesFetched: 0,
				batchCount: 0,
				hasMore: false,
				nextCursor: null,
				completeness: "limited",
				lastRecoveryReason: "schema_mismatch",
				limitedReason: "schema_mismatch",
			});
			await persistFinalItemSyncStates(
				"limited",
				args,
				response,
				effectiveWatermark || null,
				diagnostics,
			);
			return {
				...buildResourceSyncResult(
					"items",
					"limited",
					response,
					effectiveWatermark || null,
				),
				diagnostics,
			};
		}

		if (!response?.has_more) {
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
			const diagnostics = buildItemsDiagnostics({
				mode: "delta",
				action: "Ready",
				storageScope,
				localCount: itemsCount,
				serverCount: existingDiagnostics?.serverCount ?? null,
				pagesFetched: 1,
				batchCount: changedItems.length,
				hasMore: false,
				nextCursor: null,
				completeness: existingDiagnostics?.completeness || "complete",
				lastVerifiedAt:
					existingDiagnostics?.lastVerifiedAt ||
					existingDiagnostics?.lastCompletedAt ||
					null,
				lastCompletedAt:
					existingDiagnostics?.lastCompletedAt || new Date().toISOString(),
			});
			refreshSnapshotFromSync({
				posProfile: args.posProfile,
				cacheState: {
					itemsCount,
					itemsState: diagnostics,
				},
			});
			lastWatermark = resolveWatermark(response, effectiveWatermark || null);
			if (lastWatermark) {
				setItemsLastSync(lastWatermark);
			}
			await persistFinalItemSyncStates(
				"fresh",
				args,
				response,
				effectiveWatermark || null,
				diagnostics,
			);
			return {
				...buildResourceSyncResult(
					"items",
					"fresh",
					response,
					effectiveWatermark || null,
				),
				diagnostics,
			};
		}

		repairReason = "delta_batch_limited";
		await clearStoredItems(storageScope);
		clearPriceListCache();
		clearItemDetailsCache();
	}

	while (true) {
		const response = await args.fetcher({
			posProfile: args.posProfile,
			priceList: args.priceList || null,
			customer: args.customer || null,
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
			const localCount = await getStoredItemsCountByScope(storageScope);
			const diagnostics = buildItemsDiagnostics({
				mode: "full",
				action: "Rebuild required",
				storageScope,
				localCount,
				serverCount,
				pagesFetched,
				batchCount: 0,
				hasMore: false,
				nextCursor: null,
				completeness: "limited",
				lastRecoveryReason: repairReason,
				limitedReason: "schema_mismatch",
			});
			await persistFinalItemSyncStates(
				"limited",
				args,
				response,
				null,
				diagnostics,
			);
			return {
				...buildResourceSyncResult("items", "limited", response, null),
				diagnostics,
			};
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

		const nextCursor = resolveCursor(response, null);
		const localCount = await getStoredItemsCountByScope(storageScope);
		await writeInterimItemState({
			posProfile: args.posProfile,
			storageScope,
			status: response?.has_more ? "repairing" : "partial",
			action: response?.has_more ? "Repairing missing items" : "Verifying items",
			localCount,
			serverCount,
			pagesFetched,
			batchCount: changedItems.length,
			hasMore: !!response?.has_more,
			nextCursor,
			watermark: null,
			schemaVersion: response?.schema_version || args.schemaVersion || null,
			lastRecoveryReason: repairReason,
		});

				lastWatermark = resolveWatermark(response, lastWatermark || null);
		cursor = nextCursor;

		if (!response?.has_more) {
			const completedAt = new Date().toISOString();
			const diagnostics = buildItemsDiagnostics({
				mode: "full",
				action: "Ready",
				storageScope,
				localCount,
				serverCount,
				pagesFetched,
				batchCount: changedItems.length,
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
			});

			refreshSnapshotFromSync({
				posProfile: args.posProfile,
				cacheState: {
					itemsCount: localCount,
					itemsState: diagnostics,
				},
			});

			if (lastWatermark) {
				setItemsLastSync(lastWatermark);
			}

			const finalStatus =
				diagnostics.completeness === "complete" ? "fresh" : "limited";
			await persistFinalItemSyncStates(
				finalStatus,
				args,
				{
					...response,
					next_watermark: lastWatermark,
				},
				null,
				diagnostics,
			);
			return {
				...buildResourceSyncResult("items", finalStatus, response, null),
				diagnostics,
			};
		}
	}
}
