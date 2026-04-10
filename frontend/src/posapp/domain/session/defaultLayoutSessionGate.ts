import { ref } from "vue";

import type { RecoverPosSessionResult } from "./posSessionTypes";

type DefaultLayoutSessionGateState = {
	stage:
		| "idle"
		| "checking_session"
		| "needs_register_setup"
		| "starting_pos"
		| "ready"
		| "blocked";
	sessionResult: RecoverPosSessionResult | null;
	message: string | null;
};

type CreateDefaultLayoutSessionGateOptions = {
	recoverSession:
		| (() => Promise<RecoverPosSessionResult>)
		| (() => RecoverPosSessionResult);
	applyReadySession: (registerData: any) => void | Promise<void>;
	runPosStartupFlow: () => Promise<any> | any;
	currentPath: () => string;
	routeToRegister: () => void | Promise<void>;
	routeToPos: () => void | Promise<void>;
};

function createInitialState(): DefaultLayoutSessionGateState {
	return {
		stage: "idle",
		sessionResult: null,
		message: null,
	};
}

export function createDefaultLayoutSessionGate(
	options: CreateDefaultLayoutSessionGateOptions,
) {
	const state = ref<DefaultLayoutSessionGateState>(createInitialState());

	async function start() {
		try {
			state.value = {
				...createInitialState(),
				stage: "checking_session",
			};

			const sessionResult = await Promise.resolve(options.recoverSession());
			state.value = {
				...state.value,
				sessionResult,
			};

			if (sessionResult.status === "needs_register_setup") {
				state.value = {
					...state.value,
					stage: "needs_register_setup",
					message: sessionResult.message,
				};

				if (options.currentPath() !== "/register") {
					await Promise.resolve(options.routeToRegister());
				}

				return state.value;
			}

			await Promise.resolve(options.applyReadySession(sessionResult.registerData));
			state.value = {
				...state.value,
				stage: "starting_pos",
				message: null,
			};

			const startupResult = await Promise.resolve(options.runPosStartupFlow());
			if (options.currentPath() === "/register") {
				await Promise.resolve(options.routeToPos());
			}

			state.value = {
				...state.value,
				stage: startupResult?.stage === "blocked" ? "blocked" : "ready",
				message:
					startupResult?.stage === "blocked"
						? startupResult?.blocker?.summary || "POS startup is blocked."
						: null,
			};

			return state.value;
		} catch (error) {
			state.value = {
				...state.value,
				stage: "blocked",
				message:
					error instanceof Error
						? error.message
						: "POS session gate failed unexpectedly.",
			};
			return state.value;
		}
	}

	return {
		state,
		start,
	};
}
