import { runCatalogStartup } from "./catalogStartup";
import { createPosStartupCoordinator } from "./posStartupCoordinator";
import type {
	PosCatalogSourceProgress,
	PosRegisterStartupResult,
} from "./posStartupTypes";

type DefaultLayoutStartupOptions = {
	runRegisterStartup:
		| (() => Promise<PosRegisterStartupResult>)
		| (() => PosRegisterStartupResult);
	startCustomers:
		| (() => Promise<PosCatalogSourceProgress>)
		| (() => PosCatalogSourceProgress);
	startItems:
		| (() => Promise<PosCatalogSourceProgress>)
		| (() => PosCatalogSourceProgress);
	markInitLoaded?: () => void;
};

export function createDefaultLayoutStartup(
	options: DefaultLayoutStartupOptions,
) {
	const coordinator = createPosStartupCoordinator({
		runRegisterStartup: options.runRegisterStartup,
		runCatalogStartup: async () =>
			runCatalogStartup({
				startCustomers: options.startCustomers,
				startItems: options.startItems,
			}),
	});

	async function start() {
		const result = await coordinator.start();

		if (result.stage === "ready" || result.stage === "degraded") {
			options.markInitLoaded?.();
		}

		return result;
	}

	return {
		state: coordinator.state,
		start,
	};
}
