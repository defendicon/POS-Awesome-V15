// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/offline/db";
import {
	currencyRateRepository,
	itemPriceRepository,
	pricingRuleRepository,
} from "../src/offline/repositories";

async function clearOfflineDb() {
	if (!db.isOpen()) {
		await db.open();
	}
	for (const table of db.tables) {
		await table.clear();
	}
}

describe("offline pricing repositories", () => {
	beforeEach(clearOfflineDb);
	afterEach(clearOfflineDb);

	it("stores distinct UOM, currency, and customer Item Prices", async () => {
		await itemPriceRepository.upsertMany([
			{
				name: "IP-NOS",
				price_list: "Retail",
				item_code: "ITEM-001",
				uom: "Nos",
				currency: "PKR",
				customer: null,
				price_list_rate: 100,
				valid_from: null,
				valid_upto: null,
				modified: "2026-06-01T10:00:00",
			},
			{
				name: "IP-BOX-CUSTOMER",
				price_list: "Retail",
				item_code: "ITEM-001",
				uom: "Box",
				currency: "USD",
				customer: "CUST-001",
				price_list_rate: 15,
				valid_from: "2026-01-01",
				valid_upto: "2026-12-31",
				modified: "2026-06-01T10:01:00",
			},
		]);

		const rows = await itemPriceRepository.findForItemAndUom(
			"Retail",
			"ITEM-001",
			"Box",
		);

		expect(rows).toEqual([
			expect.objectContaining({
				name: "IP-BOX-CUSTOMER",
				currency: "USD",
				customer: "CUST-001",
				valid_upto: "2026-12-31",
			}),
		]);
	});

	it("deletes Item Prices by ERPNext document name", async () => {
		await itemPriceRepository.upsertMany([
			{
				name: "IP-DELETE",
				price_list: "Retail",
				item_code: "ITEM-001",
				uom: "Nos",
				currency: "PKR",
				customer: null,
				price_list_rate: 100,
			},
		]);

		await itemPriceRepository.deleteByNames(["IP-DELETE"]);

		expect(
			await itemPriceRepository.findForItem("Retail", "ITEM-001"),
		).toEqual([]);
	});

	it("purges Item Prices from price lists that leave the selling scope", async () => {
		await itemPriceRepository.upsertMany([
			{
				name: "IP-RETAIL",
				price_list: "Retail",
				item_code: "ITEM-001",
				uom: "Nos",
				currency: "PKR",
				price_list_rate: 100,
			},
			{
				name: "IP-OLD-LIST",
				price_list: "Old Retail",
				item_code: "ITEM-001",
				uom: "Nos",
				currency: "PKR",
				price_list_rate: 90,
			},
		]);

		await itemPriceRepository.deleteOutsidePriceLists(["Retail"]);

		expect(
			await itemPriceRepository.findForItem("Old Retail", "ITEM-001"),
		).toEqual([]);
		expect(
			await itemPriceRepository.findForItem("Retail", "ITEM-001"),
		).toHaveLength(1);
	});

	it("atomically replaces stale Pricing Rule targets", async () => {
		await pricingRuleRepository.replaceRuleTargets([
			{
				key: "RULE-1::item_group::Old Group",
				rule_name: "RULE-1",
				target_type: "item_group",
				target_value: "Old Group",
				name: "RULE-1",
			},
		]);
		await pricingRuleRepository.replaceRuleTargets([
			{
				key: "RULE-1::item_group::New Group",
				rule_name: "RULE-1",
				target_type: "item_group",
				target_value: "New Group",
				name: "RULE-1",
			},
		]);

		expect(
			await pricingRuleRepository.findByTarget(
				"item_group",
				"Old Group",
			),
		).toEqual([]);
		expect(
			await pricingRuleRepository.findByTarget(
				"item_group",
				"New Group",
			),
		).toEqual([
			expect.objectContaining({
				rule_name: "RULE-1",
				target_value: "New Group",
			}),
		]);
	});

	it("resolves the latest stored Currency Exchange rate on or before a date", async () => {
		await currencyRateRepository.upsertMany([
			{
				name: "FX-OLD",
				profile_name: "POS-1",
				company: "Test Co",
				from_currency: "USD",
				to_currency: "PKR",
				exchange_rate: 275,
				date: "2026-05-01",
			},
			{
				name: "FX-NEW",
				profile_name: "POS-1",
				company: "Test Co",
				from_currency: "USD",
				to_currency: "PKR",
				exchange_rate: 280,
				date: "2026-06-01",
			},
		]);

		const rate = await currencyRateRepository.findLatestOnOrBefore({
			profileName: "POS-1",
			company: "Test Co",
			fromCurrency: "USD",
			toCurrency: "PKR",
			date: "2026-05-15",
		});

		expect(rate).toEqual(
			expect.objectContaining({
				name: "FX-OLD",
				exchange_rate: 275,
			}),
		);
	});
});
