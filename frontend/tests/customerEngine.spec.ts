import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
	applyCustomerDeltas,
	db,
	getCustomerEngineDiagnostics,
	hydrateOperationalCustomerIndex,
	lookupCustomerByMobileExact,
	lookupCustomerExact,
	resetCustomerEngine,
	saveOperationalCustomersFromRaw,
	searchCustomersLocal,
	upsertOfflineCreatedCustomer,
} from "../src/offline";

const scope = "POS_PROFILE_MAIN";

const customers = [
	{
		name: "CUST-001",
		customer_name: "Jane Retail",
		mobile_no: "+1 555 0101",
		email_id: "jane@example.test",
		tax_id: "TIN-001",
		customer_group: "Retail",
		territory: "Main",
		default_price_list: "Retail USD",
	},
	{
		name: "CUST-002",
		customer_name: "John Wholesale",
		mobile_no: "+1 (555) 0202",
		email_id: "john@example.test",
		tax_id: "TIN-002",
		customer_group: "Wholesale",
		territory: "Main",
	},
	{
		name: "CUST-DISABLED",
		customer_name: "Disabled Customer",
		mobile_no: "+1 555 9999",
		disabled: 1,
	},
];

describe("local customer engine", () => {
	beforeEach(async () => {
		await db.open();
		await db.table("customers").clear();
		await db.table("operational_customers").clear();
		resetCustomerEngine();
		await saveOperationalCustomersFromRaw(customers, scope);
		await hydrateOperationalCustomerIndex(scope);
	});

	it("hydrates persisted operational customers and exposes diagnostics", () => {
		const diagnostics = getCustomerEngineDiagnostics();
		expect(diagnostics.ready).toBe(true);
		expect(diagnostics.scope).toBe(scope);
		expect(diagnostics.indexedCustomerCount).toBe(2);
		expect(diagnostics.mobileCount).toBe(2);
	});

	it("resolves exact customer id, exact name and exact mobile locally", () => {
		expect(lookupCustomerExact("CUST-001", scope)?.customer_name).toBe("Jane Retail");
		expect(lookupCustomerExact("Jane Retail", scope)?.name).toBe("CUST-001");
		expect(lookupCustomerByMobileExact("15550202", scope)?.name).toBe("CUST-002");
		expect(lookupCustomerByMobileExact("+1 555 9999", scope)).toBeNull();
	});

	it("returns bounded ranked autocomplete results", () => {
		const byName = searchCustomersLocal("jane", { scope, limit: 5 });
		expect(byName.map((customer) => customer.name)).toEqual(["CUST-001"]);

		const byPhonePrefix = searchCustomersLocal("1555", { scope, limit: 5 });
		expect(byPhonePrefix.map((customer) => customer.name)).toEqual(["CUST-001", "CUST-002"]);
	});

	it("makes offline-created customers searchable immediately", async () => {
		await upsertOfflineCreatedCustomer(
			{
				name: "Offline Customer",
				customer_name: "Offline Customer",
				mobile_no: "0300-1234567",
			},
			scope,
		);

		const result = searchCustomersLocal("offline", { scope, limit: 5 });
		expect(result[0]).toMatchObject({
			name: "Offline Customer",
			pending_sync: true,
			offline_created: true,
		});
	});

	it("applies deltas and tombstones without a full reload", async () => {
		await applyCustomerDeltas({
			scope,
			source: "test",
			changed: [
				{
					name: "CUST-001",
					customer_name: "Jane Updated",
					mobile_no: "+1 555 0101",
				},
			],
			deletedCustomerNames: ["CUST-002"],
		});

		expect(lookupCustomerExact("Jane Updated", scope)?.name).toBe("CUST-001");
		expect(lookupCustomerExact("CUST-002", scope)).toBeNull();
		expect(getCustomerEngineDiagnostics().fullReloadAvoidedCount).toBeGreaterThan(0);
	});
});
