import { describe, expect, it, vi } from "vitest";

import { buildLoadItemsRequest } from "../src/posapp/stores/items/loadItemsRequest";

describe("buildLoadItemsRequest", () => {
	it("builds server args with normalized defaults", () => {
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			item_groups: [{ item_group: "Products" }, { item_group: "Services" }],
		} as any;

		const request = buildLoadItemsRequest({
			options: {},
			posProfile: profile,
			activePriceList: "Retail",
			customer: "CUST-1",
			itemCount: 5,
			totalItemCount: 10,
			limitSearchEnabled: false,
			resolvePageSize: vi.fn(() => 50),
			resolveLimitSearchSize: vi.fn(() => 25),
		});

		expect(request.normalizedGroup).toBe("ALL");
		expect(request.effectivePriceList).toBe("Retail");
		expect(request.isInitialBootstrapRequest).toBe(false);
		expect(request.resolvedLimit).toBeNull();
		expect(request.args).toEqual({
			pos_profile: JSON.stringify(profile),
			price_list: "Retail",
			item_group: "",
			search_value: "",
			customer: "CUST-1",
			include_image: 1,
			item_groups: ["Products", "Services"],
		});
	});

	it("limits cold bootstrap fetches and forces server cache flags when requested", () => {
		const profile = {
			name: "POS-1",
			warehouse: "Main WH",
			selling_price_list: "Retail",
			currency: "PKR",
			posa_use_server_cache: 1,
			posa_force_reload_items: 0,
			item_groups: [],
		} as any;
		const resolvePageSize = vi.fn(() => 75);

		const request = buildLoadItemsRequest({
			options: {
				forceServer: true,
				groupFilter: "Hardware",
				priceList: "Wholesale",
			},
			posProfile: profile,
			activePriceList: "Retail",
			customer: null,
			itemCount: 0,
			totalItemCount: 0,
			limitSearchEnabled: false,
			resolvePageSize,
			resolveLimitSearchSize: vi.fn(() => 25),
		});

		expect(request.normalizedGroup).toBe("Hardware");
		expect(request.effectivePriceList).toBe("Wholesale");
		expect(request.isInitialBootstrapRequest).toBe(false);
		expect(request.args).toMatchObject({
			price_list: "Wholesale",
			item_group: "hardware",
			search_value: "",
			customer: null,
		});
		expect(JSON.parse(request.args.pos_profile)).toMatchObject({
			posa_use_server_cache: 0,
			posa_force_reload_items: 1,
		});
		expect(profile.posa_use_server_cache).toBe(1);
		expect(resolvePageSize).not.toHaveBeenCalled();
	});

	it("uses the page-size resolver for non-forced cold bootstrap requests", () => {
		const resolvePageSize = vi.fn(() => 60);

		const request = buildLoadItemsRequest({
			options: {},
			posProfile: {
				name: "POS-1",
				warehouse: "Main WH",
				selling_price_list: "Retail",
				currency: "PKR",
				item_groups: [],
			} as any,
			activePriceList: "Retail",
			customer: null,
			itemCount: 0,
			totalItemCount: 0,
			limitSearchEnabled: false,
			resolvePageSize,
			resolveLimitSearchSize: vi.fn(() => 25),
		});

		expect(request.isInitialBootstrapRequest).toBe(true);
		expect(request.resolvedLimit).toBe(60);
		expect(request.args.limit).toBe(60);
		expect(resolvePageSize).toHaveBeenCalledTimes(1);
	});
});
