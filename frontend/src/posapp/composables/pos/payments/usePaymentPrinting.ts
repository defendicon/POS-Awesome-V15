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
import { resolvePaymentPrintDoctype } from "../../../utils/paymentPrintDoctype";

declare const frappe: any;

export interface PaymentPrintingOptions {
	invoiceDoc: Ref<any>;
	posProfile: Ref<any>;
	invoiceType: Ref<string>;
	printFormat?: Ref<string>;
}

export function usePaymentPrinting(options: PaymentPrintingOptions) {
	const { invoiceDoc, posProfile, invoiceType, printFormat } = options;

	const resolveDocumentName = (value: any) => {
		if (value === null || value === undefined) {
			return "";
		}
		const name = String(value).trim();
		return name && name !== "undefined" && name !== "null" ? name : "";
	};

	const resolvePrintContext = (input: { doc?: any; doctype?: string } = {}) => {
		const doc = input.doc || unref(invoiceDoc);
		const profile = unref(posProfile);
		const type = unref(invoiceType);
		const pFormatOverride = unref(printFormat);
		const print_format =
			pFormatOverride ||
			profile.print_format_for_online ||
			profile.print_format;
		const letter_head = profile.letter_head || 0;
		const doctype = resolvePaymentPrintDoctype({
			profile,
			invoiceType: type,
			explicitDoctype: input.doctype || input.doc?.doctype,
		});

		return {
			doc,
			profile,
			doctype,
			print_format,
			letter_head,
		};
	};

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

	const loadPrintPage = async (input: { doc?: any; doctype?: string; name?: string } = {}) => {
		const { doc, profile, doctype, print_format, letter_head } = resolvePrintContext(input);
		const debugPrint = isDebugPrintEnabled();
		const offline = isOffline();
		const docname = resolveDocumentName(input.name || doc?.name);

		if (!docname && !offline) {
			throw new Error("Cannot print document without a submitted document name");
		}

		// Keep printview auto-trigger disabled; watchPrintWindow/silentPrint owns
		// the single browser print call so submit-and-print does not prompt twice.
		let url =
			frappe.urllib.get_base_url() +
			"/printview?doctype=" +
			encodeURIComponent(doctype) +
			"&name=" +
			encodeURIComponent(docname) +
			"&trigger_print=0" +
			"&format=" +
			encodeURIComponent(print_format || "Standard") +
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
			if (offline) {
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
				encodeURIComponent(docname) +
				"&trigger_print=0" +
				"&format=" +
				encodeURIComponent(print_format || "Standard");

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
			if (!offline) {
				try {
					await printDocumentViaQz({
						doctype,
						name: docname,
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
			silentPrint(url, printOptions);
		}
	};

	return {
		loadPrintPage,
		printOfflineInvoice,
		openOfflineInvoicePreview,
	};
}
