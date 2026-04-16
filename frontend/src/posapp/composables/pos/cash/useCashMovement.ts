import { ref } from "vue";
import cashMovementService from "../../../services/cashMovementService";
import { useCashMovementValidation } from "./useCashMovementValidation";

export function useCashMovement() {
	const loading = ref(false);
	const submitting = ref(false);
	const actionLoading = ref(false);
	const context = ref<any>(null);
	const historyRows = ref<any[]>([]);
	const error = ref<string>("");

	const { validate } = useCashMovementValidation();

	async function loadContext(posProfileName: string, posOpeningShiftName: string) {
		loading.value = true;
		error.value = "";
		try {
			context.value = await cashMovementService.getContext(posProfileName, posOpeningShiftName);
			return context.value;
		} catch (err: any) {
			error.value = err?.message || __("Failed to load cash movement context.");
			throw err;
		} finally {
			loading.value = false;
		}
	}

	async function loadHistory(
		posOpeningShiftName: string,
		{
			movementType,
			status = "",
			searchText = "",
		}: { movementType?: string; status?: string; searchText?: string } = {},
	) {
		loading.value = true;
		try {
			historyRows.value = await cashMovementService.getShiftMovements({
				pos_opening_shift: posOpeningShiftName,
				movement_type: movementType,
				status,
				search_text: searchText,
				limit_start: 0,
				limit_page_length: 200,
			});
			return historyRows.value;
		} finally {
			loading.value = false;
		}
	}

	async function submitMovement(args: {
		movementType: "Expense" | "Deposit";
		amount: number;
		againstName?: string;
		postingDate?: string;
		sourceAccount?: string;
		remarks: string;
		posProfileName: string;
		posOpeningShiftName: string;
		expenseAccount?: string;
		targetAccount?: string;
		clientRequestId?: string;
		/** Switched cashier user ID */
		posaCashier?: string;
		/** Switched cashier display name */
		posaCashierName?: string;
	}) {
		const validation = validate({
			movementType: args.movementType,
			amount: args.amount,
			remarks: args.remarks,
			context: context.value,
			expenseAccount: args.expenseAccount,
			targetAccount: args.targetAccount,
		});

		if (!validation.valid) {
			throw new Error(validation.errors.join("\n"));
		}

		submitting.value = true;
		try {
			const payload: Record<string, any> = {
				pos_profile: args.posProfileName,
				pos_opening_shift: args.posOpeningShiftName,
				posting_date: args.postingDate,
				amount: args.amount,
				against_name: args.againstName,
				source_account: args.sourceAccount,
				remarks: args.remarks,
				expense_account: args.expenseAccount,
				target_account: args.targetAccount,
				client_request_id: args.clientRequestId,
			};
			if (args.posaCashier) {
				payload.posa_cashier = args.posaCashier;
				payload.posa_cashier_name = args.posaCashierName || args.posaCashier;
			}

			if (args.movementType === "Expense") {
				return await cashMovementService.createExpense(payload);
			}
			return await cashMovementService.createDeposit(payload);
		} finally {
			submitting.value = false;
		}
	}

	async function cancelMovement(name: string) {
		actionLoading.value = true;
		try {
			return await cashMovementService.cancel(name);
		} finally {
			actionLoading.value = false;
		}
	}

	async function deleteMovement(name: string) {
		actionLoading.value = true;
		try {
			return await cashMovementService.remove(name);
		} finally {
			actionLoading.value = false;
		}
	}

	async function duplicateMovement(name: string, postingDate?: string) {
		actionLoading.value = true;
		try {
			return await cashMovementService.duplicate(name, postingDate);
		} finally {
			actionLoading.value = false;
		}
	}

	return {
		loading,
		submitting,
		actionLoading,
		context,
		historyRows,
		error,
		loadContext,
		loadHistory,
		submitMovement,
		cancelMovement,
		deleteMovement,
		duplicateMovement,
	};
}
