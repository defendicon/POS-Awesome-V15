import type {
	PosCatalogBlocker,
	PosCatalogStage,
	PosCatalogTimelineEvent,
} from "./posCatalogTypes";

export function createPosCatalogBlocker(
	code: string,
	summary: string,
): PosCatalogBlocker {
	return {
		code,
		summary,
	};
}

export function createPosCatalogTimelineEvent(
	stage: PosCatalogStage,
	blocker: PosCatalogBlocker | null = null,
): PosCatalogTimelineEvent {
	return {
		stage,
		at: new Date().toISOString(),
		blockerCode: blocker?.code ?? null,
	};
}

export function pushPosCatalogTimelineEvent(
	timeline: PosCatalogTimelineEvent[],
	stage: PosCatalogStage,
	blocker: PosCatalogBlocker | null = null,
) {
	return [...timeline, createPosCatalogTimelineEvent(stage, blocker)];
}
