import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheMocks = vi.hoisted(() => ({
	getBootstrapSnapshot: vi.fn(),
	setBootstrapSnapshot: vi.fn(),
}));

vi.mock("../src/offline/cache", () => cacheMocks);

import { buildBootstrapSnapshot } from "../src/offline/bootstrapSnapshot";
import { refreshSnapshotFromSync } from "../src/offline/sync/adapters/common";

describe("sync-driven bootstrap snapshot refresh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cacheMocks.getBootstrapSnapshot.mockReturnValue(
			buildBootstrapSnapshot({
				buildVersion: "build-2",
				profileName: "POS-1",
				profileModified: "2026-04-08 10:00:00",
				openingShiftName: "SHIFT-1",
				openingShiftUser: "test@example.com",
				prerequisites: {
					pos_profile: "ready",
					pos_opening_shift: "ready",
					payment_methods: "missing",
					items_cache_ready: "ready",
					customers_cache_ready: "ready",
				},
			}),
		);
	});

	it("marks payment methods ready from sync profile data", () => {
		const snapshot = refreshSnapshotFromSync({
			posProfile: {
				name: "POS-1",
				modified: "2026-04-08 10:00:00",
				payments: [{ mode_of_payment: "Cash" }, { mode_of_payment: "Card" }],
			},
			cacheState: {
				itemsCount: 10,
				customersCount: 5,
			},
		});

		expect(snapshot.prerequisites.payment_methods).toBe("ready");
		expect(cacheMocks.setBootstrapSnapshot).toHaveBeenCalledWith(snapshot);
	});

	it("prefers synced profile payments over stale cache payment methods", () => {
		const snapshot = refreshSnapshotFromSync({
			posProfile: {
				name: "POS-1",
				modified: "2026-04-08 10:00:00",
				payments: [{ mode_of_payment: "Cash" }],
			},
			cacheState: {
				paymentMethods: [],
				itemsCount: 10,
				customersCount: 5,
			},
		});

		expect(snapshot.prerequisites.payment_methods).toBe("ready");
		expect(cacheMocks.setBootstrapSnapshot).toHaveBeenCalledWith(snapshot);
	});
});
