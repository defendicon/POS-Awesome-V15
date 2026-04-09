import { describe, expect, it } from "vitest";
import {
	buildBootstrapSnapshot,
	collectBootstrapPrerequisites,
	createBootstrapSnapshotFromRegisterData,
	resolveBootstrapRuntimeState,
	validateBootstrapSnapshot,
} from "../src/offline/bootstrapSnapshot";

describe("bootstrap snapshot", () => {
	it("returns confirmation_required on build mismatch", () => {
		const snapshot = buildBootstrapSnapshot({
			buildVersion: "build-1",
			profileName: "Main POS",
			profileModified: "2026-04-08 10:00:00",
			openingShiftName: "POS-OPEN-1",
			openingShiftUser: "test@example.com",
			prerequisites: {
				pos_profile: "ready",
				pos_opening_shift: "ready",
				payment_methods: "ready",
			},
		});

		const result = validateBootstrapSnapshot(snapshot, {
			buildVersion: "build-2",
			profileName: "Main POS",
			profileModified: "2026-04-08 10:00:00",
			sessionUser: "test@example.com",
		});

		expect(result.mode).toBe("confirmation_required");
		expect(result.reasons).toContain("build_version_mismatch");
	});

	it("returns limited mode when matching snapshot is incomplete", () => {
		const result = validateBootstrapSnapshot(
			buildBootstrapSnapshot({
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "POS-OPEN-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "missing",
				},
			}),
			{
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
		);

		expect(result.mode).toBe("limited");
		expect(result.missingPrerequisites).toContain("payment_methods");
	});

	it("returns invalid when opening shift belongs to a different user", () => {
		const result = validateBootstrapSnapshot(
			buildBootstrapSnapshot({
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "POS-OPEN-1",
				openingShiftUser: "another@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "ready",
				},
			}),
			{
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
		);

		expect(result.mode).toBe("invalid");
		expect(result.reasons).toContain("opening_shift_user_mismatch");
	});

	it("disables pricing capability when pricing prerequisites are missing", () => {
		const result = validateBootstrapSnapshot(
			buildBootstrapSnapshot({
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "POS-OPEN-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "ready",
					items_cache_ready: "ready",
					customers_cache_ready: "ready",
					pricing_rules_snapshot: "missing",
					pricing_rules_context: "missing",
				},
			}),
			{
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
		);

		expect(result.mode).toBe("limited");
		expect(result.capabilities.canApplyPricingOffline).toBe(false);
		expect(result.capabilities.canSellOffline).toBe(true);
	});

	it("collects expanded prerequisites from cached state", () => {
		const prerequisites = collectBootstrapPrerequisites({
			profileName: "POS-1",
			openingShiftName: "SHIFT-1",
			openingShiftUser: "test@example.com",
			paymentMethods: [{ mode_of_payment: "Cash" }],
			salesPersons: [],
			itemsCount: 25,
			customersCount: 3,
			itemGroups: ["ALL", "Beverages"],
			pricingSnapshotCount: 2,
			pricingContext: { profile_name: "POS-1" },
			taxInclusive: true,
			printTemplate: "<div>Receipt</div>",
			termsAndConditions: "Terms",
			offers: [{ name: "OFFER-1" }],
			coupons: { CUSTOMER1: ["COUPON-1"] },
			stockCacheReady: false,
		});

		expect(prerequisites.pos_profile).toBe("ready");
		expect(prerequisites.pos_opening_shift).toBe("ready");
		expect(prerequisites.payment_methods).toBe("ready");
		expect(prerequisites.sales_persons).toBe("missing");
		expect(prerequisites.items_cache_ready).toBe("ready");
		expect(prerequisites.customers_cache_ready).toBe("ready");
		expect(prerequisites.item_groups).toBe("ready");
		expect(prerequisites.pricing_rules_snapshot).toBe("ready");
		expect(prerequisites.pricing_rules_context).toBe("ready");
		expect(prerequisites.tax_inclusive).toBe("ready");
		expect(prerequisites.print_template).toBe("ready");
		expect(prerequisites.terms_and_conditions).toBe("ready");
		expect(prerequisites.offers_cache).toBe("ready");
		expect(prerequisites.coupons_cache).toBe("ready");
		expect(prerequisites.stock_cache_ready).toBe("missing");
	});

	it("keeps sell capability available when only warning prerequisites are missing", () => {
		const result = validateBootstrapSnapshot(
			buildBootstrapSnapshot({
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "POS-OPEN-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "ready",
					items_cache_ready: "ready",
					customers_cache_ready: "ready",
					sales_persons: "missing",
					item_groups: "missing",
					stock_cache_ready: "missing",
				},
			}),
			{
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
		);

		expect(result.mode).toBe("limited");
		expect(result.capabilities.canSellOffline).toBe(true);
	});

	it("blocks sell capability when item or customer caches are not ready", () => {
		const result = validateBootstrapSnapshot(
			buildBootstrapSnapshot({
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "POS-OPEN-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "ready",
					items_cache_ready: "missing",
					customers_cache_ready: "missing",
				},
			}),
			{
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
		);

		expect(result.mode).toBe("limited");
		expect(result.capabilities.canSellOffline).toBe(false);
	});

	it("hydrates profile and opening prerequisites from register data", () => {
		const snapshot = createBootstrapSnapshotFromRegisterData(
			{
				pos_profile: {
					name: "POS-1",
					modified: "2026-04-08 10:00:00",
				},
				pos_opening_shift: {
					name: "SHIFT-1",
					user: "test@example.com",
				},
			},
			null,
		);

		expect(snapshot.profile_name).toBe("POS-1");
		expect(snapshot.opening_shift_name).toBe("SHIFT-1");
		expect(snapshot.opening_shift_user).toBe("test@example.com");
		expect(snapshot.prerequisites.pos_profile).toBe("ready");
		expect(snapshot.prerequisites.pos_opening_shift).toBe("ready");
	});

	it("stamps the current build version into register snapshot updates", () => {
		const snapshot = createBootstrapSnapshotFromRegisterData(
			{
				pos_profile: {
					name: "POS-1",
					modified: "2026-04-08 10:00:00",
				},
				pos_opening_shift: {
					name: "SHIFT-1",
					user: "test@example.com",
				},
			},
			null,
			{
				buildVersion: "build-2",
			},
		);

		expect(snapshot.build_version).toBe("build-2");
	});

	it("returns limited mode when snapshot is missing", () => {
		const result = validateBootstrapSnapshot(null, {
			buildVersion: "build-2",
			profileName: "Main POS",
			profileModified: "2026-04-08 10:00:00",
			sessionUser: "test@example.com",
		});

		expect(result.mode).toBe("limited");
		expect(result.reasons).toContain("snapshot_missing");
		expect(result.capabilities.canSellOffline).toBe(false);
	});

	it("requires confirmation before continuing offline on snapshot mismatch", () => {
		const validation = validateBootstrapSnapshot(
			buildBootstrapSnapshot({
				buildVersion: "build-1",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "POS-OPEN-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "ready",
				},
			}),
			{
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
		);

		const decision = resolveBootstrapRuntimeState(validation);

		expect(decision.requiresConfirmation).toBe(true);
		expect(decision.limitedMode).toBe(false);
		expect(decision.mode).toBe("confirmation_required");
	});

	it("continues in limited mode after mismatch confirmation", () => {
		const validation = validateBootstrapSnapshot(
			buildBootstrapSnapshot({
				buildVersion: "build-1",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "POS-OPEN-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "ready",
				},
			}),
			{
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
		);

		const decision = resolveBootstrapRuntimeState(validation, {
			continueOffline: true,
		});

		expect(decision.requiresConfirmation).toBe(false);
		expect(decision.limitedMode).toBe(true);
		expect(decision.mode).toBe("limited");
		expect(decision.warningCodes).toContain("build_version_mismatch");
	});
});
