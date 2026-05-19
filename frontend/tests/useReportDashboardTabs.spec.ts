import { describe, expect, it } from "vitest";

import { createDashboardTabItems } from "../src/posapp/composables/useReportDashboardTabs";

describe("report dashboard tabs", () => {
	it("keeps the report tab order, labels, and icons stable", () => {
		const tabs = createDashboardTabItems((value) => `t:${value}`);

		expect(tabs.map((tab) => tab.value)).toEqual([
			"sales",
			"staff",
			"customers",
			"finance",
			"branches",
			"products",
			"inventory",
			"procurement",
		]);
		expect(tabs[0]).toMatchObject({
			label: "t:Sales",
			icon: "mdi-point-of-sale",
		});
		expect(tabs[tabs.length - 1]).toMatchObject({
			label: "t:Procurement",
			icon: "mdi-truck-delivery-outline",
		});
	});
});
