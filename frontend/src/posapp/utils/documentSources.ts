import { parseBooleanSetting } from "./stock";
import { fetchDraftInvoiceDoc } from "./draftInvoices";

declare const frappe: any;

export type DocumentSourceKey = "invoice" | "order" | "quote";
export type CommercialDocumentSourceKey = DocumentSourceKey | "delivery";
export type DocumentFlowActionKey =
	| "invoice_load_draft"
	| "quote_edit_draft"
	| "quote_submit"
	| "quote_to_order"
	| "quote_to_invoice"
	| "order_load"
	| "order_to_delivery_note"
	| "order_to_invoice"
	| "delivery_to_invoice";

export type DocumentSourceOption = {
	key: CommercialDocumentSourceKey;
	label: "Invoice" | "Order" | "Quote" | "Delivery";
	icon: string;
	color: string;
	panelTitle: string;
	panelEyebrow: string;
	panelSubtitle: string;
	emptyTitle: string;
	emptySubtitle: string;
	loadingLabel: string;
	searchLabel: string;
	primaryActionLabel: string;
};

export type DocumentSourceRecord = Record<string, any> & {
	source: CommercialDocumentSourceKey;
	posting_date?: string;
	posting_time?: string;
	customer?: string;
	customer_name?: string;
	currency?: string;
	grand_total?: number;
	doctype?: string;
	items_count?: number;
	status?: string;
	source_doctype?: string;
	source_docstatus?: number;
	allowed_actions?: DocumentFlowActionKey[];
};

export type PreparedDocumentFlow = {
	action: DocumentFlowActionKey;
	source: CommercialDocumentSourceKey;
	source_record: DocumentSourceRecord;
	prepared_doc: Record<string, any>;
	flow_context: Record<string, any>;
	allowed_actions?: DocumentFlowActionKey[];
};

type FetchSourceOptions = {
	source: CommercialDocumentSourceKey;
	posProfile: any;
	posOpeningShift?: any;
	currentInvoiceDoctype?: string;
	isSupervisorScope?: boolean;
	resolveSupervisorProfileScope?: (() => string | null) | null;
	search?: string;
};

type LoadSourceOptions = {
	source: CommercialDocumentSourceKey;
	record: DocumentSourceRecord;
	posProfile: any;
	currentInvoiceDoctype?: string;
	invoiceStore: any;
	uiStore?: any;
	closeDrafts?: boolean;
	closeInvoiceManagement?: boolean;
};

type PrepareFlowOptions = {
	action: DocumentFlowActionKey;
	source: CommercialDocumentSourceKey;
	record: DocumentSourceRecord;
	currentInvoiceDoctype?: string;
};

type CommitFlowOptions = {
	action: DocumentFlowActionKey;
	source: CommercialDocumentSourceKey;
	record: DocumentSourceRecord;
	payload?: Record<string, any> | null;
};

const DOCUMENT_SOURCE_OPTIONS: DocumentSourceOption[] = [
	{
		key: "invoice",
		label: "Invoice",
		icon: "mdi-file-document-outline",
		color: "primary",
		panelTitle: "Invoice",
		panelEyebrow: "Saved drafts",
		panelSubtitle: "Load a saved draft invoice into the active sale.",
		emptyTitle: "No invoice drafts found",
		emptySubtitle: "Saved draft invoices will appear here.",
		loadingLabel: "Loading invoice drafts...",
		searchLabel: "Search drafts or customers",
		primaryActionLabel: "Load Draft",
	},
	{
		key: "order",
		label: "Order",
		icon: "mdi-cart-arrow-down",
		color: "info",
		panelTitle: "Order",
		panelEyebrow: "Sales orders",
		panelSubtitle: "Load a sales order into the active sale.",
		emptyTitle: "No sales orders found",
		emptySubtitle: "Matching sales orders will appear here.",
		loadingLabel: "Loading sales orders...",
		searchLabel: "Search orders or customers",
		primaryActionLabel: "Load Order",
	},
	{
		key: "quote",
		label: "Quote",
		icon: "mdi-text-box-check-outline",
		color: "warning",
		panelTitle: "Quote",
		panelEyebrow: "Quotations",
		panelSubtitle: "Load a quotation into the active sale.",
		emptyTitle: "No quotations found",
		emptySubtitle: "Matching quotations will appear here.",
		loadingLabel: "Loading quotations...",
		searchLabel: "Search quotes or customers",
		primaryActionLabel: "Load Quote",
	},
	{
		key: "delivery",
		label: "Delivery",
		icon: "mdi-truck-delivery-outline",
		color: "success",
		panelTitle: "Delivery",
		panelEyebrow: "Delivery notes",
		panelSubtitle: "Create an invoice from a completed delivery.",
		emptyTitle: "No delivery notes found",
		emptySubtitle: "Matching delivery notes will appear here.",
		loadingLabel: "Loading delivery notes...",
		searchLabel: "Search delivery notes or customers",
		primaryActionLabel: "Invoice Delivery",
	},
];

