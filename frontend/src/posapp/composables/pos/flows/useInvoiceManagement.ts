// @ts-nocheck

import { computed, inject, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useFormat } from "../../../format";
import { useToastStore } from "../../../stores/toastStore";
import { useUIStore } from "../../../stores/uiStore";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { useCustomersStore } from "../../../stores/customersStore";
import { useEmployeeStore } from "../../../stores/employeeStore";
import {
	appendDebugPrintParam,
	isDebugPrintEnabled,
	silentPrint,
	watchPrintWindow,
} from "../../../plugins/print";
import { printDocumentViaQz } from "../../../services/qzTray";
import { isOffline } from "../../../../offline/index";
import {
	canDeleteDocumentSourceRecord,
	commitDocumentFlowAction,
	fetchDocumentSourceRecords,
	getAvailableCommercialDocumentSources,
	getDefaultCommercialDocumentSource,
	getDocumentFlowActionLabel,
	getDocumentFlowActionsForRecord,
	getDocumentSourceOption,
	loadDocumentSourceRecord,
	prepareDocumentFlowAction,
	shouldShowDocumentSourceSelector,
} from "../../../utils/documentSources";
import {
	TAB_PAGE_SIZE,
	HISTORY_STATUS_ITEMS,
	PARTIAL_STATUS_ITEMS,
	buildDetailHeaders,
	buildDraftHeaders,
	buildHistoryHeaders,
	buildPartialHeaders,
	buildPaymentHeaders,
	buildReturnHeaders,
} from "../../../components/pos/flows/invoice-management/constants";
import {
	changeAllocationRepairState,
	computeFilteredHistoryInvoices,
	computeHistoryTotals,
	createDefaultTabPages,
	filterCollection,
	formatDateForDisplay,
	formatDateTime,
	isRepairCandidate,
	matchesRepairCandidatePattern,
	paginateCollection,
	pageCount,
	paginationCaption,
	sortInvoicesByLatest,
	statusColor,
	toneFromStatus,
	type InvoiceRecord,
	type TabPages,
} from "../../../components/pos/flows/invoice-management/utils";

export {
	filterCollection,
	sortInvoicesByLatest,
	invoiceSortValue,
	normalizeDate,
	normalizePostingTime,
	toPostingTimestamp,
	inRange,
	matchesRepairCandidatePattern,
	changeAllocationRepairState,
	isRepairCandidate,
	computeFilteredHistoryInvoices,
	computeHistoryTotals,
} from "../../../components/pos/flows/invoice-management/utils";

import {
	invoiceSortValue,
	normalizeDate,
	normalizePostingTime,
	toPostingTimestamp,
	inRange,
} from "../../../components/pos/flows/invoice-management/utils";

export function isSupervisorScope(ctx: {
	currentCashier?: { is_supervisor?: boolean } | null;
	posProfile?: { company?: string } | null;
}): boolean {
	return Boolean(ctx.currentCashier?.is_supervisor && ctx.posProfile?.company);
}

export function resolveSupervisorProfileScope(ctx: {
	selectedSupervisorPosProfile?: string | null;
	posProfile?: { name?: string } | null;
	currentCashier?: { is_supervisor?: boolean } | null;
}): string | null {
	if (!isSupervisorScope(ctx)) return null;
	const selectedProfile = ctx.selectedSupervisorPosProfile;
	if (selectedProfile && selectedProfile !== "All") return selectedProfile;
	return selectedProfile === "All" ? null : ctx.posProfile?.name || null;
}

export function buildInvoiceFilters(
	ctx: {
		posProfile?: Record<string, unknown> | null;
		currentCashier?: { is_supervisor?: boolean } | null;
		selectedSupervisorPosProfile?: string | null;
	},
	baseFilters: Record<string, unknown> = {},
): Record<string, unknown> {
	const filters: Record<string, unknown> = { ...baseFilters, docstatus: 1 };
	if (isSupervisorScope(ctx)) {
		filters.company = ctx.posProfile?.company;
		const scopedProfile = resolveSupervisorProfileScope(ctx);
		if (scopedProfile) filters.pos_profile = scopedProfile;
		else delete filters.pos_profile;
		delete filters.posa_pos_opening_shift;
		return filters;
	}
	filters.pos_profile = ctx.posProfile?.name;
	return filters;
}

export function getInvoiceListFields(extraFields: string[] = []) {
	return [
		"name",
		"customer",
		"customer_name",
		"posting_date",
		"posting_time",
		"grand_total",
		"paid_amount",
		"outstanding_amount",
		"status",
		"currency",
		"pos_profile",
		"owner",
		"modified_by",
		...extraFields,
	];
}

export function historyInvoiceDoctypes(currentInvoiceDoctype: string): string[] {
	if (currentInvoiceDoctype === "POS Invoice") return ["POS Invoice", "Sales Invoice"];
	return [currentInvoiceDoctype || "Sales Invoice"];
}

