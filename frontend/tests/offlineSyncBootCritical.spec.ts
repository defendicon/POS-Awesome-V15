import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
	getBootstrapSnapshot: vi.fn(() => ({
		build_version: "build-1",
		profile_name: "POS-1",
		profile_modified: "2026-04-08T09:00:00",
		prerequisites: {},
	})),
	setBootstrapSnapshot: vi.fn(),
	setTaxInclusiveSetting: vi.fn(),
	savePriceListMetaCache: vi.fn(),
	saveCurrencyOptionsCache: vi.fn(),
	saveExchangeRateCache: vi.fn(),
	savePaymentMethodCurrencyCache: vi.fn(),
}));

const bootstrapSnapshotMocks = vi.hoisted(() => ({
	refreshBootstrapSnapshotFromCaches: vi.fn(({ currentSnapshot, registerData, cacheState }) => ({
		...(currentSnapshot || {}),
		build_version: currentSnapshot?.build_version || "build-1",
		profile_name: registerData?.pos_profile?.name || currentSnapshot?.profile_name || null,
		profile_modified:
			registerData?.pos_profile?.modified ||
			currentSnapshot?.profile_modified ||
			null,
		prerequisites: {
			...(currentSnapshot?.prerequisites || {}),
			tax_inclusive:
				cacheState?.taxInclusive === null || typeof cacheState?.taxInclusive === "undefined"
					? "missing"
					: "ready",
		},
	})),
}));

const syncStateMocks = vi.hoisted(() => ({
	setSyncResourceState: vi.fn().mockResolvedValue(undefined),
}));

