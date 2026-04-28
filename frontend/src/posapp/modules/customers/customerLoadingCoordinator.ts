type CustomerProfile = {
	name?: string | null;
	modified?: string | null;
};

type EnsureCustomersReadyArgs = {
	profile: CustomerProfile | null | undefined;
	online: boolean;
	manualOffline: boolean;
	force?: boolean;
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

	if (!force && completedLoads.has(loadKey)) {
		return false;
	}

	const inflight = inflightLoads.get(loadKey);
	if (inflight) {
		await inflight;
		return true;
	}

	let loadPromise: Promise<void>;
	try {
		loadPromise = Promise.resolve(load()).then(() => {
			completedLoads.add(loadKey);
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
