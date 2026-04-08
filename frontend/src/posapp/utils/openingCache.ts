export function hasCachedOpeningData(openingData: any): boolean {
	return !!(
		openingData &&
		openingData.pos_profile &&
		openingData.pos_opening_shift &&
		openingData.pos_opening_shift.user
	);
}

export function isCachedOpeningValidForCurrentUser(
	openingData: any,
	currentUser?: string | null,
): boolean {
	if (!hasCachedOpeningData(openingData)) {
		return false;
	}
	const cachedUser = openingData?.pos_opening_shift?.user;
	if (!currentUser || !cachedUser) {
		return false;
	}
	return currentUser === cachedUser;
}

export function getValidCachedOpeningForCurrentUser(
	openingData: any,
	currentUser?: string | null,
) {
	if (!isCachedOpeningValidForCurrentUser(openingData, currentUser)) {
		return null;
	}
	return openingData;
}

export function getCachedOpeningBootstrapSeed(openingData: any) {
	if (!hasCachedOpeningData(openingData)) {
		return null;
	}

	return {
		profileName: openingData?.pos_profile?.name || null,
		profileModified: openingData?.pos_profile?.modified || null,
		openingShiftName: openingData?.pos_opening_shift?.name || null,
		openingShiftUser: openingData?.pos_opening_shift?.user || null,
	};
}