const repositoryMocks = vi.hoisted(() => ({
	currencyRateRepository: {
		clear: vi.fn().mockResolvedValue(undefined),
		upsertMany: vi.fn().mockResolvedValue(undefined),
		deleteByNames: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("../src/offline/cache", () => cacheMocks);
vi.mock("../src/offline/bootstrapSnapshot", () => bootstrapSnapshotMocks);
vi.mock("../src/offline/sync/syncState", () => syncStateMocks);
vi.mock("../src/offline/repositories", () => repositoryMocks);

import {
	syncBootstrapConfigResource,
	syncPriceListMetaResource,
} from "../src/offline/sync/adapters/bootstrapConfig";
import { syncCurrencyMatrixResource } from "../src/offline/sync/adapters/currencyMatrix";
import { syncPaymentMethodCurrenciesResource } from "../src/offline/sync/adapters/paymentMethodCurrencies";

describe("boot-critical offline sync adapters", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cacheMocks.getBootstrapSnapshot.mockReturnValue({
			build_version: "build-1",
			profile_name: "POS-1",
			profile_modified: "2026-04-08T09:00:00",
			prerequisites: {},
		});
	});

	it("writes bootstrap config and price list metadata through existing cache helpers", async () => {
		const fetcher = vi.fn(async () => ({
			schema_version: "2026-04-09",
			next_watermark: "2026-04-09T10:05:00",
			changes: [
				{
					key: "bootstrap_config",
					modified: "2026-04-09T10:05:00",
					data: {
						profile_name: "POS-1",
						company: "Test Co",
						tax_inclusive: false,
						profile_modified: "2026-04-09T10:05:00",
					},
				},
				{
					key: "price_list_meta",
					modified: "2026-04-09T10:04:00",
					data: {
						price_lists: ["Retail"],
						selected_price_list: "Retail",
						price_list_currency: "PKR",
					},
				},
			],
			deleted: [],
			has_more: false,
		}));

		await syncBootstrapConfigResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				modified: "2026-04-09T10:05:00",
			},
			fetcher,
		});
		await syncPriceListMetaResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				modified: "2026-04-09T10:05:00",
			},
			fetcher,
		});

		expect(cacheMocks.setTaxInclusiveSetting).toHaveBeenCalledWith(false);
		expect(bootstrapSnapshotMocks.refreshBootstrapSnapshotFromCaches).toHaveBeenCalledWith(
			expect.objectContaining({
				registerData: {
					pos_profile: {
						name: "POS-1",
						modified: "2026-04-09T10:05:00",
					},
				},
				cacheState: expect.objectContaining({
					profileName: "POS-1",
					taxInclusive: false,
				}),
			}),
		);
		expect(cacheMocks.setBootstrapSnapshot).toHaveBeenCalled();
		expect(cacheMocks.savePriceListMetaCache).toHaveBeenCalledWith("POS-1", {
			price_lists: ["Retail"],
			selected_price_list: "Retail",
			price_list_currency: "PKR",
		});
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: "bootstrap_config",
				status: "fresh",
				watermark: "2026-04-09T10:05:00",
			}),
		);
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: "price_list_meta",
				status: "fresh",
				watermark: "2026-04-09T10:05:00",
			}),
		);
	});

	it("writes currency scope and payment method mappings through cache helpers", async () => {
		await syncCurrencyMatrixResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				modified: "2026-04-09T10:00:00",
			},
			currencyPairs: [{ from_currency: "USD", to_currency: "PKR" }],
			fetcher: vi.fn(async () => ({
				schema_version: "2026-04-09",
				next_watermark: "2026-04-09T10:06:00",
				changes: [
					{
						key: "currency_options",
						modified: "2026-04-09T10:02:00",
						data: [{ name: "PKR" }, { name: "USD" }],
					},
					{
						key: "currency_rate::FX-USD-PKR",
						modified: "2026-04-09T10:06:00",
						data: {
							name: "FX-USD-PKR",
							from_currency: "USD",
							to_currency: "PKR",
							exchange_rate: 279.5,
							date: "2026-04-09",
						},
					},
					{
						key: "exchange_rate::USD::PKR",
						modified: "2026-04-09T10:06:00",
						data: {
							from_currency: "USD",
							to_currency: "PKR",
							exchange_rate: 279.5,
							date: "2026-04-09",
						},
					},
				],
				deleted: [],
				has_more: false,
			})),
		});

		await syncPaymentMethodCurrenciesResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				modified: "2026-04-09T10:07:00",
			},
			fetcher: vi.fn(async () => ({
				schema_version: "2026-04-09",
				next_watermark: "2026-04-09T10:07:00",
				changes: [
					{
						key: "payment_method_currencies",
						modified: "2026-04-09T10:07:00",
						data: {
							company: "Test Co",
							pos_profile: "POS-1",
							payment_methods: ["Cash", "Card"],
							mapping: { Cash: "PKR", Card: "USD" },
						},
					},
				],
				deleted: [],
				has_more: false,
			})),
		});

		expect(cacheMocks.saveCurrencyOptionsCache).toHaveBeenCalledWith("POS-1", [
			{ name: "PKR" },
			{ name: "USD" },
		]);
		expect(cacheMocks.saveExchangeRateCache).toHaveBeenCalledWith({
			profileName: "POS-1",
			company: "Test Co",
			fromCurrency: "USD",
			toCurrency: "PKR",
			date: "2026-04-09",
			exchange_rate: 279.5,
		});
		expect(repositoryMocks.currencyRateRepository.clear).toHaveBeenCalledOnce();
		expect(repositoryMocks.currencyRateRepository.upsertMany).toHaveBeenCalledWith([
			expect.objectContaining({
				name: "FX-USD-PKR",
				profile_name: "POS-1",
				company: "Test Co",
			}),
		]);
		expect(cacheMocks.savePaymentMethodCurrencyCache).toHaveBeenCalledWith(
			"Test Co",
			{ Cash: "PKR", Card: "USD" },
		);
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: "currency_matrix",
				status: "fresh",
			}),
		);
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: "payment_method_currencies",
				status: "fresh",
			}),
		);
	});

	it("consumes every page of the currency matrix before persisting sync state", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({
				changes: [
					{
						key: "currency_options",
						data: [{ name: "PKR" }, { name: "USD" }],
					},
				],
				has_more: true,
				next_offset: 1,
				next_watermark: null,
			})
			.mockResolvedValueOnce({
				changes: [
					{
						key: "currency_rate::FX-USD-PKR",
						modified: "2026-04-09T10:06:00",
						data: {
							name: "FX-USD-PKR",
							from_currency: "USD",
							to_currency: "PKR",
							exchange_rate: 279.5,
							date: "2026-04-09",
						},
					},
					{
						key: "exchange_rate::USD::PKR",
						data: {
							from_currency: "USD",
							to_currency: "PKR",
							exchange_rate: 279.5,
							date: "2026-04-09",
						},
					},
				],
				has_more: false,
				next_offset: null,
				next_watermark: "2026-04-09T10:06:00",
			});

		const result = await syncCurrencyMatrixResource({
			posProfile: { name: "POS-1", company: "Test Co" },
			watermark: null,
			fetcher,
		});

		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ offset: 1, watermark: null }),
		);
		expect(cacheMocks.saveCurrencyOptionsCache).toHaveBeenCalledOnce();
		expect(cacheMocks.saveExchangeRateCache).toHaveBeenCalledOnce();
		expect(result.watermark).toBe("2026-04-09T10:06:00");
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledTimes(1);
	});

	it("marks bootstrap sync limited when the backend requires a full resync", async () => {
		const result = await syncBootstrapConfigResource({
			posProfile: {
				name: "POS-1",
				company: "Test Co",
				modified: "2026-04-09T10:05:00",
			},
			fetcher: vi.fn(async () => ({
				schema_version: "2026-04-09",
				full_resync_required: true,
				changes: [],
				deleted: [],
				next_watermark: null,
				has_more: false,
			})),
		});

		expect(result.status).toBe("limited");
		expect(syncStateMocks.setSyncResourceState).toHaveBeenCalledWith(
			expect.objectContaining({
				resourceId: "bootstrap_config",
				status: "limited",
			}),
		);
	});
});