function isSalesOrderSourceEnabled(posProfile: any): boolean {
	return parseBooleanSetting(
		posProfile?.custom_allow_select_sales_order ?? posProfile?.posa_allow_sales_order,
	);
}

function isQuotationSourceEnabled(posProfile: any): boolean {
	return parseBooleanSetting(
		posProfile?.custom_allow_create_quotation ??
			posProfile?.custom_allow_select_quotation ??
			posProfile?.posa_allow_select_quotation ??
			posProfile?.posa_allow_quotation_selection,
	);
}

export function getAvailableDocumentSources(posProfile: any): DocumentSourceOption[] {
	return DOCUMENT_SOURCE_OPTIONS.filter((source) => {
		if (source.key === "invoice") return true;
		if (source.key === "order") return isSalesOrderSourceEnabled(posProfile);
		if (source.key === "quote") return isQuotationSourceEnabled(posProfile);
		if (source.key === "delivery") return false;
		return false;
	});
}

export function getAvailableCommercialDocumentSources(
	posProfile: any,
): DocumentSourceOption[] {
	const sources = [...getAvailableDocumentSources(posProfile)];
	if (isSalesOrderSourceEnabled(posProfile)) {
		const deliveryOption = DOCUMENT_SOURCE_OPTIONS.find(
			(source) => source.key === "delivery",
		);
		if (deliveryOption) {
			sources.push(deliveryOption);
		}
	}
	return sources;
}

export function getDefaultDocumentSource(
	posProfile: any,
	currentSource?: string | null,
): DocumentSourceKey {
	const availableSources = getAvailableDocumentSources(posProfile);
	const current = String(currentSource || "").toLowerCase() as DocumentSourceKey;
	if (availableSources.some((source) => source.key === current)) {
		return current;
	}
	return (availableSources[0]?.key as DocumentSourceKey) || "invoice";
}

export function getDefaultCommercialDocumentSource(
	posProfile: any,
	currentSource?: string | null,
): CommercialDocumentSourceKey {
	const availableSources = getAvailableCommercialDocumentSources(posProfile);
	const current = String(currentSource || "").toLowerCase() as CommercialDocumentSourceKey;
	if (availableSources.some((source) => source.key === current)) {
		return current;
	}
	return (availableSources[0]?.key as CommercialDocumentSourceKey) || "invoice";
}

export function shouldShowDocumentSourceSelector(
	sources: Pick<DocumentSourceOption, "key">[],
): boolean {
	return Array.isArray(sources) && sources.length > 1;
}

export function getDocumentSourceOption(
	sourceKey?: string | null,
): DocumentSourceOption {
	return (
		DOCUMENT_SOURCE_OPTIONS.find((source) => source.key === sourceKey) ||
		DOCUMENT_SOURCE_OPTIONS[0]!
	);
}

export function canDeleteDocumentSourceRecord(
	source: CommercialDocumentSourceKey,
): boolean {
	return source === "invoice";
}

function normalizeDocumentStatus(
	source: CommercialDocumentSourceKey,
	record: any,
): string {
	if (record?.status) {
		return record.status;
	}
	if (source === "quote") {
		return Number(record?.docstatus || 0) === 1 ? "Submitted" : "Draft";
	}
	if (source === "order") {
		return "Submitted";
	}
	if (source === "delivery") {
		return "Submitted";
	}
	return "Draft";
}

