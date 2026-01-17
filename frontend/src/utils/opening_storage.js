/* global frappe */
import { setOpeningStorage } from "../offline/index.js";

export function isOpeningStorageValidForUser(data, sessionUser = frappe?.session?.user) {
	if (!data?.pos_profile) return false;
	if (!sessionUser) return false;
	const cachedUser = data.cached_user || data.pos_opening_shift?.user || null;
	return cachedUser === sessionUser;
}

export function cacheOpeningStorageWithUser(data) {
	try {
		setOpeningStorage({ ...data, cached_user: frappe?.session?.user || null });
	} catch (e) {
		console.error("Failed to cache opening data", e);
	}
}
