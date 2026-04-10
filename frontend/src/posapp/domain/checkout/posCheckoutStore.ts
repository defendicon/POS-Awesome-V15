import { ref } from "vue";

import { pushPosCheckoutTimelineEvent } from "./checkoutDiagnostics";
import type {
	PosCheckoutBlocker,
	PosCheckoutStage,
	PosCheckoutState,
} from "./posCheckoutTypes";

function createInitialCheckoutState(): PosCheckoutState {
	return {
		stage: "idle",
		blocker: null,
		timeline: [],
	};
}

export function createPosCheckoutStore() {
	const state = ref<PosCheckoutState>(createInitialCheckoutState());

	function markStarting() {
		state.value = {
			...createInitialCheckoutState(),
			stage: "starting",
			timeline: pushPosCheckoutTimelineEvent([], "starting"),
		};
	}

	function markStage(stage: Exclude<PosCheckoutStage, "idle" | "ready" | "blocked">) {
		state.value = {
			...state.value,
			stage,
			blocker: null,
			timeline: pushPosCheckoutTimelineEvent(state.value.timeline, stage),
		};
	}

	function markReady() {
		state.value = {
			...state.value,
			stage: "ready",
			blocker: null,
			timeline: pushPosCheckoutTimelineEvent(state.value.timeline, "ready"),
		};
	}

	function blockCheckout(blocker: PosCheckoutBlocker) {
		state.value = {
			...state.value,
			stage: "blocked",
			blocker,
			timeline: pushPosCheckoutTimelineEvent(
				state.value.timeline,
				"blocked",
				blocker,
			),
		};
	}

	function resetCheckout() {
		state.value = createInitialCheckoutState();
	}

	return {
		state,
		markStarting,
		markStage,
		markReady,
		blockCheckout,
		resetCheckout,
	};
}
