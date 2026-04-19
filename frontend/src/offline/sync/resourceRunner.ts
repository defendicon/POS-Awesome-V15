import {
	syncBootstrapConfigResource,
	syncCurrencyMatrixResource,
	syncCustomersResource,
	syncItemsResource,
	syncPaymentMethodCurrenciesResource,
	syncPriceListMetaResource,
	syncStockResource,
} from "./adapters";
import type { SyncScopedProfile } from "./adapters/common";
import type {
	SyncResourceDefinition,
	SyncResourceId,
	SyncResourceState,
} from "./types";

const SUPPORTED_OFFLINE_SYNC_RESOURCE_IDS = new Set<SyncResourceId>([
	"bootstrap_config",
	"price_list_meta",
	"currency_matrix",
	"payment_method_currencies",
	"items",
	"item_prices",
	"stock",
	"customers",
]);

type SupportedSyncProfile = SyncScopedProfile & {
	currency?: string | null;
	selling_price_list?: string | null;
	payments?: any[];
};

type CallOfflineSyncMethod = (
	method: string,
	args?: Record<string, any>,
) => Promise<any>;

type RunSupportedOfflineSyncResourceArgs = {
	resource: SyncResourceDefinition;
	posProfile: SupportedSyncProfile;
	schemaVersion: string;
	getPersistedState: (
		resourceId: SyncResourceId,
	) => Promise<SyncResourceState | null>;
	getRuntimeState?: (
		resourceId: SyncResourceId,
	) => SyncResourceState | null;
	callOfflineSyncMethod: CallOfflineSyncMethod;
};

function getPersistedWatermark(
	state: SyncResourceState | null | undefined,
) {
	return state?.watermark || null;
}

function buildMirroredState(
	resourceId: SyncResourceId,
	sourceState: SyncResourceState | null | undefined,
) {
	if (!sourceState) {
		return {
			status: "idle",
		};
	}

	return {
		resourceId,
		status: sourceState.status,
		lastSyncedAt: sourceState.lastSyncedAt,
		watermark: sourceState.watermark,
		lastError: sourceState.lastError,
		consecutiveFailures: sourceState.consecutiveFailures,
		lastAttemptAt: sourceState.lastAttemptAt,
		nextRetryAt: sourceState.nextRetryAt,
		cooldownMs: sourceState.cooldownMs,
		lastTrigger: sourceState.lastTrigger,
		scopeSignature: sourceState.scopeSignature,
		schemaVersion: sourceState.schemaVersion,
	};
}

export function isSupportedOfflineSyncResourceId(
	resourceId: SyncResourceId | null | undefined,
) {
	return !!(
		resourceId && SUPPORTED_OFFLINE_SYNC_RESOURCE_IDS.has(resourceId)
	);
}

export function filterSupportedOfflineSyncResources(
	resources: SyncResourceDefinition[] = [],
) {
	return (resources || []).filter((resource) =>
		isSupportedOfflineSyncResourceId(resource?.id),
	);
}

export function filterSupportedOfflineSyncStates(
	states: SyncResourceState[] = [],
) {
	return (states || []).filter((state) =>
		isSupportedOfflineSyncResourceId(state?.resourceId),
	);
}

export function buildOfflineSyncProfile(profile: any): SupportedSyncProfile | null {
	if (!profile?.name) {
		return null;
	}

	return {
		name: profile.name,
		company: profile.company || null,
		warehouse: profile.warehouse || null,
		modified: profile.modified || null,
		currency: profile.currency || null,
		selling_price_list: profile.selling_price_list || null,
		payments: Array.isArray(profile.payments) ? profile.payments : [],
	};
}

export async function runSupportedOfflineSyncResource({
	resource,
	posProfile,
	schemaVersion,
	getPersistedState,
	getRuntimeState,
	callOfflineSyncMethod,
}: RunSupportedOfflineSyncResourceArgs) {
	const persistedState = await getPersistedState(resource.id);
	const sharedArgs = {
		posProfile,
		watermark: getPersistedWatermark(persistedState),
		schemaVersion,
	};

	switch (resource.id) {
		case "bootstrap_config":
			return syncBootstrapConfigResource({
				...sharedArgs,
				fetcher: ({ posProfile, watermark, schemaVersion }) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.bootstrap.sync_bootstrap_config",
						{
							pos_profile: posProfile,
							watermark,
							schema_version: schemaVersion,
						},
					),
			});
		case "price_list_meta":
			return syncPriceListMetaResource({
				...sharedArgs,
				fetcher: ({ posProfile, watermark, schemaVersion }) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.bootstrap.sync_bootstrap_config",
						{
							pos_profile: posProfile,
							watermark,
							schema_version: schemaVersion,
						},
					),
			});
		case "currency_matrix":
			return syncCurrencyMatrixResource({
				...sharedArgs,
				fetcher: ({
					posProfile,
					currencyPairs = [],
					watermark,
					schemaVersion,
				}) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.currencies.sync_currency_scope",
						{
							pos_profile: posProfile,
							watermark,
							currency_pairs: currencyPairs,
							schema_version: schemaVersion,
						},
					),
			});
		case "payment_method_currencies":
			return syncPaymentMethodCurrenciesResource({
				...sharedArgs,
				fetcher: ({ posProfile, watermark, schemaVersion }) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.payment_methods.sync_payment_method_currencies",
						{
							pos_profile: posProfile,
							watermark,
							schema_version: schemaVersion,
						},
					),
			});
		case "items":
			return syncItemsResource({
				...sharedArgs,
				priceList: posProfile.selling_price_list || null,
				fetcher: ({
					posProfile,
					priceList,
					customer,
					watermark,
					schemaVersion,
				}) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.items.sync_items",
						{
							pos_profile: posProfile,
							price_list: priceList,
							customer: customer || null,
							watermark,
							schema_version: schemaVersion,
						},
					),
			});
		case "item_prices":
			return buildMirroredState(
				"item_prices",
				getRuntimeState?.("items") || persistedState,
			);
		case "stock":
			return syncStockResource({
				...sharedArgs,
				fetcher: ({ posProfile, watermark, schemaVersion }) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.stock.sync_stock",
						{
							pos_profile: posProfile,
							watermark,
							schema_version: schemaVersion,
						},
					),
			});
		case "customers":
			return syncCustomersResource({
				...sharedArgs,
				fetcher: ({ posProfile, watermark, schemaVersion }) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.customers.sync_customers",
						{
							pos_profile: posProfile,
							watermark,
							schema_version: schemaVersion,
						},
					),
			});
		default:
			return {
				status: "idle",
			};
	}
}
