import { evaluateOfflineReadiness } from "../utils/offlineReadiness";

export async function readOfflineReadiness(profile: any) {
	const { startupInitPromise, getBootstrapSnapshot, listSyncResourceStates } =
		await import("../../offline/index");
	await startupInitPromise;
	return evaluateOfflineReadiness(
		profile,
		getBootstrapSnapshot(),
		await listSyncResourceStates(),
		globalThis.frappe?.session?.user || "",
	);
}
