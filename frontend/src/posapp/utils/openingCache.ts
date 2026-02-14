export function isCachedOpeningValidForCurrentUser(
	openingData: any,
	currentUser?: string | null,
): boolean {
	if (!openingData || !openingData.pos_profile || !openingData.pos_opening_shift) {
		return false;
	}
	const cachedUser = openingData?.pos_opening_shift?.user;
	if (!currentUser || !cachedUser) {
		return false;
	}
	return currentUser === cachedUser;
}
