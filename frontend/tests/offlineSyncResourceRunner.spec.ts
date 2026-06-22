// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const adapterMocks = vi.hoisted(() => ({
	syncBootstrapConfigResource: vi.fn(async () => ({
		resourceId: "bootstrap_config",
		status: "fresh",
		watermark: "boot-watermark",
	})),
	syncPriceListMetaResource: vi.fn(async () => ({
		resourceId: "price_list_meta",
		status: "fresh",
		watermark: "price-watermark",
	})),
	syncCurrencyMatrixResource: vi.fn(async () => ({
		resourceId: "currency_matrix",
		status: "fresh",
		watermark: "currency-watermark",
	})),
	syncPaymentMethodCurrenciesResource: vi.fn(async () => ({
		resourceId: "payment_method_currencies",
		status: "fresh",
		watermark: "payments-watermark",
	})),
	syncItemsResource: vi.fn(async () => ({
		resourceId: "items",
		status: "fresh",
		watermark: "items-watermark",
	})),
	syncItemPricesResource: vi.fn(async () => ({
		resourceId: "item_prices",
		status: "fresh",
		watermark: "item-prices-watermark",
	})),
	syncPricingRulesResource: vi.fn(async () => ({
		resourceId: "pricing_rules",
		status: "fresh",
		watermark: "pricing-rules-watermark",
	})),
	syncCustomersResource: vi.fn(async () => ({
		resourceId: "customers",
		status: "fresh",
		watermark: "customers-watermark",
	})),
	syncStockResource: vi.fn(async () => ({
		resourceId: "stock",
		status: "fresh",
		watermark: "stock-watermark",
	})),
}));

vi.mock("../src/offline/sync/adapters", () => adapterMocks);

import {
	buildOfflineSyncProfile,
	filterSupportedOfflineSyncResources,
	filterSupportedOfflineSyncStates,
	runSupportedOfflineSyncResource,
} from "../src/offline/sync/resourceRunner";

