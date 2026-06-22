import {
	syncBootstrapConfigResource,
	syncCurrencyMatrixResource,
	syncCustomersResource,
	syncItemPricesResource,
	syncItemsResource,
	syncPaymentMethodCurrenciesResource,
	syncPriceListMetaResource,
	syncPricingRulesResource,
	syncStockResource,
} from "./adapters";
import { syncInvoiceOutboxResource } from "../invoiceOutbox";
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
	"pricing_rules",
	"stock",
	"customers",
	"invoice_outbox",
]);

type SupportedSyncProfile = SyncScopedProfile & {
	currency?: string | null;
	selling_price_list?: string | null;
	posa_allow_multi_currency?: boolean;
	payments?: any[];
};

type CallOfflineSyncMethod = (
	_method: string,
	_args?: Record<string, any>,
) => Promise<any>;

type RunSupportedOfflineSyncResourceArgs = {
	resource: SyncResourceDefinition;
	posProfile: SupportedSyncProfile;
	schemaVersion: string;
	getPersistedState: (
		_resourceId: SyncResourceId,
	) => Promise<SyncResourceState | null>;
	getRuntimeState?: (_resourceId: SyncResourceId) => SyncResourceState | null;
	callOfflineSyncMethod: CallOfflineSyncMethod;
};

function getPersistedWatermark(state: SyncResourceState | null | undefined) {
	return state?.watermark || null;
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

export function buildOfflineSyncProfile(
	profile: any,
): SupportedSyncProfile | null {
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
		posa_allow_multi_currency: !!profile.posa_allow_multi_currency,
		payments: Array.isArray(profile.payments) ? profile.payments : [],
	};
}

export async function runSupportedOfflineSyncResource({
	resource,
	posProfile,
	schemaVersion,
	getPersistedState,
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
					offset,
					schemaVersion,
				}) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.currencies.sync_currency_scope",
						{
							pos_profile: posProfile,
							watermark,
							currency_pairs: currencyPairs,
							offset: offset || 0,
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
					startAfter,
					limit,
					schemaVersion,
				}) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.items.sync_items",
						{
							pos_profile: posProfile,
							price_list: priceList,
							customer: customer || null,
							watermark,
							start_after: startAfter || null,
							limit: limit || null,
							schema_version: schemaVersion,
						},
					),
			});
		case "item_prices":
			return syncItemPricesResource({
				...sharedArgs,
				fetcher: ({
					posProfile,
					watermark,
					offset,
					schemaVersion,
				}) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.item_prices.sync_item_prices",
						{
							pos_profile: posProfile,
							watermark,
							offset: offset || 0,
							schema_version: schemaVersion,
						},
					),
			});
		case "pricing_rules":
			return syncPricingRulesResource({
				...sharedArgs,
				fetcher: ({
					posProfile,
					watermark,
					offset,
					schemaVersion,
				}) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.pricing_rules.sync_pricing_rules",
						{
							pos_profile: posProfile,
							watermark,
							offset: offset || 0,
							schema_version: schemaVersion,
						},
					),
			});
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
				fetcher: ({ posProfile, watermark, startAfter, limit, schemaVersion }) =>
					callOfflineSyncMethod(
						"posawesome.posawesome.api.offline_sync.customers.sync_customers",
						{
							pos_profile: posProfile,
							watermark,
							start_after: startAfter || null,
							limit: limit || null,
							schema_version: schemaVersion,
						},
					),
			});
		case "invoice_outbox":
			return syncInvoiceOutboxResource(callOfflineSyncMethod);
		default:
			return {
				status: "idle",
			};
	}
}
