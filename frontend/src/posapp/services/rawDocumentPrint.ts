import { prepareQzPrinter, sendRawToQz } from "./qzTray";
import { parseBooleanSetting } from "../utils/stock";

declare const frappe: any;

export interface RawDocumentPrintOptions {
	doctype: string;
	name: string;
	doc?: Record<string, any> | null;
	profile?: Record<string, any> | null;
	printerName?: string;
	widthChars?: number;
}

const ESC = "\x1B";
const GS = "\x1D";
const DEFAULT_WIDTH = 42;
const MIN_WIDTH = 32;
const MAX_WIDTH = 64;

function translate(text: string) {
	const translator = (globalThis as any).__ || (globalThis as any).frappe?._;
	return typeof translator === "function" ? translator(text) : text;
}

function extractMessage<T>(value: any): T {
	if (value && typeof value === "object" && "message" in value) {
		return value.message as T;
	}
	return value as T;
}

function replaceControlCharacters(value: string) {
	return Array.from(value)
		.map((char) => {
			const code = char.charCodeAt(0);
			return code < 32 || code === 127 ? " " : char;
		})
		.join("");
}

function cleanText(value: unknown) {
	return replaceControlCharacters(String(value ?? "").normalize("NFC"))
		.replace(/\s+/g, " ")
		.trim();
}

function toNumber(value: unknown, fallback = 0) {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : fallback;
}

function resolveWidth(profile?: Record<string, any> | null, widthChars?: number) {
	const rawWidth = Number(widthChars ?? profile?.posa_raw_print_width ?? DEFAULT_WIDTH);
	if (!Number.isFinite(rawWidth)) return DEFAULT_WIDTH;
	return Math.min(Math.max(Math.round(rawWidth), MIN_WIDTH), MAX_WIDTH);
}

function repeat(char: string, count: number) {
	return char.repeat(Math.max(0, count));
}

function line(width: number, char = "-") {
	return repeat(char, width);
}

function center(text: unknown, width: number) {
	const value = cleanText(text);
	if (!value) return "";
	if (value.length >= width) return value.slice(0, width);
	const left = Math.floor((width - value.length) / 2);
	return `${repeat(" ", left)}${value}`;
}

function leftRight(left: unknown, right: unknown, width: number) {
	const leftText = cleanText(left);
	const rightText = cleanText(right);
	if (!rightText) return leftText.slice(0, width);
	const availableLeft = Math.max(0, width - rightText.length - 1);
	return `${leftText.slice(0, availableLeft).padEnd(availableLeft, " ")} ${rightText}`.slice(0, width);
}

function wrap(text: unknown, width: number) {
	const value = cleanText(text);
	if (!value) return [];
	const words = value.split(" ");
	const rows: string[] = [];
	let current = "";
	for (const word of words) {
		let remaining = word;
		while (remaining.length > width) {
			if (current) {
				rows.push(current);
				current = "";
			}
			rows.push(remaining.slice(0, width));
			remaining = remaining.slice(width);
		}
		if (!remaining) {
			continue;
		}
		if (!current) {
			current = remaining;
		} else if (`${current} ${remaining}`.length <= width) {
			current = `${current} ${remaining}`;
		} else {
			rows.push(current);
			current = remaining;
		}
	}
	if (current) rows.push(current);
	return rows;
}

function formatAmount(value: unknown, currency?: string) {
	const amount = toNumber(value).toFixed(2);
	const prefix = cleanText(currency);
	return prefix ? `${prefix} ${amount}` : amount;
}

function docTitle(doctype: string) {
	const clean = cleanText(doctype);
	if (!clean) return translate("DOCUMENT");
	return translate(clean).toUpperCase();
}

function docDate(doc: Record<string, any>) {
	return (
		doc.posting_date ||
		doc.transaction_date ||
		doc.reference_date ||
		doc.paid_on ||
		doc.creation ||
		""
	);
}

function docTime(doc: Record<string, any>) {
	return doc.posting_time || "";
}

function partyLabel(doc: Record<string, any>) {
	return (
		doc.customer_name ||
		doc.customer ||
		doc.party_name ||
		doc.party ||
		doc.supplier_name ||
		doc.supplier ||
		""
	);
}

function itemAmount(item: Record<string, any>) {
	return item.amount ?? item.net_amount ?? item.base_amount ?? 0;
}

function itemRate(item: Record<string, any>) {
	return item.rate ?? item.price_list_rate ?? item.base_rate ?? 0;
}

function taxAmount(row: Record<string, any>) {
	return row.tax_amount ?? row.base_tax_amount ?? row.tax_amount_after_discount_amount ?? 0;
}

function paymentAmount(row: Record<string, any>) {
	return row.amount ?? row.base_amount ?? row.paid_amount ?? row.received_amount ?? 0;
}

