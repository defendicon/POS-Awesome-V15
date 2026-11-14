import { describe, expect, it } from "vitest";
import { evaluateOfflineReadiness } from "../src/posapp/utils/offlineReadiness";
const profile = {
	name: "Main",
	company: "Co",
	warehouse: "WH",
	modified: "v1",
	posa_offline_cache_max_age_hours: 2,
	posa_offline_stale_cache_action: "Block",
};
const snapshot: any = {
	build_version: null,
	profile_name: "Main",
	profile_modified: "v1",
	opening_shift_user: "terminal",
	prerequisites: {
		pos_profile: "ready",
		pos_opening_shift: "ready",
		payment_methods: "ready",
		items_cache_ready: "ready",
		customers_cache_ready: "ready",
	},
};
const now = Date.now();
const fresh: any[] = [
	"items",
	"item_prices",
	"pricing_rules",
	"customers",
	"bootstrap_config",
	"stock",
].map((resourceId) => ({
	resourceId,
	status: "fresh",
	lastSyncedAt: new Date(now - 60_000).toISOString(),
	scopeSignature: JSON.stringify({
		profile: "Main",
		company: "Co",
		warehouse: "WH",
	}),
}));
describe("POS Profile offline readiness policy", () => {
	it("requires current resource evidence in the correct company/profile/warehouse", () => {
		expect(
			evaluateOfflineReadiness(profile, snapshot, fresh, "terminal", now)
				.blocked,
		).toBe(false);
		expect(
			evaluateOfflineReadiness(
				{ ...profile, warehouse: "OTHER" },
				snapshot,
				fresh,
				"terminal",
				now,
			).blocked,
		).toBe(true);
	});
	it("honors configured age and warning/block policies without inventing freshness", () => {
		expect(
			evaluateOfflineReadiness(
				profile,
				snapshot,
				fresh,
				"terminal",
				now + 3 * 3600_000,
			).blocked,
		).toBe(true);
		const report = evaluateOfflineReadiness(
			{ ...profile, posa_offline_stale_cache_action: "Warn" },
			snapshot,
			[],
			"terminal",
			now,
		);
		expect(report.blocked).toBe(false);
		expect(report.rows.every((row) => row.status === "unverified")).toBe(
			true,
		);
	});
	it("blocks a mismatched user/profile even when warning mode is configured", () => {
		expect(
			evaluateOfflineReadiness(
				{ ...profile, posa_offline_stale_cache_action: "Warn" },
				snapshot,
				fresh,
				"other",
				now,
			).blocked,
		).toBe(true);
	});
	it("handles missing legacy snapshot fields safely", () => {
		expect(
			evaluateOfflineReadiness(
				{ name: "Main" },
				null,
				[],
				"terminal",
				now,
			).warnings.length,
		).toBeGreaterThan(0);
	});
	it.each([null, "profile:Main", "invalid-json"])(
		"keeps fresh-looking legacy records unverified without valid scope: %s",
		(scopeSignature) => {
			const report = evaluateOfflineReadiness(
				profile,
				snapshot,
				fresh.map((state) => ({ ...state, scopeSignature })),
				"terminal",
				now,
			);
			expect(report.blocked).toBe(true);
			expect(
				report.rows.every((row) => row.status === "unverified"),
			).toBe(true);
		},
	);
});
