import { describe, expect, it } from "vitest";

import {
	buildPaymentRouteLoadingMessage,
	isPaymentRouteLocked,
} from "../src/posapp/utils/paymentRouteReadiness";

describe("payment route readiness", () => {
	it("does not block the payment route for background customer refresh alone", () => {
		expect(
			isPaymentRouteLocked({
				customersLoaded: true,
				loadingCustomers: false,
				isCustomerBackgroundLoading: true,
			}),
		).toBe(false);
	});

	it("still blocks the payment route while initial customer loading is incomplete", () => {
		expect(
			isPaymentRouteLocked({
				customersLoaded: false,
				loadingCustomers: true,
				isCustomerBackgroundLoading: false,
			}),
		).toBe(true);
	});

	it("builds a progress-aware payment loading message", () => {
		expect(buildPaymentRouteLoadingMessage(42)).toContain("(42%)");
	});
});
