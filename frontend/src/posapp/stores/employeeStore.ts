/**
 * Terminal cashier identity, multi-cashier switching, and terminal lock.
 *
 * **`TerminalEmployee` interface**
 * `user` (Frappe user ID) and `full_name` are always present. `enabled`,
 * `is_current`, and `is_supervisor` are optional flags set by the server.
 *
 * **Cashier persistence**
 * The active cashier's `user` string is persisted in `localStorage` under
 * `"posa_terminal_cashier"` (`STORAGE_KEY`). On store creation `currentCashier`
 * is seeded from `frappe.session` (the logged-in browser user) so it is never
 * null at startup.
 *
 * **`setTerminalEmployees(employees)`**
 * Normalises the list from the server, then calls `ensureCurrentCashier()` to
 * resolve the active cashier using the following priority:
 * 1. Stored user from `localStorage`.
 * 2. Employee marked `is_current` in the list.
 * 3. The logged-in `frappe.session` user.
 * 4. First employee in the list.
 *
 * **Supervisor flag**
 * `setCurrentCashier` detects when the `is_supervisor` flag changes for the same
 * user and triggers a refresh so the UI reflects the correct role immediately.
 *
 * **Terminal lock**
 * `lockTerminal()` closes the switch dialog and opens `lockDialogOpen`.
 * `unlockTerminal(cashier?)` closes the lock and optionally switches the active
 * cashier in one step. `isLocked` is a computed alias for `lockDialogOpen`.
 */
import { computed, ref } from "vue";
import { defineStore } from "pinia";

export interface TerminalEmployee {
	user: string;
	full_name: string;
	enabled?: number;
	is_current?: boolean;
	is_supervisor?: boolean;
}

const STORAGE_KEY = "posa_terminal_cashier";

const getBrowserGlobal = (): any =>
	typeof window !== "undefined" ? window : globalThis;

const getSessionCashier = (): TerminalEmployee | null => {
	const session = getBrowserGlobal()?.frappe?.session;
	if (!session?.user) {
		return null;
	}

	return {
		user: String(session.user),
		full_name: String(session.user_fullname || session.user),
		enabled: 1,
		is_current: true,
	};
};

const readStoredCashierUser = (): string => {
	try {
		return getBrowserGlobal()?.localStorage?.getItem(STORAGE_KEY) || "";
	} catch {
		return "";
	}
};

const persistCashierUser = (user: string) => {
	try {
		if (user) {
			getBrowserGlobal()?.localStorage?.setItem(STORAGE_KEY, user);
		} else {
			getBrowserGlobal()?.localStorage?.removeItem(STORAGE_KEY);
		}
	} catch {
		// Ignore storage failures.
	}
};

export const useEmployeeStore = defineStore("employee", () => {
	const terminalEmployees = ref<TerminalEmployee[]>([]);
	const currentCashier = ref<TerminalEmployee | null>(getSessionCashier());
	const switchDialogOpen = ref(false);
	const lockDialogOpen = ref(false);

	const currentCashierDisplay = computed(
		() => currentCashier.value?.full_name || currentCashier.value?.user || "",
	);
	const isLocked = computed(() => lockDialogOpen.value);

	const setCurrentCashier = (cashier: TerminalEmployee | string | null) => {
		if (!cashier) {
			currentCashier.value = null;
			persistCashierUser("");
			return;
		}

		const nextCashier =
			typeof cashier === "string"
				? terminalEmployees.value.find((employee) => employee.user === cashier) ||
					(getSessionCashier()?.user === cashier ? getSessionCashier() : null)
				: {
						user: String(cashier.user),
						full_name: String(cashier.full_name || cashier.user),
						enabled: Number(cashier.enabled ?? 1),
						is_current: Boolean(cashier.is_current),
						is_supervisor: Boolean(cashier.is_supervisor),
					};

		if (!nextCashier) {
			return;
		}

		currentCashier.value = nextCashier;
		persistCashierUser(nextCashier.user);
	};

	const ensureCurrentCashier = () => {
		const preferredUser =
			readStoredCashierUser() || getSessionCashier()?.user || "";
		const preferredCashier =
			terminalEmployees.value.find((employee) => employee.user === preferredUser) ||
			terminalEmployees.value.find((employee) => employee.is_current) ||
			getSessionCashier() ||
			terminalEmployees.value[0] ||
			null;

		const shouldRefreshCurrentCashier =
			!currentCashier.value
			|| currentCashier.value.user !== preferredCashier?.user
			|| (
				preferredCashier
				&& currentCashier.value.user === preferredCashier.user
				&& Boolean(currentCashier.value.is_supervisor) !== Boolean(preferredCashier.is_supervisor)
			);

		if (shouldRefreshCurrentCashier) {
			setCurrentCashier(preferredCashier);
		}
	};

	const setTerminalEmployees = (employees: TerminalEmployee[] = []) => {
		terminalEmployees.value = Array.isArray(employees)
			? employees
					.filter((employee) => employee?.user)
					.map((employee) => ({
						user: String(employee.user),
						full_name: String(employee.full_name || employee.user),
						enabled: Number(employee.enabled ?? 1),
						is_current: Boolean(employee.is_current),
						is_supervisor: Boolean(employee.is_supervisor),
					}))
			: [];

		ensureCurrentCashier();
	};

	const openEmployeeSwitch = () => {
		ensureCurrentCashier();
		switchDialogOpen.value = true;
	};

	const closeEmployeeSwitch = () => {
		switchDialogOpen.value = false;
	};

	const lockTerminal = () => {
		switchDialogOpen.value = false;
		lockDialogOpen.value = true;
	};

	const unlockTerminal = (cashier?: TerminalEmployee | string | null) => {
		if (cashier) {
			setCurrentCashier(cashier);
		}
		lockDialogOpen.value = false;
	};

	return {
		terminalEmployees,
		currentCashier,
		currentCashierDisplay,
		switchDialogOpen,
		lockDialogOpen,
		isLocked,
		setTerminalEmployees,
		setCurrentCashier,
		ensureCurrentCashier,
		openEmployeeSwitch,
		closeEmployeeSwitch,
		lockTerminal,
		unlockTerminal,
	};
});

export default useEmployeeStore;
