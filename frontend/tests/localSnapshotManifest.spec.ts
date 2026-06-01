import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
	buildLocalSnapshotManifest,
	validateLocalSnapshotManifest,
	LOCAL_SNAPSHOT_STALE_AFTER_MS,
} from "../src/offline/localSnapshotManifest";

const profile = {
	name: "Main POS",
	modified: "2026-06-01 10:00:00",
	company: "Example Co",
	warehouse: "Stores - EX",
	selling_price_list: "Standard Selling",
	currency: "USD",
	payments: [{ mode_of_payment: "Cash", currency: "USD" }],
};

describe("local snapshot manifest", () => {
	it("marks a complete local selling snapshot usable", () => {
		const manifest = buildLocalSnapshotManifest({
			buildVersion: "build-1",
			posProfile: profile,
			itemCount: 25_000,
			hasCurrencyOptions: true,
			hasExchangeRates: true,
			hasPriceListCache: true,
			hasPaymentMethodCurrencyMap: true,
			hasPricingSnapshot: true,
			hasOffers: true,
			customerCount: 0,
			now: 1_780_000_000_000,
		});

		const result = validateLocalSnapshotManifest(manifest, {
			buildVersion: "build-1",
			posProfile: profile,
			now: 1_780_000_000_000,
		});

		expect(result.usable).toBe(true);
		expect(manifest.resources.items.blocking).toBe(false);
		expect(manifest.resources.customers.required).toBe(false);
	});

	it("blocks sell-ready when item lookup data is missing", () => {
		const manifest = buildLocalSnapshotManifest({
			buildVersion: "build-1",
			posProfile: profile,
			itemCount: 0,
			hasCurrencyOptions: true,
			hasExchangeRates: true,
			hasPriceListCache: true,
			now: 1_780_000_000_000,
		});

		const result = validateLocalSnapshotManifest(manifest, {
			buildVersion: "build-1",
			posProfile: profile,
			now: 1_780_000_000_000,
		});

		expect(result.usable).toBe(false);
		expect(result.blockingResources).toContain("items");
	});

	it("requires cached exchange rates for multi-currency tenders", () => {
		const manifest = buildLocalSnapshotManifest({
			buildVersion: "build-1",
			posProfile: {
				...profile,
				payments: [
					{ mode_of_payment: "Cash", currency: "USD" },
					{ mode_of_payment: "EUR Cash", currency: "EUR" },
				],
			},
			itemCount: 25_000,
			hasCurrencyOptions: true,
			hasExchangeRates: false,
			hasPriceListCache: true,
			now: 1_780_000_000_000,
		});

		const result = validateLocalSnapshotManifest(manifest, {
			buildVersion: "build-1",
			posProfile: {
				...profile,
				payments: [
					{ mode_of_payment: "Cash", currency: "USD" },
					{ mode_of_payment: "EUR Cash", currency: "EUR" },
				],
			},
			now: 1_780_000_000_000,
		});

		expect(result.usable).toBe(false);
		expect(result.blockingResources).toContain("exchange_rates");
	});

	it("allows stale but valid snapshots under the stale usable policy", () => {
		const manifest = buildLocalSnapshotManifest({
			buildVersion: "build-1",
			posProfile: profile,
			itemCount: 25_000,
			hasCurrencyOptions: true,
			hasExchangeRates: true,
			hasPriceListCache: true,
			now: 1_780_000_000_000,
		});

		const result = validateLocalSnapshotManifest(manifest, {
			buildVersion: "build-1",
			posProfile: profile,
			now: 1_780_000_000_000 + LOCAL_SNAPSHOT_STALE_AFTER_MS + 1,
		});

		expect(result.stale).toBe(true);
		expect(result.usable).toBe(true);
	});
});
