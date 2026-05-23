// @ts-nocheck

import { TAB_PAGE_SIZE, type InvoiceManagementTab } from "./constants";

export type TabPages = Record<InvoiceManagementTab, number>;

export type RepairAllocationState = "repaired" | "candidate" | null;

export interface InvoiceRecord {
	name?: string;
	customer?: string;
	customer_name?: string;
	return_against?: string;
	status?: string;
	pos_profile?: string;
	owner?: string;
	modified_by?: string;
	custom_created_by_name?: string;
	custom_submitted_by_name?: string;
	posting_date?: string;
	posting_time?: string;
	modified?: string;
	created_at?: string;
	grand_total?: number;
	paid_amount?: number;
	change_amount?: number;
	outstanding_amount?: number;
	is_return?: number;
	due_date?: string;
	doctype?: string;
	[key: string]: unknown;
}

export interface ChangeAllocationRepairContext {
	repairCandidateScopeReady: boolean;
	repairedChangeAllocationInvoiceNames: string[];
}

export function normalizeDate(value: unknown): string {
	return value ? String(value).slice(0, 10) : "";
}

export function normalizePostingTime(value: unknown): string {
	const raw = String(value || "")
		.split(".")[0]
		.trim();
	if (!raw) return "00:00:00";

	const parts = raw.split(":").map((part) => part.trim());
	if (parts.length < 1 || parts.length > 3) return "00:00:00";

	const hour = Number.parseInt(parts[0] || "0", 10);
	const minute = Number.parseInt(parts[1] || "0", 10);
	const second = Number.parseInt(parts[2] || "0", 10);

	if (
		!Number.isInteger(hour) ||
		!Number.isInteger(minute) ||
		!Number.isInteger(second) ||
		hour < 0 ||
		hour > 23 ||
		minute < 0 ||
		minute > 59 ||
		second < 0 ||
		second > 59
	) {
		return "00:00:00";
	}

	return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

export function toPostingTimestamp(postingDate: unknown, postingTime: unknown): number {
	if (!postingDate) return Number.NaN;
	const dateParts = String(postingDate).split("-");
	if (dateParts.length !== 3) return Number.NaN;

	const year = Number.parseInt(dateParts[0], 10);
	const month = Number.parseInt(dateParts[1], 10);
	const day = Number.parseInt(dateParts[2], 10);
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
		return Number.NaN;
	}

	const [hourText, minuteText, secondText] = normalizePostingTime(postingTime).split(":");
	const hour = Number.parseInt(hourText || "0", 10);
	const minute = Number.parseInt(minuteText || "0", 10);
	const second = Number.parseInt(secondText || "0", 10);

	return Date.UTC(year, month - 1, day, hour, minute, second);
}

export function inRange(date: unknown, fromDate: string, toDate: string): boolean {
	const value = normalizeDate(date);
	if (fromDate && value < fromDate) return false;
	if (toDate && value > toDate) return false;
	return true;
}

export function filterCollection(
	items: InvoiceRecord[],
	search: unknown,
	status: unknown,
	fromDate: unknown,
	toDate: unknown,
): InvoiceRecord[] {
	const needle = String(search || "")
		.trim()
		.toLowerCase();
	const normalizedFrom = normalizeDate(fromDate);
	const normalizedTo = normalizeDate(toDate);

	return items.filter((item) => {
		if (needle) {
			const haystack = [
				item.name,
				item.customer,
				item.customer_name,
				item.return_against,
				item.status,
				item.pos_profile,
				item.owner,
				item.modified_by,
				item.custom_created_by_name,
				item.custom_submitted_by_name,
			]
				.filter(Boolean)
				.map((entry) => String(entry).toLowerCase());
			if (!haystack.some((entry) => entry.includes(needle))) return false;
		}
		if (status && status !== "All" && String(item.status || "") !== status) return false;
		return inRange(item.posting_date, normalizedFrom, normalizedTo);
	});
}

export function invoiceSortValue(invoice: InvoiceRecord): number {
	const postingDate = normalizeDate(invoice?.posting_date) || "0000-00-00";
	const postingTime = normalizePostingTime(invoice?.posting_time);
	const modified = String(invoice?.modified || "");
	const createdAt = String(invoice?.created_at || "");
	const timestamp = toPostingTimestamp(postingDate, postingTime);
	if (!Number.isNaN(timestamp)) return timestamp;
	const createdTimestamp = Date.parse(createdAt);
	if (!Number.isNaN(createdTimestamp)) return createdTimestamp;
	const modifiedTimestamp = Date.parse(modified);
	if (!Number.isNaN(modifiedTimestamp)) return modifiedTimestamp;
	return 0;
}

export function sortInvoicesByLatest(items: InvoiceRecord[]): InvoiceRecord[] {
	return [...items].sort((left, right) => invoiceSortValue(right) - invoiceSortValue(left));
}

