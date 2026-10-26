<template>
	<v-dialog
		:model-value="switchDialogOpen"
		max-width="520"
		scrollable
		@update:model-value="handleSwitchDialog"
	>
		<v-card class="pos-themed-card employee-switch-dialog">
			<v-card-title class="employee-switch-dialog__title">
				<div>
					<div class="employee-switch-dialog__eyebrow">{{ __("Shared terminal") }}</div>
					<div class="text-h6">{{ __("Switch Cashier") }}</div>
				</div>
				<v-btn
					icon="mdi-close"
					variant="text"
					:aria-label="__('Close cashier switcher')"
					@click="employeeStore.closeEmployeeSwitch()"
				/>
			</v-card-title>
			<v-card-text>
				<div class="employee-switch-dialog__copy">
					{{ __("Choose the cashier currently operating this terminal.") }}
				</div>
				<v-alert
					v-if="cashiersRefreshFailed"
					variant="tonal"
					type="warning"
					density="compact"
					class="employee-switch-dialog__load-error"
					data-test="cashier-list-refresh-error"
				>
					<div>{{ terminalEmployeesLoadError }}</div>
					<button type="button" class="employee-switch-dialog__retry" @click="retryCashierLoad">
						{{ __("Retry") }}
					</button>
				</v-alert>
				<div
					v-if="cashiersLoading"
					class="employee-switch-dialog__status"
					data-test="cashier-list-loading"
				>
					<v-progress-circular indeterminate color="primary" size="24" width="3" />
					<span>{{ __("Loading authorized cashiers...") }}</span>
				</div>
				<v-alert
					v-else-if="cashiersLoadFailed"
					variant="tonal"
					type="error"
					density="comfortable"
					class="employee-switch-dialog__load-error"
					data-test="cashier-list-error"
				>
					<div>{{ terminalEmployeesLoadError }}</div>
					<button
						type="button"
						class="employee-switch-dialog__retry"
						data-test="cashier-list-retry"
						@click="retryCashierLoad"
					>
						{{ __("Retry") }}
					</button>
				</v-alert>
				<div
					v-else-if="!terminalEmployees.length"
					class="employee-switch-dialog__empty"
					data-test="cashier-list-empty"
				>
					{{ __("No cashier profiles are available for this POS profile yet.") }}
				</div>
				<div v-else class="employee-switch-dialog__list">
					<button
						v-for="employee in terminalEmployees"
						:key="employee.user"
						type="button"
						:data-test="`employee-option-${employee.user}`"
						class="employee-switch-dialog__option"
						:class="{ 'employee-switch-dialog__option--active': selectedUser === employee.user }"
						@click="selectEmployee(employee.user)"
					>
						<div>
							<strong>{{ employee.full_name }}</strong>
							<div class="employee-switch-dialog__meta">{{ employee.user }}</div>
						</div>
						<v-icon
							icon="mdi-check-circle"
							color="primary"
							v-if="selectedUser === employee.user"
						/>
					</button>
				</div>
				<template v-if="terminalEmployees.length">
					<v-alert
						variant="tonal"
						type="info"
						density="comfortable"
						class="employee-switch-dialog__help"
						data-test="cashier-pin-help"
					>
						<strong v-if="isFirstPin">{{ __("Create your PIN") }}</strong>
						<div>{{ pinHelp }}</div>
					</v-alert>
					<v-text-field
						v-if="!needsSupervisor"
						v-model="cashierPin"
						:type="showPin ? 'text' : 'password'"
						name="pos-cashier-switch-pin"
						:autocomplete="isFirstPin ? 'new-password' : 'one-time-code'"
						inputmode="numeric"
						pattern="[0-9]*"
						data-1p-ignore="true"
						data-lpignore="true"
						data-bwignore="true"
						:append-inner-icon="showPin ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
						variant="outlined"
						density="comfortable"
						hide-details="auto"
						:label="isFirstPin ? __('New PIN') : __('Cashier PIN')"
						:data-test="'cashier-pin-input'"
						@click:append-inner="showPin = !showPin"
						@keyup.enter="submitSwitch"
					/>
					<v-text-field
						v-if="isFirstPin"
						v-model="confirmPin"
						:type="showPin ? 'text' : 'password'"
						name="pos-cashier-switch-confirm-pin"
						autocomplete="new-password"
						inputmode="numeric"
						pattern="[0-9]*"
						data-1p-ignore="true"
						data-lpignore="true"
						data-bwignore="true"
						variant="outlined"
						density="comfortable"
						hide-details="auto"
						class="mt-3"
						:label="__('Confirm PIN')"
						@keyup.enter="submitSwitch"
					/>
				</template>
				<v-alert
					v-if="pinError"
					variant="tonal"
					type="error"
					density="comfortable"
					class="employee-switch-dialog__error"
					data-test="cashier-pin-error"
				>
					{{ pinError }}
				</v-alert>
			</v-card-text>
			<v-card-actions class="employee-switch-dialog__actions">
				<v-btn variant="text" @click="employeeStore.closeEmployeeSwitch()">
					{{ __("Cancel") }}
				</v-btn>
				<v-btn
					color="primary"
					:disabled="!canSubmit"
					:loading="isSubmitting"
					data-test="cashier-pin-submit"
					@click="submitSwitch"
				>
					{{ isFirstPin ? __("Create PIN and unlock") : __("Use Cashier") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>

	<v-dialog :model-value="lockDialogOpen" max-width="480" persistent>
		<v-card class="pos-themed-card employee-lock-dialog" data-test="terminal-lock-dialog">
			<v-card-title class="employee-switch-dialog__title">
				<div>
					<div class="employee-switch-dialog__eyebrow">{{ __("Terminal locked") }}</div>
					<div class="text-h6">{{ __("Unlock POS") }}</div>
				</div>
			</v-card-title>
			<v-card-text>
				<div class="employee-switch-dialog__copy">
					{{ __("Select the cashier who is taking over this terminal.") }}
				</div>
				<v-alert
					v-if="cashiersRefreshFailed"
					variant="tonal"
					type="warning"
					density="compact"
					class="employee-switch-dialog__load-error"
					data-test="terminal-cashier-refresh-error"
				>
					<div>{{ terminalEmployeesLoadError }}</div>
					<button type="button" class="employee-switch-dialog__retry" @click="retryCashierLoad">
						{{ __("Retry") }}
					</button>
				</v-alert>
				<div
					v-if="cashiersLoading"
					class="employee-switch-dialog__status"
					data-test="terminal-cashier-loading"
				>
					<v-progress-circular indeterminate color="primary" size="24" width="3" />
					<span>{{ __("Loading authorized cashiers...") }}</span>
				</div>
				<v-alert
					v-else-if="cashiersLoadFailed"
					variant="tonal"
					type="error"
					density="comfortable"
					class="employee-switch-dialog__load-error"
					data-test="terminal-cashier-error"
				>
					<div>{{ terminalEmployeesLoadError }}</div>
					<button
						type="button"
						class="employee-switch-dialog__retry"
						data-test="terminal-cashier-retry"
						@click="retryCashierLoad"
					>
						{{ __("Retry") }}
					</button>
				</v-alert>
				<div
					v-else-if="!terminalEmployees.length"
					class="employee-switch-dialog__empty"
					data-test="terminal-cashier-empty"
				>
					{{ __("No enabled cashiers are assigned to this POS profile.") }}
				</div>
				<div v-else class="employee-switch-dialog__list">
					<button
						v-for="employee in terminalEmployees"
						:key="`unlock-${employee.user}`"
						type="button"
						class="employee-switch-dialog__option"
						:data-test="`terminal-unlock-cashier-${employee.user}`"
						:class="{ 'employee-switch-dialog__option--active': selectedUser === employee.user }"
						@click="selectEmployee(employee.user)"
					>
						<div>
							<strong>{{ employee.full_name }}</strong>
							<div class="employee-switch-dialog__meta">{{ employee.user }}</div>
						</div>
						<v-icon icon="mdi-lock-open-outline" color="primary" />
					</button>
				</div>
				<template v-if="terminalEmployees.length">
					<v-alert
						variant="tonal"
						type="info"
						density="comfortable"
						class="employee-switch-dialog__help"
					>
						<strong v-if="isFirstPin">{{ __("Create your PIN") }}</strong>
						<div>{{ pinHelp }}</div>
					</v-alert>
					<v-text-field
						v-if="!needsSupervisor"
						v-model="cashierPin"
						:type="showPin ? 'text' : 'password'"
						name="pos-terminal-unlock-pin"
						:autocomplete="isFirstPin ? 'new-password' : 'one-time-code'"
						inputmode="numeric"
						pattern="[0-9]*"
						data-1p-ignore="true"
						data-lpignore="true"
						data-bwignore="true"
						:append-inner-icon="showPin ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
						variant="outlined"
						density="comfortable"
						hide-details="auto"
						:label="isFirstPin ? __('New PIN') : __('Cashier PIN')"
						data-test="terminal-unlock-pin"
						autofocus
						@click:append-inner="showPin = !showPin"
						@keyup.enter="submitUnlock"
					/>
					<v-text-field
						v-if="isFirstPin"
						v-model="confirmPin"
						:type="showPin ? 'text' : 'password'"
						name="pos-terminal-unlock-confirm-pin"
						autocomplete="new-password"
						inputmode="numeric"
						pattern="[0-9]*"
						data-1p-ignore="true"
						data-lpignore="true"
						data-bwignore="true"
						variant="outlined"
						density="comfortable"
						hide-details="auto"
						class="mt-3"
						:label="__('Confirm PIN')"
						@keyup.enter="submitUnlock"
					/>
				</template>
				<v-alert
					v-if="pinError"
					variant="tonal"
					type="error"
					density="comfortable"
					class="employee-switch-dialog__error"
				>
					{{ pinError }}
				</v-alert>
			</v-card-text>
			<v-card-actions class="employee-switch-dialog__actions">
				<v-btn
					v-if="invoiceUnlockPending"
					variant="text"
					data-test="terminal-unlock-cancel"
					:disabled="isSubmitting"
					@click="employeeStore.cancelPendingInvoiceSubmission()"
				>
					{{ __("Cancel invoice submission") }}
				</v-btn>
				<v-btn color="primary" :disabled="!canSubmit" :loading="isSubmitting" @click="submitUnlock">
					{{ isFirstPin ? __("Create PIN and unlock") : __("Unlock POS") }}
				</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useEmployeeStore } from "../../../stores/employeeStore";
import { useUIStore } from "../../../stores/uiStore";

const employeeStore = useEmployeeStore();
const uiStore = useUIStore();
const emit = defineEmits(["retry-load"]);
const {
	terminalEmployees,
	currentCashier,
	switchDialogOpen,
	lockDialogOpen,
	terminalEmployeesLoadStatus,
	terminalEmployeesLoadError,
	invoiceUnlockPending,
} = storeToRefs(employeeStore);
const selectedUser = ref("");
const cashierPin = ref("");
const confirmPin = ref("");
const pinError = ref("");
const isSubmitting = ref(false);
const showPin = ref(false);
const posProfileName = computed(
	() => uiStore.posProfile?.name || window.frappe?.boot?.pos_profile?.name || "",
);
const cashiersLoading = computed(
	() =>
		!terminalEmployees.value.length &&
		(terminalEmployeesLoadStatus.value === "idle" ||
			terminalEmployeesLoadStatus.value === "loading"),
);
const cashiersLoadFailed = computed(
	() => terminalEmployeesLoadStatus.value === "error" && !terminalEmployees.value.length,
);
const cashiersRefreshFailed = computed(
	() => terminalEmployeesLoadStatus.value === "error" && terminalEmployees.value.length > 0,
);

const resolveDefaultCashierUser = (cashier) => {
	const current = terminalEmployees.value.find((employee) => employee.user === cashier?.user);
	return current?.user || terminalEmployees.value[0]?.user || "";
};

watch(
	[currentCashier, switchDialogOpen, lockDialogOpen, terminalEmployees],
	([cashier, switchOpen, lockOpen], previousValues = []) => {
		const [, previousSwitchOpen, previousLockOpen] = previousValues;
		const dialogOpen = switchOpen || lockOpen;
		const previouslyOpen = previousSwitchOpen || previousLockOpen;
		if (dialogOpen && !previouslyOpen) {
			selectedUser.value = resolveDefaultCashierUser(cashier);
			cashierPin.value = "";
			confirmPin.value = "";
			pinError.value = "";
			showPin.value = false;
			return;
		}
		if (
			dialogOpen &&
			(!selectedUser.value ||
				!terminalEmployees.value.some((employee) => employee.user === selectedUser.value))
		) {
			selectedUser.value = resolveDefaultCashierUser(cashier);
			return;
		}
		if (!dialogOpen) {
			cashierPin.value = "";
			confirmPin.value = "";
			pinError.value = "";
			showPin.value = false;
		}
	},
	{ immediate: true },
);

const selectedCashier = computed(
	() => terminalEmployees.value.find((employee) => employee.user === selectedUser.value) || null,
);
const isFirstPin = computed(
	() => selectedCashier.value?.pin_length === 0 && selectedUser.value === window.frappe?.session?.user,
);
const needsSupervisor = computed(() => selectedCashier.value?.pin_length === 0 && !isFirstPin.value);
const pinHelp = computed(() => {
	if (isFirstPin.value) return __("Choose a PIN of 4 to 8 digits and confirm it to unlock this terminal.");
	if (needsSupervisor.value) return __("This cashier has no PIN. Ask a POS supervisor for help.");
	return __("Enter the selected cashier's PIN to continue.");
});

const canSubmit = computed(
	() =>
		Boolean(selectedCashier.value?.user) &&
		!needsSupervisor.value &&
		Boolean(cashierPin.value.trim()) &&
		!isSubmitting.value,
);

const normalizeErrorMessage = (error) =>
	error?.message || error?.exc || error?.messages?.[0] || __("Unable to verify cashier PIN.");

const selectEmployee = (user) => {
	selectedUser.value = user;
	cashierPin.value = "";
	confirmPin.value = "";
	pinError.value = "";
};

const retryCashierLoad = () => {
	selectedUser.value = "";
	cashierPin.value = "";
	confirmPin.value = "";
	pinError.value = "";
	const profileName = employeeStore.terminalEmployeesProfile || posProfileName.value;
	if (profileName) {
		employeeStore.beginTerminalEmployeesLoad(profileName);
	}
	emit("retry-load");
};

const handleSwitchDialog = (value) => {
	if (!value) {
		employeeStore.closeEmployeeSwitch();
	}
};

const verifySelection = async () => {
	if (isSubmitting.value || needsSupervisor.value) return null;
	if (!selectedCashier.value) {
		pinError.value = __("Select a cashier first.");
		return null;
	}
	if (!cashierPin.value.trim()) {
		pinError.value = __("Enter the cashier PIN to continue.");
		return null;
	}
	if (isFirstPin.value) {
		if (!/^[0-9]{4,8}$/.test(cashierPin.value)) {
			pinError.value = __("PIN must be 4 to 8 digits.");
			return null;
		}
		if (cashierPin.value !== confirmPin.value) {
			pinError.value = __("PIN confirmation does not match.");
			return null;
		}
	}

	isSubmitting.value = true;
	pinError.value = "";
	const creatingPin = isFirstPin.value;
	const cashier = selectedCashier.value;
	const pin = cashierPin.value.trim();

	try {
		const response = await window.frappe.call({
			method: creatingPin
				? "posawesome.posawesome.api.employees.save_cashier_pin"
				: "posawesome.posawesome.api.employees.verify_terminal_employee_pin",
			args: {
				pos_profile: posProfileName.value,
				user: cashier.user,
				...(creatingPin ? { new_pin: pin } : { pin }),
			},
		});
		const verifiedCashier = {
			...cashier,
			...(response?.message || {}),
		};
		const terminalState = verifiedCashier.terminal_state;
		if (terminalState?.locked !== false || terminalState?.active_cashier !== verifiedCashier.user) {
			throw new Error(__("The server did not confirm the active terminal cashier."));
		}
		if (creatingPin) {
			verifiedCashier.pin_length = pin.length;
			employeeStore.setTerminalEmployees(
				terminalEmployees.value.map((employee) =>
					employee.user === cashier.user ? { ...employee, pin_length: pin.length } : employee,
				),
			);
		}
		return verifiedCashier;
	} catch (error) {
		pinError.value = normalizeErrorMessage(error);
		return null;
	} finally {
		isSubmitting.value = false;
	}
};

const submitSwitch = async () => {
	const verifiedCashier = await verifySelection();
	if (!verifiedCashier) {
		return;
	}
	employeeStore.applyVerifiedCashier(verifiedCashier);
	employeeStore.closeEmployeeSwitch();
	cashierPin.value = "";
};

const submitUnlock = async () => {
	const verifiedCashier = await verifySelection();
	if (!verifiedCashier) {
		return;
	}
	employeeStore.unlockTerminal(verifiedCashier);
	cashierPin.value = "";
};

watch(cashierPin, (value) => {
	if (isFirstPin.value) return;
	const normalizedPin = String(value || "")
		.replace(/\D/g, "")
		.slice(0, 8);
	if (normalizedPin !== value) {
		cashierPin.value = normalizedPin;
		return;
	}

	const expectedLength = Number(selectedCashier.value?.pin_length || 0);
	if (
		isSubmitting.value ||
		expectedLength < 4 ||
		expectedLength > 8 ||
		normalizedPin.length !== expectedLength
	) {
		return;
	}

	if (lockDialogOpen.value) {
		void submitUnlock();
	} else if (switchDialogOpen.value) {
		void submitSwitch();
	}
});

const __ = window.__;
</script>

<style scoped>
.employee-switch-dialog__title {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16px;
}

.employee-switch-dialog__eyebrow {
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--pos-text-secondary);
}

