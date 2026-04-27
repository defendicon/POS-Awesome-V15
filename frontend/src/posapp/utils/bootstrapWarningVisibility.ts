import type { BootstrapCapabilitySummary } from "../../offline/bootstrapSnapshot";

export function shouldLiftBootstrapWarningStartupGate(input: {
	loadingActive: boolean;
	initialBootstrapSettled: boolean;
	itemsStartupSyncSettled?: boolean;
	startupGateLifted: boolean;
}) {
	if (input.startupGateLifted) {
		return true;
	}

	return (
		!input.loadingActive &&
		input.initialBootstrapSettled &&
		input.itemsStartupSyncSettled !== false
	);
}

export function resolveBootstrapWarningUiState<
	TSummary extends BootstrapCapabilitySummary,
>(input: {
	startupWarningsReady: boolean;
	warningActive: boolean;
	warningTooltip?: string | null;
	capabilitySummaries?: TSummary[] | null;
}) {
	if (!input.startupWarningsReady) {
		return {
			active: false,
			tooltip: "",
			capabilitySummaries: [] as TSummary[],
		};
	}

	return {
		active: Boolean(input.warningActive),
		tooltip: input.warningActive ? String(input.warningTooltip || "") : "",
		capabilitySummaries: Array.isArray(input.capabilitySummaries)
			? [...input.capabilitySummaries]
			: ([] as TSummary[]),
	};
}
