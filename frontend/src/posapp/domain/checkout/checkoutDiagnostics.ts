import type {
	PosCheckoutBlocker,
	PosCheckoutStage,
	PosCheckoutTimelineEvent,
} from "./posCheckoutTypes";

export function createPosCheckoutBlocker(
	code: string,
	summary: string,
): PosCheckoutBlocker {
	return {
		code,
		summary,
	};
}

export function createPosCheckoutTimelineEvent(
	stage: PosCheckoutStage,
	blocker: PosCheckoutBlocker | null = null,
): PosCheckoutTimelineEvent {
	return {
		stage,
		at: new Date().toISOString(),
		blockerCode: blocker?.code ?? null,
	};
}

export function pushPosCheckoutTimelineEvent(
	timeline: PosCheckoutTimelineEvent[],
	stage: PosCheckoutStage,
	blocker: PosCheckoutBlocker | null = null,
) {
	return [...timeline, createPosCheckoutTimelineEvent(stage, blocker)];
}
