export interface BootFinalizeStateInput {
	profileStage: number;
	itemsLoaded: boolean;
	itemsProgress: number;
	itemsStage: number;
	customersLoaded: boolean;
	customersProgress: number;
	customersStage: number;
	manualOffline: boolean;
	navigatorOnline: boolean;
	offlineMode: boolean;
}

export interface BootFinalizeState {
	profileReady: boolean;
	itemsReady: boolean;
	customersReady: boolean;
	shouldFinalize: boolean;
}

export function evaluateBootFinalizeState(
	input: BootFinalizeStateInput,
): BootFinalizeState {
	const profileReady = input.profileStage >= 100;
	const itemsReady =
		input.itemsLoaded || input.itemsProgress >= 100 || input.itemsStage >= 100;
	const customersReady =
		input.customersLoaded ||
		input.customersProgress >= 100 ||
		input.customersStage >= 100 ||
		input.manualOffline ||
		!input.navigatorOnline ||
		input.offlineMode;

	return {
		profileReady,
		itemsReady,
		customersReady,
		shouldFinalize: profileReady && itemsReady,
	};
}
