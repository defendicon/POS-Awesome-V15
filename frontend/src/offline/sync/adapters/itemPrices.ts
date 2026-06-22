import {
	itemPriceRepository,
	type OfflineItemPriceRecord,
} from "../../repositories";
import {
	buildResourceSyncResult,
	persistResourceSyncState,
	type ResourceSyncResult,
	type SyncResponse,
	type SyncScopedProfile,
} from "./common";

type ItemPricesFetcher = (_args: {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
	offset?: number;
	schemaVersion?: string | null;
}) => Promise<SyncResponse>;

type ItemPricesSyncArgs = {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
	schemaVersion?: string | null;
	fetcher: ItemPricesFetcher;
};

function itemPriceNames(response: SyncResponse) {
	return (response?.deleted || [])
		.map((entry) => String(entry?.key || ""))
		.filter((key) => key.startsWith("item_price::"))
		.map((key) => key.slice("item_price::".length))
		.filter(Boolean);
}

export async function syncItemPricesResource(
	args: ItemPricesSyncArgs,
): Promise<ResourceSyncResult> {
	if (!args.watermark) {
		await itemPriceRepository.clear();
	}

	let offset = 0;
	let finalResponse: SyncResponse = {};
	let scopeApplied = false;
	while (true) {
		const response = await args.fetcher({
			posProfile: args.posProfile,
			watermark: args.watermark || null,
			offset,
			schemaVersion: args.schemaVersion,
		});
		finalResponse = response;
		if (
			!scopeApplied &&
			Array.isArray(response?.scope?.price_lists)
		) {
			await itemPriceRepository.deleteOutsidePriceLists(
				response.scope.price_lists,
			);
			scopeApplied = true;
		}

		if (response?.full_resync_required) {
			await itemPriceRepository.clear();
			await persistResourceSyncState({
				resourceId: "item_prices",
				status: "limited",
				posProfile: args.posProfile,
				response,
				watermark: args.watermark,
			});
			return buildResourceSyncResult(
				"item_prices",
				"limited",
				response,
				args.watermark,
			);
		}

		const rows = (response?.changes || [])
			.map((entry) => entry?.data)
			.filter(
				(row): row is OfflineItemPriceRecord =>
					!!row?.name && !!row?.price_list && !!row?.item_code,
			);
		await itemPriceRepository.upsertMany(rows);
		await itemPriceRepository.deleteByNames(itemPriceNames(response));

		if (!response?.has_more) {
			break;
		}
		const nextOffset = Number(response?.next_offset);
		if (!Number.isFinite(nextOffset) || nextOffset <= offset) {
			throw new Error("Item Price sync returned an invalid next_offset");
		}
		offset = nextOffset;
	}

	await persistResourceSyncState({
		resourceId: "item_prices",
		status: "fresh",
		posProfile: args.posProfile,
		response: finalResponse,
		watermark: args.watermark,
	});
	return buildResourceSyncResult(
		"item_prices",
		"fresh",
		finalResponse,
		args.watermark,
	);
}
