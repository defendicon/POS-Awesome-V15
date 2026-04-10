import { createPosStartupBlocker } from "./posStartupDiagnostics";
import type {
	PosCatalogSourceProgress,
	PosCatalogStartupResult,
} from "./posStartupTypes";

type RunCatalogStartupOptions = {
	startCustomers:
		| (() => Promise<PosCatalogSourceProgress>)
		| (() => PosCatalogSourceProgress);
	startItems:
		| (() => Promise<PosCatalogSourceProgress>)
		| (() => PosCatalogSourceProgress);
};

function resolveCatalogSourceState(progress: PosCatalogSourceProgress) {
	if (!progress?.started) {
		return "idle";
	}
	if (!progress?.ready) {
		return "pending";
	}
	return "ready";
}

function createCatalogBlockedResult(
	sources: PosCatalogStartupResult["sources"],
	code: string,
	summary: string,
): PosCatalogStartupResult {
	return {
		status: "blocked",
		sources,
		warningCodes: [],
		blocker: createPosStartupBlocker(code, summary),
	};
}

export async function runCatalogStartup(
	options: RunCatalogStartupOptions,
): Promise<PosCatalogStartupResult> {
	const [customersProgress, itemsProgress] = await Promise.all([
		Promise.resolve(options.startCustomers()),
		Promise.resolve(options.startItems()),
	]);
	const sources = {
		customers: resolveCatalogSourceState(customersProgress),
		items: resolveCatalogSourceState(itemsProgress),
	};

	if (!customersProgress.started) {
		return createCatalogBlockedResult(
			sources,
			"customers_not_started",
			"Customers startup did not begin.",
		);
	}

	if (!itemsProgress.started) {
		return createCatalogBlockedResult(
			sources,
			"items_not_started",
			"Items startup did not begin.",
		);
	}

	if (!customersProgress.ready) {
		return createCatalogBlockedResult(
			sources,
			"customers_pending",
			"Customers startup is still in progress.",
		);
	}

	if (!itemsProgress.ready) {
		return createCatalogBlockedResult(
			sources,
			"items_pending",
			"Items startup is still in progress.",
		);
	}

	return {
		status: "ready",
		sources,
		warningCodes: [],
		blocker: null,
	};
}
