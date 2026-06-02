import {
	clearCustomerStorage,
	getCustomerStorageCount,
	setCustomersLastSync,
} from "../../cache";
import {
	deleteCustomerStorageByNames,
	setCustomerStorage,
} from "../../customers";
import {
	applyCustomerDeltas,
	getOperationalCustomerCountByScope,
	hydrateOperationalCustomerIndex,
} from "../../customerEngine";
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

function buildCustomerStorageScope(posProfile: SyncScopedProfile) {
	return posProfile?.name || "";
}

async function ensureCustomerStorageIntegrity(
	storageScope: string,
	watermark?: string | null,
) {
	let rawCount = await getCustomerStorageCount();
	let operationalCount =
		await getOperationalCustomerCountByScope(storageScope);

	if (rawCount > 0 && operationalCount === 0) {
		const rebuildMetric = startPerfMeasure(
			"pos.offline.rebuild_operational_from_raw",
			{
				resource: "customers",
				source: "sync_preflight",
				cache_hit: true,
			},
		);
		try {
			const diagnostics =
				await hydrateOperationalCustomerIndex(storageScope);
			operationalCount = diagnostics.indexedCustomerCount;
			rebuildMetric.finish("success", {
				customer_result_count: bucketCount(operationalCount),
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
			resource: "customers",
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

async function assertCustomersPersistedAfterSync({
	storageScope,
	changedCustomersCount,
	response,
}: {
	storageScope: string;
	changedCustomersCount: number;
	response: SyncResponse;
}) {
	const rawCount = await getCustomerStorageCount();
	const operationalCount =
		await getOperationalCustomerCountByScope(storageScope);

	if (changedCustomersCount > 0 && (rawCount === 0 || operationalCount === 0)) {
		const error = new Error(
			"Customer sync completed without persisted customer rows",
		);
		startPerfMeasure("pos.offline.resource_empty_after_sync", {
			resource: "customers",
			raw_count: bucketCount(rawCount),
			operational_count: bucketCount(operationalCount),
			change_count: bucketCount(changedCustomersCount),
		}).fail(error);
		throw error;
	}

	if (
		rawCount === 0 &&
		operationalCount === 0 &&
		!response?.has_more &&
		!changedCustomersCount
	) {
		startPerfMeasure("pos.offline.resource_empty_after_sync", {
			resource: "customers",
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
	const storageScope = buildCustomerStorageScope(args.posProfile);
	if (scopeChanged) {
		startPerfMeasure("pos.offline.scope_mismatch_detected", {
			resource: "customers",
		}).finish("success");
	}
	const integrity = scopeChanged
		? {
				watermark: null,
				rawCount: 0,
				operationalCount: 0,
				cursorReset: false,
			}
		: await ensureCustomerStorageIntegrity(storageScope, args.watermark);
	let effectiveWatermark = integrity.watermark;
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
		const rawWriteMetric = startPerfMeasure(
			"pos.offline.raw_customers_write",
			{
				resource: "customers",
				customer_result_count: bucketCount(changedCustomers.length),
			},
		);
		await setCustomerStorage(changedCustomers, storageScope);
		rawWriteMetric.finish("success");
		startPerfMeasure("pos.offline.operational_customers_write", {
			resource: "customers",
			customer_result_count: bucketCount(changedCustomers.length),
		}).finish("success");
	}

	const deletedCustomerNames = extractDeletedCustomerNames(response);
	if (deletedCustomerNames.length) {
		await deleteCustomerStorageByNames(deletedCustomerNames, storageScope);
	}
	await applyCustomerDeltas({
		scope: storageScope,
		changed: changedCustomers,
		deletedCustomerNames,
		source: "sync",
	});

	const { rawCount: customersCount, operationalCount } =
		await assertCustomersPersistedAfterSync({
			storageScope,
			changedCustomersCount: changedCustomers.length,
			response,
		});
	refreshSnapshotFromSync({
		posProfile: args.posProfile,
		cacheState: {
			customersCount: Math.max(customersCount, operationalCount),
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
