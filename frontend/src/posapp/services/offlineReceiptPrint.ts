import renderOfflineInvoiceHTML, {
	prepareOfflinePrintDocument,
} from "../../offline_print_template";
import { getInvoiceRecoveryRows } from "../../offline/invoiceRecovery";
import { parseBooleanSetting } from "../utils/stock";
import {
	shouldUseConfiguredQzDocumentPrinting,
	shouldUseRawDocumentPrinting,
	confirmDocumentPrintFallback,
} from "./documentPrint";
import { printHtmlViaQz } from "./qzTray";
import { printRawDocumentViaQz } from "./rawDocumentPrint";

function validateScope(invoice: any, profile: any) {
	if (
		!profile?.name ||
		!profile?.company ||
		invoice?.pos_profile !== profile.name ||
		invoice?.company !== profile.company
	)
		throw new Error(
			"This receipt belongs to another POS Profile or company.",
		);
	if (!["Sales Invoice", "POS Invoice"].includes(invoice.doctype))
		throw new Error("Only saved sales invoices can be reprinted here.");
}

/** A local receipt is an immutable copy, never an invoice submission or repricing. */
export async function printLocalReceipt(
	invoice: any,
	profile: any,
	options: { popup?: Window | null; copy?: boolean; draft?: boolean } = {},
) {
	const popup =
		options.popup === undefined ? window.open("", "_blank") : options.popup;
	try {
		validateScope(invoice, profile);
		const doc = prepareOfflinePrintDocument(invoice);
		if (!doc.posa_client_request_id)
			throw new Error("The saved receipt has no request identity.");
		doc.name ||= `Offline ${doc.posa_client_request_id}`;
		doc._posa_receipt_label = options.draft
			? "DRAFT COPY — NOT SUBMITTED"
			: options.copy
				? "OFFLINE COPY — PENDING SERVER SYNC"
				: "OFFLINE SALE — PENDING SERVER SYNC";
		const html = await renderOfflineInvoiceHTML(doc);
		const preview =
			parseBooleanSetting(profile.posa_open_print_in_new_tab) &&
			!shouldUseRawDocumentPrinting(profile);
		if (shouldUseConfiguredQzDocumentPrinting(profile) && !preview) {
			try {
				if (shouldUseRawDocumentPrinting(profile))
					await printRawDocumentViaQz({
						doctype: doc.doctype,
						name: doc.name,
						doc,
						profile,
						printerName: profile.posa_qz_printer_name,
						localOnly: true,
					});
				else
					await printHtmlViaQz(html, {
						printerName: profile.posa_qz_printer_name,
					});
				popup?.close();
				return;
			} catch (error) {
				if (
					!confirmDocumentPrintFallback(error, {
						raw: shouldUseRawDocumentPrinting(profile),
					})
				) {
					popup?.close();
					return;
				}
			}
		}
		if (!popup || popup.closed)
			throw new Error(
				"Print popup was blocked. Allow popups for this POS site and retry.",
			);
		popup.document.write(html);
		popup.document.close();
		popup.focus();
		if (!preview) popup.print();
	} catch (error) {
		popup?.close();
		throw error;
	}
}

export async function reprintOfflineReceipt(requestId: string, profile: any) {
	// Reserve the print window directly from the user gesture, before storage reads.
	const popup = window.open("", "_blank");
	try {
		const row = (
			await getInvoiceRecoveryRows({
				profile: profile?.name || "",
				company: profile?.company,
			})
		).find((entry) => entry.request_id === requestId);
		if (!row)
			throw new Error(
				"This invoice is no longer pending on this device. Refresh the list or open its server receipt.",
			);
		const draft = row.recovery_state === "draft" || row.status === "draft";
		if (
			draft &&
			!parseBooleanSetting(profile?.posa_allow_print_draft_invoices)
		)
			throw new Error("Draft printing is disabled by this POS Profile.");
		await printLocalReceipt(row.invoice, profile, {
			popup,
			copy: true,
			draft,
		});
	} catch (error) {
		popup?.close();
		throw error;
	}
}