function addHeader(lines: string[], doc: Record<string, any>, options: RawDocumentPrintOptions, width: number) {
	const company = doc.company || options.profile?.company || options.profile?.name || "";
	if (company) lines.push(center(company, width));
	lines.push(center(docTitle(options.doctype), width));
	lines.push(line(width, "="));
	lines.push(leftRight(translate("No"), options.name || doc.name, width));
	const date = [docDate(doc), docTime(doc)].filter(Boolean).join(" ");
	if (date) lines.push(leftRight(translate("Date"), date, width));
	if (partyLabel(doc)) lines.push(leftRight(translate("Party"), partyLabel(doc), width));
	if (doc.pos_profile || options.profile?.name) lines.push(leftRight(translate("POS Profile"), doc.pos_profile || options.profile?.name, width));
	if (doc.po_no) lines.push(leftRight(translate("Customer PO"), doc.po_no, width));
}

function addItems(lines: string[], doc: Record<string, any>, width: number) {
	const items = Array.isArray(doc.items) ? doc.items : [];
	if (!items.length) return;

	lines.push(line(width));
	lines.push(leftRight(translate("Item"), translate("Amount"), width));
	lines.push(line(width));

	for (const item of items) {
		const name = item.item_name || item.item_code || item.description || translate("Item");
		for (const row of wrap(name, width)) {
			lines.push(row);
		}
		const qty = toNumber(item.qty);
		const uom = item.uom || item.stock_uom || "";
		const detail = `${qty.toFixed(3).replace(/\.?0+$/, "")} ${cleanText(uom)} x ${toNumber(itemRate(item)).toFixed(2)}`;
		lines.push(leftRight(`  ${detail}`, formatAmount(itemAmount(item), doc.currency), width));
	}
}

function addPaymentEntryDetails(lines: string[], doc: Record<string, any>, width: number) {
	if (doc.doctype !== "Payment Entry") return;
	lines.push(line(width));
	if (doc.payment_type) lines.push(leftRight(translate("Type"), doc.payment_type, width));
	if (doc.mode_of_payment) lines.push(leftRight(translate("Mode"), doc.mode_of_payment, width));
	if (doc.paid_from) lines.push(leftRight(translate("From"), doc.paid_from, width));
	if (doc.paid_to) lines.push(leftRight(translate("To"), doc.paid_to, width));
	if (doc.reference_no) lines.push(leftRight(translate("Reference"), doc.reference_no, width));
	if (doc.posa_payment_currency && doc.posa_original_amount !== undefined) {
		lines.push(
			leftRight(
				translate("Tender"),
				formatAmount(doc.posa_original_amount, doc.posa_payment_currency),
				width,
			),
		);
		const settlementAmount =
			doc.payment_type === "Pay" ? doc.received_amount : doc.paid_amount;
		const settlementCurrency =
			doc.payment_type === "Pay"
				? doc.paid_to_account_currency
				: doc.paid_from_account_currency;
		if (settlementAmount !== undefined) {
			lines.push(
				leftRight(
					translate("Settlement"),
					formatAmount(settlementAmount, settlementCurrency || doc.posa_invoice_currency),
					width,
				),
			);
		}
	} else {
		if (doc.paid_amount !== undefined) lines.push(leftRight(translate("Paid"), formatAmount(doc.paid_amount, doc.paid_from_account_currency || doc.currency), width));
		if (doc.received_amount !== undefined) lines.push(leftRight(translate("Received"), formatAmount(doc.received_amount, doc.paid_to_account_currency || doc.currency), width));
	}

	const references = Array.isArray(doc.references) ? doc.references : [];
	if (!references.length) return;
	lines.push(line(width));
	lines.push(translate("References"));
	for (const reference of references) {
		const label = [reference.reference_doctype, reference.reference_name].filter(Boolean).join(" ");
		lines.push(leftRight(label, formatAmount(reference.allocated_amount, doc.currency), width));
	}
}

