import { afterEach, describe, expect, it } from "vitest";
import {
	buildBootstrapSnapshot,
	collectBootstrapPrerequisites,
	createBootstrapSnapshotFromRegisterData,
	refreshBootstrapSnapshotFromCaches,
	resolveBootstrapRuntimeState,
	validateBootstrapSnapshot,
} from "../src/offline/bootstrapSnapshot";
import {
	getBootstrapSnapshot,
	saveCoupons,
	saveItemGroups,
	saveOffers,
	setBootstrapSnapshot,
	setPrintTemplate,
	setTaxInclusiveSetting,
	setTermsAndConditions,
} from "../src/offline/cache";
import { setStockCacheReady } from "../src/offline/stock";
import { formatBootstrapWarning } from "../src/posapp/utils/bootstrapWarnings";

describe("bootstrap snapshot", () => {
	afterEach(() => {
		setBootstrapSnapshot(null);
		saveOffers([]);
		saveCoupons({});
		saveItemGroups([]);
		setPrintTemplate("");
		setTermsAndConditions("");
		setTaxInclusiveSetting(false);
		setStockCacheReady(false);
		setBootstrapSnapshot(null);
	});

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

		// Missing pricing prerequisites do not block selling — mode stays normal.
		// Capabilities accurately reflect the reduced offline functionality.
		expect(result.mode).toBe("normal");
		expect(result.capabilities.canApplyPricingOffline).toBe(false);
		expect(result.capabilities.canSellOffline).toBe(true);
		expect(
			result.capabilitySummaries.find(
				(summary) => summary.id === "pricing_offline",
			)?.status,
		).toBe("degraded");
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
			deliveryChargesCount: 1,
			currencyOptionsCount: 2,
			exchangeRateCount: 2,
			priceListMetaReady: true,
			customerAddressesCount: 1,
			paymentMethodCurrencyCount: 2,
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
		expect(prerequisites.delivery_charges_cache).toBe("ready");
		expect(prerequisites.currency_options_cache).toBe("ready");
		expect(prerequisites.exchange_rate_cache).toBe("ready");
		expect(prerequisites.price_list_meta_cache).toBe("ready");
		expect(prerequisites.customer_addresses_cache).toBe("ready");
		expect(prerequisites.payment_method_currency_cache).toBe("ready");
	});

	it("formats new prerequisite warning messages explicitly", () => {
		expect(formatBootstrapWarning("delivery_charges_cache")).toContain(
			"delivery charges",
		);
		expect(formatBootstrapWarning("currency_options_cache")).toContain(
			"currency",
		);
		expect(formatBootstrapWarning("exchange_rate_cache")).toContain(
			"exchange rate",
		);
		expect(formatBootstrapWarning("price_list_meta_cache")).toContain(
			"price list",
		);
		expect(formatBootstrapWarning("customer_addresses_cache")).toContain(
			"address",
		);
		expect(formatBootstrapWarning("payment_method_currency_cache")).toContain(
			"payment method",
		);
	});

	it("keeps sell capability available when optional non-selling prerequisites are missing", () => {
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
					pricing_rules_snapshot: "ready",
					pricing_rules_context: "ready",
					tax_inclusive: "ready",
					stock_cache_ready: "ready",
					sales_persons: "missing",
					item_groups: "missing",
				},
			}),
			{
				buildVersion: "build-2",
				profileName: "Main POS",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			},
		);

		const decision = resolveBootstrapRuntimeState(result);

		// Optional prerequisites (sales_persons, item_groups, stock_cache_ready)
		// being absent is a valid empty/not-configured state — mode must stay
		// "normal" so no false warning banner is shown.
		expect(result.mode).toBe("normal");
		expect(result.capabilities.canSellOffline).toBe(true);
		expect(decision.limitedMode).toBe(false);
		expect(decision.primaryWarning.active).toBe(false);
	});

	it("requires stock-confidence override by default when stock cache is unverified", () => {
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

		const decision = resolveBootstrapRuntimeState(result);

		expect(result.mode).toBe("normal");
		expect(result.capabilities.canSellOffline).toBe(true);
		expect(result.capabilities.canTrustStockOffline).toBe(false);
		expect(
			result.capabilitySummaries.find(
				(summary) => summary.id === "stock_confidence_offline",
			)?.status,
		).toBe("override_required");
		expect(decision.limitedMode).toBe(true);
		expect(decision.primaryWarning.capabilityId).toBe("stock_confidence_offline");
		expect(decision.primaryWarning.active).toBe(true);
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
					payments: [{ mode_of_payment: "Cash" }],
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
		expect(snapshot.prerequisites.payment_methods).toBe("ready");
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

	it("refreshes snapshot metadata and prerequisites from cached state", () => {
		const snapshot = refreshBootstrapSnapshotFromCaches({
			currentSnapshot: buildBootstrapSnapshot({
				buildVersion: "build-1",
				profileName: "OLD-POS",
				profileModified: "2026-04-08 09:00:00",
				openingShiftName: "OLD-SHIFT",
				openingShiftUser: "old@example.com",
				prerequisites: {
					payment_methods: "missing",
				},
			}),
			buildVersion: "build-2",
			registerData: {
				pos_profile: {
					name: "POS-1",
					modified: "2026-04-08 10:00:00",
				},
				pos_opening_shift: {
					name: "SHIFT-1",
					user: "test@example.com",
				},
			},
			cacheState: {
				paymentMethods: [{ mode_of_payment: "Cash" }],
				itemsCount: 10,
				customersCount: 5,
				pricingSnapshotCount: 1,
				pricingContext: { profile_name: "POS-1" },
				taxInclusive: true,
				printTemplate: "<div>Receipt</div>",
				termsAndConditions: "Terms",
				offers: [{ name: "OFFER-1" }],
				coupons: { CUSTOMER1: ["COUPON-1"] },
			},
		});

		expect(snapshot.build_version).toBe("build-2");
		expect(snapshot.profile_name).toBe("POS-1");
		expect(snapshot.profile_modified).toBe("2026-04-08 10:00:00");
		expect(snapshot.opening_shift_name).toBe("SHIFT-1");
		expect(snapshot.opening_shift_user).toBe("test@example.com");
		expect(snapshot.prerequisites.payment_methods).toBe("ready");
		expect(snapshot.prerequisites.items_cache_ready).toBe("ready");
		expect(snapshot.prerequisites.customers_cache_ready).toBe("ready");
	});

	it("preserves existing metadata when refresh runs without new register data", () => {
		const snapshot = refreshBootstrapSnapshotFromCaches({
			currentSnapshot: buildBootstrapSnapshot({
				buildVersion: "build-2",
				profileName: "POS-1",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "SHIFT-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					payment_methods: "missing",
				},
			}),
			cacheState: {
				paymentMethods: [{ mode_of_payment: "Cash" }],
				itemsCount: 10,
				customersCount: 5,
			},
		});

		expect(snapshot.build_version).toBe("build-2");
		expect(snapshot.profile_name).toBe("POS-1");
		expect(snapshot.opening_shift_name).toBe("SHIFT-1");
		expect(snapshot.prerequisites.payment_methods).toBe("ready");
		expect(snapshot.prerequisites.items_cache_ready).toBe("ready");
		expect(snapshot.prerequisites.customers_cache_ready).toBe("ready");
	});

	it("refreshes bootstrap snapshot from cache writers without clearing unrelated readiness", () => {
		setBootstrapSnapshot(
			buildBootstrapSnapshot({
				buildVersion: "build-2",
				profileName: "POS-1",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "SHIFT-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "ready",
					items_cache_ready: "ready",
					customers_cache_ready: "ready",
				},
			}),
		);

		saveOffers([{ name: "OFFER-1" }]);
		saveCoupons({ CUSTOMER1: ["COUPON-1"] });
		setTaxInclusiveSetting(true);
		setPrintTemplate("<div>Receipt</div>");
		setTermsAndConditions("Terms");
		saveItemGroups(["ALL", "Beverages"]);
		setStockCacheReady(false);

		const snapshot = getBootstrapSnapshot();

		expect(snapshot.prerequisites.payment_methods).toBe("ready");
		expect(snapshot.prerequisites.items_cache_ready).toBe("ready");
		expect(snapshot.prerequisites.customers_cache_ready).toBe("ready");
		expect(snapshot.prerequisites.offers_cache).toBe("ready");
		expect(snapshot.prerequisites.coupons_cache).toBe("ready");
		expect(snapshot.prerequisites.tax_inclusive).toBe("ready");
		expect(snapshot.prerequisites.print_template).toBe("ready");
		expect(snapshot.prerequisites.terms_and_conditions).toBe("ready");
		expect(snapshot.prerequisites.item_groups).toBe("ready");
		expect(snapshot.prerequisites.stock_cache_ready).toBe("missing");
	});

	it("recomputes item and customer readiness on profile switch", () => {
		const snapshot = refreshBootstrapSnapshotFromCaches({
			currentSnapshot: buildBootstrapSnapshot({
				buildVersion: "build-2",
				profileName: "POS-1",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "SHIFT-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "ready",
					items_cache_ready: "ready",
					customers_cache_ready: "ready",
				},
			}),
			registerData: {
				pos_profile: {
					name: "POS-2",
					modified: "2026-04-09 09:00:00",
				},
				pos_opening_shift: {
					name: "SHIFT-2",
					user: "test@example.com",
				},
			},
			cacheState: {
				itemsCount: 0,
				customersCount: 0,
			},
		});

		expect(snapshot.profile_name).toBe("POS-2");
		expect(snapshot.profile_modified).toBe("2026-04-09 09:00:00");
		expect(snapshot.opening_shift_name).toBe("SHIFT-2");
		expect(snapshot.prerequisites.pos_profile).toBe("ready");
		expect(snapshot.prerequisites.pos_opening_shift).toBe("ready");
		expect(snapshot.prerequisites.items_cache_ready).toBe("missing");
		expect(snapshot.prerequisites.customers_cache_ready).toBe("missing");
	});

	it("formats expanded warnings for new prerequisite codes", () => {
		expect(formatBootstrapWarning("items_cache_ready")).toContain("item cache");
		expect(formatBootstrapWarning("customers_cache_ready")).toContain(
			"customer cache",
		);
		expect(formatBootstrapWarning("sales_persons")).toContain("sales persons");
		expect(formatBootstrapWarning("item_groups")).toContain("item groups");
		expect(formatBootstrapWarning("tax_inclusive")).toContain("tax inclusive");
		expect(formatBootstrapWarning("stock_cache_ready")).toContain("stock cache");
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
		expect(decisionFor(result).primaryWarning.active).toBe(true);
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

function decisionFor(validation: ReturnType<typeof validateBootstrapSnapshot>) {
	return resolveBootstrapRuntimeState(validation);
}
