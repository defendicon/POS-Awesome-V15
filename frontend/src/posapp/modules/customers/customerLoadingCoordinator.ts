type CustomerProfile = {
	name?: string | null;
	modified?: string | null;
};

type EnsureCustomersReadyArgs = {
	profile: CustomerProfile | null | undefined;
	online: boolean;
	manualOffline: boolean;
	force?: boolean;
	isReady?: () => boolean;
	setProfile: (_profile: CustomerProfile | null) => void;
	load: () => Promise<void>;
};

const inflightLoads = new Map<string, Promise<void>>();
const completedLoads = new Set<string>();

function getCustomerLoadKey(profile: CustomerProfile | null | undefined) {
	const profileName = String(profile?.name || "").trim();
	if (!profileName) {
		return "";
	}
	const profileModified = String(profile?.modified || "").trim();
	return `${profileName}::${profileModified}`;
}

export function resetCustomerLoadingCoordinator() {
	inflightLoads.clear();
	completedLoads.clear();
}

export async function ensureCustomersReady({
	profile,
	online,
	manualOffline,
	force = false,
	isReady,
	setProfile,
	load,
}: EnsureCustomersReadyArgs) {
	const loadKey = getCustomerLoadKey(profile);
	if (!loadKey) {
		setProfile(null);
		return false;
	}

	setProfile(profile as CustomerProfile);

	if (!online || manualOffline) {
		return false;
	}

	if (force) {
		completedLoads.delete(loadKey);
	}

	const hasReadyCustomerCache = () => {
		if (!isReady) {
			return true;
		}
		try {
			return Boolean(isReady());
		} catch (error) {
			console.warn("Unable to verify customer cache readiness", error);
			return false;
		}
	};

	if (!force && completedLoads.has(loadKey) && hasReadyCustomerCache()) {
		return false;
	}

	if (!hasReadyCustomerCache()) {
		completedLoads.delete(loadKey);
	}

	const inflight = inflightLoads.get(loadKey);
	if (inflight) {
		await inflight;
		return true;
	}

	let loadPromise: Promise<void>;
	try {
		loadPromise = Promise.resolve(load()).then(() => {
			if (hasReadyCustomerCache()) {
				completedLoads.add(loadKey);
			}
		});
	} catch (error) {
		loadPromise = Promise.reject(error);
	}

	inflightLoads.set(loadKey, loadPromise);

	try {
		await loadPromise;
		return true;
	} finally {
		if (inflightLoads.get(loadKey) === loadPromise) {
			inflightLoads.delete(loadKey);
		}
	}
}
