import api from "./api";

const baseMethod = "posawesome.posawesome.api.cash_movement.service";

const cashMovementService = {
	getContext(pos_profile?: string, pos_opening_shift?: string) {
		return api.call(`${baseMethod}.get_cash_movement_context`, {
			pos_profile,
			pos_opening_shift,
		});
	},

	createExpense(payload: Record<string, any>) {
		return api.call(`${baseMethod}.create_pos_expense`, { payload });
	},

	createDeposit(payload: Record<string, any>) {
		return api.call(`${baseMethod}.create_cash_deposit`, { payload });
	},

	getShiftMovements(args: {
		pos_opening_shift: string;
		movement_type?: string;
		status?: string;
		limit_start?: number;
		limit_page_length?: number;
	}) {
		return api.call(`${baseMethod}.get_shift_cash_movements`, args);
	},

	getSubmittedExpenses(args: {
		pos_opening_shift: string;
		limit_start?: number;
		limit_page_length?: number;
	}) {
		return api.call(`${baseMethod}.get_submitted_expenses`, args);
	},

	cancel(name: string) {
		return api.call(`${baseMethod}.cancel_cash_movement`, { name });
	},

	duplicate(name: string, posting_date?: string) {
		return api.call(`${baseMethod}.duplicate_cash_movement`, { name, posting_date });
	},

	remove(name: string) {
		return api.call(`${baseMethod}.delete_cash_movement`, { name });
	},
};

export default cashMovementService;