describe("offline sync resource runner", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds a supported sync profile with warehouse and price list context", () => {
		expect(
			buildOfflineSyncProfile({
				name: "POS-1",
				company: "Test Co",
				warehouse: "Main WH",
				modified: "2026-04-09T10:00:00",
				selling_price_list: "Retail",
				posa_allow_multi_currency: 1,
				payments: [{ mode_of_payment: "Cash" }],
			}),
		).toEqual({
			name: "POS-1",
			company: "Test Co",
			warehouse: "Main WH",
			modified: "2026-04-09T10:00:00",
			currency: null,
			selling_price_list: "Retail",
			posa_allow_multi_currency: true,
			payments: [{ mode_of_payment: "Cash" }],
		});
	});

	it("filters resources and states down to the supported online sync set", () => {
		expect(
			filterSupportedOfflineSyncResources([
				{ id: "bootstrap_config" },
				{ id: "offers" },
				{ id: "items" },
				{ id: "pricing_rules" },
				{ id: "customer_addresses" },
			] as any),
		).toEqual([
			{ id: "bootstrap_config" },
			{ id: "items" },
			{ id: "pricing_rules" },
		]);

		expect(
			filterSupportedOfflineSyncStates([
				{ resourceId: "items", status: "fresh" },
				{ resourceId: "offers", status: "stale" },
				{ resourceId: "stock", status: "fresh" },
			] as any),
		).toEqual([
			{ resourceId: "items", status: "fresh" },
			{ resourceId: "stock", status: "fresh" },
		]);
	});

	it("routes items through the operational sync adapter with the persisted watermark", async () => {
		const callOfflineSyncMethod = vi.fn(async () => ({
			changes: [],
			deleted: [],
			has_more: false,
		}));

		await runSupportedOfflineSyncResource({
			resource: {
				id: "items",
			} as any,
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				warehouse: "Main WH",
				selling_price_list: "Retail",
			},
			schemaVersion: "2026-04-09",
			getPersistedState: vi.fn(async () => ({
				resourceId: "items",
				status: "fresh",
				lastSyncedAt: "2026-04-09T09:00:00",
				watermark: "2026-04-09T09:30:00",
				lastSuccessHash: null,
				lastError: null,
				consecutiveFailures: 0,
				scopeSignature: null,
				schemaVersion: "2026-04-09",
			})),
			callOfflineSyncMethod,
		});

		expect(adapterMocks.syncItemsResource).toHaveBeenCalledWith(
			expect.objectContaining({
				posProfile: expect.objectContaining({
					name: "POS-1",
					warehouse: "Main WH",
				}),
				priceList: "Retail",
				watermark: "2026-04-09T09:30:00",
			}),
		);
		const itemsFetcher =
			adapterMocks.syncItemsResource.mock.calls[0][0].fetcher;
		await itemsFetcher({
			posProfile: { name: "POS-1", warehouse: "Main WH" },
			priceList: "Retail",
			customer: null,
			watermark: "2026-04-09T09:30:00",
			startAfter: "ITEM-1000",
			limit: 1000,
			schemaVersion: "2026-04-09",
		});
		expect(callOfflineSyncMethod).toHaveBeenCalledWith(
			"posawesome.posawesome.api.offline_sync.items.sync_items",
			expect.objectContaining({
				price_list: "Retail",
				watermark: "2026-04-09T09:30:00",
				start_after: "ITEM-1000",
				limit: 1000,
				schema_version: "2026-04-09",
			}),
		);
	});

	it("routes Item Prices through their independent paginated endpoint", async () => {
		const callOfflineSyncMethod = vi.fn(async () => ({
			changes: [],
			deleted: [],
			has_more: false,
		}));

		await runSupportedOfflineSyncResource({
			resource: {
				id: "item_prices",
			} as any,
			posProfile: {
				name: "POS-1",
			},
			schemaVersion: "2026-04-09",
			getPersistedState: vi.fn(async () => ({
				resourceId: "item_prices",
				status: "fresh",
				watermark: "old-item-price-watermark",
			} as any)),
			callOfflineSyncMethod,
		});

		expect(adapterMocks.syncItemPricesResource).toHaveBeenCalledWith(
			expect.objectContaining({
				watermark: "old-item-price-watermark",
			}),
		);
		const fetcher =
			adapterMocks.syncItemPricesResource.mock.calls[0][0].fetcher;
		await fetcher({
			posProfile: { name: "POS-1" },
			watermark: "old-item-price-watermark",
			offset: 200,
			schemaVersion: "2026-04-09",
		});
		expect(callOfflineSyncMethod).toHaveBeenCalledWith(
			"posawesome.posawesome.api.offline_sync.item_prices.sync_item_prices",
			expect.objectContaining({
				watermark: "old-item-price-watermark",
				offset: 200,
			}),
		);
	});

	it("routes Pricing Rules without a customer-specific request context", async () => {
		const callOfflineSyncMethod = vi.fn(async () => ({
			changes: [],
			deleted: [],
			has_more: false,
		}));

		await runSupportedOfflineSyncResource({
			resource: { id: "pricing_rules" } as any,
			posProfile: { name: "POS-1", company: "Test Co" },
			schemaVersion: "2026-04-09",
			getPersistedState: vi.fn(async () => null),
			callOfflineSyncMethod,
		});

		const fetcher =
			adapterMocks.syncPricingRulesResource.mock.calls[0][0].fetcher;
		await fetcher({
			posProfile: { name: "POS-1", company: "Test Co" },
			watermark: null,
			offset: 0,
			schemaVersion: "2026-04-09",
		});
		expect(callOfflineSyncMethod).toHaveBeenCalledWith(
			"posawesome.posawesome.api.offline_sync.pricing_rules.sync_pricing_rules",
			expect.not.objectContaining({
				customer: expect.anything(),
				customer_group: expect.anything(),
			}),
		);
	});
});
