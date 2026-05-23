export const TAB_PAGE_SIZE = 25;

export const PARTIAL_STATUS_ITEMS = ["All", "Partly Paid", "Unpaid", "Overdue"] as const;

export const HISTORY_STATUS_ITEMS = [
	"All",
	"Paid",
	"Partly Paid",
	"Unpaid",
	"Overdue",
	"Credit Note Issued",
] as const;

export type InvoiceManagementTab = "history" | "partial" | "drafts" | "returns";

export function buildPartialHeaders() {
	return [
		{ title: __("Invoice"), key: "name" },
		{ title: __("Customer"), key: "customer_name" },
		{ title: __("Posting"), key: "posting_date" },
		{ title: __("Due Date"), key: "due_date" },
		{ title: __("Status"), key: "status" },
		{ title: __("Total"), key: "grand_total", align: "end" },
		{ title: __("Paid"), key: "paid_amount", align: "end" },
		{ title: __("Outstanding"), key: "outstanding_amount", align: "end" },
		{ title: __("Actions"), key: "actions", align: "end", sortable: false },
	];
}

export function buildHistoryHeaders() {
	return [
		{ title: __("Invoice"), key: "name" },
		{ title: __("Customer"), key: "customer_name" },
		{ title: __("Posting"), key: "posting_date" },
		{ title: __("Status"), key: "status" },
		{ title: __("Total"), key: "grand_total", align: "end" },
		{ title: __("Tendered"), key: "paid_amount", align: "end" },
		{ title: __("Change Return"), key: "change_amount", align: "end" },
		{ title: __("Outstanding"), key: "outstanding_amount", align: "end" },
		{ title: __("Actions"), key: "actions", align: "end", sortable: false },
	];
}

export function buildReturnHeaders() {
	return [
		{ title: __("Invoice"), key: "name" },
		{ title: __("Customer"), key: "customer_name" },
		{ title: __("Posting"), key: "posting_date" },
		{ title: __("Against"), key: "return_against" },
		{ title: __("Total"), key: "grand_total", align: "end" },
		{ title: __("Actions"), key: "actions", align: "end", sortable: false },
	];
}

export function buildDetailHeaders() {
	return [
		{ title: __("Item"), key: "item_name" },
		{ title: __("Code"), key: "item_code" },
		{ title: __("Qty"), key: "qty", align: "end" },
		{ title: __("Rate"), key: "rate", align: "end" },
		{ title: __("Amount"), key: "amount", align: "end" },
	];
}

export function buildPaymentHeaders() {
	return [
		{ title: __("Mode"), key: "mode_of_payment" },
		{ title: __("Amount"), key: "amount", align: "end" },
		{ title: __("Account"), key: "account" },
	];
}

export function buildDraftHeaders(sourceLabel: string) {
	return [
		{ title: __(sourceLabel), key: "name" },
		{ title: __("Customer"), key: "customer_name" },
		{ title: __("Posting"), key: "posting_date" },
		{ title: __("Total"), key: "grand_total", align: "end" },
		{ title: __("Actions"), key: "actions", align: "end", sortable: false },
	];
}
