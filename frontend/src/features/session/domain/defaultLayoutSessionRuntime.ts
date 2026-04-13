import { computed } from "vue";

import { createBootstrapSnapshotFromRegisterData } from "../../../offline/bootstrapSnapshot";
import { createDefaultLayoutSessionGate } from "../../../posapp/domain/session/defaultLayoutSessionGate";
import { recoverPosSession } from "../../../posapp/domain/session/recoverPosSession";
import { createDefaultLayoutStartup } from "../../../posapp/domain/startup/defaultLayoutStartup";
import { runRegisterStartup } from "../../../posapp/domain/startup/registerStartup";

type SessionRuntimeOptions = {
	getCurrentBootstrapProfile: () => any;
	getCurrentBootstrapOpeningShift: () => any;
	getCurrentSnapshot: () => any;
	setSnapshot: (_snapshot: any) => void;
	persistBootstrapRuntime: (_validation: any, _decision: any) => void;
	getBuildVersion: () => string | null;
	getCurrentUser: () => string | null;
	startCustomers: () => Promise<{ started: boolean; ready: boolean }>;
	startItems: () => Promise<{ started: boolean; ready: boolean }>;
	markInitLoaded: () => void;
	getCachedOpening: () => any;
	fetchServerOpening: () => Promise<any>;
	applyRegisterData: (_registerData: any) => void | Promise<void>;
	refreshTaxInclusiveSetting?: () => Promise<void> | void;
	currentPath: () => string;
	routeToRegister: () => void | Promise<void>;
	routeToPos: () => void | Promise<void>;
	checkout: {
		state: {
			value: any;
		};
	};
	startCheckout: (_options: { checkout: any }) => Promise<any>;
};

export function createDefaultLayoutSessionRuntime(
	options: SessionRuntimeOptions,
) {
	let startupFlowPromise: Promise<any> | null = null;
	let checkoutFlowPromise: Promise<any> | null = null;

	function buildCurrentBootstrapValidationInput() {
		const profile = options.getCurrentBootstrapProfile();
		return {
			buildVersion: options.getBuildVersion(),
			profileName: profile?.name || null,
			profileModified: profile?.modified || null,
			sessionUser: options.getCurrentUser(),
		};
	}

	function ensureBootstrapSnapshotIsCurrent() {
		const currentSnapshot = options.getCurrentSnapshot();
		const registerData = {
			pos_profile: options.getCurrentBootstrapProfile(),
			pos_opening_shift: options.getCurrentBootstrapOpeningShift(),
		};

		if (!registerData.pos_profile && !registerData.pos_opening_shift) {
			return currentSnapshot;
		}

		const nextSnapshot = createBootstrapSnapshotFromRegisterData(
			registerData,
			currentSnapshot,
			{ buildVersion: options.getBuildVersion() },
		);

		if (JSON.stringify(currentSnapshot || null) !== JSON.stringify(nextSnapshot)) {
			options.setSnapshot(nextSnapshot);
		}

		return nextSnapshot;
	}

	function buildRegisterStartupOptions() {
		return {
			snapshot: ensureBootstrapSnapshotIsCurrent(),
			registerData: {
				pos_profile: options.getCurrentBootstrapProfile(),
				pos_opening_shift: options.getCurrentBootstrapOpeningShift(),
			},
			validationInput: buildCurrentBootstrapValidationInput(),
			continueOffline: true,
		};
	}

	function evaluateRegisterStartup() {
		const registerStartup = runRegisterStartup(buildRegisterStartupOptions());
		if (registerStartup.validation && registerStartup.runtime) {
			options.persistBootstrapRuntime(
				registerStartup.validation,
				registerStartup.runtime,
			);
		}
		return registerStartup;
	}

	const defaultLayoutStartup = createDefaultLayoutStartup({
		runRegisterStartup: evaluateRegisterStartup,
		startCustomers: options.startCustomers,
		startItems: options.startItems,
		markInitLoaded: options.markInitLoaded,
	});

	async function recoverCurrentPosSession() {
		const result = await recoverPosSession({
			getCachedOpening: options.getCachedOpening,
			getServerOpening: options.fetchServerOpening,
			currentUser: options.getCurrentUser(),
			currentSnapshot: options.getCurrentSnapshot(),
			buildVersion: options.getBuildVersion(),
			continueOffline: true,
		});

		if (result.bootstrapSnapshot) {
			options.setSnapshot(result.bootstrapSnapshot);
		}

		return result;
	}

	async function applyRecoveredPosSession(registerData: any) {
		if (!registerData) {
			return;
		}

		await Promise.resolve(options.applyRegisterData(registerData));
		evaluateRegisterStartup();

		if (navigator.onLine) {
			await Promise.resolve(options.refreshTaxInclusiveSetting?.());
		}
	}

	async function runPosStartupFlow() {
		if (startupFlowPromise) {
			return startupFlowPromise;
		}

		startupFlowPromise = defaultLayoutStartup
			.start()
			.catch((error) => {
				console.error("POS startup flow failed", error);
				return defaultLayoutStartup.state.value;
			})
			.finally(() => {
				startupFlowPromise = null;
			});

		return startupFlowPromise;
	}

	const defaultLayoutSessionGate = createDefaultLayoutSessionGate({
		recoverSession: recoverCurrentPosSession,
		applyReadySession: applyRecoveredPosSession,
		runPosStartupFlow,
		currentPath: options.currentPath,
		routeToRegister: options.routeToRegister,
		routeToPos: options.routeToPos,
	});

	async function runCheckoutFlow() {
		if (checkoutFlowPromise) {
			return checkoutFlowPromise;
		}

		if (!options.getCurrentBootstrapProfile()?.name) {
			return options.checkout.state.value;
		}

		checkoutFlowPromise = options
			.startCheckout({
				checkout: options.checkout,
			})
			.catch((error) => {
				console.error("POS checkout flow failed", error);
				return options.checkout.state.value;
			})
			.finally(() => {
				checkoutFlowPromise = null;
			});

		return checkoutFlowPromise;
	}

	return {
		startupState: defaultLayoutStartup.state,
		sessionGateState: defaultLayoutSessionGate.state,
		startupBlocker: computed(() => defaultLayoutStartup.state.value.blocker),
		evaluateRegisterStartup,
		runPosStartupFlow,
		runCheckoutFlow,
		startSessionGate: () => defaultLayoutSessionGate.start(),
	};
}
