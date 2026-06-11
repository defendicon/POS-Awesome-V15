import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
	itemPriceRepository: {
		clear: vi.fn().mockResolvedValue(undefined),
		upsertMany: vi.fn().mockResolvedValue(undefined),
		deleteByNames: vi.fn().mockResolvedValue(undefined),
		deleteOutsidePriceLists: vi.fn().mockResolvedValue(undefined),
	},
	pricingRuleRepository: {
		clear: vi.fn().mockResolvedValue(undefined),
		replaceRuleTargets: vi.fn().mockResolvedValue(undefined),
		deleteByRuleNames: vi.fn().mockResolvedValue(undefined),
	},
}));

const commonMocks = vi.hoisted(() => ({
	buildResourceSyncResult: vi.fn(
		(resourceId, status, response, watermark) => ({
			resourceId,
			status,
			response,
			watermark: response?.next_watermark || watermark || null,
		}),
	),
	persistResourceSyncState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/offline/repositories", () => repositoryMocks);
vi.mock("../src/offline/sync/adapters/common", async () => {
	const actual = await vi.importActual<any>(
		"../src/offline/sync/adapters/common",
	);
	return {
		...actual,
		...commonMocks,
	};
});

import { syncItemPricesResource } from "../src/offline/sync/adapters/itemPrices";
import { syncPricingRulesResource } from "../src/offline/sync/adapters/pricingRules";

describe("offline pricing sync adapters", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("loads every Item Price page before committing the final watermark", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce({
				changes: [
					{
						key: "item_price::IP-1",
						data: { name: "IP-1", item_code: "ITEM-1" },
					},
				],
				deleted: [],
				has_more: true,
				next_offset: 1,
				next_watermark: null,
				scope: { price_lists: ["Retail", "Export"] },
			})
			.mockResolvedValueOnce({
				changes: [
					{
						key: "item_price::IP-2",
						data: { name: "IP-2", item_code: "ITEM-2" },
					},
				],
				deleted: [{ key: "item_price::IP-OLD" }],
				has_more: false,
				next_offset: null,
				next_watermark: "2026-06-01T10:00:00",
			});

		const result = await syncItemPricesResource({
			posProfile: { name: "POS-1", company: "Test Co" },
			watermark: null,
			fetcher,
		});

		expect(repositoryMocks.itemPriceRepository.clear).toHaveBeenCalledOnce();
		expect(repositoryMocks.itemPriceRepository.upsertMany).toHaveBeenCalledTimes(
			2,
		);
		expect(
			repositoryMocks.itemPriceRepository.deleteByNames,
		).toHaveBeenCalledWith(["IP-OLD"]);
		expect(
			repositoryMocks.itemPriceRepository.deleteOutsidePriceLists,
		).toHaveBeenCalledWith(["Retail", "Export"]);
		expect(fetcher).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ offset: 1, watermark: null }),
		);
		expect(result.watermark).toBe("2026-06-01T10:00:00");
	});

	it("replaces all targets for changed Pricing Rule parents and deletes tombstones", async () => {
		const fetcher = vi.fn().mockResolvedValue({
			changes: [
				{
					key: "pricing_rule::RULE-1::item_group::Products",
					data: {
						key: "RULE-1::item_group::Products",
						rule_name: "RULE-1",
						target_type: "item_group",
						target_value: "Products",
					},
				},
			],
			deleted: [{ key: "pricing_rule::RULE-OLD" }],
			has_more: false,
			next_watermark: "2026-06-01T11:00:00",
		});

		await syncPricingRulesResource({
			posProfile: { name: "POS-1", company: "Test Co" },
			watermark: "2026-05-01T00:00:00",
			fetcher,
		});

		expect(
			repositoryMocks.pricingRuleRepository.replaceRuleTargets,
		).toHaveBeenCalledWith([
			expect.objectContaining({ rule_name: "RULE-1" }),
		]);
		expect(
			repositoryMocks.pricingRuleRepository.deleteByRuleNames,
		).toHaveBeenCalledWith(["RULE-OLD"]);
	});
});
