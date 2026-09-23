import { parseBooleanSetting } from "../utils/stock";
import {
	confirmDocumentPrintFallback,
	shouldUseConfiguredQzDocumentPrinting,
	shouldUseRawDocumentPrinting,
} from "./documentPrint";
import { printHtmlViaQz, sendRawToQz } from "./qzTray";

const ESC = "\x1B";
const GS = "\x1D";
const DEFAULT_RAW_WIDTH = 42;

function translate(text: string) {
	const translator = (globalThis as any).__ || (globalThis as any).frappe?._;
	return typeof translator === "function" ? translator(text) : text;
}

function numberValue(value: unknown, fallback = 0) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown) {
	return Array.from(String(value ?? ""))
		.map((character) => {
			const code = character.charCodeAt(0);
			return code < 32 || code === 127 ? " " : character;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
}

function escapeHtml(value: unknown) {
	return textValue(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function decimalPrecision(value: unknown, fallback = 2) {
	const parsed = Number(value);
	return Number.isInteger(parsed)
		? Math.max(0, Math.min(9, parsed))
		: fallback;
}

function amount(value: unknown, currency: string, precision = 2) {
	return `${textValue(currency)} ${Math.abs(numberValue(value)).toFixed(precision)}`.trim();
}

function documentTotal(doc: Record<string, any>) {
	return Math.abs(
		numberValue(
			doc.rounded_total ??
				doc.grand_total ??
				doc.base_rounded_total ??
				doc.base_grand_total,
		),
	);
}

function itemAmount(item: Record<string, any>) {
	return Math.abs(
		numberValue(item.amount ?? item.net_amount ?? item.base_amount),
	);
}

function itemRate(item: Record<string, any>) {
	return Math.abs(
		numberValue(item.rate ?? item.price_list_rate ?? item.base_rate),
	);
}

export function isExchangeReceiptDocument(doc: any) {
	return Boolean(
		doc?.exchange_reference &&
			doc?.return_invoice_doc &&
			doc?.exchange_summary &&
			doc?.replacement_invoice,
	);
}

export function buildExchangeReceiptModel(
	doc: Record<string, any>,
	profile?: Record<string, any> | null,
) {
	if (!isExchangeReceiptDocument(doc)) {
		throw new Error(translate("Invalid item exchange receipt data."));
	}

	const returnDoc = doc.return_invoice_doc || {};
	const summary = doc.exchange_summary || {};
	const currency = textValue(doc.currency || returnDoc.currency);
	const currencyPrecision = decimalPrecision(
		profile?.posa_decimal_precision ??
			summary.currency_precision ??
			doc.currency_precision ??
			2,
	);
	const difference = numberValue(
		summary.difference_amount,
		documentTotal(doc) - documentTotal(returnDoc),
	);

	return {
		exchangeReference: textValue(doc.exchange_reference),
		originalInvoice: textValue(returnDoc.return_against),
		returnInvoice: textValue(doc.return_invoice || returnDoc.name),
		replacementInvoice: textValue(doc.replacement_invoice || doc.name),
		company: textValue(doc.company || returnDoc.company),
		customer: textValue(
			doc.customer_name ||
				doc.customer ||
				returnDoc.customer_name ||
				returnDoc.customer,
		),
		postingDate: textValue(doc.posting_date || returnDoc.posting_date),
		postingTime: textValue(doc.posting_time || returnDoc.posting_time),
		posProfile: textValue(doc.pos_profile || returnDoc.pos_profile),
		currency,
		currencyPrecision,
		returnedItems: Array.isArray(returnDoc.items) ? returnDoc.items : [],
		replacementItems: Array.isArray(doc.items) ? doc.items : [],
		returnTotal: Math.abs(
			numberValue(summary.return_total, documentTotal(returnDoc)),
		),
		saleTotal: Math.abs(
			numberValue(summary.sale_total, documentTotal(doc)),
		),
		allocatedAmount: Math.abs(numberValue(summary.allocated_amount)),
		differenceAmount: difference,
		settlementType: textValue(summary.settlement_type),
		payments: (Array.isArray(doc.payments) ? doc.payments : []).filter(
			(row: Record<string, any>) =>
				Math.abs(numberValue(row.amount)) > 0.0001,
		),
	};
}

function itemRows(
	items: Record<string, any>[],
	currency: string,
	precision: number,
) {
	if (!items.length) {
		return `<tr><td colspan="4" class="empty">${escapeHtml(translate("No items"))}</td></tr>`;
	}
	return items
		.map((item) => {
			const qty = Math.abs(numberValue(item.qty));
			const uom = textValue(item.uom || item.stock_uom);
			return `<tr>
				<td>${escapeHtml(item.item_name || item.item_code || translate("Item"))}</td>
				<td class="number">${escapeHtml(`${qty.toFixed(3).replace(/\.?0+$/, "")} ${uom}`)}</td>
				<td class="number">${escapeHtml(amount(itemRate(item), currency, precision))}</td>
				<td class="number">${escapeHtml(amount(itemAmount(item), currency, precision))}</td>
			</tr>`;
		})
		.join("");
}

function paymentRows(model: ReturnType<typeof buildExchangeReceiptModel>) {
	if (!model.payments.length) return "";
	const rows = model.payments
		.map((payment: Record<string, any>) => {
			const paymentCurrency = textValue(
				payment.posa_payment_currency || model.currency,
			);
			const paid = payment.posa_original_amount ?? payment.amount;
			return `<div class="line"><span>${escapeHtml(payment.mode_of_payment || payment.account || translate("Payment"))}</span><strong>${escapeHtml(amount(paid, paymentCurrency, model.currencyPrecision))}</strong></div>`;
		})
		.join("");
	return `<section class="payments"><h3>${escapeHtml(translate("Payment received"))}</h3>${rows}</section>`;
}

export function renderExchangeReceiptHtml(
	doc: Record<string, any>,
	profile?: Record<string, any> | null,
) {
	const model = buildExchangeReceiptModel(doc, profile);
	const outcomeLabel =
		model.differenceAmount > 0
			? translate("Customer pays")
			: model.differenceAmount < 0
				? translate("Customer credit")
				: translate("Even exchange");

	return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${escapeHtml(translate("Item Exchange Receipt"))}</title>
<style>
@page{margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17211b;margin:0;font-size:12px}.receipt{max-width:780px;margin:0 auto}.header{text-align:center;border-bottom:2px solid #168253;padding-bottom:12px}.header h1{font-size:22px;margin:4px 0}.header p,.meta p{margin:3px 0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin:14px 0}h2{font-size:15px;margin:16px 0 6px;color:#116941}h3{font-size:13px;margin:0 0 7px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #d7dfda;padding:7px 5px;text-align:left}th{background:#edf5f1}.number{text-align:right;white-space:nowrap}.empty{text-align:center;color:#69736d}.summary{margin-top:18px;border:1px solid #b9d5c7;border-radius:8px;padding:10px}.line{display:flex;justify-content:space-between;gap:20px;padding:4px 0}.result{border-top:2px solid #168253;margin-top:6px;padding-top:8px;font-size:15px;color:#0d6840}.payments{margin-top:12px;padding-top:10px;border-top:1px dashed #9ba9a1}.footer{text-align:center;margin-top:18px;padding-top:10px;border-top:1px solid #d7dfda;color:#56625b}@media print{.receipt{max-width:none}}
</style></head><body><main class="receipt" id="exchange-receipt">
<header class="header"><div>${escapeHtml(model.company)}</div><h1>${escapeHtml(translate("Item Exchange Receipt"))}</h1><p>${escapeHtml(model.exchangeReference)}</p></header>
<section class="meta">
<p><strong>${escapeHtml(translate("Customer"))}:</strong> ${escapeHtml(model.customer)}</p>
<p><strong>${escapeHtml(translate("Date"))}:</strong> ${escapeHtml([model.postingDate, model.postingTime].filter(Boolean).join(" "))}</p>
<p><strong>${escapeHtml(translate("Original invoice"))}:</strong> ${escapeHtml(model.originalInvoice)}</p>
<p><strong>${escapeHtml(translate("POS Profile"))}:</strong> ${escapeHtml(model.posProfile)}</p>
</section>
<h2>${escapeHtml(translate("Returned items"))} · ${escapeHtml(model.returnInvoice)}</h2>
<table><thead><tr><th>${escapeHtml(translate("Item"))}</th><th class="number">${escapeHtml(translate("Qty"))}</th><th class="number">${escapeHtml(translate("Rate"))}</th><th class="number">${escapeHtml(translate("Amount"))}</th></tr></thead><tbody>${itemRows(model.returnedItems, model.currency, model.currencyPrecision)}</tbody></table>
<h2>${escapeHtml(translate("Replacement items"))} · ${escapeHtml(model.replacementInvoice)}</h2>
<table><thead><tr><th>${escapeHtml(translate("Item"))}</th><th class="number">${escapeHtml(translate("Qty"))}</th><th class="number">${escapeHtml(translate("Rate"))}</th><th class="number">${escapeHtml(translate("Amount"))}</th></tr></thead><tbody>${itemRows(model.replacementItems, model.currency, model.currencyPrecision)}</tbody></table>
<section class="summary">
<div class="line"><span>${escapeHtml(translate("Replacement sale"))}</span><strong>${escapeHtml(amount(model.saleTotal, model.currency, model.currencyPrecision))}</strong></div>
<div class="line"><span>${escapeHtml(translate("Return credit"))}</span><strong>− ${escapeHtml(amount(model.returnTotal, model.currency, model.currencyPrecision))}</strong></div>
<div class="line"><span>${escapeHtml(translate("Allocated credit"))}</span><strong>${escapeHtml(amount(model.allocatedAmount, model.currency, model.currencyPrecision))}</strong></div>
<div class="line result"><span>${escapeHtml(outcomeLabel)}</span><strong>${escapeHtml(amount(model.differenceAmount, model.currency, model.currencyPrecision))}</strong></div>
${paymentRows(model)}</section>
<footer class="footer">${escapeHtml(model.settlementType)} · ${escapeHtml(translate("Thank you"))}</footer>
</main></body></html>`;
}

function rawWidth(profile?: Record<string, any> | null) {
	const width = numberValue(profile?.posa_raw_print_width, DEFAULT_RAW_WIDTH);
	return Math.min(Math.max(Math.round(width), 32), 64);
}

function rawLine(left: unknown, right: unknown, width: number) {
	const leftText = textValue(left);
	const rightText = textValue(right);
	const available = Math.max(0, width - rightText.length - 1);
	return `${leftText.slice(0, available).padEnd(available)} ${rightText}`.slice(
		0,
		width,
	);
}

function rawWrap(value: unknown, width: number) {
	const words = textValue(value).split(" ").filter(Boolean);
	const rows: string[] = [];
	let current = "";
	for (let word of words) {
		while (word.length > width) {
			if (current) rows.push(current);
			rows.push(word.slice(0, width));
			word = word.slice(width);
			current = "";
		}
		if (!word) continue;
		if (!current) current = word;
		else if (`${current} ${word}`.length <= width) current += ` ${word}`;
		else {
			rows.push(current);
			current = word;
		}
	}
	if (current) rows.push(current);
	return rows;
}

export function buildEscPosExchangeReceipt(
	doc: Record<string, any>,
	profile?: Record<string, any> | null,
) {
	const model = buildExchangeReceiptModel(doc, profile);
	const width = rawWidth(profile);
	const divider = "-".repeat(width);
	const lines: string[] = [
		textValue(model.company),
		translate("ITEM EXCHANGE RECEIPT"),
		"=".repeat(width),
		rawLine(translate("Exchange"), model.exchangeReference, width),
		rawLine(translate("Original"), model.originalInvoice, width),
		rawLine(translate("Return"), model.returnInvoice, width),
		rawLine(translate("Replacement"), model.replacementInvoice, width),
		rawLine(translate("Customer"), model.customer, width),
		rawLine(
			translate("Date"),
			[model.postingDate, model.postingTime].filter(Boolean).join(" "),
			width,
		),
	];

	const addItems = (title: string, items: Record<string, any>[]) => {
		lines.push(divider, title, divider);
		for (const item of items) {
			lines.push(
				...rawWrap(
					item.item_name || item.item_code || translate("Item"),
					width,
				),
			);
			const qty = Math.abs(numberValue(item.qty))
				.toFixed(3)
				.replace(/\.?0+$/, "");
			const detail = `${qty} ${textValue(item.uom || item.stock_uom)} x ${itemRate(item).toFixed(model.currencyPrecision)}`;
			lines.push(
				rawLine(
					`  ${detail}`,
					amount(
						itemAmount(item),
						model.currency,
						model.currencyPrecision,
					),
					width,
				),
			);
		}
	};

	addItems(translate("RETURNED ITEMS"), model.returnedItems);
	addItems(translate("REPLACEMENT ITEMS"), model.replacementItems);
	lines.push(
		divider,
		rawLine(
			translate("Replacement sale"),
			amount(model.saleTotal, model.currency, model.currencyPrecision),
			width,
		),
		rawLine(
			translate("Return credit"),
			`- ${amount(model.returnTotal, model.currency, model.currencyPrecision)}`,
			width,
		),
		rawLine(
			translate("Allocated credit"),
			amount(
				model.allocatedAmount,
				model.currency,
				model.currencyPrecision,
			),
			width,
		),
		"=".repeat(width),
		rawLine(
			model.differenceAmount > 0
				? translate("Customer pays")
				: model.differenceAmount < 0
					? translate("Customer credit")
					: translate("Even exchange"),
			amount(
				model.differenceAmount,
				model.currency,
				model.currencyPrecision,
			),
			width,
		),
	);
	for (const payment of model.payments) {
		lines.push(
			rawLine(
				payment.mode_of_payment ||
					payment.account ||
					translate("Payment"),
				amount(
					payment.posa_original_amount ?? payment.amount,
					payment.posa_payment_currency || model.currency,
					model.currencyPrecision,
				),
				width,
			),
		);
	}
	lines.push(divider, model.settlementType, translate("Thank you"));

	return `${ESC}@${ESC}a\x01${ESC}E\x01${lines.shift() || ""}\n${ESC}E\x00${ESC}a\x00${lines.join("\n")}\n\n\n${GS}V\x00`;
}

function writeBrowserReceipt(html: string, preview: boolean) {
	const target = preview
		? window.open("", "_blank")
		: document.createElement("iframe");
	if (!target)
		throw new Error(
			translate("Popup blocked while opening exchange receipt."),
		);

	if (preview) {
		const win = target as Window;
		win.document.open();
		win.document.write(html);
		win.document.close();
		win.focus();
		return;
	}

	const iframe = target as HTMLIFrameElement;
	iframe.style.position = "fixed";
	iframe.style.width = "0";
	iframe.style.height = "0";
	iframe.style.border = "0";
	iframe.onload = () => {
		iframe.contentWindow?.focus();
		iframe.contentWindow?.print();
		setTimeout(() => iframe.remove(), 1000);
	};
	iframe.srcdoc = html;
	document.body.appendChild(iframe);
}

export async function printExchangeReceipt(
	doc: Record<string, any>,
	profile?: Record<string, any> | null,
) {
	const html = renderExchangeReceiptHtml(doc, profile);
	const useRaw = shouldUseRawDocumentPrinting(profile);
	const useQz = shouldUseConfiguredQzDocumentPrinting(profile);

	if (useQz) {
		try {
			if (useRaw) {
				await sendRawToQz(
					buildEscPosExchangeReceipt(doc, profile),
					profile?.posa_qz_printer_name,
				);
			} else {
				await printHtmlViaQz(html, {
					printerName: profile?.posa_qz_printer_name,
				});
			}
			return;
		} catch (error) {
			console.warn("QZ Tray exchange receipt print failed", error);
			if (!confirmDocumentPrintFallback(error, { raw: useRaw })) return;
		}
	}

	writeBrowserReceipt(
		html,
		parseBooleanSetting(profile?.posa_open_print_in_new_tab) && !useRaw,
	);
}