function normalizeDocumentSourceRecord(
	source: CommercialDocumentSourceKey,
	record: Record<string, any>,
): DocumentSourceRecord {
	const postingDate =
		record?.posting_date ||
		record?.transaction_date ||
		record?.modified?.slice?.(0, 10) ||
		"";
	const customer = record?.customer || record?.party_name || record?.customer_name || "";
	const customerName = record?.customer_name || record?.party_name || record?.customer || "";

	return {
		...record,
		source,
		doctype:
			record?.doctype ||
			(source === "invoice"
				? "Sales Invoice"
				: source === "order"
					? "Sales Order"
					: source === "delivery"
						? "Delivery Note"
						: "Quotation"),
		posting_date: postingDate,
		posting_time: record?.posting_time || "",
		customer,
		customer_name: customerName,
		currency: record?.currency || "",
		grand_total: Number(record?.grand_total || 0),
		items_count: Array.isArray(record?.items)
			? record.items.length
			: Number(record?.items_count || 0),
		status: normalizeDocumentStatus(source, record),
		source_doctype:
			record?.source_doctype ||
			(source === "invoice"
				? "Sales Invoice"
				: source === "order"
					? "Sales Order"
					: source === "delivery"
						? "Delivery Note"
						: "Quotation"),
		source_docstatus: Number(record?.source_docstatus ?? record?.docstatus ?? 0),
		allowed_actions: Array.isArray(record?.allowed_actions)
			? record.allowed_actions
			: getDocumentFlowActionsForRecord({ ...record, source }),
	};
}

function getSourceDoctypeForKey(
	source: CommercialDocumentSourceKey,
	currentInvoiceDoctype = "Sales Invoice",
): string {
	if (source === "invoice") return currentInvoiceDoctype;
	if (source === "order") return "Sales Order";
	if (source === "delivery") return "Delivery Note";
	return "Quotation";
}

export function getDocumentFlowActionsForRecord(
	record: Partial<DocumentSourceRecord> | null | undefined,
): DocumentFlowActionKey[] {
	const source = String(record?.source || "").toLowerCase();
	const docstatus = Number(record?.source_docstatus ?? record?.docstatus ?? 0);
	if (source === "invoice") {
		return docstatus === 0 ? ["invoice_load_draft"] : [];
	}
	if (source === "quote") {
		if (docstatus === 0) return ["quote_edit_draft", "quote_submit"];
		if (docstatus === 1) return ["quote_to_order", "quote_to_invoice"];
		return [];
	}
	if (source === "order") {
		return docstatus === 1
			? ["order_load", "order_to_delivery_note", "order_to_invoice"]
			: [];
	}
	if (source === "delivery") {
		return docstatus === 1 ? ["delivery_to_invoice"] : [];
	}
	return [];
}

function getPrimaryDocumentFlowAction(
	record: Partial<DocumentSourceRecord> | null | undefined,
): DocumentFlowActionKey | null {
	const allowed = getDocumentFlowActionsForRecord(record);
	return allowed[0] || null;
}

export function getDocumentFlowActionLabel(
	action: DocumentFlowActionKey,
): string {
	switch (action) {
		case "invoice_load_draft":
			return "Load Draft";
		case "quote_edit_draft":
			return "Edit Quote";
		case "quote_submit":
			return "Submit Quote";
		case "quote_to_order":
			return "Create Order";
		case "quote_to_invoice":
			return "Create Invoice";
		case "order_load":
			return "Open Order";
		case "order_to_delivery_note":
			return "Delivery Note";
		case "order_to_invoice":
			return "Create Invoice";
		case "delivery_to_invoice":
			return "Create Invoice";
		default:
			return "Open";
	}
}

