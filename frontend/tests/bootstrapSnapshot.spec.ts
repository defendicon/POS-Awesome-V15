import { describe, expect, it } from "vitest";
import {
	buildBootstrapSnapshot,
	createBootstrapSnapshotFromRegisterData,
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
});
