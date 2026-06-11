import {
	saveCurrencyOptionsCache,
	saveExchangeRateCache,
} from "../../cache";
import {
	currencyRateRepository,
	type OfflineCurrencyRateRecord,
} from "../../repositories";
import {
	buildResourceSyncResult,
	persistResourceSyncState,
	refreshSnapshotFromSync,
	type ResourceSyncResult,
	type SyncResponse,
	type SyncScopedProfile,
} from "./common";

type CurrencyPair = {
	from_currency: string;
	to_currency: string;
};

type CurrencyMatrixFetcher = (_args: {
	posProfile: SyncScopedProfile;
	currencyPairs?: CurrencyPair[];
	watermark?: string | null;
	offset?: number;
	schemaVersion?: string | null;
}) => Promise<SyncResponse>;

type CurrencyMatrixSyncArgs = {
	posProfile: SyncScopedProfile;
	currencyPairs?: CurrencyPair[];
	watermark?: string | null;
	schemaVersion?: string | null;
	fetcher: CurrencyMatrixFetcher;
};

export async function syncCurrencyMatrixResource(
	args: CurrencyMatrixSyncArgs,
): Promise<ResourceSyncResult> {
	if (!args.watermark) {
		await currencyRateRepository.clear();
	}

	let currencyOptionsCount: number | undefined;
	let exchangeRateCount = 0;
	let offset = 0;
	let finalResponse: SyncResponse = {};

	while (true) {
		const response = await args.fetcher({
			posProfile: args.posProfile,
			currencyPairs: args.currencyPairs || [],
			watermark: args.watermark || null,
			offset,
			schemaVersion: args.schemaVersion,
		});
		finalResponse = response;

		if (response?.full_resync_required) {
			refreshSnapshotFromSync({
				posProfile: args.posProfile,
				cacheState: {
					currencyOptionsCount: 0,
					exchangeRateCount: 0,
				},
			});
			await persistResourceSyncState({
				resourceId: "currency_matrix",
				status: "limited",
				posProfile: args.posProfile,
				response,
				watermark: args.watermark,
			});
			return buildResourceSyncResult(
				"currency_matrix",
				"limited",
				response,
				args.watermark,
			);
		}

		for (const change of response?.changes || []) {
			if (
				change?.key === "currency_options" &&
				Array.isArray(change.data)
			) {
				saveCurrencyOptionsCache(args.posProfile.name, change.data);
				currencyOptionsCount = change.data.length;
				continue;
			}

			if (!String(change?.key || "").startsWith("exchange_rate::")) {
				if (String(change?.key || "").startsWith("currency_rate::")) {
					const row = change?.data || {};
					await currencyRateRepository.upsertMany([
						{
							...row,
							profile_name: args.posProfile.name,
							company: args.posProfile.company || "",
						} as OfflineCurrencyRateRecord,
					]);
				}
				continue;
			}

			const rate = change?.data || {};
			saveExchangeRateCache({
				profileName: args.posProfile.name,
				company: args.posProfile.company || undefined,
				fromCurrency: rate.from_currency,
				toCurrency: rate.to_currency,
				date: rate.date,
				exchange_rate: rate.exchange_rate,
			});
			exchangeRateCount += 1;
		}
		const deletedRateNames = (response?.deleted || [])
			.map((entry) => String(entry?.key || ""))
			.filter((key) => key.startsWith("currency_rate::"))
			.map((key) => key.slice("currency_rate::".length))
			.filter(Boolean);
		await currencyRateRepository.deleteByNames(deletedRateNames);

		if (!response?.has_more) {
			break;
		}
		const nextOffset = Number(response?.next_offset);
		if (!Number.isFinite(nextOffset) || nextOffset <= offset) {
			throw new Error("Currency matrix sync returned an invalid next_offset");
		}
		offset = nextOffset;
	}

	if (
		typeof currencyOptionsCount !== "undefined" ||
		exchangeRateCount > 0
	) {
		refreshSnapshotFromSync({
			posProfile: args.posProfile,
			cacheState: {
				...(typeof currencyOptionsCount !== "undefined"
					? { currencyOptionsCount }
					: {}),
				...(exchangeRateCount > 0 ? { exchangeRateCount } : {}),
			},
		});
	}

	await persistResourceSyncState({
		resourceId: "currency_matrix",
		status: "fresh",
		posProfile: args.posProfile,
		response: finalResponse,
		watermark: args.watermark,
	});
	return buildResourceSyncResult(
		"currency_matrix",
		"fresh",
		finalResponse,
		args.watermark,
	);
}
