import { savePricingRulesSnapshot } from "../../cache";
import type { SyncLifecycleState } from "../types";
import {
	buildResourceSyncResult,
	persistResourceSyncState,
	refreshSnapshotFromSync,
	type ResourceSyncResult,
	type SyncResponse,
	type SyncScopedProfile,
} from "./common";

type PricingRulesFetcher = (args: {
	posProfile: SyncScopedProfile & {
		currency?: string | null;
		selling_price_list?: string | null;
	};
	date?: string | null;
	watermark?: string | null;
	schemaVersion?: string | null;
}) => Promise<SyncResponse | any[]>;

type PricingRulesSyncArgs = {
	posProfile: SyncScopedProfile & {
		currency?: string | null;
		selling_price_list?: string | null;
	};
	watermark?: string | null;
	schemaVersion?: string | null;
	fetcher: PricingRulesFetcher;
};

function today() {
	return new Date().toISOString().slice(0, 10);
}

function buildPricingRulesContext(
	posProfile: PricingRulesSyncArgs["posProfile"],
	date = today(),
) {
	return {
		company: posProfile?.company || null,
		price_list: posProfile?.selling_price_list || null,
		currency: posProfile?.currency || null,
		date,
	};
}

function buildContextKey(context: ReturnType<typeof buildPricingRulesContext>) {
	return JSON.stringify({
		company: context.company || "",
		price_list: context.price_list || "",
		currency: context.currency || "",
		date: context.date || "",
	});
}

async function finalizeState(
	status: SyncLifecycleState,
	args: PricingRulesSyncArgs,
	response: SyncResponse,
) {
	await persistResourceSyncState({
		resourceId: "pricing_rules",
		status,
		posProfile: args.posProfile,
		response,
		watermark: args.watermark,
	});
	return buildResourceSyncResult(
		"pricing_rules",
		status,
		response,
		args.watermark,
	);
}

export async function syncPricingRulesResource(
	args: PricingRulesSyncArgs,
): Promise<ResourceSyncResult> {
	const context = buildPricingRulesContext(args.posProfile);
	if (!context.company || !context.price_list || !context.currency) {
		const response = {
			changes: [],
			next_watermark: args.watermark || null,
			schema_version: args.schemaVersion || null,
		};
		refreshSnapshotFromSync({
			posProfile: args.posProfile,
			cacheState: {
				pricingSnapshotCount: 0,
				pricingContext: null,
			},
		});
		return finalizeState("limited", args, response);
	}

	const rawResponse = await args.fetcher({
		posProfile: args.posProfile,
		date: context.date,
		watermark: args.watermark,
		schemaVersion: args.schemaVersion,
	});
	const rules: any[] = Array.isArray(rawResponse)
		? rawResponse
		: Array.isArray(rawResponse?.changes)
			? rawResponse.changes
					.filter((entry) => entry?.key === "pricing_rules")
					.flatMap((entry) => (Array.isArray(entry?.data) ? entry.data : []))
			: [];
	const response: SyncResponse = Array.isArray(rawResponse)
		? {
				changes: [{ key: "pricing_rules", data: rules }],
				next_watermark: new Date().toISOString(),
				schema_version: args.schemaVersion || null,
			}
		: rawResponse || {};

	const staleAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
	(savePricingRulesSnapshot as any)(rules, buildContextKey(context), staleAt);
	refreshSnapshotFromSync({
		posProfile: args.posProfile,
		cacheState: {
			pricingSnapshotCount: rules.length,
			pricingContext: buildContextKey(context),
		},
	});

	return finalizeState("fresh", args, response);
}
