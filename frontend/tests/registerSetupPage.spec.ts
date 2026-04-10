import { describe, expect, it, vi } from "vitest";

import { buildBootstrapSnapshot } from "../src/offline/bootstrapSnapshot";
import { createRegisterSetupPage } from "../src/posapp/domain/session/registerSetupPage";

describe("createRegisterSetupPage", () => {
	const buildDialogData = () => ({
		companies: [{ name: "Test Co" }, { name: "Second Co" }],
		pos_profiles_data: [
			{ name: "Main POS", company: "Test Co" },
			{ name: "Backup POS", company: "Second Co" },
		],
		payments_method: [
			{ parent: "Main POS", mode_of_payment: "Cash", currency: "PKR" },
			{ parent: "Main POS", mode_of_payment: "Card", currency: "PKR" },
			{ parent: "Backup POS", mode_of_payment: "Cash", currency: "USD" },
		],
	});

	it("prefills register setup fields from cached opening dialog data", async () => {
		const page = createRegisterSetupPage({
			getCachedSetupData: () => buildDialogData(),
			getServerSetupData: async () => null,
			saveSetupCache: vi.fn(),
			submitOpeningShift: vi.fn(),
			saveOpeningStorage: vi.fn(),
			getBootstrapSnapshot: () => null,
			setBootstrapSnapshot: vi.fn(),
			buildVersion: "build-1",
		});

		await page.load();

		expect(page.state.value.stage).toBe("ready");
		expect(page.state.value.company).toBe("Test Co");
		expect(page.state.value.posProfile).toBe("Main POS");
		expect(page.state.value.paymentMethods).toEqual([
			{ mode_of_payment: "Cash", amount: 0, currency: "PKR" },
			{ mode_of_payment: "Card", amount: 0, currency: "PKR" },
		]);
	});

	it("submits the opening shift and stores the submitted register session", async () => {
		const saveOpeningStorage = vi.fn();
		const setBootstrapSnapshot = vi.fn();
		const submitOpeningShift = vi.fn(async () => ({
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
				name: "POS-OPEN-9",
				user: "cashier@example.com",
			},
		}));
		const page = createRegisterSetupPage({
			getCachedSetupData: () => buildDialogData(),
			getServerSetupData: async () => null,
			saveSetupCache: vi.fn(),
			submitOpeningShift,
			saveOpeningStorage,
			getBootstrapSnapshot: () =>
				buildBootstrapSnapshot({
					buildVersion: "build-1",
					profileName: "Main POS",
					profileModified: "2026-04-10 08:00:00",
					openingShiftName: null,
					openingShiftUser: null,
					prerequisites: {},
				}),
			setBootstrapSnapshot,
			buildVersion: "build-1",
		});

		await page.load();
		page.state.value.paymentMethods[0].amount = 500;

		await page.submit();

		expect(submitOpeningShift).toHaveBeenCalledWith({
			posProfile: "Main POS",
			company: "Test Co",
			balanceDetails: [
				{ mode_of_payment: "Cash", amount: 500, currency: "PKR" },
				{ mode_of_payment: "Card", amount: 0, currency: "PKR" },
			],
		});
		expect(saveOpeningStorage).toHaveBeenCalledTimes(1);
		expect(setBootstrapSnapshot).toHaveBeenCalledTimes(1);
		expect(page.state.value.stage).toBe("submitted");
		expect(page.state.value.submittedRegisterData?.pos_opening_shift?.name).toBe(
			"POS-OPEN-9",
		);
	});
});
