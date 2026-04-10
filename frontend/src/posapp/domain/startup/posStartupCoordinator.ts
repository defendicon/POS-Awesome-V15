import { ref } from "vue";

import {
	collectPosStartupWarningCodes,
	createPosStartupBlocker,
	pushPosStartupTimelineEvent,
} from "./posStartupDiagnostics";
import type {
	PosCatalogStartupResult,
	PosRegisterStartupResult,
	PosStartupState,
} from "./posStartupTypes";

type PosStartupCoordinatorOptions = {
	runRegisterStartup:
		| (() => Promise<PosRegisterStartupResult>)
		| (() => PosRegisterStartupResult);
	runCatalogStartup:
		| ((registerResult: PosRegisterStartupResult) => Promise<PosCatalogStartupResult>)
		| ((registerResult: PosRegisterStartupResult) => PosCatalogStartupResult);
};

function createInitialState(): PosStartupState {
	return {
		stage: "idle",
		blocker: null,
		timeline: [],
		registerResult: null,
		catalogResult: null,
		warningCodes: [],
	};
}

export function createPosStartupCoordinator(
	options: PosStartupCoordinatorOptions,
) {
	const state = ref<PosStartupState>(createInitialState());

	function moveToBlocked(blocker: PosStartupState["blocker"]) {
		state.value = {
			...state.value,
			stage: "blocked",
			blocker,
			timeline: pushPosStartupTimelineEvent(
				state.value.timeline,
				"blocked",
				blocker,
			),
		};
	}

	async function start() {
		try {
			state.value = {
				...createInitialState(),
				stage: "register",
				timeline: pushPosStartupTimelineEvent([], "register"),
			};

			const registerResult = await Promise.resolve(options.runRegisterStartup());
			state.value = {
				...state.value,
				registerResult,
			};

			if (registerResult.status === "blocked") {
				moveToBlocked(
					registerResult.blocker ??
						createPosStartupBlocker(
							"register_not_ready",
							"Register startup did not complete.",
						),
				);
				return state.value;
			}

			state.value = {
				...state.value,
				stage: "catalog",
				timeline: pushPosStartupTimelineEvent(state.value.timeline, "catalog"),
			};

			const catalogResult = await Promise.resolve(
				options.runCatalogStartup(registerResult),
			);
			const warningCodes = collectPosStartupWarningCodes(
				registerResult,
				catalogResult,
			);

			state.value = {
				...state.value,
				catalogResult,
				warningCodes,
			};

			if (catalogResult.status === "blocked") {
				moveToBlocked(
					catalogResult.blocker ??
						createPosStartupBlocker(
							"catalog_not_ready",
							"Catalog startup did not complete.",
						),
				);
				return state.value;
			}

			const finalStage =
				registerResult.status === "degraded" ||
				catalogResult.status === "degraded" ||
				warningCodes.length
					? "degraded"
					: "ready";

			state.value = {
				...state.value,
				stage: finalStage,
				blocker: null,
				timeline: pushPosStartupTimelineEvent(state.value.timeline, finalStage),
			};

			return state.value;
		} catch (error) {
			const blocker = createPosStartupBlocker(
				"startup_failed",
				error instanceof Error
					? error.message
					: "POS startup failed unexpectedly.",
			);
			moveToBlocked(blocker);
			return state.value;
		}
	}

	return {
		state,
		start,
	};
}