export function useInvoiceManagement() {
	const uiStore = useUIStore();
	const invoiceStore = useInvoiceStore();
	const customersStore = useCustomersStore();
	const employeeStore = useEmployeeStore();
	const toastStore = useToastStore();
	const router = useRouter();
	const eventBus = inject<{ emit?: (_event: string, _payload?: unknown) => void }>("eventBus");
	const { formatCurrency, formatFloat, currencySymbol } = useFormat();

	const { invoiceManagementDialog, invoiceManagementTargetTab, posProfile, posOpeningShift } =
		storeToRefs(uiStore);
	const { currentCashier } = storeToRefs(employeeStore);

	const activeTab = ref<"history" | "partial" | "drafts" | "returns">("history");
	const viewMode = ref<"card" | "list">("card");
	const loading = ref(false);
	const pageSize = ref(TAB_PAGE_SIZE);
	const tabPages = ref<TabPages>(createDefaultTabPages());

	const partialSearch = ref("");
	const partialStatus = ref("All");
	const partialDateFrom = ref("");
	const partialDateTo = ref("");

	const historySearch = ref("");
	const historyStatus = ref("All");
	const historyDateFrom = ref("");
	const historyDateTo = ref("");
	const historyShowRepairCandidatesOnly = ref(false);
	const repairCandidateInvoiceNames = ref<string[]>([]);
	const repairedChangeAllocationInvoiceNames = ref<string[]>([]);
	const repairCandidateScopeReady = ref(false);

	const selectedSupervisorPosProfile = ref<string | null>(null);
	const supervisorPosProfiles = ref<string[]>([]);
	const suppressSupervisorProfileRefresh = ref(false);

	const draftSearch = ref("");
	const draftDateFrom = ref("");
	const draftDateTo = ref("");
	const draftSource = ref("invoice");

	const returnSearch = ref("");
	const returnDateFrom = ref("");
	const returnDateTo = ref("");

	const unpaidInvoices = ref<InvoiceRecord[]>([]);
	const historyInvoices = ref<InvoiceRecord[]>([]);
	const draftRecordsBySource = ref<Record<string, InvoiceRecord[]>>({
		invoice: [],
		order: [],
		quote: [],
		delivery: [],
	});

	const repairChangeLoading = ref(false);
	const detailDialog = ref(false);
	const selectedInvoiceDetail = ref<InvoiceRecord | null>(null);

	const partialHeaders = buildPartialHeaders();
	const historyHeaders = buildHistoryHeaders();
	const returnHeaders = buildReturnHeaders();
	const detailHeaders = buildDetailHeaders();
	const paymentHeaders = buildPaymentHeaders();
	const partialStatusItems = [...PARTIAL_STATUS_ITEMS];
	const historyStatusItems = [...HISTORY_STATUS_ITEMS];

	const scopeContext = () => ({
		currentCashier: currentCashier.value,
		posProfile: posProfile.value,
		selectedSupervisorPosProfile: selectedSupervisorPosProfile.value,
	});

	const repairContext = computed(() => ({
		repairCandidateScopeReady: repairCandidateScopeReady.value,
		repairedChangeAllocationInvoiceNames: repairedChangeAllocationInvoiceNames.value,
	}));

	const currentInvoiceDoctype = computed(() =>
		posProfile.value?.create_pos_invoice_instead_of_sales_invoice
			? "POS Invoice"
			: "Sales Invoice",
	);

	const availableDraftSources = computed(() =>
		getAvailableCommercialDocumentSources(posProfile.value),
	);

	const currentDraftSource = computed(() =>
		getDefaultCommercialDocumentSource(posProfile.value, draftSource.value),
	);

	const currentDraftSourceOption = computed(() =>
		getDocumentSourceOption(currentDraftSource.value),
	);

	const showDraftSourceSelector = computed(() =>
		shouldShowDocumentSourceSelector(availableDraftSources.value),
	);

	const canDeleteActiveDraftSource = computed(() =>
		canDeleteDocumentSourceRecord(currentDraftSource.value),
	);

	const draftHeaders = computed(() => buildDraftHeaders(currentDraftSourceOption.value.label));

	const draftRecords = computed(() =>
		Array.isArray(draftRecordsBySource.value?.[currentDraftSource.value])
			? draftRecordsBySource.value[currentDraftSource.value]
			: [],
	);

	const supervisorPosProfileItems = computed(() => {
		if (!isSupervisorScope(scopeContext())) return [];
		const profileNames = new Set(
			[posProfile.value?.name, ...(supervisorPosProfiles.value || [])].filter(Boolean),
		);
		return [
			{ title: __("All"), value: "All" },
			...Array.from(profileNames)
				.sort((left, right) => String(left).localeCompare(String(right)))
				.map((profileName) => ({
					title: profileName,
					value: profileName,
				})),
		];
	});

	const filteredUnpaidInvoices = computed(() =>
		sortInvoicesByLatest(
			filterCollection(
				unpaidInvoices.value,
				partialSearch.value,
				partialStatus.value,
				partialDateFrom.value,
				partialDateTo.value,
			),
		),
	);

	const filteredHistoryInvoices = computed(() =>
		computeFilteredHistoryInvoices({
			historyInvoices: historyInvoices.value,
			historySearch: historySearch.value,
			historyStatus: historyStatus.value,
			historyDateFrom: historyDateFrom.value,
			historyDateTo: historyDateTo.value,
			historyShowRepairCandidatesOnly: historyShowRepairCandidatesOnly.value,
			repairContext: repairContext.value,
		}),
	);

	const historyRepairCandidateCount = computed(() =>
		filterCollection(
			historyInvoices.value.filter(
				(invoice) =>
					!invoice.is_return && changeAllocationRepairState(invoice, repairContext.value) !== null,
			),
			historySearch.value,
			historyStatus.value,
			historyDateFrom.value,
			historyDateTo.value,
		).length,
	);

	const filteredDraftInvoices = computed(() =>
		sortInvoicesByLatest(
			filterCollection(
				draftRecords.value,
				draftSearch.value,
				"All",
				draftDateFrom.value,
				draftDateTo.value,
			),
		),
	);

	const filteredReturnInvoices = computed(() =>
		sortInvoicesByLatest(
			filterCollection(
				historyInvoices.value.filter((d) => d.is_return),
				returnSearch.value,
				"All",
				returnDateFrom.value,
				returnDateTo.value,
			),
		),
	);

	const filteredUnpaidSummary = computed(() =>
		filteredUnpaidInvoices.value.reduce(
			(accumulator, invoice) => {
				accumulator.count += 1;
				accumulator.total_paid += Number(invoice.paid_amount || 0);
				accumulator.total_outstanding += Number(invoice.outstanding_amount || 0);
				if (isOverdue(invoice)) accumulator.overdue_count += 1;
				return accumulator;
			},
			{ count: 0, total_paid: 0, total_outstanding: 0, overdue_count: 0 },
		),
	);

	const historyTotals = computed(() => computeHistoryTotals(filteredHistoryInvoices.value));

	const unpaidStatusCounts = computed(() =>
		unpaidInvoices.value.reduce(
			(accumulator, invoice) => {
				accumulator.all += 1;
				const status = String(invoice.status || "");
				if (status === "Partly Paid") accumulator.partial += 1;
				if (status === "Unpaid") accumulator.unpaid += 1;
				if (isOverdue(invoice)) accumulator.overdue += 1;
				return accumulator;
			},
			{ all: 0, partial: 0, unpaid: 0, overdue: 0 },
		),
	);

	const paginatedHistoryInvoices = computed(() =>
		paginateCollection(filteredHistoryInvoices.value, "history", tabPages.value, pageSize.value),
	);

	const paginatedUnpaidInvoices = computed(() =>
		paginateCollection(filteredUnpaidInvoices.value, "partial", tabPages.value, pageSize.value),
	);

	const paginatedDraftInvoices = computed(() =>
		paginateCollection(filteredDraftInvoices.value, "drafts", tabPages.value, pageSize.value),
	);

	const paginatedReturnInvoices = computed(() =>
		paginateCollection(filteredReturnInvoices.value, "returns", tabPages.value, pageSize.value),
	);

	const historyPageCount = computed(() => pageCount(filteredHistoryInvoices.value.length, pageSize.value));
	const partialPageCount = computed(() => pageCount(filteredUnpaidInvoices.value.length, pageSize.value));
	const draftsPageCount = computed(() => pageCount(filteredDraftInvoices.value.length, pageSize.value));
	const returnsPageCount = computed(() => pageCount(filteredReturnInvoices.value.length, pageSize.value));

	function resetPagination() {
		tabPages.value = createDefaultTabPages();
	}

	function resetTabPage(tab: keyof TabPages) {
		if (!tabPages.value || !Object.prototype.hasOwnProperty.call(tabPages.value, tab)) return;
		tabPages.value[tab] = 1;
	}

	function setTabPage(tab: keyof TabPages, value: number) {
		if (!tabPages.value || !Object.prototype.hasOwnProperty.call(tabPages.value, tab)) return;
		const page = Number(value) || 1;
		tabPages.value[tab] = page > 0 ? page : 1;
	}

	function paginationCaptionFor(tab: keyof TabPages, total: number) {
		return paginationCaption(total, tab, tabPages.value, pageSize.value);
	}

	function isOverdue(invoice: InvoiceRecord) {
		const status = String(invoice?.status || "").toLowerCase();
		if (status.includes("overdue")) return true;
		const dueDate = normalizeDate(invoice?.due_date);
		if (!dueDate) return false;
		const today = frappe.datetime.get_today();
		return dueDate < today && Number(invoice?.outstanding_amount || 0) > 0;
	}

	function dueTone(invoice: InvoiceRecord) {
		if (!invoice?.due_date) return "default";
		return isOverdue(invoice) ? "error" : "warning";
	}

	function dueLabel(invoice: InvoiceRecord) {
		if (!invoice?.due_date) return __("No due date");
		if (isOverdue(invoice)) return __("Overdue");
		return __("Due {0}", [formatDateForDisplay(invoice.due_date)]);
	}

	function paymentProgress(invoice: InvoiceRecord) {
		const grandTotal = Number(invoice?.grand_total || 0);
		if (!grandTotal) return 0;
		return Math.max(0, Math.min(100, (Number(invoice?.paid_amount || 0) / grandTotal) * 100));
	}

	function getChangeAllocationRepairState(invoice: InvoiceRecord) {
		return changeAllocationRepairState(invoice, repairContext.value);
	}

	function repairStateLabel(state: string | null) {
		if (state === "repaired") return __("Repaired");
		if (state === "candidate") return __("Repair Candidate");
		return "";
	}

	function repairStateColor(state: string | null) {
		if (state === "repaired") return "success";
		if (state === "candidate") return "warning";
		return "primary";
	}

	function checkIsRepairCandidate(invoice: InvoiceRecord) {
		return isRepairCandidate(invoice, repairContext.value);
	}

	function initializeSupervisorProfileScope() {
		if (!isSupervisorScope(scopeContext())) {
			selectedSupervisorPosProfile.value = null;
			supervisorPosProfiles.value = [];
			return;
		}
		const currentProfile = posProfile.value?.name || null;
		suppressSupervisorProfileRefresh.value = true;
		if (
			!selectedSupervisorPosProfile.value ||
			(selectedSupervisorPosProfile.value !== "All" &&
				![currentProfile, ...(supervisorPosProfiles.value || [])]
					.filter(Boolean)
					.includes(selectedSupervisorPosProfile.value))
		) {
			selectedSupervisorPosProfile.value = currentProfile;
		}
		suppressSupervisorProfileRefresh.value = false;
	}

	async function loadSupervisorPosProfiles() {
		if (!isSupervisorScope(scopeContext())) {
			supervisorPosProfiles.value = [];
			return;
		}
		try {
			const { message } = await frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "POS Profile",
					filters: {
						company: posProfile.value?.company,
					},
					fields: ["name"],
					order_by: "name asc",
					limit_page_length: 0,
				},
			});
			supervisorPosProfiles.value = Array.isArray(message)
				? message.map((entry: { name: string }) => entry.name).filter(Boolean)
				: [];
			initializeSupervisorProfileScope();
		} catch (error) {
			console.error("Error loading supervisor POS profiles:", error);
			supervisorPosProfiles.value = posProfile.value?.name ? [posProfile.value.name] : [];
		}
	}

	async function refreshRepairCandidates(invoices: InvoiceRecord[] = historyInvoices.value) {
		const candidateInvoices = Array.isArray(invoices)
			? invoices.filter((invoice) => matchesRepairCandidatePattern(invoice))
			: [];

		if (!candidateInvoices.length) {
			repairCandidateInvoiceNames.value = [];
			repairedChangeAllocationInvoiceNames.value = [];
			repairCandidateScopeReady.value = true;
			return;
		}

		try {
			const invoicesByDoctype = candidateInvoices.reduce<Record<string, string[]>>(
				(groups, invoice) => {
					const doctype = invoice?.doctype || currentInvoiceDoctype.value || "Sales Invoice";
					if (!groups[doctype]) groups[doctype] = [];
					groups[doctype].push(String(invoice.name));
					return groups;
				},
				{},
			);
			const responses = await Promise.all(
				Object.entries(invoicesByDoctype).map(async ([doctype, invoiceNames]) => {
					const { message } = await frappe.call({
						method: "posawesome.posawesome.api.payments.repair_overpayment_change_allocations",
						args: {
							doctype,
							invoice_names: invoiceNames,
							company: posProfile.value?.company || null,
							dry_run: 1,
							limit: Math.min(invoiceNames.length, 500),
						},
					});
					return message || {};
				}),
			);
			repairCandidateInvoiceNames.value = responses.flatMap((message) =>
				Array.isArray(message?.matched)
					? message.matched.map((entry: { invoice?: string }) => entry?.invoice).filter(Boolean)
					: [],
			);
			repairedChangeAllocationInvoiceNames.value = responses.flatMap((message) =>
				Array.isArray(message?.skipped)
					? message.skipped
							.filter((entry: { reason?: string }) => entry?.reason === "already_allocated")
							.map((entry: { invoice?: string }) => entry.invoice)
							.filter(Boolean)
					: [],
			);
			repairCandidateScopeReady.value = true;
		} catch (error) {
			console.error("Error refreshing repair candidates:", error);
			repairCandidateInvoiceNames.value = [];
			repairedChangeAllocationInvoiceNames.value = [];
			repairCandidateScopeReady.value = false;
		}
	}

	async function runRepairChangeAllocation(invoice: InvoiceRecord, dryRun = true) {
		const response = await frappe.call({
			method: "posawesome.posawesome.api.payments.repair_overpayment_change_allocations",
			args: {
				doctype: invoice.doctype || currentInvoiceDoctype.value || "Sales Invoice",
				invoice_names: [invoice.name],
				company: posProfile.value?.company || invoice.company || null,
				dry_run: dryRun ? 1 : 0,
			},
			freeze: !dryRun,
			freeze_message: dryRun ? undefined : __("Repairing change allocation"),
		});
		return response?.message || {};
	}

	async function repairChangeAllocation(invoice: InvoiceRecord) {
		const repairState = getChangeAllocationRepairState(invoice);
		if (repairState === "repaired") {
			toastStore.show({ title: __("This invoice is already repaired"), color: "info" });
			return;
		}
		if (repairState !== "candidate") {
			toastStore.show({
				title: __("This invoice does not need change-allocation repair"),
				color: "info",
			});
			return;
		}
		if (isOffline()) {
			toastStore.show({ title: __("Repair requires an online connection"), color: "warning" });
			return;
		}

		repairChangeLoading.value = true;
		try {
			const preview = await runRepairChangeAllocation(invoice, true);
			if (
				!Array.isArray(preview?.matched) ||
				preview.matched.length !== 1 ||
				(preview?.skipped || []).length
			) {
				toastStore.show({
					title: __("No exact repair match found for this invoice"),
					color: "warning",
				});
				return;
			}

			const result = await runRepairChangeAllocation(invoice, false);
			if (!Array.isArray(result?.repaired) || !result.repaired.length) {
				toastStore.show({ title: __("Unable to repair change allocation"), color: "error" });
				return;
			}

			await viewInvoice(invoice);
			await refreshAll();
			toastStore.show({ title: __("Change allocation repaired"), color: "success" });
		} catch (error) {
			console.error("Error repairing change allocation:", error);
			toastStore.show({ title: __("Unable to repair change allocation"), color: "error" });
		} finally {
			repairChangeLoading.value = false;
		}
	}

	function draftItemCount(invoice: InvoiceRecord) {
		if (Array.isArray(invoice?.items)) return invoice.items.length;
		if (Number.isFinite(Number(invoice?.items_count))) return Number(invoice.items_count);
		return 0;
	}

	function draftSourceChipLabel(invoice: InvoiceRecord) {
		if (currentDraftSource.value === "invoice") return __("Draft");
		if (currentDraftSource.value === "quote") return __(String(invoice?.status || "Quote"));
		if (currentDraftSource.value === "delivery") return __("Delivered");
		return __("Order");
	}

	function draftSecondaryMetaLabel(invoice: InvoiceRecord) {
		if (currentDraftSource.value === "invoice") {
			return {
				label: __("Items"),
				value: draftItemCount(invoice),
			};
		}
		return {
			label: __("Status"),
			value: __(String(invoice?.status || currentDraftSourceOption.value.label)),
		};
	}

	function draftActions(invoice: InvoiceRecord) {
		return getDocumentFlowActionsForRecord(invoice || { source: currentDraftSource.value });
	}

	function draftActionLabel(action: string) {
		return __(getDocumentFlowActionLabel(action));
	}

	function draftActionColor(action: string) {
		if (action === "quote_submit") return "warning";
		if (action === "order_to_delivery_note") return "success";
		if (
			action === "order_to_invoice" ||
			action === "quote_to_invoice" ||
			action === "delivery_to_invoice"
		) {
			return "primary";
		}
		return currentDraftSourceOption.value.color;
	}

	function isPrimaryDraftAction(action: string) {
		return action !== "quote_submit" && action !== "order_to_delivery_note";
	}

	async function runDraftAction(invoice: InvoiceRecord, action: string) {
		if (!invoice?.name || !action) return;

		try {
			if (action === "invoice_load_draft") {
				await loadDraft(invoice);
				return;
			}

			if (action === "quote_submit" || action === "order_to_delivery_note") {
				const result = await commitDocumentFlowAction({
					action,
					source: invoice?.source || currentDraftSource.value,
					record: invoice,
				});
				if (action === "quote_submit") {
					toastStore.show({ title: __("Quotation submitted"), color: "success" });
					await loadDrafts();
					return;
				}

				if (result?.result?.name) {
					toastStore.show({
						title: __("Delivery Note {0} created", [result.result.name]),
						color: "success",
					});
				} else {
					toastStore.show({ title: __("Delivery note created"), color: "success" });
				}
				draftSource.value = "delivery";
				uiStore.setInvoiceManagementDraftSource("delivery");
				await loadDrafts();
				return;
			}

			const prepared = await prepareDocumentFlowAction({
				action,
				source: invoice?.source || currentDraftSource.value,
				record: invoice,
				currentInvoiceDoctype: currentInvoiceDoctype.value,
			});
			if (!prepared?.prepared_doc) {
				toastStore.show({ title: __("Unable to prepare document"), color: "error" });
				return;
			}
			invoiceStore.triggerLoadFlow?.(prepared);
			uiStore.closeInvoiceManagement();
		} catch (error) {
			console.error("Error running draft action:", error);
			toastStore.show({ title: __("Unable to process document action"), color: "error" });
		}
	}

	async function updateDraftSource(source: string) {
		const nextSource = getDefaultCommercialDocumentSource(posProfile.value, source);
		if (draftSource.value === nextSource) return;
		draftSource.value = nextSource;
		uiStore.setInvoiceManagementDraftSource(nextSource);
		if (activeTab.value === "drafts") {
			await loadDrafts();
		}
	}

	async function refreshAll() {
		resetPagination();
		await Promise.all([loadUnpaidInvoices(), loadHistory(), loadDrafts()]);
	}

	async function refreshActiveTab() {
		if (!invoiceManagementDialog.value) return;
		if (activeTab.value === "drafts") return loadDrafts();
		if (activeTab.value === "partial") return loadUnpaidInvoices();
		return loadHistory();
	}

	async function loadUnpaidInvoices() {
		if (!posProfile.value?.name) {
			unpaidInvoices.value = [];
			return;
		}
		loading.value = true;
		try {
			const filters = buildInvoiceFilters(scopeContext(), {
				is_return: 0,
				outstanding_amount: [">", 0],
			});
			const { message } = await frappe.call({
				method: "frappe.client.get_list",
				args: {
					doctype: currentInvoiceDoctype.value,
					filters,
					fields: getInvoiceListFields(["due_date"]),
					order_by: "posting_date desc, posting_time desc, modified desc",
					limit_page_length: 0,
				},
			});
			unpaidInvoices.value = Array.isArray(message)
				? message.map((entry: InvoiceRecord) => ({
						...entry,
						doctype: currentInvoiceDoctype.value,
					}))
				: [];
		} catch (error) {
			console.error("Error loading unpaid invoices:", error);
			toastStore.show({ title: __("Unable to fetch unpaid invoices"), color: "error" });
		} finally {
			loading.value = false;
		}
	}

	async function loadHistory() {
		if (!posProfile.value?.name) {
			historyInvoices.value = [];
			repairCandidateInvoiceNames.value = [];
			repairedChangeAllocationInvoiceNames.value = [];
			repairCandidateScopeReady.value = false;
			return;
		}
		loading.value = true;
		try {
			const filters = buildInvoiceFilters(scopeContext());
			const doctypes = historyInvoiceDoctypes(currentInvoiceDoctype.value);
			const results = await Promise.all(
				doctypes.map(async (doctype) => {
					const { message } = await frappe.call({
						method: "frappe.client.get_list",
						args: {
							doctype,
							filters,
							fields: getInvoiceListFields([
								"change_amount",
								"is_return",
								"return_against",
							]),
							order_by: "posting_date desc, posting_time desc, modified desc",
							limit_page_length: 0,
						},
					});
					return Array.isArray(message)
						? message.map((entry: InvoiceRecord) => ({ ...entry, doctype }))
						: [];
				}),
			);
			historyInvoices.value = results.flat();
			await refreshRepairCandidates(historyInvoices.value);
		} catch (error) {
			console.error("Error loading invoice history:", error);
			toastStore.show({ title: __("Unable to fetch invoice history"), color: "error" });
			repairCandidateInvoiceNames.value = [];
			repairedChangeAllocationInvoiceNames.value = [];
			repairCandidateScopeReady.value = false;
		} finally {
			loading.value = false;
		}
	}

	async function loadDrafts() {
		if (!posProfile.value?.name) {
			draftRecordsBySource.value[currentDraftSource.value] = [];
			return;
		}
		loading.value = true;
		try {
			const records = await fetchDocumentSourceRecords({
				source: currentDraftSource.value,
				posOpeningShift: posOpeningShift.value,
				posProfile: posProfile.value,
				currentInvoiceDoctype: currentInvoiceDoctype.value,
				isSupervisorScope: isSupervisorScope(scopeContext()),
				resolveSupervisorProfileScope: () => resolveSupervisorProfileScope(scopeContext()),
				resolveCashierProfileScope: () => posProfile.value?.name || null,
				resolveCashierScope: () => currentCashier.value?.user || null,
			});
			draftRecordsBySource.value = {
				...draftRecordsBySource.value,
				[currentDraftSource.value]: records,
			};
			uiStore.setInvoiceManagementDraftSource(currentDraftSource.value);
		} catch (error) {
			console.error("Error loading source records:", error);
			toastStore.show({ title: __("Unable to fetch documents"), color: "error" });
		} finally {
			loading.value = false;
		}
	}

	async function viewInvoice(invoice: InvoiceRecord) {
		try {
			const { message } = await frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: invoice.doctype || currentInvoiceDoctype.value,
					name: invoice.name,
				},
			});
			selectedInvoiceDetail.value = message || null;
			detailDialog.value = !!message;
		} catch (error) {
			console.error("Error loading invoice details:", error);
			toastStore.show({ title: __("Unable to load invoice details"), color: "error" });
		}
	}

	async function loadDraft(invoice: InvoiceRecord) {
		try {
			await loadDocumentSourceRecord({
				source: invoice?.source || currentDraftSource.value,
				record: invoice,
				posProfile: posProfile.value,
				currentInvoiceDoctype: currentInvoiceDoctype.value,
				invoiceStore,
				uiStore,
				closeDrafts: true,
				closeInvoiceManagement: true,
			});
		} catch (error) {
			console.error("Error loading source record:", error);
			toastStore.show({ title: __("Unable to load document"), color: "error" });
		}
	}

	async function deleteDraft(invoice: InvoiceRecord) {
		if (!canDeleteActiveDraftSource.value) return;
		if (!window.confirm(__("Delete draft invoice {0}?", [invoice.name]))) return;
		try {
			await frappe.call({
				method: "posawesome.posawesome.api.invoices.delete_invoice",
				args: { invoice: invoice.name },
			});
			toastStore.show({ title: __("Draft invoice deleted"), color: "success" });
			await loadDrafts();
		} catch (error) {
			console.error("Error deleting draft invoice:", error);
			toastStore.show({ title: __("Unable to delete draft invoice"), color: "error" });
		}
	}

	async function createReturn(invoice: InvoiceRecord) {
		try {
			const { message } = await frappe.call({
				method: "posawesome.posawesome.api.invoices.get_invoice_for_return",
				args: {
					invoice_name: invoice.name,
					pos_profile: posProfile.value?.name,
					doctype: invoice.doctype || currentInvoiceDoctype.value,
				},
			});
			const returnDoc = message;
			if (!returnDoc || !Array.isArray(returnDoc.items) || !returnDoc.items.length) {
				toastStore.show({
					title: __("No returnable items found for this invoice"),
					color: "warning",
				});
				return;
			}
			const invoiceDoc = {
				items: returnDoc.items.map((item: Record<string, unknown>) => {
					const row = { ...item };
					if (returnDoc.doctype === "POS Invoice") row.pos_invoice_item = item.name;
					else row.sales_invoice_item = item.name;
					delete row.name;
					row.rate = item.rate;
					row.price_list_rate = item.price_list_rate;
					row.discount_percentage = item.discount_percentage;
					row.discount_amount = item.discount_amount;
					row.is_free_item = item.is_free_item;
					row.net_rate = item.net_rate;
					row.net_amount =
						Number(item.net_amount) > 0 ? Number(item.net_amount) * -1 : item.net_amount;
					row.locked_price = true;
					row.qty = Number(item.qty) > 0 ? Number(item.qty) * -1 : item.qty;
					row.stock_qty =
						Number(item.stock_qty) > 0 ? Number(item.stock_qty) * -1 : item.stock_qty;
					row.amount = Number(item.amount) > 0 ? Number(item.amount) * -1 : item.amount;
					return row;
				}),
				is_return: 1,
				return_against: returnDoc.name,
				customer: returnDoc.customer,
				discount_amount: returnDoc.discount_amount,
				additional_discount_percentage: returnDoc.additional_discount_percentage,
				payments: Array.isArray(returnDoc.payments)
					? returnDoc.payments.map((payment: Record<string, unknown>) => ({
							mode_of_payment: payment.mode_of_payment,
							amount: payment.amount,
							base_amount: payment.base_amount,
							default: payment.default,
							account: payment.account,
							type: payment.type,
							currency: payment.currency,
							conversion_rate: payment.conversion_rate,
						}))
					: [],
				grand_total:
					returnDoc.grand_total > 0 ? returnDoc.grand_total * -1 : returnDoc.grand_total,
				update_stock: 1,
				pos_profile: posProfile.value?.name,
				company: posProfile.value?.company,
			};
			eventBus?.emit?.("load_return_invoice", {
				invoice_doc: invoiceDoc,
				return_doc: returnDoc,
			});
			uiStore.closeInvoiceManagement();
		} catch (error) {
			console.error("Error creating return invoice:", error);
			toastStore.show({ title: __("Unable to prepare return invoice"), color: "error" });
		}
	}

	function openAddPayment(invoice: InvoiceRecord) {
		const customer = invoice.customer || selectedInvoiceDetail.value?.customer;
		if (!customer) {
			toastStore.show({ title: __("Customer is required to add payment"), color: "error" });
			return;
		}
		customersStore.setSelectedCustomer(customer);
		uiStore.setPaymentRouteTarget({
			invoiceName: invoice.name,
			customer,
			currency: invoice.currency || posProfile.value?.currency || null,
		});
		detailDialog.value = false;
		uiStore.closeInvoiceManagement();
		router.push("/payments");
	}

	async function printInvoice(invoice: InvoiceRecord) {
		const profile = posProfile.value;
		if (!invoice?.name || !profile) return;
		const doctype = invoice.doctype || currentInvoiceDoctype.value;
		const printFormat = profile.print_format_for_online || profile.print_format || "Standard";
		const letterHead = profile.letter_head || 0;
		const debugPrint = isDebugPrintEnabled();
		const useSilentPrint = !!profile.posa_silent_print;
		let url =
			frappe.urllib.get_base_url() +
			"/printview?doctype=" +
			encodeURIComponent(doctype) +
			"&name=" +
			encodeURIComponent(String(invoice.name)) +
			"&trigger_print=1&format=" +
			encodeURIComponent(printFormat) +
			"&no_letterhead=" +
			(letterHead ? "0" : "1");
		if (letterHead) url += "&letterhead=" + encodeURIComponent(String(letterHead));
		url = appendDebugPrintParam(url, debugPrint);
		const printOptions = { allowOfflineFallback: isOffline(), triggerPrint: "1", debugPrint };
		if (useSilentPrint && !isOffline()) {
			try {
				await printDocumentViaQz({
					doctype,
					name: String(invoice.name),
					printFormat,
					letterhead: letterHead || null,
					noLetterhead: letterHead ? "0" : "1",
				});
				return;
			} catch (error) {
				console.warn("QZ Tray print failed, falling back to browser print", error);
			}
		}
		if (useSilentPrint) {
			silentPrint(url, printOptions);
			return;
		}
		const printWindow = window.open(url, "Print");
		if (printWindow) watchPrintWindow(printWindow, printOptions);
	}

	watch(invoiceManagementDialog, (value) => {
		if (value) {
			activeTab.value =
				(invoiceManagementTargetTab.value as typeof activeTab.value) || "history";
			draftSource.value = getDefaultCommercialDocumentSource(
				posProfile.value,
				uiStore.invoiceManagementDraftSource || draftSource.value,
			);
			initializeSupervisorProfileScope();
			loadSupervisorPosProfiles();
			refreshAll();
		} else {
			resetPagination();
		}
	});

	watch(activeTab, () => {
		refreshActiveTab();
	});

	watch(filteredHistoryInvoices, () => resetTabPage("history"));
	watch(filteredUnpaidInvoices, () => resetTabPage("partial"));
	watch(filteredDraftInvoices, () => resetTabPage("drafts"));
	watch(filteredReturnInvoices, () => resetTabPage("returns"));

	watch(selectedSupervisorPosProfile, (value, previousValue) => {
		if (
			value !== previousValue &&
			invoiceManagementDialog.value &&
			isSupervisorScope(scopeContext()) &&
			!suppressSupervisorProfileRefresh.value
		) {
			refreshAll();
		}
	});

	watch(
		posProfile,
		async (value, previousValue) => {
			draftSource.value = getDefaultCommercialDocumentSource(
				value,
				uiStore.invoiceManagementDraftSource || draftSource.value,
			);
			initializeSupervisorProfileScope();
			if (!invoiceManagementDialog.value) return;

			const profileChanged =
				value?.name !== previousValue?.name ||
				value?.company !== previousValue?.company ||
				value?.create_pos_invoice_instead_of_sales_invoice !==
					previousValue?.create_pos_invoice_instead_of_sales_invoice;

			if (!profileChanged) return;

			if (isSupervisorScope(scopeContext())) {
				await loadSupervisorPosProfiles();
			}
			await refreshAll();
		},
		{ deep: true },
	);

	return {
		uiStore,
		invoiceStore,
		posProfile,
		activeTab,
		viewMode,
		loading,
		tabPages,
		partialSearch,
		partialStatus,
		partialDateFrom,
		partialDateTo,
		historySearch,
		historyStatus,
		historyDateFrom,
		historyDateTo,
		historyShowRepairCandidatesOnly,
		selectedSupervisorPosProfile,
		supervisorPosProfileItems,
		draftSearch,
		draftDateFrom,
		draftDateTo,
		currentDraftSource,
		currentDraftSourceOption,
		showDraftSourceSelector,
		availableDraftSources,
		canDeleteActiveDraftSource,
		returnSearch,
		returnDateFrom,
		returnDateTo,
		detailDialog,
		selectedInvoiceDetail,
		repairChangeLoading,
		partialHeaders,
		historyHeaders,
		returnHeaders,
		draftHeaders,
		detailHeaders,
		paymentHeaders,
		partialStatusItems,
		historyStatusItems,
		currentInvoiceDoctype,
		filteredHistoryInvoices,
		filteredUnpaidInvoices,
		filteredDraftInvoices,
		filteredReturnInvoices,
		historyRepairCandidateCount,
		filteredUnpaidSummary,
		historyTotals,
		unpaidStatusCounts,
		paginatedHistoryInvoices,
		paginatedUnpaidInvoices,
		paginatedDraftInvoices,
		paginatedReturnInvoices,
		historyPageCount,
		partialPageCount,
		draftsPageCount,
		returnsPageCount,
		isOffline,
		formatCurrency,
		formatFloat,
		currencySymbol,
		formatDateForDisplay,
		formatDateTime,
		statusColor,
		toneFromStatus,
		dueTone,
		dueLabel,
		paymentProgress,
		changeAllocationRepairState: getChangeAllocationRepairState,
		repairStateLabel,
		repairStateColor,
		isRepairCandidate: checkIsRepairCandidate,
		draftSourceChipLabel,
		draftSecondaryMetaLabel,
		draftActions,
		draftActionLabel,
		draftActionColor,
		isPrimaryDraftAction,
		isSupervisorScope: () => isSupervisorScope(scopeContext()),
		setTabPage,
		paginationCaption: paginationCaptionFor,
		refreshActiveTab,
		refreshAll,
		updateDraftSource,
		viewInvoice,
		printInvoice,
		createReturn,
		openAddPayment,
		runDraftAction,
		deleteDraft,
		repairChangeAllocation,
	};
}

