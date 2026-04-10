export type PosCheckoutStage =
	| "idle"
	| "starting"
	| "loading-customer"
	| "loading-pricing"
	| "loading-offers"
	| "loading-payments"
	| "ready"
	| "blocked";

export type PosCheckoutBlocker = {
	code: string;
	summary: string;
};

export type PosCheckoutTimelineEvent = {
	stage: PosCheckoutStage;
	at: string;
	blockerCode: string | null;
};

export type PosCheckoutState = {
	stage: PosCheckoutStage;
	blocker: PosCheckoutBlocker | null;
	timeline: PosCheckoutTimelineEvent[];
};
