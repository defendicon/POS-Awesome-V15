import { unref, type Ref } from "vue";
import renderOfflineInvoiceHTML from "../../../../offline_print_template";
import {
	appendDebugPrintParam,
	isDebugPrintEnabled,
	silentPrint,
	watchPrintWindow,
} from "../../../plugins/print";
import { printDocumentViaQz } from "../../../services/qzTray";
import { isOffline } from "../../../../offline/index";

declare const frappe: any;

export interface PaymentPrintingOptions {
	invoiceDoc: Ref<any>;
	posProfile: Ref<any>;
	invoiceType: Ref<string>;
	printFormat?: Ref<string>;
}

export function usePaymentPrinting(options: PaymentPrintingOptions) {
	const { invoiceDoc, posProfile, invoiceType, printFormat } = options;

	const openOfflineInvoicePreview = async (
		invoice: any,
		{ debugPrint = false, printFormatStr = "" } = {},
	) => {
		if (!invoice) return;
		const html = await renderOfflineInvoiceHTML(invoice);
		const win = window.open("", "_blank");
		if (!win) return;
		win.document.write(html);
		win.document.close();
		win.focus();
		if (debugPrint) {
			console.log("[POSAwesome][Print Debug]", {
				location: win.location?.href || null,
				online: navigator.onLine,
				trigger_print: "0",
				print_format: printFormatStr || null,
				template_path: "offline-fallback",
				should_print: false,
			});
		}
	};

	const printOfflineInvoice = async (invoice: any) => {
		if (!invoice) return;
		const html = await renderOfflineInvoiceHTML(invoice);
		const win = window.open("", "_blank");
		if (!win) return;
		win.document.write(html);
		win.document.close();
		win.focus();
		win.print();
	};

	const loadPrintPage = async () => {
		const doc = unref(invoiceDoc);
		const profile = unref(posProfile);
		const type = unref(invoiceType);

		const pFormatOverride = unref(printFormat);
		const print_format =
			pFormatOverride ||
			profile.print_format_for_online ||
			profile.print_format;

		const letter_head = profile.letter_head || 0;
		let doctype: string;
		const debugPrint = isDebugPrintEnabled();

		if (type === "Quotation") {
			doctype = "Quotation";
		} else if (type === "Order" && profile.posa_create_only_sales_order) {
			doctype = "Sales Order";
		} else if (profile.create_pos_invoice_instead_of_sales_invoice) {
			doctype = "POS Invoice";
		} else {
			doctype = "Sales Invoice";
		}

		let url =
			frappe.urllib.get_base_url() +
			"/printview?doctype=" +
			encodeURIComponent(doctype) +
			"&name=" +
			doc.name +
			"&trigger_print=1" +
			"&format=" +
			print_format +
			"&no_letterhead=" +
			letter_head;

		url = appendDebugPrintParam(url, debugPrint);

		const printOptions = {
			invoiceDoc: doc,
			allowOfflineFallback: isOffline(),
			triggerPrint: "1",
			debugPrint,
			debugInfo: {
				printFormat: print_format,
				templatePath: "online-printview",
			},
		};

		if (profile.posa_open_print_in_new_tab) {
			if (isOffline()) {
				openOfflineInvoicePreview(doc, {
					debugPrint,
					printFormatStr: print_format,
				});
				return;
			}
			let newTabUrl =
				frappe.urllib.get_base_url() +
				"/printview?doctype=" +
				encodeURIComponent(doctype) +
				"&name=" +
				doc.name +
				"&trigger_print=0" +
				"&format=" +
				print_format;

			if (profile.letter_head) {
				newTabUrl +=
					"&letterhead=" + encodeURIComponent(profile.letter_head);
				newTabUrl += "&no_letterhead=0";
			} else {
				newTabUrl += "&no_letterhead=0";
			}

			newTabUrl = appendDebugPrintParam(newTabUrl, debugPrint);
			const printWindow = window.open(newTabUrl, "_blank");
			if (printWindow) {
				watchPrintWindow(printWindow, {
					...printOptions,
					triggerPrint: "0",
					shouldPrint: false,
				});
			}
			return;
		}

		if (profile.posa_silent_print) {
			if (!isOffline()) {
				try {
					await printDocumentViaQz({
						doctype,
						name: doc.name,
						printFormat: print_format || "Standard",
						letterhead: profile.letter_head || null,
						noLetterhead: letter_head,
					});
					return;
				} catch (error) {
					console.warn("QZ Tray print failed, falling back to browser print", error);
				}
			}
			silentPrint(url, printOptions);
		} else {
			const printWindow = window.open(url, "Print");
			if (printWindow) {
				watchPrintWindow(printWindow, printOptions);
			}
		}
	};

	return {
		loadPrintPage,
		printOfflineInvoice,
		openOfflineInvoicePreview,
	};
}