.employee-switch-dialog__copy {
	margin-bottom: 12px;
	color: var(--pos-text-secondary);
}

.employee-switch-dialog__empty {
	padding: 16px;
	border: 1px dashed var(--pos-border);
	border-radius: 14px;
	color: var(--pos-text-secondary);
}

.employee-switch-dialog__status {
	display: flex;
	align-items: center;
	gap: 12px;
	min-height: 64px;
	padding: 14px 16px;
	border: 1px solid var(--pos-border);
	border-radius: 14px;
	background: var(--pos-surface-muted);
	color: var(--pos-text-secondary);
}

.employee-switch-dialog__load-error :deep(.v-alert__content) {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.employee-switch-dialog__retry {
	flex: 0 0 auto;
	padding: 6px 10px;
	border: 1px solid currentColor;
	border-radius: 6px;
	background: transparent;
	color: inherit;
	font: inherit;
	font-weight: 700;
	cursor: pointer;
}

.employee-switch-dialog__retry:focus-visible {
	outline: 2px solid currentColor;
	outline-offset: 2px;
}

.employee-switch-dialog__list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.employee-switch-dialog__option {
	width: 100%;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px 16px;
	border-radius: 16px;
	border: 1px solid rgba(var(--v-theme-primary), 0.12);
	background: var(--pos-surface-muted);
	color: var(--pos-text-primary);
	text-align: left;
	transition:
		transform 0.18s ease,
		box-shadow 0.18s ease,
		border-color 0.18s ease;
}

.employee-switch-dialog__option:hover,
.employee-switch-dialog__option--active {
	border-color: rgba(var(--v-theme-primary), 0.34);
	box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);
	transform: translateY(-1px);
}

.employee-switch-dialog__meta {
	margin-top: 4px;
	font-size: 0.82rem;
	color: var(--pos-text-secondary);
}

.employee-switch-dialog__actions {
	justify-content: flex-end;
}

.employee-switch-dialog__error {
	margin-top: 12px;
	border-radius: 14px;
}

.employee-switch-dialog__help {
	margin: 14px 0 12px;
	border-radius: 14px;
}
</style>
