type ItemProfile = {
	name?: string | null;
	modified?: string | null;
};

type EnsureItemsReadyArgs = {
	profile: ItemProfile | null | undefined;
	customer?: string | null;
	priceList?: string | null;
	initialize: () => Promise<void>;
};

const inflightInitializations = new Map<string, Promise<void>>();
const completedInitializations = new Set<string>();

function normalizeKeyPart(value: unknown) {
	return String(value || "").trim();
}

function getItemLoadKey({
	profile,
	customer,
	priceList,
}: Omit<EnsureItemsReadyArgs, "initialize">) {
	const profileName = normalizeKeyPart(profile?.name);
	if (!profileName) {
		return "";
	}

	return [
		profileName,
		normalizeKeyPart(profile?.modified),
		normalizeKeyPart(customer),
		normalizeKeyPart(priceList),
	].join("::");
}

export function resetItemLoadingCoordinator() {
	inflightInitializations.clear();
	completedInitializations.clear();
}

export async function ensureItemsReady({
	profile,
	customer = null,
	priceList = null,
	initialize,
}: EnsureItemsReadyArgs) {
	const loadKey = getItemLoadKey({ profile, customer, priceList });
	if (!loadKey) {
		return false;
	}

	if (completedInitializations.has(loadKey)) {
		return false;
	}

	const inflight = inflightInitializations.get(loadKey);
	if (inflight) {
		await inflight;
		return true;
	}

	const initializationPromise = Promise.resolve(initialize()).then(() => {
		completedInitializations.add(loadKey);
	});
	inflightInitializations.set(loadKey, initializationPromise);

	try {
		await initializationPromise;
		return true;
	} finally {
		if (inflightInitializations.get(loadKey) === initializationPromise) {
			inflightInitializations.delete(loadKey);
		}
	}
}
