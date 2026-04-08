import { describe, expect, it } from "vitest";
import {
	buildBootstrapSnapshot,
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
});
