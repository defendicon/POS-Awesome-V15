import { describe, expect, it } from "vitest";

import {
	createPosCheckoutBlocker,
	createPosCheckoutTimelineEvent,
	pushPosCheckoutTimelineEvent,
} from "../src/features/checkout/domain/checkoutDiagnostics";

describe("checkoutDiagnostics", () => {
	it("creates a checkout blocker with a code and summary", () => {
		expect(
			createPosCheckoutBlocker(
				"customer_load_failed",
				"Customer data did not finish loading.",
			),
		).toEqual({
			code: "customer_load_failed",
			summary: "Customer data did not finish loading.",
		});
	});

	it("records timeline events with blocker metadata when checkout becomes blocked", () => {
		const blocker = createPosCheckoutBlocker(
			"payments_failed",
			"Payment data did not become ready.",
		);
		const started = createPosCheckoutTimelineEvent("starting");
		const blockedTimeline = pushPosCheckoutTimelineEvent(
			[started],
			"blocked",
			blocker,
		);

		expect(started.stage).toBe("starting");
		expect(started.blockerCode).toBeNull();
		expect(blockedTimeline).toHaveLength(2);
		expect(blockedTimeline[1]).toMatchObject({
			stage: "blocked",
			blockerCode: "payments_failed",
		});
	});
});
