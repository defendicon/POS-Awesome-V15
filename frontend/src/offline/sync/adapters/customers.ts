import {
	clearCustomerStorage,
	getCustomerStorageCount,
	setCustomersLastSync,
} from "../../cache";
import {
	deleteCustomerStorageByNames,
	setCustomerStorage,
} from "../../customers";
import { applyCustomerDeltas } from "../../customerEngine";
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

type CustomersFetcher = (_args: {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
	startAfter?: string | null;
	limit?: number | null;
	schemaVersion?: string | null;
}) => Promise<SyncResponse>;

type CustomersSyncArgs = {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
	schemaVersion?: string | null;
	fetcher: CustomersFetcher;
};

const CUSTOMER_SYNC_PAGE_SIZE = 1000;

function extractChangedCustomers(response: SyncResponse) {
	return (response?.changes || [])
		.map((entry) => entry?.data)
		.filter((row): row is Record<string, any> => !!row?.name);
}

function extractDeletedCustomerNames(response: SyncResponse) {
	return (response?.deleted || [])
		.map((entry) => {
			const key = String(entry?.key || "");
			return key.startsWith("customer::")
				? key.slice("customer::".length)
				: "";
		})
		.filter(Boolean);
}

async function hasCustomerScopeChanged(posProfile: SyncScopedProfile) {
	const nextScopeSignature = buildScopeSignature(posProfile);
	const currentState = await getSyncResourceState("customers");
	return !!(
		currentState?.scopeSignature &&
		currentState.scopeSignature !== nextScopeSignature
	);
}

function getLastCustomerCursor(response: SyncResponse) {
	const changes = Array.isArray(response?.changes) ? response.changes : [];
	for (let index = changes.length - 1; index >= 0; index -= 1) {
		const name = String(changes[index]?.data?.name || "").trim();
		if (name) {
			return name;
		}
		const key = String(changes[index]?.key || "").trim();
		if (key.startsWith("customer::")) {
			return key.slice("customer::".length);
		}
	}
	return null;
}

function mergeCustomerSyncResponses(
	responses: SyncResponse[],
): SyncResponse {
	const lastResponse = responses[responses.length - 1] || {};
	return {
		...lastResponse,
		changes: responses.flatMap((response) => response?.changes || []),
		deleted: responses.flatMap((response) => response?.deleted || []),
		has_more: Boolean(lastResponse?.has_more),
		next_watermark: resolveWatermark(
			lastResponse,
			responses[0]?.next_watermark || null,
		),
		schema_version: lastResponse?.schema_version || responses[0]?.schema_version,
	};
}

async function fetchAllCustomerPages({
	posProfile,
	watermark,
	schemaVersion,
	fetcher,
}: {
	posProfile: SyncScopedProfile;
	watermark?: string | null;
	schemaVersion?: string | null;
	fetcher: CustomersFetcher;
}) {
	const responses: SyncResponse[] = [];
	let startAfter: string | null = null;

	while (true) {
		const response = await fetcher({
			posProfile,
			watermark,
			startAfter,
			limit: CUSTOMER_SYNC_PAGE_SIZE,
			schemaVersion,
		});
		responses.push(response || {});

		if (response?.full_resync_required || !response?.has_more) {
			break;
		}

		const nextStartAfter = getLastCustomerCursor(response);
		if (!nextStartAfter || nextStartAfter === startAfter) {
			break;
		}
		startAfter = nextStartAfter;
	}

	return mergeCustomerSyncResponses(responses);
}

export async function syncCustomersResource(
	args: CustomersSyncArgs,
): Promise<ResourceSyncResult> {
	const scopeChanged = await hasCustomerScopeChanged(args.posProfile);
	let effectiveWatermark = scopeChanged ? null : args.watermark;
	let response = await fetchAllCustomerPages({
		posProfile: args.posProfile,
		watermark: effectiveWatermark,
		schemaVersion: args.schemaVersion,
		fetcher: args.fetcher,
	});

	if (response?.full_resync_required) {
		effectiveWatermark = null;
		await clearCustomerStorage();
		response = await fetchAllCustomerPages({
			posProfile: args.posProfile,
			watermark: effectiveWatermark,
			schemaVersion: null,
			fetcher: args.fetcher,
		});
	}

	if (response?.full_resync_required) {
		await persistResourceSyncState({
			resourceId: "customers",
			status: "limited",
			posProfile: args.posProfile,
			response,
			watermark: effectiveWatermark,
		});
		return buildResourceSyncResult(
			"customers",
			"limited",
			response,
			effectiveWatermark,
		);
	}

	if (scopeChanged) {
		await clearCustomerStorage();
	}

	const changedCustomers = extractChangedCustomers(response);
	if (changedCustomers.length) {
		await setCustomerStorage(changedCustomers, args.posProfile.name || "");
	}

	const deletedCustomerNames = extractDeletedCustomerNames(response);
	if (deletedCustomerNames.length) {
		await deleteCustomerStorageByNames(deletedCustomerNames, args.posProfile.name || "");
	}
	await applyCustomerDeltas({
		scope: args.posProfile.name || "",
		changed: changedCustomers,
		deletedCustomerNames,
		source: "sync",
	});

	const customersCount = await getCustomerStorageCount();
	refreshSnapshotFromSync({
		posProfile: args.posProfile,
		cacheState: {
			customersCount,
		},
	});

	const nextWatermark = resolveWatermark(response, effectiveWatermark);
	if (nextWatermark) {
		setCustomersLastSync(nextWatermark);
	}

	await persistResourceSyncState({
		resourceId: "customers",
		status: "fresh",
		posProfile: args.posProfile,
		response,
		watermark: effectiveWatermark,
	});
	return buildResourceSyncResult(
		"customers",
		"fresh",
		response,
		effectiveWatermark,
	);
}
