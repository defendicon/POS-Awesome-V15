// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
	buildBootstrapSnapshot,
	refreshBootstrapSnapshotFromCaches,
	resolveBootstrapRuntimeState,
	validateBootstrapSnapshot,
} from "../src/offline/bootstrapSnapshot";
import {
	getBootstrapLimitedMode,
	getBootstrapSnapshot,
	getBootstrapSnapshotStatus,
	setBootstrapLimitedMode,
	setBootstrapSnapshot,
	setBootstrapSnapshotStatus,
} from "../src/offline/cache";
import { listenForBootstrapSnapshotUpdates } from "../src/posapp/utils/bootstrapRuntimeEvents";

describe("bootstrap runtime reevaluation", () => {
	afterEach(() => {
		setBootstrapSnapshot(null);
		setBootstrapSnapshotStatus(null);
		setBootstrapLimitedMode(false);
	});

	it("updates persisted bootstrap warning state when sync refresh makes selling ready", () => {
		const stopListening = listenForBootstrapSnapshotUpdates(() => {
			const validation = validateBootstrapSnapshot(getBootstrapSnapshot(), {
				buildVersion: "build-2",
				profileName: "POS-1",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			});
			const decision = resolveBootstrapRuntimeState(validation);
			setBootstrapSnapshotStatus({
				snapshot: currentSnapshot,
				mode: validation.mode,
				runtime_mode: decision.mode,
				reasons: validation.reasons,
				missing_prerequisites: validation.missingPrerequisites,
				warning_codes: decision.warningCodes,
				capabilities: validation.capabilities,
				capability_summaries: decision.capabilitySummaries,
				primary_warning: decision.primaryWarning,
			});
			setBootstrapLimitedMode(decision.limitedMode);
		});

		let currentSnapshot = buildBootstrapSnapshot({
			buildVersion: "build-2",
			profileName: "POS-1",
			profileModified: "2026-04-08 10:00:00",
			openingShiftName: "SHIFT-1",
			openingShiftUser: "test@example.com",
			prerequisites: {
				pos_profile: "ready",
				pos_opening_shift: "ready",
				payment_methods: "missing",
				items_cache_ready: "missing",
				customers_cache_ready: "missing",
			},
		});

		setBootstrapSnapshot(currentSnapshot);
		expect(getBootstrapLimitedMode()).toBe(true);
		expect(getBootstrapSnapshotStatus()?.capabilities?.canSellOffline).toBe(false);

		currentSnapshot = refreshBootstrapSnapshotFromCaches({
			currentSnapshot,
			cacheState: {
				paymentMethods: [{ mode_of_payment: "Cash" }],
				itemsCount: 10,
				customersCount: 5,
				pricingSnapshotCount: 1,
				pricingContext: { profile_name: "POS-1" },
				taxInclusive: true,
				stockCacheReady: true,
			},
		});
		setBootstrapSnapshot(currentSnapshot);

		expect(getBootstrapLimitedMode()).toBe(false);
		expect(getBootstrapSnapshotStatus()?.capabilities?.canSellOffline).toBe(true);
		expect(getBootstrapSnapshotStatus()?.primary_warning?.active).toBe(false);

		stopListening();
	});

	it("clears the stock-confidence warning in the same session after stock sync succeeds", () => {
		const stopListening = listenForBootstrapSnapshotUpdates(() => {
			const validation = validateBootstrapSnapshot(getBootstrapSnapshot(), {
				buildVersion: "build-2",
				profileName: "POS-1",
				profileModified: "2026-04-08 10:00:00",
				sessionUser: "test@example.com",
			});
			const decision = resolveBootstrapRuntimeState(validation);
			setBootstrapSnapshotStatus({
				snapshot: currentSnapshot,
				mode: validation.mode,
				runtime_mode: decision.mode,
				reasons: validation.reasons,
				missing_prerequisites: validation.missingPrerequisites,
				warning_codes: decision.warningCodes,
				capabilities: validation.capabilities,
				capability_summaries: decision.capabilitySummaries,
				primary_warning: decision.primaryWarning,
			});
			setBootstrapLimitedMode(decision.limitedMode);
		});

		let currentSnapshot = buildBootstrapSnapshot({
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
				pricing_rules_snapshot: "ready",
				pricing_rules_context: "ready",
				tax_inclusive: "ready",
				stock_cache_ready: "missing",
			},
		});

		setBootstrapSnapshot(currentSnapshot);
		expect(getBootstrapLimitedMode()).toBe(true);
		expect(getBootstrapSnapshotStatus()?.primary_warning?.capabilityId).toBe(
			"stock_confidence_offline",
		);

		currentSnapshot = refreshBootstrapSnapshotFromCaches({
			currentSnapshot,
			cacheState: {
				stockCacheReady: true,
			},
		});
		setBootstrapSnapshot(currentSnapshot);

		expect(getBootstrapLimitedMode()).toBe(false);
		expect(getBootstrapSnapshotStatus()?.capabilities?.canTrustStockOffline).toBe(
			true,
		);
		expect(getBootstrapSnapshotStatus()?.primary_warning?.active).toBe(false);

		stopListening();
	});
});
