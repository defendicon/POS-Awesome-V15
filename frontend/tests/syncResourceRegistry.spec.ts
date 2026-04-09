import { describe, expect, it } from "vitest";
import {
	getSyncResourceDefinitions,
	getSyncResourcesByPriority,
	getSyncResourcesForTrigger,
} from "../src/offline/sync/resourceRegistry";

describe("sync resource registry", () => {
	it("registers unique resources in deterministic priority order", () => {
		const resources = getSyncResourceDefinitions();
		const ids = resources.map((resource) => resource.id);

		expect(ids).toEqual([
			"bootstrap_config",
			"price_list_meta",
			"currency_matrix",
			"payment_method_currencies",
			"item_groups",
			"offers",
			"items",
			"item_prices",
			"stock",
			"customers",
			"customer_addresses",
			"delivery_charges",
		]);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("filters resources by priority without mutating registry order", () => {
		expect(
			getSyncResourcesByPriority("boot_critical").map((resource) => resource.id),
		).toEqual([
			"bootstrap_config",
			"price_list_meta",
			"currency_matrix",
			"payment_method_currencies",
			"item_groups",
			"offers",
		]);

		expect(
			getSyncResourcesByPriority("lazy").map((resource) => resource.id),
		).toEqual(["customer_addresses", "delivery_charges"]);

		expect(getSyncResourceDefinitions().map((resource) => resource.id)).toEqual([
			"bootstrap_config",
			"price_list_meta",
			"currency_matrix",
			"payment_method_currencies",
			"item_groups",
			"offers",
			"items",
			"item_prices",
			"stock",
			"customers",
			"customer_addresses",
			"delivery_charges",
		]);
	});

	it("returns only resources that opt into a given trigger", () => {
		expect(
			getSyncResourcesForTrigger("boot").map((resource) => resource.id),
		).toEqual([
			"bootstrap_config",
			"price_list_meta",
			"currency_matrix",
			"payment_method_currencies",
			"item_groups",
			"offers",
		]);

		expect(
			getSyncResourcesForTrigger("online_resume").map((resource) => resource.id),
		).toEqual([
			"bootstrap_config",
			"price_list_meta",
			"currency_matrix",
			"payment_method_currencies",
			"item_groups",
			"offers",
			"items",
			"item_prices",
			"stock",
			"customers",
		]);
	});
});
