export type BootstrapPrerequisiteState =
	| "ready"
	| "missing"
	| "stale"
	| "error";

export type BootstrapSnapshotInput = {
	buildVersion?: string | null;
	profileName?: string | null;
	profileModified?: string | null;
	openingShiftName?: string | null;
	openingShiftUser?: string | null;
	prerequisites?: Record<string, BootstrapPrerequisiteState>;
};

export type BootstrapSnapshot = {
	build_version: string | null;
	profile_name: string | null;
	profile_modified: string | null;
	opening_shift_name: string | null;
	opening_shift_user: string | null;
	prerequisites: Record<string, BootstrapPrerequisiteState>;
};

export type BootstrapValidationInput = {
	buildVersion?: string | null;
	profileName?: string | null;
	profileModified?: string | null;
	sessionUser?: string | null;
};

export function buildBootstrapSnapshot(
	input: BootstrapSnapshotInput,
): BootstrapSnapshot {
	return {
		build_version: input.buildVersion || null,
		profile_name: input.profileName || null,
		profile_modified: input.profileModified || null,
		opening_shift_name: input.openingShiftName || null,
		opening_shift_user: input.openingShiftUser || null,
		prerequisites: input.prerequisites || {},
	};
}

export function validateBootstrapSnapshot(
	snapshot: BootstrapSnapshot | null | undefined,
	current: BootstrapValidationInput,
) {
	const reasons: string[] = [];

	if ((snapshot?.build_version || null) !== (current?.buildVersion || null)) {
		reasons.push("build_version_mismatch");
	}

	return {
		mode: reasons.length ? "confirmation_required" : "normal",
		reasons,
	};
}
