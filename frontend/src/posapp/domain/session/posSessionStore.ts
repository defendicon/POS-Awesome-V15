import { ref } from "vue";

import type {
	PosSessionBlocker,
	PosSessionState,
	ReadyPosSession,
} from "./posSessionTypes";

function createInitialPosSessionState(): PosSessionState {
	return {
		stage: "recovering",
		posProfile: null,
		posOpeningShift: null,
		source: null,
		message: null,
		blocker: null,
	};
}

export function createPosSessionStore() {
	const state = ref<PosSessionState>(createInitialPosSessionState());

	function setRecovering(message: string | null = null) {
		state.value = {
			...createInitialPosSessionState(),
			stage: "recovering",
			message,
		};
	}

	function setReadySession(session: ReadyPosSession) {
		state.value = {
			stage: "ready",
			posProfile: session.posProfile,
			posOpeningShift: session.posOpeningShift,
			source: session.source,
			message: null,
			blocker: null,
		};
	}

	function setNeedsRegisterSetup(message: string) {
		state.value = {
			stage: "needs_register_setup",
			posProfile: null,
			posOpeningShift: null,
			source: null,
			message,
			blocker: null,
		};
	}

	function setSubmittingRegisterSetup(message: string | null = null) {
		state.value = {
			...state.value,
			stage: "submitting_register_setup",
			message,
			blocker: null,
		};
	}

	function setClosingShift(message: string | null = null) {
		state.value = {
			...state.value,
			stage: "closing_shift",
			message,
			blocker: null,
		};
	}

	function setBlockedSession(blocker: PosSessionBlocker, message?: string | null) {
		state.value = {
			...state.value,
			stage: "blocked",
			message: message ?? blocker.summary,
			blocker,
		};
	}

	function resetSession() {
		state.value = createInitialPosSessionState();
	}

	return {
		state,
		setRecovering,
		setReadySession,
		setNeedsRegisterSetup,
		setSubmittingRegisterSetup,
		setClosingShift,
		setBlockedSession,
		resetSession,
	};
}