function addTotals(lines: string[], doc: Record<string, any>, width: number) {
	const currency = doc.currency || doc.base_currency || "";
	lines.push(line(width));

	if (doc.net_total !== undefined || doc.total !== undefined) {
		lines.push(leftRight(translate("Net Total"), formatAmount(doc.net_total ?? doc.total, currency), width));
	}
	if (toNumber(doc.discount_amount) !== 0) {
		lines.push(leftRight(translate("Discount"), formatAmount(doc.discount_amount, currency), width));
	}
	if (toNumber(doc.total_taxes_and_charges) !== 0) {
		lines.push(leftRight(translate("Taxes"), formatAmount(doc.total_taxes_and_charges, currency), width));
	}

	const taxes = Array.isArray(doc.taxes) ? doc.taxes : [];
	for (const tax of taxes) {
		const amount = toNumber(taxAmount(tax));
		if (amount === 0) continue;
		lines.push(leftRight(`  ${tax.description || tax.account_head || translate("Tax")}`, formatAmount(amount, currency), width));
	}

	const grandTotal = doc.rounded_total ?? doc.grand_total ?? doc.base_rounded_total ?? doc.base_grand_total;
	if (grandTotal !== undefined) {
		lines.push(line(width, "="));
		lines.push(leftRight(translate("Grand Total"), formatAmount(grandTotal, currency), width));
	}
	if (doc.paid_amount !== undefined && doc.doctype !== "Payment Entry") {
		lines.push(leftRight(translate("Paid"), formatAmount(doc.paid_amount, currency), width));
	}
	if (doc.outstanding_amount !== undefined) {
		lines.push(leftRight(translate("Outstanding"), formatAmount(doc.outstanding_amount, currency), width));
	}
	if (doc.change_amount !== undefined && toNumber(doc.change_amount) !== 0) {
		lines.push(leftRight(translate("Change"), formatAmount(doc.change_amount, currency), width));
	}

	const payments = Array.isArray(doc.payments) ? doc.payments : [];
	if (payments.length) {
		lines.push(line(width));
		lines.push(translate("Payments"));
	}
	for (const payment of payments) {
		const paymentCurrency = payment.posa_payment_currency || currency;
		const originalAmount = payment.posa_original_amount ?? paymentAmount(payment);
		lines.push(leftRight(payment.mode_of_payment || payment.account || translate("Payment"), formatAmount(originalAmount, paymentCurrency), width));
		if (paymentCurrency !== currency) {
			lines.push(leftRight(`  ${translate("Invoice equivalent")}`, formatAmount(payment.amount, currency), width));
		}
	}
	const changeReturns = Array.isArray(doc.posa_change_returns) ? doc.posa_change_returns : [];
	if (changeReturns.length) {
		lines.push(translate("Physical Change Returned"));
		for (const row of changeReturns) {
			lines.push(leftRight(row.currency || currency, formatAmount(row.original_amount, row.currency || currency), width));
		}
	}
}

function addFooter(lines: string[], doc: Record<string, any>, width: number) {
	if (doc.remarks) {
		lines.push(line(width));
		for (const row of wrap(doc.remarks, width)) {
			lines.push(row);
		}
	}
	lines.push(line(width));
	lines.push(center(translate("Thank you"), width));
}

export function shouldUseRawDocumentPrinting(profile?: Record<string, any> | null) {
	return parseBooleanSetting(profile?.posa_raw_printing);
}

export function buildEscPosDocument(doc: Record<string, any>, options: RawDocumentPrintOptions) {
	const width = resolveWidth(options.profile, options.widthChars);
	const lines: string[] = [];

	addHeader(lines, doc, options, width);
	addItems(lines, doc, width);
	addPaymentEntryDetails(lines, doc, width);
	addTotals(lines, doc, width);
	addFooter(lines, doc, width);

	return [
		`${ESC}@`,
		`${ESC}a\x01`,
		`${ESC}E\x01`,
		`${lines.shift() || ""}\n`,
		`${ESC}E\x00`,
		`${ESC}a\x00`,
		`${lines.join("\n")}\n\n\n`,
		`${GS}V\x00`,
	].join("");
}

async function loadDocument(options: RawDocumentPrintOptions) {
	if (options.name && typeof frappe !== "undefined" && frappe?.call) {
		try {
			const response = await frappe.call({
				method: "frappe.client.get",
				args: {
					doctype: options.doctype,
					name: options.name,
				},
			});
			const doc = extractMessage<Record<string, any>>(response);
			if (doc && (doc.name || doc.doctype || Array.isArray(doc.items))) return doc;
		} catch (error) {
			if (!options.doc) throw error;
			console.warn("Unable to load saved document for raw printing, using provided document", error);
		}
	}

	return options.doc;
}

export async function printRawDocumentViaQz(options: RawDocumentPrintOptions) {
	if (!options?.doctype || !options?.name) {
		throw new Error(translate("Invalid raw print document details."));
	}

	// Check the local printer before making a document API request so fallback is immediate.
	const printerName = await prepareQzPrinter(
		options.printerName || options.profile?.posa_qz_printer_name,
	);

	const doc = await loadDocument(options);
	if (!doc) {
		throw new Error(translate("Unable to load document for raw printing."));
	}

	const rawData = buildEscPosDocument(
		{
			...doc,
			doctype: doc.doctype || options.doctype,
			name: doc.name || options.name,
		},
		options,
	);
	await sendRawToQz(rawData, printerName);
}
