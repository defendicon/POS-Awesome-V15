import { describe, expect, it } from "vitest";

import {
	buildPaymentRouteLoadingMessage,
	isPaymentRouteLocked,
} from "../src/posapp/utils/paymentRouteReadiness";

describe("paymentRouteReadiness", () => {
	it("locks the payments route while customer loading is still in progress", () => {
		expect(
			isPaymentRouteLocked({
				customersLoaded: false,
				loadingCustomers: true,
				isCustomerBackgroundLoading: false,
			}),
		).toBe(true);

		expect(
			isPaymentRouteLocked({
				customersLoaded: true,
				loadingCustomers: false,
				isCustomerBackgroundLoading: true,
			}),
		).toBe(true);
	});

	it("unlocks the payments route only after customer loading is complete", () => {
		expect(
			isPaymentRouteLocked({
				customersLoaded: true,
				loadingCustomers: false,
				isCustomerBackgroundLoading: false,
			}),
		).toBe(false);
	});

	it("builds an english loading message with progress when available", () => {
		expect(buildPaymentRouteLoadingMessage(42)).toBe(
			"Preparing payments. Customer data is still loading (42%).",
		);
		expect(buildPaymentRouteLoadingMessage(null)).toBe(
			"Preparing payments. Customer data is still loading.",
		);
	});
});
