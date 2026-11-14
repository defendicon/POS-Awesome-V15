import {
	validateBootstrapSnapshot,
	type BootstrapSnapshot,
} from "../../offline/bootstrapSnapshot";
import type { SyncResourceState } from "../../offline/sync/types";

export function evaluateOfflineReadiness(
	profile: any,
	snapshot: BootstrapSnapshot | null,
	states: SyncResourceState[],
	sessionUser: string,
	now = Date.now(),
) {
	const maxHours =
		Number(profile?.posa_offline_cache_max_age_hours) > 0
			? Number(profile.posa_offline_cache_max_age_hours)
			: 24;
	const strict = profile?.posa_offline_stale_cache_action === "Block";
	const validation = validateBootstrapSnapshot(snapshot, {
		profileName: profile?.name,
		profileModified: profile?.modified || null,
		sessionUser,
		buildVersion: snapshot?.build_version,
	});
	const scopeMismatch = validation.reasons.some((reason) =>
		[
			"opening_shift_user_mismatch",
			"profile_name_mismatch",
			"profile_modified_mismatch",
		].includes(reason),
	);
	const definitions = [
		["items", "Items"],
		["item_prices", "Prices"],
		["pricing_rules", "Pricing rules"],
		["customers", "Customers / price lists"],
		["bootstrap_config", "Taxes / payment configuration"],
		["stock", "Stock on this device"],
	];
	const rows = definitions.map(([id, label]) => {
		const state = states.find((row) => row.resourceId === id);
		const synced = Date.parse(state?.lastSyncedAt || "");
		let matchingScope = false;
		try {
			const scope = JSON.parse(state?.scopeSignature || "null");
			matchingScope =
				scope?.profile === profile?.name &&
				scope?.company === profile?.company &&
				(scope?.warehouse || null) === (profile?.warehouse || null);
		} catch {
			/* An old/non-JSON scope is unverified, never implicitly fresh. */
		}
		const fresh =
			matchingScope &&
			state?.status === "fresh" &&
			Number.isFinite(synced) &&
			synced <= now + 60_000 &&
			now - synced <= maxHours * 3600_000;
		return {
			id: id!,
			label: label!,
			status: fresh ? "ready" : "unverified",
			lastSyncedAt: state?.lastSyncedAt || null,
			message: fresh
				? "Prepared on this device"
				: state?.lastError ||
					"Missing, stale or outside the active POS scope",
		};
	});
	const warnings = rows
		.filter((row) => row.status !== "ready")
		.map((row) => `${row.label}: ${row.message}`);
	if (!snapshot || validation.mode === "limited")
		warnings.unshift(
			"Core offline cache is incomplete. Refresh this POS Profile online.",
		);
	if (scopeMismatch)
		warnings.unshift(
			"Cached POS configuration belongs to another session or profile revision. Refresh online.",
		);
	return {
		rows,
		warnings,
		blocked: scopeMismatch || (strict && warnings.length > 0),
		policy: strict ? "Block" : "Warn",
		maxHours,
	};
}
