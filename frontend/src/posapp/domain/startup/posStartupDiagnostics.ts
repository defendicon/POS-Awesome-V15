import type {
	PosCatalogStartupResult,
	PosRegisterStartupResult,
	PosStartupBlocker,
	PosStartupStage,
	PosStartupTimelineEvent,
} from "./posStartupTypes";

export function createPosStartupBlocker(
	code: string,
	summary: string,
): PosStartupBlocker {
	return {
		code,
		summary,
	};
}

export function createPosStartupTimelineEvent(
	stage: PosStartupStage,
	blocker: PosStartupBlocker | null = null,
): PosStartupTimelineEvent {
	return {
		stage,
		at: new Date().toISOString(),
		blockerCode: blocker?.code ?? null,
	};
}

export function pushPosStartupTimelineEvent(
	timeline: PosStartupTimelineEvent[],
	stage: PosStartupStage,
	blocker: PosStartupBlocker | null = null,
) {
	return [...timeline, createPosStartupTimelineEvent(stage, blocker)];
}

export function collectPosStartupWarningCodes(
	...results: Array<PosRegisterStartupResult | PosCatalogStartupResult | null | undefined>
) {
	const warningCodes = new Set<string>();

	for (const result of results) {
		for (const code of result?.warningCodes ?? []) {
			warningCodes.add(code);
		}
	}

	return [...warningCodes];
}
