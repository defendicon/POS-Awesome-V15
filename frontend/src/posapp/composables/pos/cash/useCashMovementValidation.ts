type ValidationArgs = {
	movementType: string;
	amount: number;
	remarks: string;
	context: any;
	expenseAccount?: string;
	targetAccount?: string;
};

export function useCashMovementValidation() {
	function validate(args: ValidationArgs) {
		const errors: string[] = [];
		const amount = Number(args.amount || 0);
		const movementType = (args.movementType || "").trim();
		const requiresRemarks = !!args.context?.require_cash_movement_remarks;

		if (!args.context?.enable_cash_movement) {
			errors.push(__("Cash movement is disabled for this POS Profile."));
		}

		if (!movementType || !["Expense", "Deposit"].includes(movementType)) {
			errors.push(__("Please select a valid movement type."));
		}

		if (movementType === "Expense" && !args.context?.allow_pos_expense) {
			errors.push(__("POS Expense is disabled for this POS Profile."));
		}

		if (movementType === "Deposit" && !args.context?.allow_cash_deposit) {
			errors.push(__("Cash Deposit is disabled for this POS Profile."));
		}

		if (!Number.isFinite(amount) || amount <= 0) {
			errors.push(__("Amount must be greater than zero."));
		}

		const maxAmount = Number(args.context?.cash_movement_max_amount || 0);
		if (maxAmount > 0 && amount > maxAmount) {
			errors.push(__("Amount exceeds profile cash movement max amount."));
		}

		if (requiresRemarks && !(args.remarks || "").trim()) {
			errors.push(__("Remarks are required."));
		}

		if (movementType === "Expense" && !(args.expenseAccount || args.context?.default_expense_account)) {
			errors.push(__("Expense account is required."));
		}

		if (movementType === "Deposit" && !(args.targetAccount || args.context?.back_office_cash_account)) {
			errors.push(__("Back office cash account is required."));
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	return {
		validate,
	};
}
