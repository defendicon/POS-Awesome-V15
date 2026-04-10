import { describe, expect, it } from "vitest";

import { buildBootstrapSnapshot } from "../src/offline/bootstrapSnapshot";
import { recoverPosSession } from "../src/posapp/domain/session/recoverPosSession";

describe("recoverPosSession", () => {
	const currentSnapshot = buildBootstrapSnapshot({
		buildVersion: "build-1",
		profileName: "Main POS",
		profileModified: "2026-04-10 08:00:00",
		openingShiftName: "POS-OPEN-1",
		openingShiftUser: "cashier@example.com",
		prerequisites: {
			payment_methods: "ready",
		},
	});

	it("returns a ready session from cached opening data for the current user", async () => {
		const result = await recoverPosSession({
			getCachedOpening: () => ({
				pos_profile: {
					name: "Main POS",
					modified: "2026-04-10 08:00:00",
					company: "Test Co",
					currency: "PKR",
					warehouse: "Stores - TC",
					selling_price_list: "Standard Selling",
					income_account: "Sales - TC",
					expense_account: "Cost - TC",
				},
				pos_opening_shift: {
					name: "POS-OPEN-1",
					user: "cashier@example.com",
				},
			}),
			getServerOpening: async () => null,
			currentUser: "cashier@example.com",
			currentSnapshot,
			buildVersion: "build-1",
		});

		expect(result.status).toBe("ready");
		expect(result.source).toBe("cache");
		expect(result.session.posProfile.name).toBe("Main POS");
		expect(result.session.posOpeningShift.name).toBe("POS-OPEN-1");
		expect(result.bootstrapSnapshot?.build_version).toBe("build-1");
	});

	it("falls back to the server opening when the cache does not match the cashier", async () => {
		const result = await recoverPosSession({
			getCachedOpening: () => ({
				pos_profile: {
					name: "Other POS",
					modified: "2026-04-10 07:00:00",
				},
				pos_opening_shift: {
					name: "POS-OPEN-OLD",
					user: "another@example.com",
				},
			}),
			getServerOpening: async () => ({
				pos_profile: {
					name: "Main POS",
					modified: "2026-04-10 08:00:00",
					company: "Test Co",
					currency: "PKR",
					warehouse: "Stores - TC",
					selling_price_list: "Standard Selling",
					income_account: "Sales - TC",
					expense_account: "Cost - TC",
				},
				pos_opening_shift: {
					name: "POS-OPEN-2",
					user: "cashier@example.com",
				},
			}),
			currentUser: "cashier@example.com",
			currentSnapshot,
			buildVersion: "build-1",
		});

		expect(result.status).toBe("ready");
		expect(result.source).toBe("server");
		expect(result.session.posOpeningShift.name).toBe("POS-OPEN-2");
	});

	it("returns needs_register_setup when no cached or server session exists", async () => {
		const result = await recoverPosSession({
			getCachedOpening: () => null,
			getServerOpening: async () => null,
			currentUser: "cashier@example.com",
			currentSnapshot,
			buildVersion: "build-1",
		});

		expect(result.status).toBe("needs_register_setup");
		expect(result.message).toBe("No opening shift found.");
		expect(result.source).toBeNull();
	});
});
