import { parseBooleanSetting } from "./stock";
import { fetchDraftInvoiceDoc } from "./draftInvoices";

declare const frappe: any;

export type DocumentSourceKey = "invoice" | "order" | "quote";

export type DocumentSourceOption = {
	key: DocumentSourceKey;
	label: "Invoice" | "Order" | "Quote";
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
	source: DocumentSourceKey;
	posting_date?: string;
	posting_time?: string;
	customer?: string;
	customer_name?: string;
	currency?: string;
	grand_total?: number;
	doctype?: string;
	items_count?: number;
	status?: string;
};

type FetchSourceOptions = {
	source: DocumentSourceKey;
	posProfile: any;
	posOpeningShift?: any;
	currentInvoiceDoctype?: string;
	isSupervisorScope?: boolean;
	resolveSupervisorProfileScope?: (() => string | null) | null;
	search?: string;
};

type LoadSourceOptions = {
	source: DocumentSourceKey;
	record: DocumentSourceRecord;
	posProfile: any;
	currentInvoiceDoctype?: string;
	invoiceStore: any;
	uiStore?: any;
	closeDrafts?: boolean;
	closeInvoiceManagement?: boolean;
};

export const DOCUMENT_SOURCE_OPTIONS: DocumentSourceOption[] = [
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
];

export function isSalesOrderSourceEnabled(posProfile: any): boolean {
	return parseBooleanSetting(
		posProfile?.custom_allow_select_sales_order ?? posProfile?.posa_allow_sales_order,
	);
}

export function isQuotationSourceEnabled(posProfile: any): boolean {
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
		return false;
	});
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
	return availableSources[0]?.key || "invoice";
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

export function canDeleteDocumentSourceRecord(source: DocumentSourceKey): boolean {
	return source === "invoice";
}

function normalizeDocumentStatus(source: DocumentSourceKey, record: any): string {
	if (record?.status) {
		return record.status;
	}
	if (source === "quote") {
		return Number(record?.docstatus || 0) === 1 ? "Submitted" : "Draft";
	}
	if (source === "order") {
		return "Submitted";
	}
	return "Draft";
}

export function normalizeDocumentSourceRecord(
	source: DocumentSourceKey,
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
	};
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

	if (source === "invoice") {
		if (!posOpeningShift?.name && !isSupervisorScope) {
			return [];
		}

		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.invoices.get_draft_invoices",
			args: {
				pos_opening_shift: posOpeningShift?.name,
				doctype: currentInvoiceDoctype,
				limit_page_length: 0,
				company: isSupervisorScope ? posProfile?.company : null,
				pos_profile:
					isSupervisorScope && typeof resolveSupervisorProfileScope === "function"
						? resolveSupervisorProfileScope()
						: null,
				cashier: null,
				is_supervisor: isSupervisorScope ? 1 : 0,
			},
		});
		return Array.isArray(message)
			? message.map((entry) =>
					normalizeDocumentSourceRecord("invoice", {
						...entry,
						doctype: entry?.doctype || currentInvoiceDoctype,
					}),
				)
			: [];
	}

	if (source === "order") {
		const { message } = await frappe.call({
			method: "posawesome.posawesome.api.sales_orders.search_orders",
			args: {
				order_name: search || undefined,
				company: posProfile?.company,
				currency: posProfile?.currency,
			},
		});
		return Array.isArray(message)
			? message.map((entry) => normalizeDocumentSourceRecord("order", entry))
			: [];
	}

	const { message } = await frappe.call({
		method: "posawesome.posawesome.api.quotations.search_quotations",
		args: {
			company: posProfile?.company,
			currency: posProfile?.currency,
			quotation_name: search || undefined,
			include_draft: 1,
			include_submitted: 1,
		},
	});
	return Array.isArray(message)
		? message.map((entry) => normalizeDocumentSourceRecord("quote", entry))
		: [];
}

export async function prepareSalesOrderRecordForLoading(
	orderRecord: DocumentSourceRecord,
): Promise<DocumentSourceRecord | null> {
	if (!orderRecord?.name) {
		return null;
	}

	let invoiceDocForLoad: any = {};
	const { message } = await frappe.call({
		method: "posawesome.posawesome.api.invoices.create_sales_invoice_from_order",
		args: {
			sales_order: orderRecord.name,
		},
	});

	if (message) {
		invoiceDocForLoad = message;
	}

	const orderToLoad = {
		...orderRecord,
		items: Array.isArray(orderRecord?.items)
			? orderRecord.items.map((item: Record<string, any>) => ({ ...item }))
			: [],
	};

	if (Array.isArray(invoiceDocForLoad?.items) && Array.isArray(orderToLoad.items)) {
		const loadedItemsMap = invoiceDocForLoad.items.reduce(
			(map: Record<string, any>, item: Record<string, any>) => {
				if (item?.item_code) {
					map[item.item_code] = item;
				}
				return map;
			},
			{},
		);

		orderToLoad.items = orderToLoad.items.filter((selectedItem: Record<string, any>) => {
			const loadedItem = loadedItemsMap[selectedItem?.item_code];
			if (!loadedItem) {
				return false;
			}

			selectedItem.qty = loadedItem.qty;
			selectedItem.amount = loadedItem.amount;
			selectedItem.uom = loadedItem.uom;
			selectedItem.rate = loadedItem.rate;
			return true;
		});
	}

	if (invoiceDocForLoad?.name) {
		await frappe.call({
			method: "posawesome.posawesome.api.invoices.delete_sales_invoice",
			args: {
				sales_invoice: invoiceDocForLoad.name,
			},
		});
	}

	return normalizeDocumentSourceRecord("order", orderToLoad);
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

	if (source === "invoice") {
		loadedRecord = await fetchDraftInvoiceDoc({
			draft: {
				...record,
				doctype: record?.doctype || currentInvoiceDoctype,
			},
			posProfile,
		});
		if (loadedRecord) {
			invoiceStore.triggerLoadInvoice(loadedRecord);
		}
	} else if (source === "order") {
		loadedRecord = await prepareSalesOrderRecordForLoading(record);
		if (loadedRecord) {
			invoiceStore.triggerLoadOrder(loadedRecord);
		}
	} else if (source === "quote") {
		const { message } = await frappe.call({
			method: "frappe.client.get",
			args: {
				doctype: "Quotation",
				name: record?.name,
			},
		});
		loadedRecord = message || null;
		if (loadedRecord) {
			invoiceStore.triggerLoadInvoice(loadedRecord);
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