export async function fetchDocumentSourceRecords(
	options: FetchSourceOptions,
): Promise<DocumentSourceRecord[]> {
	const {
		source,
		posProfile,
		posOpeningShift,
		currentInvoiceDoctype = "Sales Invoice",
		isSupervisorScope = false,
		resolveSupervisorProfileScope = null,
		search = "",
	} = options;

	if (!posProfile?.company && source !== "invoice") {
		return [];
	}

	const { message } = await frappe.call({
		method: "posawesome.posawesome.api.commercial_flow.list_source_documents",
		args: {
			source,
			pos_opening_shift: posOpeningShift?.name,
			doctype: currentInvoiceDoctype,
			company: posProfile?.company,
			currency: posProfile?.currency,
			pos_profile:
				isSupervisorScope && typeof resolveSupervisorProfileScope === "function"
					? resolveSupervisorProfileScope()
					: null,
			cashier: null,
			is_supervisor: isSupervisorScope ? 1 : 0,
			search: search || undefined,
			include_draft: 1,
			include_submitted: 1,
		},
	});
	return Array.isArray(message)
		? message.map((entry) => normalizeDocumentSourceRecord(source, entry))
		: [];
}

export async function prepareDocumentFlowAction(
	options: PrepareFlowOptions,
): Promise<PreparedDocumentFlow | null> {
	const { action, source, record, currentInvoiceDoctype = "Sales Invoice" } =
		options;

	if (!record?.name) {
		return null;
	}

	const { message } = await frappe.call({
		method: "posawesome.posawesome.api.commercial_flow.prepare_document_flow_action",
		args: {
			action,
			source_doctype:
				record?.source_doctype ||
				record?.doctype ||
				getSourceDoctypeForKey(source, currentInvoiceDoctype),
			source_name: record.name,
			target_invoice_doctype: currentInvoiceDoctype,
		},
	});

	if (!message?.prepared_doc) {
		return null;
	}

	return {
		...message,
		source_record: normalizeDocumentSourceRecord(
			source,
			message.source_record || record,
		),
		prepared_doc: { ...message.prepared_doc },
	};
}

export async function commitDocumentFlowAction(
	options: CommitFlowOptions,
): Promise<any> {
	const { action, source, record, payload = null } = options;
	if (!record?.name) {
		return null;
	}

	const { message } = await frappe.call({
		method: "posawesome.posawesome.api.commercial_flow.commit_document_flow_action",
		args: {
			action,
			source_doctype: record?.source_doctype || record?.doctype || getSourceDoctypeForKey(source),
			source_name: record.name,
			payload: payload ? JSON.stringify(payload) : null,
		},
	});
	return message || null;
}

export async function loadDocumentSourceRecord(
	options: LoadSourceOptions,
): Promise<any> {
	const {
		source,
		record,
		posProfile,
		currentInvoiceDoctype = "Sales Invoice",
		invoiceStore,
		uiStore,
		closeDrafts = true,
		closeInvoiceManagement = true,
	} = options;

	let loadedRecord: any = null;
	const primaryAction = getPrimaryDocumentFlowAction(record);
	if (!primaryAction) {
		return null;
	}

	if (source === "invoice" && primaryAction === "invoice_load_draft") {
		loadedRecord = await fetchDraftInvoiceDoc({
			draft: {
				...record,
				doctype: record?.doctype || currentInvoiceDoctype,
			},
			posProfile,
		});
		if (loadedRecord) {
			invoiceStore.triggerLoadFlow?.({
				action: primaryAction,
				source,
				prepared_doc: loadedRecord,
				source_record: record,
				flow_context: {
					source,
					source_doctype: record?.source_doctype || currentInvoiceDoctype,
					source_name: record?.name,
					prepared_action: primaryAction,
					target_doctype: loadedRecord.doctype || currentInvoiceDoctype,
				},
			});
		}
	} else {
		const prepared = await prepareDocumentFlowAction({
			action: primaryAction,
			source,
			record,
			currentInvoiceDoctype,
		});
		loadedRecord = prepared?.prepared_doc || null;
		if (prepared && typeof invoiceStore.triggerLoadFlow === "function") {
			invoiceStore.triggerLoadFlow(prepared);
		}
	}

	if (loadedRecord && uiStore) {
		if (closeDrafts && typeof uiStore.closeDrafts === "function") {
			uiStore.closeDrafts();
		}
		if (closeInvoiceManagement && typeof uiStore.closeInvoiceManagement === "function") {
			uiStore.closeInvoiceManagement();
		}
	}

	return loadedRecord;
}