export const invoiceManagementTestApi = {
	methods: {
		filterCollection,
		sortInvoicesByLatest,
		invoiceSortValue,
		normalizeDate,
		normalizePostingTime,
		toPostingTimestamp,
		inRange,
		matchesRepairCandidatePattern,
		changeAllocationRepairState(invoice: InvoiceRecord) {
			return changeAllocationRepairState(invoice, {
				repairCandidateScopeReady: Boolean((this as Record<string, unknown>).repairCandidateScopeReady),
				repairedChangeAllocationInvoiceNames: Array.isArray(
					(this as Record<string, unknown>).repairedChangeAllocationInvoiceNames,
				)
					? ((this as Record<string, unknown>).repairedChangeAllocationInvoiceNames as string[])
					: [],
			});
		},
		isRepairCandidate(invoice: InvoiceRecord) {
			return invoiceManagementTestApi.methods.changeAllocationRepairState.call(this, invoice) === "candidate";
		},
		isSupervisorScope() {
			return isSupervisorScope(this as Parameters<typeof isSupervisorScope>[0]);
		},
		resolveSupervisorProfileScope(this: Parameters<typeof resolveSupervisorProfileScope>[0]) {
			return resolveSupervisorProfileScope(this);
		},
		buildInvoiceFilters(
			this: Parameters<typeof buildInvoiceFilters>[0],
			baseFilters?: Record<string, unknown>,
		) {
			return buildInvoiceFilters(this, baseFilters);
		},
		getInvoiceListFields,
		async loadHistory(this: {
			posProfile?: { name?: string; company?: string };
			currentInvoiceDoctype: string;
			historyInvoices: InvoiceRecord[];
			loading: boolean;
			toastStore: { show: (_options: unknown) => void };
			refreshRepairCandidates?: (_invoices: InvoiceRecord[]) => Promise<void>;
			currentCashier?: { is_supervisor?: boolean };
			selectedSupervisorPosProfile?: string | null;
		}) {
			if (!this.posProfile?.name) {
				this.historyInvoices = [];
				return;
			}
			this.loading = true;
			try {
				const filters = buildInvoiceFilters(this);
				const doctypes = historyInvoiceDoctypes(this.currentInvoiceDoctype);
				const results = await Promise.all(
					doctypes.map(async (doctype) => {
						const { message } = await frappe.call({
							method: "frappe.client.get_list",
							args: {
								doctype,
								filters,
								fields: getInvoiceListFields([
									"change_amount",
									"is_return",
									"return_against",
								]),
								order_by: "posting_date desc, posting_time desc, modified desc",
								limit_page_length: 0,
							},
						});
						return Array.isArray(message)
							? message.map((entry: InvoiceRecord) => ({ ...entry, doctype }))
							: [];
					}),
				);
				this.historyInvoices = results.flat();
				if (typeof this.refreshRepairCandidates === "function") {
					await this.refreshRepairCandidates(this.historyInvoices);
				}
			} catch (error) {
				console.error("Error loading invoice history:", error);
				this.toastStore.show({ title: __("Unable to fetch invoice history"), color: "error" });
			} finally {
				this.loading = false;
			}
		},
		async loadDrafts(this: {
			posProfile?: Record<string, unknown>;
			posOpeningShift?: { name?: string };
			currentInvoiceDoctype: string;
			currentDraftSource: string;
			draftRecordsBySource: Record<string, InvoiceRecord[]>;
			loading: boolean;
			toastStore: { show: (_options: unknown) => void };
			uiStore: { setInvoiceManagementDraftSource: (_source: string) => void };
			currentCashier?: { is_supervisor?: boolean; user?: string };
			selectedSupervisorPosProfile?: string | null;
		}) {
			if (!this.posProfile?.name) {
				this.draftRecordsBySource[this.currentDraftSource] = [];
				return;
			}
			this.loading = true;
			try {
				const records = await fetchDocumentSourceRecords({
					source: this.currentDraftSource,
					posOpeningShift: this.posOpeningShift,
					posProfile: this.posProfile,
					currentInvoiceDoctype: this.currentInvoiceDoctype,
					isSupervisorScope: isSupervisorScope(this),
					resolveSupervisorProfileScope: () => resolveSupervisorProfileScope(this),
					resolveCashierProfileScope: () => this.posProfile?.name || null,
					resolveCashierScope: () => this.currentCashier?.user || null,
				});
				this.draftRecordsBySource = {
					...this.draftRecordsBySource,
					[this.currentDraftSource]: records,
				};
				this.uiStore.setInvoiceManagementDraftSource(this.currentDraftSource);
			} catch (error) {
				console.error("Error loading source records:", error);
				this.toastStore.show({ title: __("Unable to fetch documents"), color: "error" });
			} finally {
				this.loading = false;
			}
		},
		async refreshRepairCandidates(this: {
			currentInvoiceDoctype: string;
			posProfile?: { company?: string };
			historyInvoices: InvoiceRecord[];
			repairCandidateInvoiceNames: string[];
			repairedChangeAllocationInvoiceNames: string[];
			repairCandidateScopeReady: boolean;
			toastStore: { show: (_options: unknown) => void };
		}, _invoices: InvoiceRecord[] = this.historyInvoices) {
			const candidateInvoices = Array.isArray(_invoices)
				? _invoices.filter((invoice) => matchesRepairCandidatePattern(invoice))
				: [];

			if (!candidateInvoices.length) {
				this.repairCandidateInvoiceNames = [];
				this.repairedChangeAllocationInvoiceNames = [];
				this.repairCandidateScopeReady = true;
				return;
			}

			try {
				const invoicesByDoctype = candidateInvoices.reduce<Record<string, string[]>>(
					(groups, invoice) => {
						const doctype = invoice?.doctype || this.currentInvoiceDoctype || "Sales Invoice";
						if (!groups[doctype]) groups[doctype] = [];
						groups[doctype].push(String(invoice.name));
						return groups;
					},
					{},
				);
				const responses = await Promise.all(
					Object.entries(invoicesByDoctype).map(async ([doctype, invoiceNames]) => {
						const { message } = await frappe.call({
							method: "posawesome.posawesome.api.payments.repair_overpayment_change_allocations",
							args: {
								doctype,
								invoice_names: invoiceNames,
								company: this.posProfile?.company || null,
								dry_run: 1,
								limit: Math.min(invoiceNames.length, 500),
							},
						});
						return message || {};
					}),
				);
				this.repairCandidateInvoiceNames = responses.flatMap((message) =>
					Array.isArray(message?.matched)
						? message.matched.map((entry: { invoice?: string }) => entry?.invoice).filter(Boolean)
						: [],
				);
				this.repairedChangeAllocationInvoiceNames = responses.flatMap((message) =>
					Array.isArray(message?.skipped)
						? message.skipped
								.filter((entry: { reason?: string }) => entry?.reason === "already_allocated")
								.map((entry: { invoice?: string }) => entry.invoice)
								.filter(Boolean)
						: [],
				);
				this.repairCandidateScopeReady = true;
			} catch (error) {
				console.error("Error refreshing repair candidates:", error);
				this.repairCandidateInvoiceNames = [];
				this.repairedChangeAllocationInvoiceNames = [];
				this.repairCandidateScopeReady = false;
			}
		},
	},
	computed: {
		filteredHistoryInvoices(this: FilteredHistoryParams) {
			return computeFilteredHistoryInvoices({
				historyInvoices: this.historyInvoices,
				historySearch: this.historySearch,
				historyStatus: this.historyStatus,
				historyDateFrom: this.historyDateFrom,
				historyDateTo: this.historyDateTo,
				historyShowRepairCandidatesOnly: this.historyShowRepairCandidatesOnly,
				repairContext: {
					repairCandidateScopeReady: Boolean(this.repairCandidateScopeReady),
					repairedChangeAllocationInvoiceNames: Array.isArray(
						this.repairedChangeAllocationInvoiceNames,
					)
						? this.repairedChangeAllocationInvoiceNames
						: [],
				},
			});
		},
		historyTotals(this: { filteredHistoryInvoices: InvoiceRecord[] }) {
			return computeHistoryTotals(this.filteredHistoryInvoices);
		},
		supervisorProfileScope(this: Parameters<typeof resolveSupervisorProfileScope>[0]) {
			return resolveSupervisorProfileScope(this);
		},
	},
	watch: {
		posProfile: {
			async handler(
				this: {
					invoiceManagementDialog: boolean;
					draftSource: string;
					uiStore: { invoiceManagementDraftSource?: string };
					initializeSupervisorProfileScope: () => void;
					loadSupervisorPosProfiles: () => Promise<void>;
					refreshAll: () => Promise<void>;
					currentCashier?: { is_supervisor?: boolean };
					posProfile?: Record<string, unknown>;
					selectedSupervisorPosProfile?: string | null;
				},
				value: Record<string, unknown> | undefined,
				previousValue: Record<string, unknown> | undefined,
			) {
				this.draftSource = getDefaultCommercialDocumentSource(
					value,
					this.uiStore.invoiceManagementDraftSource || this.draftSource,
				);
				this.initializeSupervisorProfileScope();
				if (!this.invoiceManagementDialog) return;

				const profileChanged =
					value?.name !== previousValue?.name ||
					value?.company !== previousValue?.company ||
					value?.create_pos_invoice_instead_of_sales_invoice !==
						previousValue?.create_pos_invoice_instead_of_sales_invoice;

				if (!profileChanged) return;

				if (isSupervisorScope(this)) {
					await this.loadSupervisorPosProfiles();
				}
				await this.refreshAll();
			},
		},
	},
};
