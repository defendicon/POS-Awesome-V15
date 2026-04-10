import { describe, expect, it } from "vitest";

import {
	buildBootstrapSnapshot,
	collectBootstrapPrerequisites,
} from "../src/offline/bootstrapSnapshot";
import { runRegisterStartup } from "../src/posapp/domain/startup/registerStartup";

function createReadySnapshot(buildVersion = "build-2") {
	return buildBootstrapSnapshot({
		buildVersion,
		profileName: "Main POS",
		profileModified: "2026-04-08 10:00:00",
		openingShiftName: "POS-OPEN-1",
		openingShiftUser: "test@example.com",
		prerequisites: collectBootstrapPrerequisites({
			profileName: "Main POS",
			openingShiftName: "POS-OPEN-1",
			openingShiftUser: "test@example.com",
			paymentMethods: [{ mode_of_payment: "Cash" }],
			salesPersons: [{ name: "Cashier" }],
			itemsCount: 25,
			customersCount: 8,
			itemGroups: ["All"],
			pricingSnapshotCount: 1,
			pricingContext: { profile_name: "Main POS" },
			taxInclusive: false,
			printTemplate: "<div>Receipt</div>",
			termsAndConditions: "Terms",
			offers: [{ name: "OFFER-1" }],
			coupons: { CUSTOMER1: ["COUPON-1"] },
			stockCacheReady: true,
			deliveryChargesCount: 1,
			currencyOptionsCount: 2,
			exchangeRateCount: 1,
			priceListMetaReady: true,
			customerAddressesCount: 1,
			paymentMethodCurrencyCount: 1,
		}),
	});
}

function createRegisterData() {
	return {
		pos_profile: {
			name: "Main POS",
			modified: "2026-04-08 10:00:00",
		},
		pos_opening_shift: {
			name: "POS-OPEN-1",
			user: "test@example.com",
		},
	};
}

describe("runRegisterStartup", () => {
	it("returns ready when register data and snapshot are aligned", () => {
		const result = runRegisterStartup({
			snapshot: createReadySnapshot(),
			registerData: createRegisterData(),
			validationInput: {
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
		});

		expect(result.status).toBe("ready");
		expect(result.warningCodes).toEqual([]);
		expect(result.data).toMatchObject({
			profileName: "Main POS",
			openingShiftName: "POS-OPEN-1",
		});
		expect(result.runtime.mode).toBe("normal");
	});

	it("returns degraded when bootstrap validation requires limited warning mode", () => {
		const result = runRegisterStartup({
			snapshot: createReadySnapshot("build-1"),
			registerData: createRegisterData(),
			validationInput: {
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
			continueOffline: true,
		});

		expect(result.status).toBe("degraded");
		expect(result.warningCodes).toContain("build_version_mismatch");
		expect(result.runtime.mode).toBe("limited");
		expect(result.data).toMatchObject({
			profileName: "Main POS",
			openingShiftUser: "test@example.com",
		});
	});
});
