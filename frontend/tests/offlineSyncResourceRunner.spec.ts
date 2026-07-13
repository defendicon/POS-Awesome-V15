// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
	getBootstrapSnapshot: vi.fn(() => ({
		prerequisites: {
			items_cache_ready: "ready",
			pricing_rules_snapshot: "ready",
			pricing_rules_context: "ready",
		},
	})),
}));

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
vi.mock("../src/offline/cache", () => cacheMocks);

import {
	buildOfflineSyncProfile,
	filterSupportedOfflineSyncResources,
	filterSupportedOfflineSyncStates,
	runSupportedOfflineSyncResource,
} from "../src/offline/sync/resourceRunner";

describe("offline sync resource runner", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cacheMocks.getBootstrapSnapshot.mockReturnValue({
			prerequisites: {
				items_cache_ready: "ready",
				pricing_rules_snapshot: "ready",
				pricing_rules_context: "ready",
			},
		});
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
			getPersistedState: vi.fn(
				async () =>
					({
						resourceId: "item_prices",
						status: "fresh",
						watermark: "old-item-price-watermark",
					}) as any,
			),
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

	it("uses the schema persisted for each resource", async () => {
		await runSupportedOfflineSyncResource({
			resource: { id: "items" } as any,
			posProfile: { name: "POS-1", warehouse: "Main WH" },
			getPersistedState: vi.fn(
				async () =>
					({
						resourceId: "items",
						watermark: "wm-1",
						schemaVersion: "items-schema-v2",
					}) as any,
			),
			callOfflineSyncMethod: vi.fn(),
		});

		expect(adapterMocks.syncItemsResource).toHaveBeenCalledWith(
			expect.objectContaining({
				watermark: "wm-1",
				schemaVersion: "items-schema-v2",
			}),
		);
	});

	it("drops stale cursors when a snapshot prerequisite is missing", async () => {
		cacheMocks.getBootstrapSnapshot.mockReturnValue({
			prerequisites: { tax_inclusive: "missing" },
		});

		await runSupportedOfflineSyncResource({
			resource: { id: "bootstrap_config" } as any,
			posProfile: { name: "POS-1", company: "Test Co" },
			getPersistedState: vi.fn(
				async () =>
					({
						resourceId: "bootstrap_config",
						watermark: "stale-watermark",
						schemaVersion: "bootstrap-v1",
					}) as any,
			),
			callOfflineSyncMethod: vi.fn(),
		});

		expect(adapterMocks.syncBootstrapConfigResource).toHaveBeenCalledWith(
			expect.objectContaining({
				watermark: null,
				schemaVersion: null,
			}),
		);
	});

	it("retries a backend schema-resync response immediately with a clean cursor", async () => {
		adapterMocks.syncStockResource
			.mockResolvedValueOnce({
				resourceId: "stock",
				status: "limited",
				watermark: "wm-1",
				response: { full_resync_required: true },
			})
			.mockResolvedValueOnce({
				resourceId: "stock",
				status: "fresh",
				watermark: "wm-2",
				response: { full_resync_required: false },
			});
		cacheMocks.getBootstrapSnapshot.mockReturnValue({
			prerequisites: { stock_cache_ready: "ready" },
		});

		const result = await runSupportedOfflineSyncResource({
			resource: { id: "stock" } as any,
			posProfile: { name: "POS-1", warehouse: "Main WH" },
			getPersistedState: vi.fn(
				async () =>
					({
						resourceId: "stock",
						watermark: "wm-1",
						schemaVersion: "old-stock-schema",
					}) as any,
			),
			callOfflineSyncMethod: vi.fn(),
		});

		expect(adapterMocks.syncStockResource).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				watermark: "wm-1",
				schemaVersion: "old-stock-schema",
			}),
		);
		expect(adapterMocks.syncStockResource).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ watermark: null, schemaVersion: null }),
		);
		expect(result.status).toBe("fresh");
	});
});