export function pageCount(totalItems: number, pageSize = TAB_PAGE_SIZE): number {
	const perPage = Number(pageSize) || TAB_PAGE_SIZE;
	return Math.max(1, Math.ceil(Number(totalItems || 0) / perPage));
}

export function paginateCollection<T>(
	items: T[],
	tab: InvoiceManagementTab,
	tabPages: TabPages,
	pageSize = TAB_PAGE_SIZE,
): T[] {
	if (!Array.isArray(items) || !items.length) return [];
	const perPage = Number(pageSize) || TAB_PAGE_SIZE;
	const currentPage = Number(tabPages?.[tab]) || 1;
	const maxPage = pageCount(items.length, perPage);
	const page = Math.min(Math.max(currentPage, 1), maxPage);
	const startIndex = (page - 1) * perPage;
	return items.slice(startIndex, startIndex + perPage);
}

export function paginationCaption(
	totalItems: number,
	tab: InvoiceManagementTab,
	tabPages: TabPages,
	pageSize = TAB_PAGE_SIZE,
): string {
	const total = Number(totalItems || 0);
	if (!total) return __("Showing 0 of 0");
	const perPage = Number(pageSize) || TAB_PAGE_SIZE;
	const maxPage = pageCount(total, perPage);
	const currentPage = Number(tabPages?.[tab]) || 1;
	const page = Math.min(Math.max(currentPage, 1), maxPage);
	const start = (page - 1) * perPage + 1;
	const end = Math.min(total, page * perPage);
	return __("Showing {0}-{1} of {2}", [start, end, total]);
}

export function createDefaultTabPages(): TabPages {
	return {
		history: 1,
		partial: 1,
		drafts: 1,
		returns: 1,
	};
}

export function matchesRepairCandidatePattern(invoice: InvoiceRecord | null | undefined): boolean {
	return Boolean(
		invoice &&
			!Number(invoice?.is_return || 0) &&
			Number(invoice?.change_amount || 0) > 0 &&
			Number(invoice?.outstanding_amount || 0) < 0,
	);
}

export function changeAllocationRepairState(
	invoice: InvoiceRecord | null | undefined,
	context: ChangeAllocationRepairContext,
): RepairAllocationState {
	if (!matchesRepairCandidatePattern(invoice)) return null;
	if (context.repairCandidateScopeReady) {
		if (
			Array.isArray(context.repairedChangeAllocationInvoiceNames) &&
			context.repairedChangeAllocationInvoiceNames.includes(String(invoice?.name || ""))
		) {
			return "repaired";
		}
		return "candidate";
	}
	return "candidate";
}

export function isRepairCandidate(
	invoice: InvoiceRecord | null | undefined,
	context: ChangeAllocationRepairContext,
): boolean {
	return changeAllocationRepairState(invoice, context) === "candidate";
}

export interface FilteredHistoryParams {
	historyInvoices: InvoiceRecord[];
	historySearch: string;
	historyStatus: string;
	historyDateFrom: string;
	historyDateTo: string;
	historyShowRepairCandidatesOnly: boolean;
	repairContext: ChangeAllocationRepairContext;
}

export function computeFilteredHistoryInvoices(params: FilteredHistoryParams): InvoiceRecord[] {
	const visibleInvoices = params.historyInvoices.filter((invoice) => !invoice.is_return);
	const candidateScopedInvoices = params.historyShowRepairCandidatesOnly
		? visibleInvoices.filter(
				(invoice) => changeAllocationRepairState(invoice, params.repairContext) !== null,
			)
		: visibleInvoices;
	return sortInvoicesByLatest(
		filterCollection(
			candidateScopedInvoices,
			params.historySearch,
			params.historyStatus,
			params.historyDateFrom,
			params.historyDateTo,
		),
	);
}

export function computeHistoryTotals(invoices: InvoiceRecord[]) {
	return invoices.reduce(
		(accumulator, invoice) => {
			accumulator.gross += Number(invoice.grand_total || 0);
			accumulator.paid += Number(invoice.paid_amount || 0);
			accumulator.change_return += Number(invoice.change_amount || 0);
			accumulator.outstanding += Number(invoice.outstanding_amount || 0);
			return accumulator;
		},
		{ gross: 0, paid: 0, change_return: 0, outstanding: 0 },
	);
}

export function statusColor(status: unknown): string {
	const value = String(status || "").toLowerCase();
	if (value === "paid") return "success";
	if (value.includes("partly")) return "warning";
	if (value.includes("overdue")) return "error";
	if (value.includes("credit")) return "info";
	return "primary";
}

export function toneFromStatus(status: unknown): string {
	return statusColor(status);
}

export function formatDateForDisplay(date: unknown): string {
	if (!date) return "";
	const parts = String(date).split("-");
	return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : String(date);
}

export function formatDateTime(date: unknown, time: unknown): string {
	const formattedDate = formatDateForDisplay(date);
	const formattedTime = time ? String(time).split(".")[0] : "";
	return [formattedDate, formattedTime].filter(Boolean).join(" ");
}
