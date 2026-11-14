import { computed, ref } from "vue";
import { defineStore } from "pinia";

export interface TerminalEmployee {
	user: string;
	full_name: string;
	enabled?: number;
	pin_length?: number;
	is_current?: boolean;
	is_supervisor?: boolean;
	can_override_below_cost?: boolean;
}

export interface AuthoritativeTerminalState {
	pos_profile?: string;
	active_cashier?: string | null;
	locked?: boolean;
	verified_at?: string | null;
	locked_at?: string | null;
}

export type TerminalEmployeesLoadStatus =
	| "idle"
	| "loading"
	| "ready"
	| "error";

const normalizeEmployee = (cashier: TerminalEmployee): TerminalEmployee => ({
	user: String(cashier.user),
	full_name: String(cashier.full_name || cashier.user),
	enabled: Number(cashier.enabled ?? 1),
	pin_length: Number.isInteger(Number(cashier.pin_length))
		? Number(cashier.pin_length)
		: undefined,
	is_current: Boolean(cashier.is_current),
	is_supervisor: Boolean(cashier.is_supervisor),
	can_override_below_cost: Boolean(
		cashier.can_override_below_cost ?? cashier.is_supervisor,
	),
});

export const useEmployeeStore = defineStore("employee", () => {
	const terminalEmployees = ref<TerminalEmployee[]>([]);
	const currentCashier = ref<TerminalEmployee | null>(null);
	const offlineCashierToken = ref("");
	const cashierVerifiedOffline = ref(false);
	const switchDialogOpen = ref(false);
	const lockDialogOpen = ref(true);
	const terminalStateLoaded = ref(false);
	const terminalLockPending = ref(false);
	const invoiceUnlockPending = ref(false);
	const terminalEmployeesLoadStatus =
		ref<TerminalEmployeesLoadStatus>("idle");
	const terminalEmployeesLoadError = ref("");
	const terminalEmployeesProfile = ref("");

	const currentCashierDisplay = computed(
		() =>
			currentCashier.value?.full_name || currentCashier.value?.user || "",
	);
	const isLocked = computed(() => lockDialogOpen.value);
	let pendingUnlockPromise: Promise<boolean> | null = null;
	let settlePendingUnlock: ((unlocked: boolean) => void) | null = null;

	const finishPendingUnlock = (unlocked: boolean) => {
		const settle = settlePendingUnlock;
		settlePendingUnlock = null;
		pendingUnlockPromise = null;
		invoiceUnlockPending.value = false;
		settle?.(unlocked);
	};

	const setCurrentCashier = (cashier: TerminalEmployee | string | null) => {
		if (!cashier) {
			currentCashier.value = null;
			return;
		}

		const nextCashier =
			typeof cashier === "string"
				? terminalEmployees.value.find(
						(employee) => employee.user === cashier,
					) || null
				: normalizeEmployee(cashier);

		if (nextCashier) {
			currentCashier.value = nextCashier;
		}
	};

	const setTerminalEmployees = (employees: TerminalEmployee[] = []) => {
		terminalEmployees.value = Array.isArray(employees)
			? employees
					.filter((employee) => employee?.user)
					.map(normalizeEmployee)
			: [];
		terminalEmployeesLoadStatus.value = "ready";
		terminalEmployeesLoadError.value = "";

		if (currentCashier.value) {
			const refreshedCashier = terminalEmployees.value.find(
				(employee) => employee.user === currentCashier.value?.user,
			);
			currentCashier.value = refreshedCashier || null;
		}
	};

	const beginTerminalEmployeesLoad = (
		profileName: string,
		cachedEmployees: TerminalEmployee[] = [],
	) => {
		finishPendingUnlock(false);
		offlineCashierToken.value = "";
		const nextProfileName = String(profileName || "").trim();
		const canReuseLoadedEmployees =
			terminalEmployeesProfile.value === nextProfileName &&
			terminalEmployees.value.length > 0;
		terminalEmployeesProfile.value = nextProfileName;
		terminalEmployeesLoadStatus.value = "loading";
		terminalEmployeesLoadError.value = "";
		if (!canReuseLoadedEmployees) {
			terminalEmployees.value = Array.isArray(cachedEmployees)
				? cachedEmployees
						.filter((employee) => employee?.user)
						.map(normalizeEmployee)
				: [];
		}
		currentCashier.value = null;
		lockDialogOpen.value = true;
		terminalStateLoaded.value = false;
		switchDialogOpen.value = false;
	};

	const completeTerminalEmployeesLoad = (
		profileName: string,
		employees: TerminalEmployee[] = [],
	) => {
		if (
			terminalEmployeesProfile.value !== String(profileName || "").trim()
		) {
			return false;
		}
		setTerminalEmployees(employees);
		terminalEmployeesLoadStatus.value = "ready";
		terminalEmployeesLoadError.value = "";
		return true;
	};

	const failTerminalEmployeesLoad = (
		profileName: string,
		message: string,
	) => {
		if (
			terminalEmployeesProfile.value !== String(profileName || "").trim()
		) {
			return false;
		}
		terminalEmployeesLoadStatus.value = "error";
		terminalEmployeesLoadError.value = String(message || "").trim();
		return true;
	};

	const resetTerminalEmployeesLoad = () => {
		setTerminalEmployees([]);
		terminalEmployeesProfile.value = "";
		terminalEmployeesLoadStatus.value = "idle";
		terminalEmployeesLoadError.value = "";
	};

	const applyTerminalState = (
		state: AuthoritativeTerminalState | null | undefined,
		verifiedCashier?: TerminalEmployee | null,
	) => {
		offlineCashierToken.value = "";
		cashierVerifiedOffline.value = false;
		const activeCashier = String(state?.active_cashier || "").trim();
		const candidate =
			verifiedCashier?.user === activeCashier
				? normalizeEmployee(verifiedCashier)
				: terminalEmployees.value.find(
						(employee) => employee.user === activeCashier,
					) ||
					(state?.locked === false && activeCashier
						? normalizeEmployee({
								user: activeCashier,
								full_name: activeCashier,
								enabled: 1,
							})
						: null);

		currentCashier.value = candidate;
		lockDialogOpen.value = state?.locked !== false || !candidate;
		terminalLockPending.value = false;
		terminalStateLoaded.value = true;
		if (lockDialogOpen.value) {
			switchDialogOpen.value = false;
		} else {
			finishPendingUnlock(true);
		}
	};

	const applyVerifiedCashier = (
		cashier: TerminalEmployee & {
			terminal_state?: AuthoritativeTerminalState;
		},
	) => {
		const state = cashier?.terminal_state;
		if (
			!cashier?.user ||
			state?.locked !== false ||
			state?.active_cashier !== cashier.user
		) {
			throw new Error(
				"The server did not confirm the active terminal cashier.",
			);
		}
		applyTerminalState(state, cashier);
	};

	const ensureCurrentCashier = () => {
		if (!currentCashier.value) return;
		const serverListedCashier = terminalEmployees.value.find(
			(employee) => employee.user === currentCashier.value?.user,
		);
		currentCashier.value =
			cashierVerifiedOffline.value && serverListedCashier
				? normalizeEmployee({
						user: serverListedCashier.user,
						full_name: serverListedCashier.full_name,
					})
				: serverListedCashier || null;
		if (!currentCashier.value) {
			lockDialogOpen.value = true;
		}
	};

	const openEmployeeSwitch = () => {
		ensureCurrentCashier();
		if (!lockDialogOpen.value) {
			switchDialogOpen.value = true;
		}
	};

	const closeEmployeeSwitch = () => {
		switchDialogOpen.value = false;
	};

	const lockTerminal = () => {
		offlineCashierToken.value = "";
		switchDialogOpen.value = false;
		lockDialogOpen.value = true;
	};

	const markTerminalLockPending = () => {
		lockTerminal();
		terminalLockPending.value = true;
	};

	const requestTerminalUnlock = () => {
		lockTerminal();
		invoiceUnlockPending.value = true;
		if (!pendingUnlockPromise) {
			pendingUnlockPromise = new Promise<boolean>((resolve) => {
				settlePendingUnlock = resolve;
			});
		}
		return pendingUnlockPromise;
	};

	const cancelPendingInvoiceSubmission = () => {
		finishPendingUnlock(false);
	};

	const unlockTerminal = (
		cashier: TerminalEmployee & {
			terminal_state?: AuthoritativeTerminalState;
		},
	) => {
		applyVerifiedCashier(cashier);
	};
	const applyOfflineCashier = (cashier: {
		user: string;
		full_name: string;
		token: string;
	}) => {
		if (
			!cashier.token ||
			!terminalEmployees.value.some((row) => row.user === cashier.user)
		) {
			throw new Error(
				"Offline cashier is not available for this POS Profile.",
			);
		}
		currentCashier.value = normalizeEmployee({
			user: cashier.user,
			full_name: cashier.full_name,
		});
		offlineCashierToken.value = cashier.token;
		cashierVerifiedOffline.value = true;
		lockDialogOpen.value = false;
		switchDialogOpen.value = false;
		terminalStateLoaded.value = true;
		finishPendingUnlock(true);
	};

	return {
		terminalEmployees,
		offlineCashierToken,
		cashierVerifiedOffline,
		applyOfflineCashier,
		currentCashier,
		currentCashierDisplay,
		switchDialogOpen,
		lockDialogOpen,
		terminalStateLoaded,
		terminalLockPending,
		invoiceUnlockPending,
		terminalEmployeesLoadStatus,
		terminalEmployeesLoadError,
		terminalEmployeesProfile,
		isLocked,
		setTerminalEmployees,
		beginTerminalEmployeesLoad,
		completeTerminalEmployeesLoad,
		failTerminalEmployeesLoad,
		resetTerminalEmployeesLoad,
		setCurrentCashier,
		applyTerminalState,
		applyVerifiedCashier,
		ensureCurrentCashier,
		openEmployeeSwitch,
		closeEmployeeSwitch,
		lockTerminal,
		markTerminalLockPending,
		requestTerminalUnlock,
		cancelPendingInvoiceSubmission,
		unlockTerminal,
	};
});

export default useEmployeeStore;
